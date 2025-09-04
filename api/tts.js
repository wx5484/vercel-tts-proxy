// api/tts.js

// 这是Vercel最标准的处理函数语法
export default function handler(request, response) {
  
  // 无论如何，都返回一个成功的JSON信息
  response.status(200).json({
    message: '诊断API已成功部署！',
    timestamp: new Date().toISOString(),
  });
}
