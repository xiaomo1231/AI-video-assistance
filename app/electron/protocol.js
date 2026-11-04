// mojian://local/app/...  → 界面（dist/）
// mojian://local/fs/<绝对路径> → 工程文件、代码场景、素材（只允许已打开的工程和指定目录）
// 同一个 origin，所以界面可以直接调用代码场景 iframe 里的 render(t)。支持 Range，视频可以拖动。
import { protocol } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

export const ORIGIN = 'mojian://local';
const roots = new Set();
export const allow = (dir) => dir && roots.add(path.resolve(dir));
export const fsUrl = (abs) => `${ORIGIN}/fs/${path.resolve(abs).split(path.sep).map(encodeURIComponent).join('/').replace(/^\//, '')}`;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.glb': 'model/gltf-binary', '.hdr': 'application/octet-stream', '.wasm': 'application/wasm' };

export function registerScheme() {
  protocol.registerSchemesAsPrivileged([{ scheme: 'mojian', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true, bypassCSP: true } }]);
}

function serveFile(file, req) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response('not found', { status: 404 });
  const size = fs.statSync(file).size, type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.get('range');
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' };
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/); let start = m[1] ? +m[1] : 0, end = m[2] ? +m[2] : size - 1;
    if (!m[1] && m[2]) { start = size - +m[2]; end = size - 1; }
    end = Math.min(end, size - 1);
    return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })), { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) } });
  }
  return new Response(Readable.toWeb(fs.createReadStream(file)), { status: 200, headers: { ...headers, 'Content-Length': String(size) } });
}

export function handle(appDir) {
  protocol.handle('mojian', (req) => {
    const u = new URL(req.url);
    let p = decodeURIComponent(u.pathname);
    if (p.startsWith('/app/')) {
      const f = path.join(appDir, path.normalize(p.slice(5)).replace(/^(\.\.[/\\])+/, ''));
      if (!f.startsWith(appDir)) return new Response('forbidden', { status: 403 });
      return serveFile(f, req);
    }
    if (p.startsWith('/fs/')) {
      let f = p.slice(4); f = process.platform === 'win32' ? f.replace(/\//g, '\\') : '/' + f;
      f = path.resolve(f);
      if (![...roots].some((r) => f === r || f.startsWith(r + path.sep))) return new Response('forbidden: ' + f, { status: 403 });
      return serveFile(f, req);
    }
    return new Response('not found', { status: 404 });
  });
}
