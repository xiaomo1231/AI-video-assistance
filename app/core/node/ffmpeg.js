// FFmpeg / FFprobe：优先用户设置路径，其次随包的 ffmpeg-static，最后系统 PATH
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let FF = null, FP = null;

function fix(p) { return p && p.includes('app.asar') ? p.replace('app.asar', 'app.asar.unpacked') : p; }
export function setBinaries({ ffmpeg, ffprobe } = {}) { if (ffmpeg) FF = ffmpeg; if (ffprobe) FP = ffprobe; }
export function ffmpegPath() {
  if (FF) return FF;
  try { const p = fix(require('ffmpeg-static')); if (p && existsSync(p)) return (FF = p); } catch {}
  return (FF = 'ffmpeg');
}
export function ffprobePath() {
  if (FP) return FP;
  try { const p = fix(require('ffprobe-static').path); if (p && existsSync(p)) return (FP = p); } catch {}
  return (FP = 'ffprobe');
}

/** 运行 ffmpeg；返回 {code, stderr}。失败抛错（带最后几行 stderr） */
export function run(args, { onProgress, input, signal, bin } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin || ffmpegPath(), ['-hide_banner', '-nostdin', ...args], { stdio: [input ? 'pipe' : 'ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => {
      const s = d.toString(); err = (err + s).slice(-20000);
      const m = s.match(/time=(\d+):(\d+):(\d+\.\d+)/); if (m && onProgress) onProgress(+m[1] * 3600 + +m[2] * 60 + +m[3]);
    });
    if (signal) signal.addEventListener('abort', () => p.kill('SIGKILL'));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve({ code, stderr: err }) : reject(new Error(`ffmpeg 失败（${code}）：\n${err.split('\n').slice(-8).join('\n')}`))));
    if (input) input(p.stdin);
  });
}

/** 启动一个可写入原始帧的 ffmpeg 进程 */
export function spawnWriter(args) {
  const p = spawn(ffmpegPath(), ['-hide_banner', '-nostdin', ...args], { stdio: ['pipe', 'ignore', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => (err = (err + d).slice(-20000)));
  const done = new Promise((res, rej) => { p.on('error', rej); p.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg 失败（${c}）：\n${err.split('\n').slice(-8).join('\n')}`)))); });
  const write = (buf) => new Promise((res, rej) => { if (!p.stdin.write(buf)) p.stdin.once('drain', res); else res(); p.stdin.once('error', rej); });
  return { proc: p, write, end: () => { p.stdin.end(); return done; }, kill: () => p.kill('SIGKILL'), get stderr() { return err; } };
}

export function probe(file) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffprobePath(), ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
    let out = '', err = '';
    p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (c) => {
      if (c !== 0) return reject(new Error('无法读取素材：' + err.trim()));
      const j = JSON.parse(out); const v = j.streams.find((s) => s.codec_type === 'video'); const a = j.streams.find((s) => s.codec_type === 'audio');
      const fr = v?.r_frame_rate?.split('/').map(Number);
      const still = v && (/(png|mjpeg|jpeg|webp|bmp|gif)/.test(v.codec_name) && !(+j.format.duration > 0.5));
      resolve({ dur: +j.format.duration || 0, kind: v ? (still ? 'image' : 'video') : a ? 'audio' : 'other', w: v?.width, h: v?.height, fps: fr ? fr[0] / (fr[1] || 1) : null, hasAudio: !!a, codec: v?.codec_name || a?.codec_name, sampleRate: a ? +a.sample_rate : null });
    });
  });
}

/** 解码为单声道 float32 PCM（用于波形、节拍、响度、听写） */
export function decodePCM(file, { rate = 16000, start, dur } = {}) {
  return new Promise((resolve, reject) => {
    const args = ['-hide_banner', '-nostdin', '-v', 'error'];
    if (start) args.push('-ss', String(start)); if (dur) args.push('-t', String(dur));
    args.push('-i', file, '-ac', '1', '-ar', String(rate), '-f', 'f32le', '-');
    const p = spawn(ffmpegPath(), args); const chunks = []; let err = '';
    p.stdout.on('data', (d) => chunks.push(d)); p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (c) => { if (c !== 0) return reject(new Error(err)); const b = Buffer.concat(chunks); resolve(new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4))); });
  });
}

/** 波形峰值（每秒 n 个点），给时间线画波形 */
export async function peaks(file, perSec = 50) {
  const rate = 8000; const pcm = await decodePCM(file, { rate });
  const step = Math.max(1, Math.floor(rate / perSec)); const out = new Array(Math.ceil(pcm.length / step));
  for (let i = 0; i < out.length; i++) { let m = 0; for (let j = i * step; j < Math.min(pcm.length, (i + 1) * step); j++) { const v = Math.abs(pcm[j]); if (v > m) m = v; } out[i] = Math.round(m * 100) / 100; }
  return { perSec, peaks: out };
}
