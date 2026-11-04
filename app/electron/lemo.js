// lemo-opuscar 适配器：把一部 lemo 影片（含 render(t) 的 index.html）导入成墨剪工程。
// 读 DUR / EV；按画面变化自动切镜头；读 vo/lines.json 或 lines.json 的台词和已有配音，按 EV 里的 vo 事件对时。
import { BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { ORIGIN, fsUrl, allow } from './protocol.js';
import { newShot, uid } from '../core/project.js';
import { probe } from '../core/node/ffmpeg.js';
import { rel } from '../core/node/store.js';
import { layout, snap } from '../core/timing.js';

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

/** 在隐藏窗口里打开场景，读 DUR、EV，按画面变化找切点 */
export async function inspectScene(folder, { detect = true, step = 0.25, onProgress = () => {} } = {}) {
  allow(folder);
  const win = new BrowserWindow({ width: 480, height: 270, show: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
  const logs = [];
  win.webContents.on('console-message', (e, level, message) => { const m = typeof e === 'object' && e.message ? e.message : message; logs.push(m); if (process.env.MOJIAN_E2E) console.log('[scene]', m); });
  try {
    await win.loadURL(`${ORIGIN}/app/index.html#/probe`);
    await win.webContents.executeJavaScript('new Promise(r => { const t = setInterval(() => { if (window.__mojianProbe) { clearInterval(t); r(); } }, 20); })');
    const url = fsUrl(path.join(folder, 'index.html'));
    const meta = await win.webContents.executeJavaScript(`window.__mojianProbe(${JSON.stringify(url)})`);
    if (!meta.ok) throw new Error('打不开这个场景：' + meta.error + (logs.length ? '。场景报错：' + logs.slice(-3).join(' / ') : ''));
    const cuts = [];
    if (detect && meta.dur > 0) {
      let prev = null;
      for (let t = 0; t < meta.dur; t += step) {
        // 截整个窗口（场景可能是 canvas 也可能是 DOM），缩成 32×18 的灰度图比较
        await win.webContents.executeJavaScript(`window.__mojianProbeSeek(${t})`);
        const bmp = (await win.webContents.capturePage()).resize({ width: 32, height: 18 }).toBitmap();
        const img = []; for (let i = 0; i < bmp.length; i += 4) img.push(bmp[i], bmp[i + 1], bmp[i + 2]); // 按通道比，换色也能认出来
        if (prev) { let d = 0; for (let i = 0; i < img.length; i++) d += Math.abs(img[i] - prev[i]); d /= img.length; if (d > 38) cuts.push(snap(t, 24)); }
        prev = img;
        if (Math.round(t / step) % 8 === 0) onProgress(t / meta.dur);
      }
    }
    return { ...meta, cuts };
  } finally { win.destroy(); }
}

export async function importLemo(dir, p, folder, opts = {}) {
  if (!fs.existsSync(path.join(folder, 'index.html'))) throw new Error('这个文件夹里没有 index.html，不是 lemo-opuscar 影片（应选 demo/ 或影片文件夹）');
  const meta = await inspectScene(folder, opts);
  const asset = { id: uid('a'), name: path.basename(path.dirname(folder)) + '/' + path.basename(folder), kind: 'scene', path: rel(dir, folder), dur: meta.dur, w: 1920, h: 1080, ev: meta.ev?.length || 0 };
  p.assets.push(asset);
  // 镜头：按切点（太近的合并）
  const pts = [0, ...meta.cuts.filter((t, i, a) => i === 0 || t - a[i - 1] > 1.2), meta.dur].filter((t, i, a) => i === 0 || t - a[i - 1] > 0.8 || i === a.length - 1);
  const base = p.shots.length;
  for (let i = 0; i < pts.length - 1; i++) {
    const s = newShot({ title: `镜头 ${base + i + 1}`, src: { kind: 'scene', asset: asset.id, in: pts[i] }, lock: true, dur: snap(pts[i + 1] - pts[i], p.fps), minDur: 0.5 });
    s.status = 'confirmed'; p.shots.push(s);
  }
  layout(p);
  // 台词与配音
  // 各个风格的目录不完全一样：vo/、voice/、voices/，配音可能在 out/ 子目录
  const dirs = ['vo', 'voice', 'voices', 'vo/out', 'voice/out', 'voices/out', 'out', '.'].map((d) => path.join(folder, d)).filter((d) => fs.existsSync(d));
  const voDir = dirs[0] || folder;
  const lines = [...dirs, folder].map((d) => readJson(path.join(d, 'lines.json'))).find(Array.isArray);
  const durs = Object.assign({}, ...dirs.map((d) => readJson(path.join(d, 'dur.json')) || {}).reverse());
  const voEv = new Map((meta.ev || []).filter((e) => e.type === 'vo' && e.id).map((e) => [e.id, e.t]));
  if (Array.isArray(lines)) {
    let cursor = 0.5;
    for (const L of lines) {
      if (!L || !L.text) continue;
      const at = voEv.has(L.id) ? voEv.get(L.id) + (pts[0] || 0) : cursor;
      const shot = p.shots.slice(base).find((s) => at >= s.t0 && at < s.t0 + s.dur) || p.shots[p.shots.length - 1];
      const wav = dirs.flatMap((d) => [`${L.id}.wav`, `${L.id}.mp3`].map((n) => path.join(d, n))).find((f) => fs.existsSync(f));
      let dur = (typeof durs[L.id] === 'object' ? durs[L.id]?.dur : durs[L.id]) || null; if (wav && !dur) dur = (await probe(wav)).dur;
      dur = snap(dur || L.text.length / 4.6 + 0.45, p.fps);
      p.lines.push({ id: uid('l'), shot: shot.id, who: L.voice || L.who || '旁白', text: L.text, say: L.say || '', off: snap(at - shot.t0, p.fps), dur, soff: snap(at - shot.t0, p.fps), sdur: dur, pin: true, voice: {}, audio: wav ? rel(dir, wav) : null, audioDur: wav ? dur : null, asr: null, status: wav ? 'ok' : 'est' });
      cursor = at + dur + 0.35;
    }
  }
  // 现成混音 / 配乐
  for (const f of ['out/mix.wav', 'out/music.wav', 'music.wav', 'score.wav']) {
    const m = path.join(folder, f);
    if (fs.existsSync(m)) { const a = { id: uid('a'), name: path.basename(m), kind: 'audio', path: rel(dir, m), dur: (await probe(m)).dur }; p.assets.push(a); p.music.push({ id: uid('m'), asset: a.id, name: f.includes('mix') ? 'lemo 混音（含配音）' : 'lemo 配乐', t0: p.shots[base]?.t0 || 0, in: 0, dur: a.dur, gain: 0, fadeIn: 0, fadeOut: 0.5, duck: false, mute: f.includes('mix') && p.lines.some((l) => l.audio) }); break; }
  }
  const style = readJson(path.join(folder, '..', 'style.json'));
  if (style?.slug) p.lemoStyle = style.slug;
  layout(p);
  return { asset, shots: pts.length - 1, lines: Array.isArray(lines) ? lines.length : 0, dur: meta.dur };
}
