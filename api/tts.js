// api/tts.js (最终诊断版本)

const edgeTtsModule = require("edge-tts-node");

module.exports = async (req, res) => {
  // --- 核心诊断代码 ---
  // 我们将在日志中打印出导入的模块到底是什么样子
  console.log("--- 诊断开始 ---");
  console.log("检查 'edge-tts-node' 模块的内容:");
  console.log(edgeTtsModule);
  console.log("模块的类型是:", typeof edgeTtsModule);
  console.log("--- 诊断结束 ---");
  // --- 诊断代码结束 ---

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 我们将尝试一种更健壮的方式来获取TTS类
    // 某些打包工具会把 CommonJS 模块包在一个 default 属性里
    const TTS = edgeTtsModule.default || edgeTtsModule;

    // 如果我们拿到的东西依然不是一个函数/类，就主动报错
    if (typeof TTS !== 'function') {
      throw new Error(`无法从导入的模块中解析出TTS构造函数。模块类型为: ${typeof edgeTtsModule}`);
    }
    
    const { text, voice = 'zh-CN-XiaochenNeural' } = req.body;
    if (!text) {
      return res.status(400).json({ success: false, message: 'Text is required' });
    }

    const tts = new TTS({ voice, outputFormat: "audio-24khz-48kbitrate-mono-mp3" });
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
