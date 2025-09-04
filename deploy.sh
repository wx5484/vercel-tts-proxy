#!/bin/bash

echo "开始部署 Edge TTS API 到 Vercel..."

# 检查是否安装了 Vercel CLI
if ! command -v vercel &> /dev/null; then
    echo "正在安装 Vercel CLI..."
    npm install -g vercel
fi

# 登录 Vercel（如果需要）
echo "请确保已登录 Vercel..."
vercel login

# 部署到生产环境
echo "正在部署到生产环境..."
vercel --prod

echo "部署完成！"
echo "访问你的应用：https://your-app-name.vercel.app"
