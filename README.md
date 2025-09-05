# Vercel TTS 代理服务

这是一个部署在 Vercel 平台上的 Edge TTS API 代理服务，专门为解决 Cloudflare Worker 中 WebSocket 连接限制而设计。

## 🚀 功能特性

- ✅ 完全兼容 ES 模块（解决 `ERR_REQUIRE_ESM` 错误）
- ✅ 支持文本智能分块处理
- ✅ 生成高质量音频和精确字幕
- ✅ 完整的 CORS 支持
- ✅ 30秒超时保护
- ✅ 错误处理和日志记录

## 📦 部署方式

### 方式一：Vercel CLI 部署

```bash
# 1. 安装依赖
npm install

# 2. 部署到 Vercel
npx vercel --prod
```

### 方式二：Git 连接部署

1. 将代码推送到 GitHub 仓库
2. 在 Vercel 控制台连接 GitHub 仓库
3. Vercel 会自动部署

### 方式三：拖拽部署

1. 压缩整个项目文件夹
2. 在 Vercel 控制台直接拖拽上传

## 🔧 配置说明

### 项目结构
```
vercel-tts-proxy/
├── api/
│   └── tts.js          # 主要的 TTS API 端点
├── public/
│   └── index.html      # 测试页面
├── package.json        # 依赖配置
├── vercel.json         # Vercel 配置
└── README.md          # 说明文档
```

### 重要配置

**package.json 关键配置：**
```json
{
  "type": "module",
  "engines": {
    "node": ">=18"
  }
}
```

**vercel.json 配置：**
```json
{
  "functions": {
    "api/**/*.js": {
      "maxDuration": 30
    }
  }
}
```

## 📡 API 接口

### POST /api/tts

文本转语音接口

**请求体：**
```json
{
  "text": "要转换的文本",
  "voice": "zh-CN-XiaochenNeural",
  "rate": 0,
  "pitch": 0,
  "volume": 50
}
```

**响应：**
```json
{
  "success": true,
  "audio_base64": "base64编码的音频数据",
  "srt_string": "SRT格式字幕",
  "message": "语音生成成功",
  "voice": "zh-CN-XiaochenNeural",
  "rate": 0,
  "pitch": 0,
  "volume": 50,
  "duration": 5.234,
  "chunks": 2
}
```

## 🔗 与 Cloudflare Worker 集成

在你的 Cloudflare Worker 中使用这个代理：

```javascript
const VERCEL_PROXY_URL = "https://your-vercel-app.vercel.app/api/tts";

router.post('/api/edge-tts', async (request, env) => {
  // 1. 身份验证
  const authResult = requireAuth(request, env);
  if (!authResult.success) {
    return errorResponse(authResult.message, 401);
  }

  // 2. 获取请求参数
  const payload = await request.json();

  // 3. 转发到 Vercel 代理
  const proxyResponse = await fetch(VERCEL_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  // 4. 返回结果
  const result = await proxyResponse.json();
  return jsonResponse(result);
});
```

## 🐛 问题解决

### 常见错误及解决方案

1. **ERR_REQUIRE_ESM 错误**
   - ✅ 已解决：使用 ES 模块语法和正确的 package.json 配置

2. **WebSocket 连接失败**
   - 检查网络连接
   - 确保使用正确的签名和令牌

3. **超时错误**
   - 文本会自动分块处理
   - 每个块有30秒超时保护

## 📝 更新日志

### v1.0.0 (2025-09-05)
- ✅ 完全重构，解决 ES 模块兼容性问题
- ✅ 优化文本分块算法
- ✅ 改进错误处理和日志记录
- ✅ 添加完整的测试页面

## 📞 技术支持

如果遇到问题，请检查：
1. Node.js 版本 >= 18
2. package.json 中的 "type": "module" 配置
3. vercel.json 中的函数超时配置
4. API 请求格式是否正确

## 🔒 安全说明

- 本服务使用微软官方的 Edge TTS API
- 所有请求都通过 HTTPS 加密
- 不存储任何用户数据
- 建议在生产环境中添加适当的访问控制