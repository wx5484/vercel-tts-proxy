# Edge TTS API Proxy

基于 Vercel 平台的 Microsoft Edge TTS API 代理服务。

## 功能特性

- 🎤 支持多种语音合成
- 📝 自动生成字幕文件（VTT格式）
- 🌐 跨域支持（CORS）
- ⚡ 基于 Vercel 的快速部署
- 🔧 可自定义语音参数

## 部署到 Vercel

1. Fork 或下载此仓库
2. 在 Vercel 中导入项目
3. 部署完成后即可使用

或者使用 Vercel CLI：

```bash
npm install -g vercel
vercel --prod
```

## API 使用方法

### 生成语音

```bash
curl -X POST https://your-app.vercel.app/api/tts \
  -H "Content-Type: application/json" \
  -d '{
    "text": "你好，这是一个测试",
    "voice": "zh-CN-XiaoxiaoNeural",
    "pitch": "+0Hz",
    "rate": "+0%",
    "volume": "+0%"
  }' \
  --output speech.mp3
```

### 生成字幕

```bash
curl -X POST https://your-app.vercel.app/api/tts \
  -H "Content-Type: application/json" \
  -d '{
    "text": "你好，这是一个测试",
    "voice": "zh-CN-XiaoxiaoNeural",
    "type": "subtitle"
  }' \
  --output subtitle.vtt
```

## 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| `text` | string | 是 | - | 要转换的文本内容（最大5000字符） |
| `voice` | string | 否 | zh-CN-XiaoxiaoNeural | 语音类型 |
| `pitch` | string | 否 | +0Hz | 音调调节 |
| `rate` | string | 否 | +0% | 语速调节 |
| `volume` | string | 否 | +0% | 音量调节 |
| `type` | string | 否 | audio | 输出类型：audio（音频）或 subtitle（字幕） |
| `outputFormat` | string | 否 | audio-24khz-48kbitrate-mono-mp3 | 音频输出格式 |

## 支持的语音

常用中文语音：
- `zh-CN-XiaoxiaoNeural` - 晓晓（女声）
- `zh-CN-YunxiNeural` - 云希（男声）
- `zh-CN-YunjianNeural` - 云健（男声）
- `zh-CN-XiaoyiNeural` - 晓伊（女声）
- `zh-CN-YunyangNeural` - 云扬（男声）

更多语音类型请参考微软官方文档。

## 响应格式

### 成功响应
- 音频请求：返回 MP3 音频文件
- 字幕请求：返回 VTT 字幕文件

### 错误响应
```json
{
  "error": "错误类型",
  "message": "错误详情",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 限制说明

- 单次请求文本长度限制：5000 字符
- 请求超时时间：30 秒
- 支持的方法：POST
- 需要正确的 Content-Type: application/json

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 部署到生产环境
npm run deploy
```

## 许可证

MIT License