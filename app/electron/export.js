// 导出：离屏窗口逐帧渲染（和预览是同一个合成器、同一个 Chromium），原始帧送进 FFmpeg。
import { BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnWriter, probe } from '../core/node/ffmpeg.js';
import { mixAudio } from '../core/node/mix.js';
import { toSRT } from '../core/interchange.js';
import { ORIGIN, fsUrl } from './protocol.js';

export const CODECS = {
  h264: { label: 'H.264（兼容最好）', ext: 'mp4', v: ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'], a: ['-c:a', 'aac', '-b:a', '320k'] },
  h265: { label: 'H.265（体积小）', ext: 'mp4', v: ['-c:v', 'libx265', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-tag:v', 'hvc1', '-movflags', '+faststart'], a: ['-c:a', 'aac', '-b:a', '320k'] },
  'mov-h264': { label: 'MOV · H.264', ext: 'mov', v: ['-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p'], a: ['-c:a', 'pcm_s16le'] },
  prores: { label: 'MOV · ProRes 422 HQ（给剪辑软件）', ext: 'mov', v: ['-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le', '-vendor', 'apl0'], a: ['-c:a', 'pcm_s24le'] },
  prores4444: { label: 'MOV · ProRes 4444', ext: 'mov', v: ['-c:v', 'prores_ks', '-profile:v', '4', '-pix_fmt', 'yuva444p10le', '-vendor', 'apl0'], a: ['-c:a', 'pcm_s24le'] },
};

/** 打开一个离屏渲染窗口，返回 {seek(t)→NativeImage, close} */
export async function openRenderer({ width, height, project, dir }) {
  const win = new BrowserWindow({ width, height, show: false, useContentSize: true, frame: false, webPreferences: { offscreen: true, backgroundThrottling: false, contextIsolation: false, nodeIntegration: false, sandbox: false } });
  win.webContents.setFrameRate(60);
  await win.loadURL(`${ORIGIN}/app/index.html#/render`);
  await win.webContents.executeJavaScript('new Promise(r => { const t = setInterval(() => { if (window.__mojianRender) { clearInterval(t); r(); } }, 20); })');
  await win.webContents.executeJavaScript(`window.__mojianRender.load(${JSON.stringify(project)}, ${JSON.stringify(fsUrl(dir) + '/')}, ${width}, ${height})`);
  return {
    win,
    async frame(t) {
      await win.webContents.executeJavaScript(`window.__mojianRender.seek(${t})`);
      let img = await win.webContents.capturePage();
      const s = img.getSize(); if (s.width !== width || s.height !== height) img = img.resize({ width, height, quality: 'best' });
      return img;
    },
    close() { if (!win.isDestroyed()) win.destroy(); },
  };
}

export async function exportFilm({ dir, project: p, opts = {}, onProgress = () => {}, signal }) {
  const fmt = CODECS[opts.codec || p.export.codec] || CODECS.h264;
  const h = opts.height || p.export.height || p.height; const w = Math.round((p.width / p.height) * h / 2) * 2; const H = Math.round(h / 2) * 2;
  const fps = opts.fps || p.export.fps || p.fps;
  const name = (opts.name || p.name).replace(/[\\/:*?"<>|]/g, '_');
  const outDir = opts.outDir || path.join(dir, 'out'); await fs.mkdir(outDir, { recursive: true });
  const out = path.join(outDir, `${name}.${fmt.ext}`);
  const total = Math.max(1, Math.round(p.duration * fps));
  const t0 = Date.now();

  onProgress({ phase: 'audio', pct: 0, text: '混音' });
  const wav = path.join(dir, '.mojian/cache', 'mix.wav');
  const loud = await mixAudio(dir, p, wav, { loudness: p.export.loudness ?? -14, signal });
  if (signal?.aborted) throw new Error('已取消');

  onProgress({ phase: 'video', pct: 0, text: '逐帧渲染' });
  const r = await openRenderer({ width: w, height: H, project: p, dir });
  const ff = spawnWriter(['-y', '-f', 'rawvideo', '-pix_fmt', 'bgra', '-s', `${w}x${H}`, '-r', String(fps), '-i', '-', '-i', wav, '-map', '0:v', '-map', '1:a', ...fmt.v, '-r', String(fps), ...fmt.a, '-shortest', '-metadata', `title=${p.name}`, '-metadata', 'comment=墨剪', out + '.part' + path.extname(out)]);
  let black = 0;
  try {
    for (let f = 0; f < total; f++) {
      if (signal?.aborted) throw new Error('已取消');
      const img = await r.frame(f / fps);
      const bmp = img.toBitmap();
      if (f % Math.max(1, Math.round(fps)) === 0) { let s = 0; for (let i = 0; i < bmp.length; i += 4 * 997) s += bmp[i] + bmp[i + 1] + bmp[i + 2]; if (s < 10) black++; }
      await ff.write(bmp);
      if (f % 6 === 0) { const el = (Date.now() - t0) / 1000; onProgress({ phase: 'video', pct: f / total, frame: f, total, eta: Math.round((el / Math.max(1, f)) * (total - f)), text: `第 ${f} / ${total} 帧` }); }
    }
    await ff.end();
  } catch (e) { ff.kill(); r.close(); await fs.rm(out + '.part' + path.extname(out), { force: true }); throw e; }
  r.close();
  await fs.rename(out + '.part' + path.extname(out), out);
  const files = [out];
  if (opts.srt ?? p.export.srt) { const srt = out.replace(/\.\w+$/, '.srt'); await fs.writeFile(srt, toSRT(p)); files.push(srt); }
  const info = await probe(out);
  onProgress({ phase: 'done', pct: 1, text: '完成' });
  return { out, files, dur: info.dur, size: (await fs.stat(out)).size, loudness: loud, blackSeconds: black, seconds: Math.round((Date.now() - t0) / 1000), width: w, height: H, fps };
}

/** 导出一张静帧（缩略图、海报、给 AI 看的画面） */
export async function still({ dir, project, t, width = 960 }) {
  const H = Math.round((project.height / project.width) * width / 2) * 2;
  const r = await openRenderer({ width, height: H, project, dir });
  try { const img = await r.frame(t); return img.toJPEG(85); } finally { r.close(); }
}
