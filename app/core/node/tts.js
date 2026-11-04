// 配音接口。每个提供商实现 synth(opts, cfg) → Buffer（任意音频格式），之后统一转成 48k 单声道 WAV 并裁掉首尾静音。
// 新接口：在 PROVIDERS 里加一项，或在设置里配「自定义 HTTP」。
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { run, probe } from './ffmpeg.js';

const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------------- edge-tts（微软在线，免费，不用 Key） ----------------
const EDGE_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const EDGE_VER = '1-130.0.2849.68';
function secMsGec() {
  let ticks = Math.floor(Date.now() / 1000) + 11644473600; ticks -= ticks % 300;
  return crypto.createHash('sha256').update(`${BigInt(ticks) * 10000000n}${EDGE_TOKEN}`, 'ascii').digest('hex').toUpperCase();
}
async function edgeSynth({ text, voice = 'zh-CN-XiaoxiaoNeural', speed = 1, pitch = 0 }) {
  const { default: WebSocket } = await import('ws');
  const id = crypto.randomUUID().replace(/-/g, '');
  const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${EDGE_TOKEN}&Sec-MS-GEC=${secMsGec()}&Sec-MS-GEC-Version=${EDGE_VER}&ConnectionId=${id}`;
  const rate = `${speed >= 1 ? '+' : ''}${Math.round((speed - 1) * 100)}%`;
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers: { Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0' } });
    const chunks = []; const timer = setTimeout(() => { ws.terminate(); reject(new Error('edge-tts 超时，检查网络')); }, 30000);
    ws.on('open', () => {
      const ts = new Date().toString();
      ws.send(`X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`);
      ws.send(`X-RequestId:${id}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts}Z\r\nPath:ssml\r\n\r\n<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${voice}'><prosody pitch='${pitch >= 0 ? '+' : ''}${pitch}Hz' rate='${rate}' volume='+0%'>${xmlEsc(text)}</prosody></voice></speak>`);
    });
    ws.on('message', (data, isBinary) => {
      if (isBinary) { const hl = data.readUInt16BE(0); const head = data.subarray(2, 2 + hl).toString(); if (head.includes('Path:audio')) chunks.push(data.subarray(2 + hl)); }
      else if (String(data).includes('Path:turn.end')) { clearTimeout(timer); ws.close(); chunks.length ? resolve(Buffer.concat(chunks)) : reject(new Error('edge-tts 没有返回声音')); }
    });
    ws.on('error', (e) => { clearTimeout(timer); reject(new Error('edge-tts 连不上：' + e.message)); });
  });
}

// ---------------- MiniMax T2A v2 ----------------
async function minimaxSynth({ text, voice = 'female-shaonv', speed = 1, emotion, pitch = 0 }, cfg) {
  if (!cfg?.key) throw new Error('MiniMax 需要 API Key（设置 → 配音）');
  const base = cfg.baseUrl || 'https://api.minimaxi.com';
  const r = await fetch(`${base}/v1/t2a_v2${cfg.groupId ? `?GroupId=${cfg.groupId}` : ''}`, {
    method: 'POST', headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: cfg.model || 'speech-2.8-hd', text, stream: false, voice_setting: { voice_id: voice, speed, vol: 1, pitch, ...(emotion && emotion !== 'neutral' ? { emotion } : {}) }, audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.base_resp?.status_code) throw new Error(`MiniMax：${j.base_resp?.status_msg || r.status}`);
  return Buffer.from(j.data.audio, 'hex');
}

// ---------------- OpenAI 兼容 /audio/speech ----------------
async function openaiSynth({ text, voice = 'alloy', speed = 1, emotion }, cfg) {
  if (!cfg?.key) throw new Error('OpenAI 配音需要 API Key');
  const r = await fetch(`${(cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')}/audio/speech`, {
    method: 'POST', headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: cfg.model || 'gpt-4o-mini-tts', voice, input: text, speed, response_format: 'wav', ...(emotion && emotion !== 'neutral' ? { instructions: `用${emotion}的语气说` } : {}) }),
  });
  if (!r.ok) throw new Error(`OpenAI 配音：${r.status} ${(await r.text()).slice(0, 200)}`);
  return Buffer.from(await r.arrayBuffer());
}

