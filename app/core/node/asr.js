// 听写（语音转文字）：本地 faster-whisper（Python 侧车）或 OpenAI 兼容的 /audio/transcriptions。
// 用途：配音校验、自动字幕、按文字稿剪辑、去口误、长切短。
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { run } from './ffmpeg.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ASR_SCRIPT = path.join(HERE, '../../resources/py/asr.py').replace('app.asar', 'app.asar.unpacked');

function pythonBin(cfg) { return cfg?.python || (process.platform === 'win32' ? 'python' : 'python3'); }

/** 检查本地听写是否可用 */
export function localAvailable(cfg) {
  return new Promise((res) => { const p = spawn(pythonBin(cfg), ['-c', 'import faster_whisper']); p.on('error', () => res(false)); p.on('close', (c) => res(c === 0)); });
}

async function toWav16k(file) { const out = path.join(os.tmpdir(), `mj_asr_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`); await run(['-y', '-i', file, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', out]); return out; }

async function localTranscribe(file, { lang = 'zh', model, cfg } = {}) {
  const wav = await toWav16k(file);
  try {
    return await new Promise((resolve, reject) => {
      const p = spawn(pythonBin(cfg), [ASR_SCRIPT, wav, '--lang', lang, '--model', model || cfg?.model || (lang === 'en' ? 'base.en' : 'small')]);
      let out = '', err = '';
      p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err += d));
      p.on('error', () => reject(new Error('找不到 Python。本地听写需要 Python 3 和 faster-whisper（pip install faster-whisper）')));
      p.on('close', (c) => { if (c) return reject(new Error('本地听写失败：' + err.slice(-400))); try { resolve(JSON.parse(out)); } catch { reject(new Error('本地听写输出无法解析')); } });
    });
  } finally { fs.rm(wav, { force: true }); }
}

async function apiTranscribe(file, { lang = 'zh', cfg } = {}) {
  if (!cfg?.key) throw new Error('在线听写需要 API Key（设置 → 听写）');
  const wav = await toWav16k(file);
  try {
    const fd = new FormData();
    fd.append('file', new Blob([await fs.readFile(wav)], { type: 'audio/wav' }), 'a.wav');
    fd.append('model', cfg.model || 'whisper-1'); fd.append('language', lang); fd.append('response_format', 'verbose_json');
    fd.append('timestamp_granularities[]', 'word'); fd.append('timestamp_granularities[]', 'segment');
    const r = await fetch(`${(cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${cfg.key}` }, body: fd });
    if (!r.ok) throw new Error(`听写接口：${r.status} ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    const words = (j.words || []).map((w) => ({ w: w.word, t0: w.start, t1: w.end }));
    const segments = (j.segments || []).map((s) => ({ text: s.text.trim(), t0: s.start, t1: s.end }));
    return { text: j.text || segments.map((s) => s.text).join(''), words, segments };
  } finally { fs.rm(wav, { force: true }); }
}

/** @returns {{text:string, words:{w,t0,t1}[], segments:{text,t0,t1}[]}} */
export async function transcribe(file, opts = {}) {
  const engine = opts.cfg?.engine || 'local';
  if (engine === 'api') return apiTranscribe(file, opts);
  return localTranscribe(file, opts);
}

// ---------- 比对 ----------
const CN_NUM = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function cnToArabic(s) {
  return s.replace(/[零〇一二两三四五六七八九十百千万点]+/g, (m) => {
    if (!/[一二两三四五六七八九十]/.test(m)) return m;
    const [ip, fp] = m.split('点');
    let total = 0, sec = 0, num = 0;
    for (const ch of ip) { if (ch in CN_NUM) num = CN_NUM[ch]; else if (ch === '十') { sec += (num || 1) * 10; num = 0; } else if (ch === '百') { sec += num * 100; num = 0; } else if (ch === '千') { sec += num * 1000; num = 0; } else if (ch === '万') { total += (sec + num) * 10000; sec = 0; num = 0; } }
    let v = String(total + sec + num);
    if (fp) v += '.' + [...fp].map((c) => CN_NUM[c] ?? '').join('');
    return v;
  });
}
export const normText = (s) => cnToArabic(String(s || '').toLowerCase()).replace(/百分之(\d+(?:\.\d+)?)/g, '$1%').replace(/[\s，。？！、…：；,.?!;:"'“”‘’（）()《》「」\-—]/g, '');
function lev(a, b) { const m = a.length, n = b.length; if (!m) return n; if (!n) return m; let prev = Array.from({ length: n + 1 }, (_, i) => i); for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; } return prev[n]; }
export function similarity(a, b) { const x = normText(a), y = normText(b); if (!x && !y) return 1; return 1 - lev(x, y) / Math.max(x.length, y.length); }

/** 校验一句配音：返回 {pass, score, heard} */
export async function checkLine(file, expected, opts = {}) {
  const r = await transcribe(file, opts);
  const score = similarity(expected, r.text);
  return { pass: score >= (opts.threshold ?? 0.9), score: Math.round(score * 1000) / 1000, heard: r.text, words: r.words };
}

// ---------- 口误、停顿 ----------
export const FILLERS = ['嗯', '啊', '呃', '额', '那个', '就是说', '然后呢', 'um', 'uh', 'erm', 'like'];
/** 从词级时间戳里找出口误和长停顿，返回要剪掉的区间 */
export function findCuts(words, { level = 'standard' } = {}) {
  const maxGap = { gentle: 1.2, standard: 0.7, aggressive: 0.45 }[level] || 0.7;
  const keepGap = 0.18; const cuts = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i], t = String(w.w).trim().toLowerCase();
    if (FILLERS.includes(t.replace(/[，。,.]/g, ''))) cuts.push({ t0: w.t0, t1: w.t1, why: `口头禅「${t}」` });
    if (i > 0 && t && t === String(words[i - 1].w).trim().toLowerCase() && t.length > 0) cuts.push({ t0: words[i - 1].t0, t1: words[i - 1].t1, why: `重复「${t}」` });
    const nxt = words[i + 1]; if (nxt && nxt.t0 - w.t1 > maxGap) cuts.push({ t0: w.t1 + keepGap, t1: nxt.t0 - keepGap, why: `停顿 ${(nxt.t0 - w.t1).toFixed(1)} 秒` });
  }
  cuts.sort((a, b) => a.t0 - b.t0);
  const merged = []; for (const c of cuts) { const l = merged[merged.length - 1]; if (l && c.t0 <= l.t1 + 0.02) { l.t1 = Math.max(l.t1, c.t1); l.why += '、' + c.why; } else merged.push({ ...c }); }
  return merged.filter((c) => c.t1 - c.t0 > 0.05);
}

export { existsSync as _exists };
