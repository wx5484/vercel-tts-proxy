const { TTS } = require("edge-tts-node");

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { text, voice = 'zh-CN-XiaochenNeural' } = req.body;
    if (!text) { return res.status(400).json({ message: 'Text is required' }); }
    
    const tts = new TTS({ voice, outputFormat: "audio-24khz-48kbitrate-mono-mp3" });
    const subtitles = await tts.getSubtitles(text);
    
    const audioStream = tts.getStream(text);
    const chunks = [];
    for await (const chunk of audioStream) { chunks.push(chunk); }
    const audioBuffer = Buffer.concat(chunks);
    const audioBase64 = audioBuffer.toString('base64');
    
    const srtContent = vttToSrt(subtitles);

    res.status(200).json({ audio_base_64: audioBase64, srt_string: srtContent });
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to generate audio.' });
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
