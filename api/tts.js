// Edge TTS API Proxy for Vercel
const WebSocket = require("ws");
const { Readable } = require("stream");

const SYNTH_URL = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4";

// 工具函数
function formatTime(milliseconds) {
    const date = new Date(milliseconds);
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    const seconds = date.getUTCSeconds().toString().padStart(2, '0');
    const ms = date.getUTCMilliseconds().toString().padStart(3, '0');
    return `${hours}:${minutes}:${seconds},${ms}`;
}

function escape(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function ssml(text, options) {
    const { voice, pitch, rate, volume } = options;
    const lang = voice.slice(0, 5);
    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${lang}"><voice name="${voice}"><prosody pitch="${pitch}" rate="${rate}" volume="${volume}">${escape(text)}</prosody></voice></speak>`;
}

// CORS 头设置
function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
}

// TTS 类
class TTS {
    constructor(options) { 
        this.options = options || {}; 
    }

    async getAudioBuffer(text) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            const ws = new WebSocket(SYNTH_URL);
            let hasError = false;

            const timeout = setTimeout(() => {
                hasError = true;
                ws.terminate();
                reject(new Error('TTS请求超时'));
            }, 30000); // 30秒超时

            ws.on("open", () => {
                try {
                    const configPayload = JSON.stringify({
                        context: { 
                            synthesis: { 
                                audio: { 
                                    metadataoptions: { 
                                        sentenceBoundaryEnabled: "false", 
                                        wordBoundaryEnabled: "false" 
                                    }, 
                                    outputFormat: this.options.outputFormat || "audio-24khz-48kbitrate-mono-mp3" 
                                } 
                            } 
                        }
                    });
                    ws.send(`X-Timestamp:${new Date().toISOString()}\r\nPath:speech.config\r\nContent-Type:application/json; charset=utf-8\r\n\r\n${configPayload}`);
                    
                    const ssmlPayload = ssml(text, this.options);
                    ws.send(`X-Timestamp:${new Date().toISOString()}\r\nPath:ssml\r\nContent-Type:application/ssml+xml\r\n\r\n${ssmlPayload}`);
                } catch (error) {
                    hasError = true;
                    clearTimeout(timeout);
                    reject(error);
                }
            });

            ws.on("message", (data) => {
                if (hasError) return;
                
                if (data instanceof Buffer) {
                    const separator = "Path:audio\r\n";
                    const index = data.indexOf(separator);
                    if (index > -1) {
                        chunks.push(data.slice(index + separator.length));
                    }
                } else if (typeof data === "string" && data.includes("Path:turn.end")) {
                    clearTimeout(timeout);
                    ws.close();
                }
            });

            ws.on("error", (error) => {
                if (!hasError) {
                    hasError = true;
                    clearTimeout(timeout);
                    reject(error);
                }
            });
            
            ws.on("close", () => {
                if (!hasError) {
                    clearTimeout(timeout);
                    resolve(Buffer.concat(chunks));
                }
            });
        });
    }
}

// 字幕生成类
class SubMaker {
    constructor(options) { 
        this.options = options || {}; 
    }

    async getSubtitles(text) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(SYNTH_URL);
            let vtt = "WEBVTT\n\n";
            let hasError = false;

            const timeout = setTimeout(() => {
                hasError = true;
                ws.terminate();
                reject(new Error('字幕生成请求超时'));
            }, 30000);

            ws.on("open", () => {
                try {
                    const configPayload = JSON.stringify({
                        context: { 
                            synthesis: { 
                                audio: { 
                                    metadataoptions: { 
                                        sentenceBoundaryEnabled: "true", 
                                        wordBoundaryEnabled: "false" 
                                    }, 
                                    outputFormat: "audio-24khz-48kbitrate-mono-mp3" 
                                } 
                            } 
                        }
                    });
                    ws.send(`X-Timestamp:${new Date().toISOString()}\r\nPath:speech.config\r\nContent-Type:application/json; charset=utf-8\r\n\r\n${configPayload}`);

                    const ssmlPayload = ssml(text, this.options);
                    ws.send(`X-Timestamp:${new Date().toISOString()}\r\nPath:ssml\r\nContent-Type:application/ssml+xml\r\n\r\n${ssmlPayload}`);
                } catch (error) {
                    hasError = true;
                    clearTimeout(timeout);
                    reject(error);
                }
            });

