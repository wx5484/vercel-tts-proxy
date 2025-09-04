# Edge TTS API Proxy

基于 Vercel 平台的 Microsoft Edge TTS API 代理服务。

## 功能特性

- 🎤 支持多种语音合成
- 📝 自动生成字幕文件（VTT格式）
- 🌐 跨域支持（CORS）
- ⚡ 基于 Vercel 的快速部署
- 🔧 可自定义语音参数

## 部署到 Vercel

### 方式一：通过 Vercel 网站部署
1. Fork 或下载此仓库
2. 在 [Vercel](https://vercel.com) 中导入项目
3. 设置构建命令为：`echo 'Build completed'`
4. 设置输出目录为：`public`
5. 部署完成后访问根域名（例如：https://your-app.vercel.app）

### 方式二：使用 Vercel CLI
```bash
npm install -g vercel
vercel login
vercel --prod
```

### 方式三：使用部署脚本
```bash
chmod +x deploy.sh
./deploy.sh
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

## 常见问题

### Q: 访问网站时显示 404 错误
**A:** 请确保访问的是根域名，而不是 `/public/index.html` 路径。正确的访问地址应该是：
- ✅ 正确：`https://your-app.vercel.app/`
- ❌ 错误：`https://your-app.vercel.app/public/index.html`

### Q: API 调用失败
**A:** 请检查：
1. 请求方法是否为 POST
2. Content-Type 是否设置为 `application/json`
3. 请求体格式是否正确
4. 文本内容是否超过 5000 字符

### Q: 部署后无法访问
**A:** 请检查 Vercel 项目设置：
1. 构建命令设置为：`echo 'Build completed'`
2. 输出目录设置为：`public`
3. 或者使用自动检测（推荐）



```
