// api/tts.js (最终修正版)

const { MsEdgeTTS } = require("edge-tts-node"); // <-- 修正#1：我们现在正确地取出了 MsEdgeTTS

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { text, voice = 'zh-CN-XiaochenNeural', rate = '+0%', pitch = '+0Hz', volume = '100%' } = req.body;
    if (!text) {
      return res.status(400).json({ success: false, message: 'Text is required' });
    }

    // 修正#2：我们现在使用正确的 MsEdgeTTS 来创建实例
    const tts = new MsEdgeTTS({ voice, pitch, rate, volume, outputFormat: "audio-24khz-48kbitrate-mono-mp3" });
    
    const subtitles = await tts.getSubtitles(text);
    
    const audioStream = tts.getStream(text);
    const chunks = [];
    for await (const chunk of audioStream) { chunks.push(chunk); }
    const audioBuffer = Buffer.concat(chunks);
    const audioBase64 = audioBuffer.toString('base64');
    
    const srtContent = vttToSrt(subtitles);

    res.status(200).json({ success: true, audio_base_64: audioBase64, srt_string: srtContent });

  } catch (error) {
    console.error("最终捕捉到的错误:", error);
    res.status(500).json({ success: false, message: '代理服务内部错误。', error: error.message });
  }
};

function vttToSrt(vttContent) {
  let srt = "";
  const lines = vttContent.split("\n");
  let index = 1;
  let i = 0;
  while(i < lines.length && !lines[i].includes('-->')) { i++; }
  for (; i < lines.length; i++) {
    if (lines[i] && lines[i].includes('-->')) {
      const timeLine = lines[i].replace(/\./g, ',');
      const textLine = lines[i + 1];
      if(timeLine && textLine) {
        srt += `${index++}\n${timeLine}\n${textLine}\n\n`;
        i++;
      }
    }
  }
  return srt;
}
