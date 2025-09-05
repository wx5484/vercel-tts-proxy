// /api/tts.js

// 核心依赖，请确保已安装: npm install ws node-fetch
const WebSocket = require('ws');
const fetch = require('node-fetch');
const crypto = require('crypto');

// ==============================================================================
// Vercel Serverless Function 主入口
// ==============================================================================
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


    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { text, voice = 'zh-CN-XiaochenNeural', rate = 0, pitch = 0, volume = 50 } = req.body;

        if (!text || !text.trim()) {
            return res.status(400).json({ success: false, message: '请提供要转换的文本' });
        }
        
        // 1. 【新功能】文本预处理：去除标点并智能分块
        const textChunks = preprocessText(text);

        // 2. 获取一次性的 TTS 服务端点和认证信息
        const { endpoint } = await getTTSEndpoint();
        const trustedToken = endpoint.t;

        const allAudioChunks = [];
        let allWordBoundaries = [];
        let totalAudioDurationNs = 0; // 用于校正后续字幕的时间轴

        // 3. 【新功能】循环处理每一个文本块
        for (const chunk of textChunks) {
            const ssml = generateSSML(chunk, voice, rate, pitch, volume);
            const webSocketUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${trustedToken}`;
            const clientId = crypto.randomUUID().replace(/-/g, '');
            const webSocketSignature = await generateWebSocketSignature(webSocketUrl);

            // 为当前块获取音频和词边界
            const result = await getAudioAndSubtitlesFromWebSocket(webSocketUrl, webSocketSignature, clientId, ssml);
            
            allAudioChunks.push(result.audioBuffer);

            // 【关键】校正当前块的字幕时间戳
            const correctedBoundaries = result.wordBoundaries.map(wb => ({
                ...wb,
                AudioOffset: wb.AudioOffset + totalAudioDurationNs
            }));
            allWordBoundaries = allWordBoundaries.concat(correctedBoundaries);

            // 更新总时长，为下一个块做准备
            if (result.wordBoundaries.length > 0) {
                const lastWord = result.wordBoundaries[result.wordBoundaries.length - 1];
                totalAudioDurationNs += lastWord.AudioOffset + lastWord.AudioDuration;
            }
        }

        // 4. 合并所有结果
        const finalAudioBuffer = Buffer.concat(allAudioChunks);
        const audioBase64 = finalAudioBuffer.toString('base64');
        const srtContent = generateAccurateSRT(allWordBoundaries);
        const actualDuration = totalAudioDurationNs / 10000000;

        // 5. 返回最终结果
        return res.status(200).json({
            success: true,
            audio_base64: audioBase64,
            srt_string: srtContent,
            message: '语音生成成功',
            voice, rate, pitch, volume,
            duration: actualDuration
        });

    } catch (error) {
        console.error('Vercel 代理 TTS 处理错误:', error);
        return res.status(500).json({ success: false, message: `语音合成失败: ${error.message}` });
    }
}

// ==============================================================================
// 【新功能】文本预处理函数
// ==============================================================================
function preprocessText(text) {
    // 1. 移除非中文字符、字母和数字之外的所有标点和符号
    const cleanedText = text.replace(/[^\p{L}\p{N}\s]/gu, '');

    // 2. 将文本按常见结束符（。！？）分割，并确保每块不超过一个合理的长度（例如200）
    const sentences = cleanedText.split(/(?<=[。！？])/).filter(s => s.trim());
    const chunks = [];
    const maxLength = 200;

    sentences.forEach(sentence => {
        if (sentence.length <= maxLength) {
            chunks.push(sentence);
        } else {
            // 如果句子本身超长，则进行硬切分
            for (let i = 0; i < sentence.length; i += maxLength) {
                chunks.push(sentence.substring(i, i + maxLength));
            }
        }
    });

    console.log('文本被切分为', chunks.length, '块');
    return chunks.filter(c => c.trim()); // 过滤掉可能的空块
}


// ==============================================================================
// 核心 WebSocket 通信逻辑 (与上一版相同，但更健壮)
// ==============================================================================
function getAudioAndSubtitlesFromWebSocket(url, signature, clientId, ssml) {
    return new Promise((resolve, reject) => {
        // ... (此处省略与我上一回答中完全相同的 getAudioAndSubtitlesFromWebSocket 函数代码)
        // ... 请将我上一个回答中此函数的完整代码粘贴到这里 ...
        const headers = {
            'X-ClientTraceId': clientId,
            'X-MT-Signature': signature,
            'Origin': 'https://azure.microsoft.com',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        };
        const ws = new WebSocket(url, 'edge-tts', { headers });
        let audioChunks = [];
        let wordBoundaries = [];
        let responseSent = false;
        const timeout = setTimeout(() => {
            if (!responseSent) {
                responseSent = true;
                ws.close();
                reject(new Error('WebSocket 操作超时'));
            }
        }, 30000);
        ws.on('open', () => {
            const configMessage = { context: { synthesis: { audio: { metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'true' }, outputFormat: 'audio-24khz-48kbitrate-mono-mp3' } } } };
            ws.send(`X-Timestamp:${new Date().toISOString()}\r\nPath:speech.config\r\nContent-Type:application/json; charset=utf-8\r\n\r\n${JSON.stringify(configMessage)}`);
            ws.send(`X-Timestamp:${new Date().toISOString()}\r\nPath:ssml\r\nContent-Type:application/ssml+xml\r\n\r\n${ssml}`);
        });
        ws.on('message', (data) => {
            if (typeof data === 'string') {
                const lines = data.split('\r\n');
                const path = lines.find(line => line.startsWith('Path:'));
                if (path && path.includes('wordBoundary')) {
                    const jsonStr = lines.find(line => line.startsWith('{'));
                    if (jsonStr) wordBoundaries.push(JSON.parse(jsonStr));
                } else if (path && path.includes('turn.end')) {
                    clearTimeout(timeout);
                    if (!responseSent) {
                        responseSent = true;
                        if (audioChunks.length > 0) {
                            resolve({ audioBuffer: Buffer.concat(audioChunks), wordBoundaries });
                        } else {
                            reject(new Error('未收到任何音频数据'));
                        }
                    }
                    ws.close();
                }
            } else if (data instanceof Buffer) {
                const headerLength = data.readUInt16BE(0);
                const audioData = data.slice(2 + headerLength);
                audioChunks.push(audioData);
            }
        });
        ws.on('error', (error) => {
            clearTimeout(timeout);
            if (!responseSent) {
                responseSent = true;
                reject(new Error(`WebSocket 连接失败: ${error.message}`));
            }
        });
        ws.on('close', (code, reason) => {
            clearTimeout(timeout);
            if (!responseSent) {
                responseSent = true;
                if (audioChunks.length === 0) {
                     reject(new Error(`WebSocket 意外关闭。代码: ${code}, 原因: ${reason || '无'}`));
                }
            }
        });
    });
}


// ==============================================================================
// 认证、签名及其他辅助函数 (与上一版相同)
// ==============================================================================
// ... (此处省略所有签名和辅助函数: getTTSEndpoint, generateTTSSignature, 
//      generateWebSocketSignature, generateSSML, generateAccurateSRT, formatTimeSRT)
// ... 请将我上一个回答中这些函数的完整代码粘贴到这里 ...
async function getTTSEndpoint() {
    const endpointUrl = 'https://dev.microsofttranslator.com/apps/endpoint?api-version=1.0';
    const signature = await generateTTSSignature(endpointUrl);
    const clientId = crypto.randomUUID().replace(/-/g, '');
    const headers = { 'Accept-Language': 'zh-Hans', 'X-ClientTraceId': clientId, 'X-MT-Signature': signature, 'User-Agent': 'okhttp/4.5.0', 'Content-Type': 'application/json; charset=utf-8' };
    const response = await fetch(endpointUrl, { method: 'POST', headers });
    if (!response.ok) throw new Error(`获取TTS Endpoint失败，状态码 ${response.status}`);
    return { endpoint: await response.json(), signature };
}
function generateTTSSignature(urlStr) {
    const url = urlStr.split('://')[1];
    const encodedUrl = encodeURIComponent(url);
    const uuidStr = crypto.randomUUID().replace(/-/g, '');
    const formattedDate = new Date().toUTCString();
    const bytesToSign = `MSTranslatorAndroidApp${encodedUrl}${formattedDate}${uuidStr}`.toLowerCase();
    const key = Buffer.from('oik6PdDdMnOXemTbwvMn9de/h9lFnfBaCWbGMMZqqoSaQaqUOqjVGm5NqsmjcBI1x+sS9ugjB55HEJWRiFXYFw==', 'base64');
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(bytesToSign);
    const signatureBase64 = hmac.digest('base64');
    return `MSTranslatorAndroidApp::${signatureBase64}::${formattedDate}::${uuidStr}`;
}
function generateWebSocketSignature(webSocketUrlStr) {
    const url = new URL(webSocketUrlStr);
    const pathAndQuery = url.pathname + url.search;
    const encodedPathAndQuery = encodeURIComponent(pathAndQuery);
    const uuidStr = crypto.randomUUID().replace(/-/g, '');
    const formattedDate = new Date().toUTCString();
    const bytesToSign = `MSTranslatorAndroidApp${encodedPathAndQuery}${formattedDate}${uuidStr}`.toLowerCase();
    const key = Buffer.from('oik6PdDdMnOXemTbwvMn9de/h9lFnfBaCWbGMMZqqoSaQaqUOqjVGm5NqsmjcBI1x+sS9ugjB55HEJWRiFXYFw==', 'base64');
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(bytesToSign);
    const signatureBase64 = hmac.digest('base64');
    return `MSTranslatorAndroidApp::${signatureBase64}::${formattedDate}::${uuidStr}`;
}
function generateSSML(text, voiceName, rate, pitch, volume) {
    const escapedText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
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
