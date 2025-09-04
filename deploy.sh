#!/bin/bash

# Edge TTS API Proxy 部署脚本

echo \"🚀 开始部署 Edge TTS API Proxy 到 Vercel...\"

# 检查是否安装了 Vercel CLI
if ! command -v vercel &> /dev/null; then
    echo \"❌ 未找到 Vercel CLI，正在安装...\"
    npm install -g vercel
fi

# 检查是否已登录
echo \"🔐 检查 Vercel 登录状态...\"
vercel whoami > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo \"📝 请先登录 Vercel...\"
    vercel login
fi

# 部署到生产环境
echo \"📦 部署到生产环境...\"
vercel --prod

if [ $? -eq 0 ]; then
    echo \"✅ 部署成功！\"
    echo \"🌐 您的 API 现在可以通过以下方式访问：\"
    echo \"   - 语音生成: POST https://your-domain.vercel.app/api/tts\"
    echo \"   - 测试页面: https://your-domain.vercel.app/\"
    echo \"\"
    echo \"📖 API 使用示例：\"
    echo 'curl -X POST https://your-domain.vercel.app/api/tts \\'
    echo '  -H \"Content-Type: application/json\" \\'
    echo '  -d '\\'{\"text\":\"你好世界\",\"voice\":\"zh-CN-XiaoxiaoNeural\"}\\'' \\'
    echo '  --output speech.mp3'
else
    echo \"❌ 部署失败，请检查错误信息\"
    exit 1
fi