// ---------------- 系统语音（离线）：Windows SAPI / macOS say / Linux espeak-ng ----------------
function sh(cmd, args, input) { return new Promise((res, rej) => { const p = spawn(cmd, args); let e = ''; p.stderr.on('data', (d) => (e += d)); p.on('error', rej); p.on('close', (c) => (c ? rej(new Error(`${cmd} 失败：${e}`)) : res())); if (input != null) { p.stdin.write(input); p.stdin.end(); } }); }
async function systemSynth({ text, voice, speed = 1 }) {
  const tmp = path.join(os.tmpdir(), `mj_sys_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  if (process.platform === 'win32') {
    const f = tmp + '.wav';
    const ps = `Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; ${voice ? `try{$s.SelectVoice('${voice.replace(/'/g, "''")}')}catch{};` : `$v=$s.GetInstalledVoices()|?{$_.VoiceInfo.Culture.Name -like 'zh*'}|select -First 1; if($v){$s.SelectVoice($v.VoiceInfo.Name)};`} $s.Rate=${Math.round(Math.max(-10, Math.min(10, (speed - 1) * 10)))}; $s.SetOutputToWaveFile('${f}'); $s.Speak([Console]::In.ReadToEnd()); $s.Dispose()`;
    await sh('powershell', ['-NoProfile', '-Command', ps], text);
    return fs.readFile(f).finally(() => fs.rm(f, { force: true }));
  }
  if (process.platform === 'darwin') {
    const f = tmp + '.aiff';
    await sh('say', [...(voice ? ['-v', voice] : ['-v', 'Tingting']), '-r', String(Math.round(180 * speed)), '-o', f, text]);
    return fs.readFile(f).finally(() => fs.rm(f, { force: true }));
  }
  const f = tmp + '.wav';
  await sh('espeak-ng', ['-v', voice || 'cmn', '-s', String(Math.round(165 * speed)), '-w', f, text]);
  return fs.readFile(f).finally(() => fs.rm(f, { force: true }));
}

// ---------------- 自定义 HTTP（接豆包、讯飞、阿里、自建服务等） ----------------
function fill(tpl, v) { return String(tpl).replace(/\{\{(\w+)\}\}/g, (_, k) => (v[k] != null ? String(v[k]).replace(/"/g, '\\"') : '')); }
function getPath(o, p) { return String(p).split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
async function customSynth(o, cfg) {
  if (!cfg?.url) throw new Error('自定义接口没有填地址');
  const vars = { text: o.text, voice: o.voice || '', speed: o.speed || 1, emotion: o.emotion || '', key: cfg.key || '' };
  const headers = JSON.parse(fill(cfg.headers || '{"Content-Type":"application/json"}', vars));
  const r = await fetch(fill(cfg.url, vars), { method: cfg.method || 'POST', headers, body: cfg.method === 'GET' ? undefined : fill(cfg.body || '{"text":"{{text}}","voice":"{{voice}}"}', vars) });
  if (!r.ok) throw new Error(`自定义配音接口：${r.status}`);
  if (!cfg.resultPath) return Buffer.from(await r.arrayBuffer());
  const v = getPath(await r.json(), cfg.resultPath);
  if (!v) throw new Error('自定义接口返回里找不到 ' + cfg.resultPath);
  if (/^https?:/.test(v)) return Buffer.from(await (await fetch(v)).arrayBuffer());
  return Buffer.from(v, cfg.encoding || (/^[0-9a-f]+$/i.test(v.slice(0, 64)) ? 'hex' : 'base64'));
}

export const PROVIDERS = {
  edge: { name: 'edge-tts（微软，免费在线）', synth: edgeSynth, needsKey: false, voices: [['zh-CN-XiaoxiaoNeural', '晓晓 · 活泼女声'], ['zh-CN-YunxiNeural', '云希 · 青年男声'], ['zh-CN-YunjianNeural', '云健 · 沉稳男声'], ['zh-CN-XiaoyiNeural', '晓伊 · 少女'], ['zh-CN-YunyangNeural', '云扬 · 新闻男声'], ['zh-CN-liaoning-XiaobeiNeural', '晓北 · 东北话'], ['zh-TW-HsiaoChenNeural', '曉臻 · 台湾'], ['en-US-AriaNeural', 'Aria · English'], ['en-US-GuyNeural', 'Guy · English'], ['ja-JP-NanamiNeural', 'Nanami · 日本語']] },
  minimax: { name: 'MiniMax 语音', synth: minimaxSynth, needsKey: true, voices: [['female-shaonv', '少女'], ['female-yujie', '御姐'], ['male-qn-qingse', '青涩青年'], ['male-qn-jingying', '精英青年'], ['presenter_male', '男主持'], ['presenter_female', '女主持'], ['audiobook_male_1', '有声书男'], ['clever_boy', '聪明男童']] },
  openai: { name: 'OpenAI 语音', synth: openaiSynth, needsKey: true, voices: [['alloy', 'alloy'], ['nova', 'nova'], ['shimmer', 'shimmer'], ['echo', 'echo'], ['onyx', 'onyx'], ['coral', 'coral']] },
  system: { name: '系统语音（离线）', synth: systemSynth, needsKey: false, voices: [['', '系统默认中文'], ['Microsoft Huihui Desktop', '慧慧（Windows）'], ['Microsoft Kangkang', '康康（Windows）'], ['Tingting', '婷婷（macOS）']] },
  custom: { name: '自定义 HTTP 接口', synth: customSynth, needsKey: false, voices: [] },
};

/** 合成一句，写到 out（.wav），返回实际时长 */
export async function synthLine(opts, cfg, out) {
  const P = PROVIDERS[opts.provider || 'edge'];
  if (!P) throw new Error('没有这个配音接口：' + opts.provider);
  const raw = await P.synth(opts, cfg);
  const tmp = out + '.src';
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(tmp, raw);
  // 统一格式 + 裁首尾静音（保留 60ms）
  await run(['-y', '-i', tmp, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.06,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse', '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', out]);
  await fs.rm(tmp, { force: true });
  const info = await probe(out);
  return { dur: info.dur };
}

/** 导入自己录的音：转格式、裁静音 */
export async function importRecording(file, out) {
  await fs.mkdir(path.dirname(out), { recursive: true });
  await run(['-y', '-i', file, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.06,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse', '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', out]);
  return { dur: (await probe(out)).dur };
}
