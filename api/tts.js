// lib/ms-edge-tts.js (完整的、真实的源码)

const WebSocket = require("ws");
const { Readable } = require("stream");

const SYNTH_URL = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4";

function formatTime(milliseconds) {
    const date = new Date(milliseconds);
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    const seconds = date.getUTCSeconds().toString().padStart(2, '0');
    const ms = date.getUTCMilliseconds().toString().padStart(3, '0');
    return `${hours}:${minutes}:${seconds},${ms}`;
}

function escape(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function ssml(text, options) {
    const { voice, pitch, rate, volume } = options;
    const lang = voice.slice(0, 5);
    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${lang}"><voice name="${voice}"><prosody pitch="${pitch}" rate="${rate}" volume="${volume}">${escape(text)}</prosody></voice></speak>`;
}

class TTS {
    constructor(options) { this.options = options || {}; }

    getStream(text) {
        const stream = new Readable({ read() {} });
        const ws = new WebSocket(SYNTH_URL);

        ws.on("open", () => {
            const configPayload = JSON.stringify({
                context: { synthesis: { audio: { metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "false" }, outputFormat: this.options.outputFormat || "audio-24khz-48kbitrate-mono-mp3" } } }
            });
            ws.send(`X-Timestamp:${new Date().toISOString()}\r\nPath:speech.config\r\nContent-Type:application/json; charset=utf-8\r\n\r\n${configPayload}`);
            
            const ssmlPayload = ssml(text, this.options);
            ws.send(`X-Timestamp:${new Date().toISOString()}\r\nPath:ssml\r\nContent-Type:application/ssml+xml\r\n\r\n${ssmlPayload}`);
        });

        ws.on("message", (data) => {
            if (data instanceof Buffer) {
                const separator = "Path:audio\r\n";
                const index = data.indexOf(separator);
                if (index > -1) {
                    stream.push(data.slice(index + separator.length));
                }
            } else if (typeof data === "string" && data.includes("Path:turn.end")) {
                ws.close();
            }
        });

        ws.on("error", (error) => { stream.emit("error", error); stream.push(null); });
        ws.on("close", () => stream.push(null));
        return stream;
    }
}

class SubMaker {
    constructor(options) { this.options = options || {}; }

    getSubtitles(text) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(SYNTH_URL);
            let vtt = "WEBVTT\n\n";

            ws.on("open", () => {
                const configPayload = JSON.stringify({
                    context: { synthesis: { audio: { metadataoptions: { sentenceBoundaryEnabled: "true", wordBoundaryEnabled: "false" }, outputFormat: "audio-24khz-48kbitrate-mono-mp3" } } }
                });
                ws.send(`X-Timestamp:${new Date().toISOString()}\r\nPath:speech.config\r\nContent-Type:application/json; charset=utf-8\r\n\r\n${configPayload}`);

                const ssmlPayload = ssml(text, this.options);
                ws.send(`X-Timestamp:${new Date().toISOString()}\r\nPath:ssml\r\nContent-Type:application/ssml+xml\r\n\r\n${ssmlPayload}`);
            });

            ws.on("message", (data) => {
                if (typeof data === "string") {
                    if (data.includes("Path:speech.sentence")) {
                        try {
                            const metadata = JSON.parse(data.split("\r\n\r\n")[1]);
                            const startTime = metadata.Offset / 10000;
                            const endTime = (metadata.Offset + metadata.Duration) / 10000;
                            vtt += `${formatTime(startTime)} --> ${formatTime(endTime)}\n${metadata.Text}\n\n`;
                        } catch (e) {}
                    } else if (data.includes("Path:turn.end")) {
                        ws.close();
                    }
                }
            });
            
            ws.on("error", reject);
            ws.on("close", () => resolve(vtt));
        });
    }
}

module.exports = { TTS, SubMaker };
