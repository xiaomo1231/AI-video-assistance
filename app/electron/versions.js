// 版本：工程文件夹就是一个 git 仓库（isomorphic-git，纯 JS，不需要装 git）
import fs from 'node:fs';
import path from 'node:path';
import git from 'isomorphic-git';

const author = { name: '墨剪', email: 'local@mojian.app' };
const FILES = ['project.json'];

async function ensure(dir) { if (!fs.existsSync(path.join(dir, '.git'))) await git.init({ fs, dir, defaultBranch: 'main' }); }

export async function commit(dir, message) {
  await ensure(dir);
  for (const f of FILES) if (fs.existsSync(path.join(dir, f))) await git.add({ fs, dir, filepath: f });
  // 配音文件也进版本，方便回到旧配音
  const vo = path.join(dir, 'audio/voice');
  if (fs.existsSync(vo)) for (const f of fs.readdirSync(vo)) if (f.endsWith('.wav')) await git.add({ fs, dir, filepath: `audio/voice/${f}` });
  const st = await git.statusMatrix({ fs, dir, filepaths: FILES });
  const changed = st.some(([, h, w, s]) => !(h === 1 && w === 1 && s === 1));
  const head = await git.resolveRef({ fs, dir, ref: 'HEAD' }).catch(() => null);
  if (!changed && head) return { oid: head, unchanged: true };
  const oid = await git.commit({ fs, dir, message: message || '保存版本', author });
  return { oid };
}

export async function list(dir, depth = 100) {
  if (!fs.existsSync(path.join(dir, '.git'))) return [];
  try { return (await git.log({ fs, dir, depth })).map((c) => ({ oid: c.oid, message: c.commit.message.trim(), at: new Date(c.commit.author.timestamp * 1000).toISOString() })); } catch { return []; }
}

export async function read(dir, oid) {
  const { blob } = await git.readBlob({ fs, dir, oid, filepath: 'project.json' });
  return JSON.parse(Buffer.from(blob).toString('utf8'));
}

/** 取出某个版本里的一个文件（例如旧配音）到临时位置 */
export async function readFile(dir, oid, filepath) { const { blob } = await git.readBlob({ fs, dir, oid, filepath }); return Buffer.from(blob); }
