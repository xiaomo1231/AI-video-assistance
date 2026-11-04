// 交换格式：SRT、FCPXML 1.10、CMX3600 EDL、录音稿
import { subT, lineT, tc } from './timing.js';

const srtTime = (t) => {
  const ms = Math.max(0, Math.round(t * 1000));
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

export function toSRT(p) {
  const ls = [...p.lines].sort((a, b) => subT(p, a) - subT(p, b));
  return ls.map((l, i) => `${i + 1}\n${srtTime(subT(p, l))} --> ${srtTime(subT(p, l) + l.sdur)}\n${l.text}\n`).join('\n');
}

export function parseSRT(text) {
  const out = [];
  for (const block of String(text).replace(/\r/g, '').split(/\n\n+/)) {
    const m = block.match(/(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)\n([\s\S]*)/);
    if (!m) continue;
    const t = (h, mi, s, ms) => +h * 3600 + +mi * 60 + +s + +ms / 1000;
    out.push({ t0: t(m[1], m[2], m[3], m[4]), t1: t(m[5], m[6], m[7], m[8]), text: m[9].trim() });
  }
  return out;
}

/** 录音稿：按段号，方便自己录音后拖回来自动替换 */
export function toScript(p) {
  return p.lines.map((l, i) => `${String(i + 1).padStart(2, '0')}  [${l.who}]  ${tc(lineT(p, l), p.fps)}\n${l.say || l.text}\n文件名：line_${String(i + 1).padStart(2, '0')}.wav\n`).join('\n');
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** FCPXML 1.10（Final Cut Pro、DaVinci Resolve、Premiere 通过插件可读）。代码场景导出为已渲染的成片片段引用 */
export function toFCPXML(p, { renderedVideo = 'render.mov', assetPath = (a) => a.path } = {}) {
  const fd = `100/${p.fps * 100}s`;
  const rt = (t) => `${Math.round(t * p.fps) * 100}/${p.fps * 100}s`;
  const resources = [`<format id="r1" name="FFVideoFormat${p.height}p${p.fps}" frameDuration="${fd}" width="${p.width}" height="${p.height}"/>`];
  resources.push(`<asset id="rv" name="成片" src="${esc(renderedVideo)}" start="0s" duration="${rt(p.duration)}" hasVideo="1" format="r1"/>`);
  const seen = new Set();
  for (const a of p.assets) if (!seen.has(a.id) && a.path) { seen.add(a.id); resources.push(`<asset id="${a.id}" name="${esc(a.name || a.id)}" src="file://${esc(assetPath(a))}" start="0s" duration="${rt(a.dur || 3600)}" hasVideo="${a.kind === 'video' || a.kind === 'image' ? 1 : 0}" hasAudio="${a.kind !== 'image' ? 1 : 0}" format="r1"/>`); }
  const spine = p.shots.map((s, i) => {
    const media = s.src.kind === 'media' && s.src.asset;
    const ref = media ? s.src.asset : 'rv';
    const start = media ? rt(s.src.in || 0) : rt(s.t0);
    const lanes = [];
    for (const l of p.lines.filter((x) => x.shot === s.id && x.audio)) lanes.push(`<asset-clip ref="${'vo_' + l.id}" lane="-1" offset="${rt(s.t0 + l.off)}" duration="${rt(l.dur)}" name="${esc(l.text.slice(0, 20))}"/>`);
    return `<asset-clip ref="${ref}" offset="${rt(s.t0)}" start="${start}" duration="${rt(s.dur)}" name="${esc(`S${i + 1} ${s.title}`)}">${lanes.join('')}<marker start="${start}" duration="${fd}" value="${esc(s.title)}"/></asset-clip>`;
  });
  for (const l of p.lines) if (l.audio) resources.push(`<asset id="vo_${l.id}" name="${esc(l.id)}" src="file://${esc(l.audio)}" start="0s" duration="${rt(l.audioDur || l.dur)}" hasAudio="1"/>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE fcpxml>\n<fcpxml version="1.10">\n<resources>\n${resources.join('\n')}\n</resources>\n<library><event name="${esc(p.name)}"><project name="${esc(p.name)}"><sequence format="r1" duration="${rt(p.duration)}" tcStart="0s" tcFormat="NDF"><spine>\n${spine.join('\n')}\n</spine></sequence></project></event></library>\n</fcpxml>\n`;
}

/** CMX3600 EDL，主轨镜头 */
export function toEDL(p) {
  const lines = [`TITLE: ${p.name}`, 'FCM: NON-DROP FRAME', ''];
  p.shots.forEach((s, i) => {
    const srcIn = s.src.kind === 'media' ? s.src.in || 0 : s.t0;
    lines.push(`${String(i + 1).padStart(3, '0')}  ${(s.src.asset || 'AX').slice(0, 8).padEnd(8)} V     C        ${tc(srcIn, p.fps)} ${tc(srcIn + s.dur, p.fps)} ${tc(s.t0, p.fps)} ${tc(s.t0 + s.dur, p.fps)}`);
    lines.push(`* FROM CLIP NAME: S${i + 1} ${s.title}`, '');
  });
  return lines.join('\n');
}
