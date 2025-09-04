// api/tts.js (最终的、基于官方文档的正确版本)

const { TTS, SubMaker } = require("edge-tts-node"); // 修正#1: 我们现在同时取出了音频工具(TTS)和字幕工具(SubMaker)

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

    // 准备好两个工具共用的配置
    const options = { voice, pitch, rate, volume, outputFormat: "audio-24khz-48kbitrate-mono-mp3" };

    // 修正#2: 分别创建音频工具和字幕工具的实例
    const tts = new TTS(options);
    const subMaker = new SubMaker(options);

    // 修正#3: 让两个工具并行工作，以提高效率
    const [audioBuffer, subtitles] = await Promise.all([
      // 任务一：获取音频数据流并转换为Buffer
      (async () => {
        const audioStream = tts.getStream(text);
        const chunks = [];
        for await (const chunk of audioStream) { chunks.push(chunk); }
        return Buffer.concat(chunks);
      })(),
      // 任务二：使用字幕工具获取字幕
      subMaker.getSubtitles(text)
    ]);
    
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
