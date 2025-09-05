// Vercel Edge TTS API代理服务 - 简化版本
// 解决ES模块兼容性问题

import { WebSocket } from 'ws';
import { createHmac, randomUUID } from 'crypto';

// Vercel Serverless Function 主入口
export default async function handler(req, res) {
    // 处理 CORS 预检请求
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        return res.status(200).end();
    }
    
    // 设置 CORS 响应头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { text, voice = 'zh-CN-XiaochenNeural', rate = 0, pitch = 0, volume = 50 } = req.body;

        if (!text || !text.trim()) {
            return res.status(400).json({ success: false, message: '请提供要转换的文本' });
        }

        console.log('TTS请求:', { textLength: text.length, voice });
        
        // 文本预处理
        const textChunks = preprocessText(text);
        console.log(`文本分为 ${textChunks.length} 个块`);

        // 获取TTS服务端点
        const { endpoint } = await getTTSEndpoint();
        const trustedToken = endpoint.t;

        const allAudioChunks = [];
        let allWordBoundaries = [];
        let totalAudioDurationNs = 0;

        // 处理每个文本块
        for (let i = 0; i < textChunks.length; i++) {
            const chunk = textChunks[i];
            console.log(`处理第 ${i + 1}/${textChunks.length} 个文本块`);
            
            const ssml = generateSSML(chunk, voice, rate, pitch, volume);
            const webSocketUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${trustedToken}`;
            const clientId = randomUUID().replace(/-/g, '');
            const webSocketSignature = await generateWebSocketSignature(webSocketUrl);

            try {
                const result = await getAudioAndSubtitlesFromWebSocket(webSocketUrl, webSocketSignature, clientId, ssml);
                
                allAudioChunks.push(result.audioBuffer);

                // 校正字幕时间戳
                const correctedBoundaries = result.wordBoundaries.map(wb => ({
                    ...wb,
                    AudioOffset: wb.AudioOffset + totalAudioDurationNs
                }));
                allWordBoundaries = allWordBoundaries.concat(correctedBoundaries);

                // 更新总时长
                if (result.wordBoundaries.length > 0) {
                    const lastWord = result.wordBoundaries[result.wordBoundaries.length - 1];
                    totalAudioDurationNs += lastWord.AudioOffset + lastWord.AudioDuration;
                }
            } catch (chunkError) {
                console.error(`处理第 ${i + 1} 个文本块失败:`, chunkError);
                throw new Error(`处理文本块 ${i + 1} 失败: ${chunkError.message}`);
            }
        }

        // 合并结果
        const finalAudioBuffer = Buffer.concat(allAudioChunks);
        const audioBase64 = finalAudioBuffer.toString('base64');
        const srtContent = generateAccurateSRT(allWordBoundaries);
        const actualDuration = totalAudioDurationNs / 10000000;

        console.log('TTS处理完成:', { audioSize: finalAudioBuffer.length, duration: actualDuration });

        return res.status(200).json({
            success: true,
            audio_base64: audioBase64,
            srt_string: srtContent,
            message: '语音生成成功',
            voice, rate, pitch, volume,
            duration: actualDuration,
            chunks: textChunks.length
        });

    } catch (error) {
        console.error('Vercel TTS处理错误:', error);
        return res.status(500).json({ 
            success: false, 
            message: `语音合成失败: ${error.message}`
        });
    }
}

// ==============================================================================
// 文本预处理函数
// ==============================================================================
function preprocessText(text) {
    // 移除标点符号，保留中文、字母、数字和空格
    const cleanedText = text.replace(/[^\p{L}\p{N}\s]/gu, '');
    
    // 按句子分割
    const sentences = cleanedText.split(/(?<=[。！？.])\s*/).filter(s => s.trim());
    const chunks = [];
    const maxLength = 200;

    sentences.forEach(sentence => {
        if (sentence.length <= maxLength) {
            chunks.push(sentence);
        } else {
            // 超长句子进行硬切分
            for (let i = 0; i < sentence.length; i += maxLength) {
                chunks.push(sentence.substring(i, i + maxLength));
            }
        }
    });

    return chunks.filter(c => c.trim());
}

// ==============================================================================
// WebSocket通信核心逻辑
// ==============================================================================
function getAudioAndSubtitlesFromWebSocket(url, signature, clientId, ssml) {
    return new Promise((resolve, reject) => {
        const headers = {
            'X-ClientTraceId': clientId,
            'X-MT-Signature': signature,
            'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.77 Safari/537.36 Edg/91.0.864.41'
        };

        const ws = new WebSocket(url, {
            headers: headers
        });

        let audioChunks = [];
        let wordBoundaries = [];
        let responseSent = false;

        // 设置30秒超时
        const timeout = setTimeout(() => {
            if (!responseSent) {
                responseSent = true;
                ws.close();
                reject(new Error('WebSocket操作超时'));
            }
        }, 30000);

        ws.on('open', () => {
            console.log('WebSocket连接已建立');
            
            // 发送配置消息
            const configMessage = {
                context: {
                    synthesis: {
                        audio: {
                            metadataoptions: {
                                sentenceBoundaryEnabled: 'false',
                                wordBoundaryEnabled: 'true'
                            },
                            outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
                        }
                    }
                }
            };

            const configPayload = `X-Timestamp:${new Date().toISOString()}\r\nPath:speech.config\r\nContent-Type:application/json; charset=utf-8\r\n\r\n${JSON.stringify(configMessage)}`;
            ws.send(configPayload);

            // 发送SSML消息
            const ssmlPayload = `X-Timestamp:${new Date().toISOString()}\r\nPath:ssml\r\nContent-Type:application/ssml+xml\r\n\r\n${ssml}`;
            ws.send(ssmlPayload);
        });

        ws.on('message', (data) => {
            try {
                if (typeof data === 'string') {
                    const lines = data.split('\r\n');
                    const pathLine = lines.find(line => line.startsWith('Path:'));
                    
                    if (pathLine && pathLine.includes('wordBoundary')) {
                        const jsonLine = lines.find(line => line.startsWith('{'));
                        if (jsonLine) {
                            const boundary = JSON.parse(jsonLine);
                            wordBoundaries.push(boundary);
                        }
                    } else if (pathLine && pathLine.includes('turn.end')) {
                        clearTimeout(timeout);
                        if (!responseSent) {
                            responseSent = true;
                            if (audioChunks.length > 0) {
                                resolve({
                                    audioBuffer: Buffer.concat(audioChunks),
                                    wordBoundaries: wordBoundaries
                                });
                            } else {
                                reject(new Error('未收到音频数据'));
                            }
                        }
                        ws.close();
                    }
                } else if (Buffer.isBuffer(data)) {
                    // 处理二进制音频数据
                    const headerLength = data.readUInt16BE(0);
                    const audioData = data.slice(2 + headerLength);
                    if (audioData.length > 0) {
                        audioChunks.push(audioData);
                    }
                }
            } catch (error) {
                console.error('消息处理错误:', error);
            }
        });

        ws.on('error', (error) => {
            clearTimeout(timeout);
            if (!responseSent) {
                responseSent = true;
                reject(new Error(`WebSocket连接失败: ${error.message}`));
            }
        });

        ws.on('close', (code, reason) => {
            clearTimeout(timeout);
            if (!responseSent) {
                responseSent = true;
                if (audioChunks.length === 0) {
                    reject(new Error(`WebSocket意外关闭。代码: ${code}, 原因: ${reason || '未知'}`));
                } else {
                    resolve({
                        audioBuffer: Buffer.concat(audioChunks),
                        wordBoundaries: wordBoundaries
                    });
                }
            }
        });
    });
}

// ==============================================================================
// 辅助函数
// ==============================================================================
async function getTTSEndpoint() {
    const endpointUrl = 'https://dev.microsofttranslator.com/apps/endpoint?api-version=1.0';
    const signature = await generateTTSSignature(endpointUrl);
    const clientId = randomUUID().replace(/-/g, '');
    
    const headers = {
        'Accept-Language': 'zh-Hans',
        'X-ClientTraceId': clientId,
        'X-MT-Signature': signature,
        'User-Agent': 'okhttp/4.5.0',
        'Content-Type': 'application/json; charset=utf-8'
    };

    const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: headers
    });

    if (!response.ok) {
        throw new Error(`获取TTS Endpoint失败，状态码 ${response.status}`);
    }

    return { endpoint: await response.json(), signature };
}

function generateTTSSignature(urlStr) {
    const url = urlStr.split('://')[1];
    const encodedUrl = encodeURIComponent(url);
    const uuidStr = randomUUID().replace(/-/g, '');
    const formattedDate = new Date().toUTCString();
    const bytesToSign = `MSTranslatorAndroidApp${encodedUrl}${formattedDate}${uuidStr}`.toLowerCase();
    
    const key = Buffer.from('oik6PdDdMnOXemTbwvMn9de/h9lFnfBaCWbGMMZqqoSaQaqUOqjVGm5NqsmjcBI1x+sS9ugjB55HEJWRiFXYFw==', 'base64');
    const hmac = createHmac('sha256', key);
    hmac.update(bytesToSign);
    const signatureBase64 = hmac.digest('base64');
    
    return `MSTranslatorAndroidApp::${signatureBase64}::${formattedDate}::${uuidStr}`;
}

function generateWebSocketSignature(webSocketUrlStr) {
    const url = new URL(webSocketUrlStr);
    const pathAndQuery = url.pathname + url.search;
    const encodedPathAndQuery = encodeURIComponent(pathAndQuery);
    const uuidStr = randomUUID().replace(/-/g, '');
    const formattedDate = new Date().toUTCString();
    const bytesToSign = `MSTranslatorAndroidApp${encodedPathAndQuery}${formattedDate}${uuidStr}`.toLowerCase();
    
    const key = Buffer.from('oik6PdDdMnOXemTbwvMn9de/h9lFnfBaCWbGMMZqqoSaQaqUOqjVGm5NqsmjcBI1x+sS9ugjB55HEJWRiFXYFw==', 'base64');
    const hmac = createHmac('sha256', key);
    hmac.update(bytesToSign);
    const signatureBase64 = hmac.digest('base64');
    
    return `MSTranslatorAndroidApp::${signatureBase64}::${formattedDate}::${uuidStr}`;
}

function generateSSML(text, voiceName, rate, pitch, volume) {
    const escapedText = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
        
    return `<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" version="1.0" xml:lang="zh-CN"><voice name="${voiceName}"><mstts:express-as style="general" styledegree="1.0" role="default"><prosody rate="${rate}%" pitch="${pitch}%" volume="${volume}">${escapedText}</prosody></mstts:express-as></voice></speak>`;
}

function generateAccurateSRT(wordBoundaries) {
    let srt = '';
    const groupSize = 12;
    
    for (let i = 0; i < wordBoundaries.length; i += groupSize) {
        const chunk = wordBoundaries.slice(i, i + groupSize);
        if (chunk.length === 0) continue;
        
        const index = Math.floor(i / groupSize) + 1;
        const startTime = chunk[0].AudioOffset / 10000000;
        const lastWord = chunk[chunk.length - 1];
        const endTime = (lastWord.AudioOffset + lastWord.AudioDuration) / 10000000;
        const text = chunk.map(word => word.Text).join('');
        
        srt += `${index}\n${formatTimeSRT(startTime)} --> ${formatTimeSRT(endTime)}\n${text}\n\n`;
    }
    
    return srt;
}

function formatTimeSRT(seconds) {
    const date = new Date(0);
    date.setSeconds(seconds);
    return date.toISOString().substr(11, 12).replace('.', ',');
}