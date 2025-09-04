// api/tts.js

const { TTS } = require("edge-tts-node");

// 这是Vercel处理Serverless函数的标准方式
module.exports = async (req, res) => {
  // 只接受POST请求
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  try {
    // 从请求体中获取参数，并提供默认值
    const {
      text,
      voice = 'zh-CN-XiaochenNeural',
      rate = '+0%',
      pitch = '+0Hz',
      volume = '100%'
    } = req.body;

    if (!text) {
      return res.status(400).json({ success: false, message: 'Text is required' });
    }

    // 创建TTS实例
    const tts = new TTS({
      voice: voice,
      pitch: pitch,
      rate: rate,
      volume: volume,
      outputFormat: "audio-24khz-48kbitrate-mono-mp3"
    });

    // 获取字幕数据
    const subtitles = await tts.getSubtitles(text);
    
    // 获取音频流并转换为Base64
    const audioStream = tts.getStream(text);
    const chunks = [];
    for await (const chunk of audioStream) {
      chunks.push(chunk);
    }
    const audioBuffer = Buffer.concat(chunks);
    const audioBase64 = audioBuffer.toString('base64');
    
    // 将VTT字幕格式转换为SRT格式
    const srtContent = vttToSrt(subtitles);

    // 成功响应
    return res.status(200).json({
      success: true,
      audio_base64: audioBase64,
      srt_string: srtContent,
    });

  } catch (error) {
    console.error('TTS generation failed:', error);
    // 失败响应
    return res.status(500).json({ success: false, message: 'Failed to generate TTS audio.', error: error.message });
  }
};

// VTT to SRT 转换函数
function vttToSrt(vttContent) {
  let srtContent = "";
  const lines = vttContent.split("\n");
  let index = 1;
  let i = 0;
  
  // 跳过WebVTT文件头
  while(i < lines.length && !lines[i].includes('-->')) {
    i++;
  }

  for (; i < lines.length; i++) {
    if (lines[i] && lines[i].includes('-->')) {
      const timeLine = lines[i].replace(/\./g, ',');
      const textLine = lines[i + 1];
      
      if(timeLine && textLine) {
        srtContent += `${index}\n`;
        srtContent += `${timeLine}\n`;
        srtContent += `${textLine}\n\n`;
        index++;
        i++; // 跳过下一行文本行
      }
    }
  }
  return srtContent;
}