            ws.on("message", (data) => {
                if (hasError) return;
                
                if (typeof data === "string") {
                    if (data.includes("Path:speech.sentence")) {
                        try {
                            const metadata = JSON.parse(data.split("\r\n\r\n")[1]);
                            const startTime = metadata.Offset / 10000;
                            const endTime = (metadata.Offset + metadata.Duration) / 10000;
                            vtt += `${formatTime(startTime)} --> ${formatTime(endTime)}\n${metadata.Text}\n\n`;
                        } catch (e) {
                            console.warn('解析字幕元数据失败:', e);
                        }
                    } else if (data.includes("Path:turn.end")) {
                        clearTimeout(timeout);
                        ws.close();
                    }
                }
            });
            
            ws.on("error", (error) => {
                if (!hasError) {
                    hasError = true;
                    clearTimeout(timeout);
                    reject(error);
                }
            });
            
            ws.on("close", () => {
                if (!hasError) {
                    clearTimeout(timeout);
                    resolve(vtt);
                }
            });
        });
    }
}

// 默认TTS选项
const DEFAULT_OPTIONS = {
    voice: 'zh-CN-XiaoxiaoNeural',
    pitch: '+0Hz',
    rate: '+0%',
    volume: '+0%',
    outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
};

// Vercel API 处理函数
export default async function handler(req, res) {
    // 处理 CORS 预检请求
    if (req.method === 'OPTIONS') {
        setCorsHeaders(res);
        return res.status(200).end();
    }

    setCorsHeaders(res);

    try {
        // 只接受 POST 请求
        if (req.method !== 'POST') {
            return res.status(405).json({ 
                error: '方法不允许', 
                message: '只支持POST请求' 
            });
        }

        // 解析请求体
        const { text, voice, pitch, rate, volume, outputFormat, type } = req.body;

        // 验证必需参数
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return res.status(400).json({ 
                error: '参数错误', 
                message: '文本内容不能为空' 
            });
        }

        if (text.length > 5000) {
            return res.status(400).json({ 
                error: '参数错误', 
                message: '文本长度不能超过5000个字符' 
            });
        }

        // 合并选项
        const options = {
            ...DEFAULT_OPTIONS,
            voice: voice || DEFAULT_OPTIONS.voice,
            pitch: pitch || DEFAULT_OPTIONS.pitch,
            rate: rate || DEFAULT_OPTIONS.rate,
            volume: volume || DEFAULT_OPTIONS.volume,
            outputFormat: outputFormat || DEFAULT_OPTIONS.outputFormat
        };

        // 根据类型处理请求
        if (type === 'subtitle') {
            // 生成字幕
            const subMaker = new SubMaker(options);
            const vttContent = await subMaker.getSubtitles(text);
            
            res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename="subtitle.vtt"');
            return res.status(200).send(vttContent);
        } else {
            // 生成音频（默认）
            const tts = new TTS(options);
            const audioBuffer = await tts.getAudioBuffer(text);
            
            if (!audioBuffer || audioBuffer.length === 0) {
                return res.status(500).json({ 
                    error: '服务错误', 
                    message: '音频生成失败' 
                });
            }

            // 设置音频响应头
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Content-Length', audioBuffer.length);
            res.setHeader('Content-Disposition', 'attachment; filename="speech.mp3"');
            
            return res.status(200).send(audioBuffer);
        }

    } catch (error) {
        console.error('TTS API 错误:', error);
        
        return res.status(500).json({ 
            error: '服务器内部错误', 
            message: error.message || '未知错误',
            timestamp: new Date().toISOString()
        });
    }
}
