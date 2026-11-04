// 工程文件夹读写
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { normalize, emptyProject, uid } from '../project.js';
import { probe, peaks } from './ffmpeg.js';

export const DIRS = ['media', 'audio/voice', 'audio/music', 'audio/sfx', 'scenes', 'out', '.mojian/cache'];

export async function createProject(dir, name, opts = {}) {
  if (existsSync(path.join(dir, 'project.json'))) throw new Error('这个文件夹里已经有工程了');
  for (const d of DIRS) await fs.mkdir(path.join(dir, d), { recursive: true });
  const p = emptyProject(name || path.basename(dir), opts);
  await saveProject(dir, p);
  await fs.writeFile(path.join(dir, '.gitignore'), '.mojian/cache/\nout/\n');
  return p;
}

export async function openProject(dir) {
  const f = path.join(dir, 'project.json');
  if (!existsSync(f)) throw new Error('这里没有 project.json，不是墨剪工程');
  const raw = JSON.parse(await fs.readFile(f, 'utf8'));
  for (const d of DIRS) await fs.mkdir(path.join(dir, d), { recursive: true });
  return normalize(raw);
}

let writing = Promise.resolve();
/** 原子写入：先写临时文件再改名 */
export function saveProject(dir, p) {
  writing = writing.then(async () => {
    const f = path.join(dir, 'project.json'), tmp = f + '.tmp';
    const { duration, ...rest } = p; // 计算字段也存，方便外部工具读
    await fs.writeFile(tmp, JSON.stringify({ ...rest, duration, saved: new Date().toISOString() }, null, 1));
    await fs.rename(tmp, f);
  });
  return writing;
}

export const abs = (dir, rel) => (!rel ? rel : path.isAbsolute(rel) ? rel : path.join(dir, rel));
export const rel = (dir, file) => { const r = path.relative(dir, file); return r.startsWith('..') ? file : r.split(path.sep).join('/'); };

/** 导入素材：复制到 media/（可选），探测时长和尺寸 */
export async function importAsset(dir, file, { copy = true } = {}) {
  const info = await probe(file);
  let dest = file;
  if (copy) {
    const base = path.basename(file).replace(/[^\w.\-一-鿿]/g, '_');
    const sub = info.kind === 'audio' ? 'audio/music' : 'media';
    dest = path.join(dir, sub, base);
    if (existsSync(dest) && path.resolve(dest) !== path.resolve(file)) dest = path.join(dir, sub, `${Date.now().toString(36)}_${base}`);
    if (path.resolve(dest) !== path.resolve(file)) await fs.copyFile(file, dest);
  }
  return { id: uid('a'), name: path.basename(file), kind: info.kind, path: rel(dir, dest), dur: info.kind === 'image' ? 0 : info.dur, w: info.w, h: info.h, fps: info.fps, hasAudio: info.hasAudio };
}

/** 波形缓存 */
export async function cachedPeaks(dir, file) {
  const key = path.join(dir, '.mojian/cache', Buffer.from(file).toString('base64url').slice(-60) + '.peaks.json');
  try { const st = await fs.stat(file); const c = JSON.parse(await fs.readFile(key, 'utf8')); if (c.mtime === st.mtimeMs) return c; } catch {}
  const st = await fs.stat(file); const r = { ...(await peaks(file)), mtime: st.mtimeMs };
  await fs.writeFile(key, JSON.stringify(r)).catch(() => {});
  return r;
}

// ---------- 最近工程 ----------
export async function recent(appDir) { try { return JSON.parse(await fs.readFile(path.join(appDir, 'recent.json'), 'utf8')); } catch { return []; } }
export async function addRecent(appDir, dir, name) {
  const list = (await recent(appDir)).filter((r) => r.dir !== dir);
  list.unshift({ dir, name, at: new Date().toISOString() });
  await fs.mkdir(appDir, { recursive: true });
  await fs.writeFile(path.join(appDir, 'recent.json'), JSON.stringify(list.slice(0, 20), null, 1));
  return list;
}
