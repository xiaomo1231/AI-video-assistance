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

/** FCPXML 1.10（Final Cut Pro、DaVinci Resolve 可读）。卡片和代码场景引用已渲染的成片；素材片段带变速、定格、叠化，配音和配乐放在下方的连接轨道 */
export function toFCPXML(p, { renderedVideo = 'render.mov', assetPath = (a) => a.path, audioPath = (f) => f } = {}) {
  const fps = p.fps; const fd = `100/${fps * 100}s`;
  const rt = (t) => `${Math.round(t * fps) * 100}/${fps * 100}s`;
  const url = (f) => 'file://' + encodeURI(String(f).replace(/\\/g, '/')).replace(/^(?!\/)/, '/');
  const formats = new Map(); const fmt = (w, h, r) => { const k = `${w}x${h}@${r}`; if (!formats.has(k)) formats.set(k, { id: `r${formats.size + 1}`, w, h, r }); return formats.get(k).id; };
  const seqFmt = fmt(p.width, p.height, fps);
  const res = [];
  res.push(`<asset id="rv" name="成片" start="0s" duration="${rt(p.duration)}" hasVideo="1" hasAudio="1" format="${seqFmt}"><media-rep kind="original-media" src="${esc(url(renderedVideo))}"/></asset>`);
  for (const a of p.assets) {
    if (!a.path) continue;
    const f = a.kind === 'video' || a.kind === 'image' ? fmt(a.w || p.width, a.h || p.height, Math.round(a.fps || fps)) : null;
    res.push(`<asset id="${a.id}" name="${esc(a.name || a.id)}" start="0s" duration="${rt(a.dur || 3600)}" hasVideo="${a.kind === 'video' || a.kind === 'image' ? 1 : 0}" hasAudio="${a.kind === 'audio' || (a.kind === 'video' && a.hasAudio !== false) ? 1 : 0}"${f ? ` format="${f}"` : ''}><media-rep kind="original-media" src="${esc(url(assetPath(a)))}"/></asset>`);
  }
  for (const l of p.lines) if (l.audio && !l.subOnly) res.push(`<asset id="vo_${l.id}" name="${esc(l.text.slice(0, 20))}" start="0s" duration="${rt(l.audioDur || l.dur)}" hasAudio="1"><media-rep kind="original-media" src="${esc(url(audioPath(l.audio)))}"/></asset>`);
  const spine = [];
  p.shots.forEach((s, i) => {
    const media = s.src.kind === 'media' && s.src.asset && p.assets.some((a) => a.id === s.src.asset);
    const ref = media ? s.src.asset : 'rv'; const startSec = media ? s.src.in || 0 : s.t0; const start = rt(startSec);
    const sp = s.speed || 1; const hold = s.hold || 0; const play = Math.max(1 / fps, s.dur - hold);
    // 连接片段的 offset 是父片段自己的时间（从 start 算起）
    const local = (absT) => rt(startSec + (absT - s.t0) * (media ? sp : 1));
    const kids = [];
    if (media && (sp !== 1 || hold > 0)) {
      const pts = [`<timept time="0s" value="${start}" interp="linear"/>`, `<timept time="${rt(play)}" value="${rt(startSec + play * sp)}" interp="linear"/>`];
      if (hold > 0) pts.push(`<timept time="${rt(s.dur)}" value="${rt(startSec + play * sp)}" interp="linear"/>`); // 定格：时间往前走，取帧不动
      kids.push(`<timeMap>${pts.join('')}</timeMap>`);
    }
    for (const l of p.lines.filter((x) => x.shot === s.id && x.audio && !x.subOnly)) kids.push(`<asset-clip ref="vo_${l.id}" lane="-1" offset="${local(s.t0 + l.off)}" start="0s" duration="${rt(l.audioDur || l.dur)}" name="${esc(l.text.slice(0, 20))}"/>`);
    for (const m of p.music) if (m.t0 >= s.t0 - 1e-6 && m.t0 < s.t0 + s.dur && p.assets.some((a) => a.id === m.asset)) kids.push(`<asset-clip ref="${m.asset}" lane="-2" offset="${local(m.t0)}" start="${rt(m.in || 0)}" duration="${rt(m.dur)}" name="${esc(m.name || '配乐')}"/>`);
    kids.push(`<marker start="${start}" duration="${fd}" value="${esc(s.title)}"/>`);
    const tr = s.trans || {};
    if (i > 0 && tr.type && tr.type !== 'cut' && tr.dur > 0) spine.push(`<transition name="${tr.type === 'fade' || tr.type === 'dissolve' ? 'Cross Dissolve' : esc(tr.type)}" offset="${rt(s.t0 - tr.dur / 2)}" duration="${rt(tr.dur)}"/>`);
    spine.push(`<asset-clip ref="${ref}" offset="${rt(s.t0)}" start="${start}" duration="${rt(s.dur)}" name="${esc(`S${i + 1} ${s.title}`)}"${media && s.muted ? ' audioRole="dialogue" ' : ''}>${kids.join('')}</asset-clip>`);
  });
  const fmts = [...formats.values()].map((f) => `<format id="${f.id}" name="FFVideoFormat${f.h}p${f.r}" frameDuration="100/${f.r * 100}s" width="${f.w}" height="${f.h}"/>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE fcpxml>\n<fcpxml version="1.10">\n<resources>\n${[...fmts, ...res].join('\n')}\n</resources>\n<library><event name="${esc(p.name)}"><project name="${esc(p.name)}"><sequence format="${seqFmt}" duration="${rt(p.duration)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k"><spine>\n${spine.join('\n')}\n</spine></sequence></project></event></library>\n</fcpxml>\n`;
}

/** CMX3600 EDL：主轨（带变速 M2、定格、叠化）+ 配音 A1 + 配乐 A2。卷名用素材文件名，保证不重名 */
export function toEDL(p) {
  const fps = p.fps; const T = (t) => tc(Math.max(0, t), fps);
  const reels = new Map(); const used = new Set();
  const reel = (key, name) => {
    if (reels.has(key)) return reels.get(key);
    const base = (String(name || key).replace(/\.[^.]+$/, '').normalize('NFKD').replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'CLIP').slice(0, 8);
    let r = base, n = 1; while (used.has(r)) { const sfx = String(n++); r = base.slice(0, 8 - sfx.length) + sfx; }
    used.add(r); reels.set(key, r); return r;
  };
  const files = new Map();
  const out = [`TITLE: ${p.name}`, 'FCM: NON-DROP FRAME', '']; let n = 0;
  const ev = (r, track, kind, sIn, sOut, rIn, rOut, extra = []) => { n++; const no = String(n).padStart(3, '0'); out.push(`${no}  ${r.padEnd(8)} ${track.padEnd(5)} ${kind.padEnd(8)} ${T(sIn)} ${T(sOut)} ${T(rIn)} ${T(rOut)}`, ...extra); return no; };
  const src = (s) => { const a = s.src.kind === 'media' && p.assets.find((x) => x.id === s.src.asset); if (a) { const r = reel(a.id, a.name || a.path); files.set(r, a.name || a.path); return { r, inn: s.src.in || 0, media: true }; } const r = reel('__render', 'RENDER'); files.set(r, `${p.name} 成片`); return { r, inn: s.t0, media: false }; };
  let prev = null;
  p.shots.forEach((s, i) => {
    const { r, inn, media } = src(s); const sp = media ? s.speed || 1 : 1; const hold = s.hold || 0; const play = Math.max(0, s.dur - hold);
    const sOut = inn + play * sp; const tr = s.trans || {}; const name = [`* FROM CLIP NAME: S${i + 1} ${s.title}`];
    const m2 = sp !== 1 ? [`M2   ${r.padEnd(8)}       ${(sp * fps).toFixed(1).padStart(5, '0')}                ${T(inn)}`] : [];
    if (i > 0 && prev && tr.type && tr.type !== 'cut' && tr.dur > 0) {
      const d = Math.round(tr.dur * fps); const no = String(n + 1).padStart(3, '0');
      out.push(`${no}  ${prev.r.padEnd(8)} V     C        ${T(prev.out)} ${T(prev.out)} ${T(s.t0)} ${T(s.t0)}`); n++;
      out.push(`${no}  ${r.padEnd(8)} V     D    ${String(d).padStart(3, '0')} ${T(inn)} ${T(sOut)} ${T(s.t0)} ${T(s.t0 + play)}`, ...m2, ...name, '');
    } else ev(r, 'V', 'C', inn, sOut, s.t0, s.t0 + play, [...m2, ...name, '']);
    if (hold > 0) ev(r, 'V', 'C', sOut, sOut + hold, s.t0 + play, s.t0 + s.dur, [`M2   ${r.padEnd(8)}       000.0                ${T(sOut)}`, `* FREEZE FRAME S${i + 1}`, '']);
    prev = { r, out: sOut };
  });
  for (const l of p.lines) {
    if (!l.audio || l.subOnly) continue; const s = p.shots.find((x) => x.id === l.shot); if (!s) continue;
    const r = reel('vo_' + l.audio, l.audio.split(/[\\/]/).pop()); files.set(r, l.audio); const at = s.t0 + l.off; const d = l.audioDur || l.dur;
    ev(r, 'A', 'C', 0, d, at, at + d, [`* FROM CLIP NAME: ${l.text.slice(0, 30)}`, '']);
  }
  for (const m of p.music) {
    const a = p.assets.find((x) => x.id === m.asset); if (!a) continue; const r = reel(a.id, a.name || a.path); files.set(r, a.name || a.path);
    ev(r, 'A2', 'C', m.in || 0, (m.in || 0) + m.dur, m.t0, m.t0 + m.dur, [`* FROM CLIP NAME: ${m.name || a.name}`, '']);
  }
  out.push('* 卷名对照：', ...[...files].map(([r, f]) => `* ${r} = ${f}`));
  return out.join('\n') + '\n';
}
