const { TTS, SubMaker } = require("../lib/ms-edge-tts.js"); // <-- 注意路径的变化

module.exports = async (req, res) => {
  // The rest of the code is identical to our last attempt
  if (req.method !== 'POST') {
     return res.status(405).json({ error: 'Method Not Allowed' });
  }
  try {
    const { text, voice = 'zh-CN-XiaochenNeural' } = req.body;
    if (!text) { return res.status(400).json({ message: 'Text is required' }); }

    const options = { voice };
    const tts = new TTS(options);
    const subMaker = new SubMaker(options);

    const [audioBuffer, subtitles] = await Promise.all([
      (async () => {
        const audioStream = tts.getStream(text);
        const chunks = [];
        for await (const chunk of audioStream) { chunks.push(chunk); }
        return Buffer.concat(chunks);
      })(),
      subMaker.getSubtitles(text)
    ]);
    
    const audioBase64 = audioBuffer.toString('base64');
    const srtContent = vttToSrt(subtitles);

    res.status(200).json({ success: true, audio_base_64: audioBase64, srt_string: srtContent });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal error.', error: error.message });
  }
};

function vttToSrt(vttContent) {
   // ... same vttToSrt function as before ...
   let srt = "";
   const lines = vttContent.split("\n");
   let index = 1; let i = 0;
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
```    *   提交文件。
