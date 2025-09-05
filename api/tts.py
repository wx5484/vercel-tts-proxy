"""
Python TTS代理服务 - 基于edge-tts库
部署到Vercel的无服务器函数

优势:
1. 直接使用成熟的edge-tts Python库
2. 支持精确的字幕时间戳
3. 不需要处理复杂的WebSocket连接
4. 库维护活跃，稳定可靠
"""

import asyncio
import base64
import json
import tempfile
import os
from typing import Dict, Any

try:
    import edge_tts
    from edge_tts import VoicesManager
except ImportError:
    # 如果没有安装，返回错误信息
    edge_tts = None

async def process_tts_request(request_body: Dict[str, Any]) -> Dict[str, Any]:
    """
    Vercel无服务器函数处理器
    """
    try:
        # 检查edge-tts库是否可用
        if edge_tts is None:
            return {
                "statusCode": 500,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Content-Type": "application/json"
                },
                "body": json.dumps({
                    "success": False,
                    "message": "edge-tts库未安装，请在requirements.txt中添加edge-tts"
                })
            }

        # 解析请求参数
        text = request_body.get('text', '')
        voice = request_body.get('voice', 'zh-CN-XiaochenNeural')
        rate = request_body.get('rate', 0)
        pitch = request_body.get('pitch', 0)
        volume = request_body.get('volume', 50)

        if not text or not text.strip():
            return {
                "statusCode": 400,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Content-Type": "application/json"
                },
                "body": json.dumps({
                    "success": False,
                    "message": "请提供要转换的文本"
                })
            }

        print(f"处理TTS请求: text_length={len(text)}, voice={voice}")

        # 使用edge-tts生成音频和字幕
        result = await generate_tts_with_subtitles(text, voice, rate, pitch, volume)
        
        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json"
            },
            "body": json.dumps({
                "success": True,
                "audio_base64": result["audio_base64"],
                "srt_string": result["srt_content"],
                "message": "语音生成成功",
                "voice": voice,
                "rate": rate,
                "pitch": pitch,
                "volume": volume,
                "duration": result["duration"],
                "engine": "edge-tts-python"
            })
        }

    except Exception as e:
        print(f"TTS处理错误: {str(e)}")
        return {
            "statusCode": 500,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json"
            },
            "body": json.dumps({
                "success": False,
                "message": f"语音生成失败: {str(e)}"
            })
        }


async def generate_tts_with_subtitles(text: str, voice: str, rate: int, pitch: int, volume: int) -> Dict[str, Any]:
    """
    使用edge-tts生成音频和精确字幕
    """
    # 构建SSML参数
    rate_str = f"{rate:+d}%" if rate != 0 else "+0%"
    pitch_str = f"{pitch:+d}Hz" if pitch != 0 else "+0Hz"
    volume_str = f"{volume:+d}%"

    # 创建临时文件
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as audio_file:
        audio_path = audio_file.name
    
    with tempfile.NamedTemporaryFile(suffix=".vtt", delete=False) as subtitle_file:
        subtitle_path = subtitle_file.name

    try:
        # 使用edge-tts生成音频和字幕
        communicate = edge_tts.Communicate(
            text=text,
            voice=voice,
            rate=rate_str,
            pitch=pitch_str,
            volume=volume_str
        )

        # 同时生成音频和字幕文件
        submaker = edge_tts.SubMaker()
        
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                with open(audio_path, "ab") as f:
                    f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                submaker.create_sub((chunk["offset"], chunk["duration"]), chunk["text"])

        # 生成字幕文件
        with open(subtitle_path, "w", encoding="utf-8") as f:
            f.write(submaker.generate_subs())

        # 读取音频文件并转换为base64
        with open(audio_path, "rb") as f:
            audio_data = f.read()
            audio_base64 = base64.b64encode(audio_data).decode('utf-8')

        # 读取字幕文件并转换为SRT格式
        with open(subtitle_path, "r", encoding="utf-8") as f:
            vtt_content = f.read()
            srt_content = convert_vtt_to_srt(vtt_content)

        # 估算音频时长（简单估算）
        duration = len(audio_data) / (128 * 1024 / 8)  # 假设128kbps

        return {
            "audio_base64": audio_base64,
            "srt_content": srt_content,
            "duration": duration
        }

    finally:
        # 清理临时文件
        try:
            os.unlink(audio_path)
            os.unlink(subtitle_path)
        except:
            pass


def convert_vtt_to_srt(vtt_content: str) -> str:
    """
    将VTT字幕转换为SRT格式
    """
    lines = vtt_content.strip().split('\n')
    srt_lines = []
    subtitle_index = 1
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        # 跳过VTT头部信息
        if line.startswith('WEBVTT') or line.startswith('NOTE') or not line:
            i += 1
            continue
            
        # 检查是否是时间戳行
        if '-->' in line:
            # 转换时间格式 (00:00:01.000 --> 00:00:02.500)
            time_parts = line.split(' --> ')
            start_time = time_parts[0].replace('.', ',')
            end_time = time_parts[1].replace('.', ',')
            
            # 添加序号和时间戳
            srt_lines.append(str(subtitle_index))
            srt_lines.append(f"{start_time} --> {end_time}")
            
            # 查找并添加字幕文本
            i += 1
            subtitle_text = []
            while i < len(lines) and lines[i].strip() and '-->' not in lines[i]:
                subtitle_text.append(lines[i].strip())
                i += 1
            
            srt_lines.append(' '.join(subtitle_text))
            srt_lines.append('')  # 空行分隔
            subtitle_index += 1
        else:
            i += 1
    
    return '\n'.join(srt_lines)


# Vercel HTTP入口点
from http.server import BaseHTTPRequestHandler
import urllib.parse

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        """处理CORS预检请求"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def do_POST(self):
        """处理POST请求"""
        try:
            # 读取请求体
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            request_body = json.loads(post_data.decode('utf-8'))
            
            # 异步处理TTS请求
            result = asyncio.run(process_tts_request(request_body))
            
            # 发送响应
            self.send_response(result["statusCode"])
            for key, value in result["headers"].items():
                self.send_header(key, value)
            self.end_headers()
            self.wfile.write(result["body"].encode('utf-8'))
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            error_response = json.dumps({
                "success": False,
                "message": f"请求处理失败: {str(e)}"
            })
            self.wfile.write(error_response.encode('utf-8'))
    
    def do_GET(self):
        """处理GET请求 - 返回API信息"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        info = {
            "service": "Python TTS Proxy",
            "status": "running",
            "engine": "edge-tts",
            "method": "POST /api/tts",
            "params": ["text", "voice", "rate", "pitch", "volume"]
        }

        self.wfile.write(json.dumps(info, ensure_ascii=False).encode('utf-8'))
