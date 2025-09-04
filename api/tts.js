// /api/proxy-edge-tts.js

const WebSocket = require('ws');

// Vercel Serverless Function 会自动处理请求和响应对象
export default async function handler(request, response) {
    // 1. 确认这是POST请求
    if (request.method !== 'POST') {
        response.status(405).json({ error: 'Method Not Allowed' });
        return;
    }

    try {
        // 2. 解析从Cloudflare Worker发来的请求体
        const requestData = request.body;
        // 假设请求体中包含了需要合成的文本等信息
        // const textToSynthesize = requestData.text;

        // 3. 建立到微软Edge TTS的WebSocket连接
        // 注意：URL需要替换为微软官方的WebSocket地址
        const ttsSocketUrl = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=...';
        const socket = new WebSocket(ttsSocketUrl, {
            headers: {
                'User-Agent': 'YOUR_USER_AGENT', // 可能需要模拟浏览器User-Agent
                'Origin': 'chrome-extension://...', // 可能需要一个有效的Origin
            }
        });

        // 用于存储接收到的音频和字幕数据
        const audioChunks = [];
        let subtitles = [];

        // 4. 定义WebSocket事件处理
        socket.on('open', () => {
            console.log('WebSocket connection established with Microsoft TTS.');
            // 连接成功后，发送初始化或配置消息
            // 这部分需要参考微软TTS的官方文档或网络分析
            // 例如:
            // const configMessage = { ... };
            // socket.send(JSON.stringify(configMessage));
            // const textMessage = { text: textToSynthesize, ... };
            // socket.send(JSON.stringify(textMessage));
        });

        socket.on('message', (data) => {
            // 处理从微软服务器收到的消息
            // 这通常是二进制的音频数据或JSON格式的字幕/元数据
            if (typeof data === 'string') {
                // 可能是JSON格式的元数据或字幕
                try {
                    const messageJson = JSON.parse(data);
                    if (messageJson.type === 'subtitle') {
                        subtitles.push(messageJson.data);
                    }
                } catch (e) {
                    // 非JSON字符串
                }
            } else if (data instanceof Buffer) {
                // 二进制音频数据
                audioChunks.push(data);
            }
        });

        socket.on('close', () => {
            console.log('WebSocket connection closed.');
            // 当连接关闭时，说明所有数据都已接收完毕
            // 5. 整合数据并通过HTTP响应返回
            const finalAudioBuffer = Buffer.concat(audioChunks);

            // 将结果一次性返回给Cloudflare Worker
            response.status(200).json({
                audio: finalAudioBuffer.toString('base64'), // 通常将二进制数据编码为Base64字符串
                subtitles: subtitles
            });
        });

        socket.on('error', (error) => {
            console.error('WebSocket error:', error);
            // 6. 错误处理
            if (!response.headersSent) {
                response.status(500).json({ error: 'WebSocket connection error' });
            }
        });

    } catch (error) {
        console.error('Server-side error:', error);
        if (!response.headersSent) {
            response.status(500).json({ error: 'Internal Server Error' });
        }
    }
}
