// 时间模型：台词挂在镜头上，镜头时长由台词推出，主轨磁吸排布。
// 与渲染进程共用（纯函数，无 Node 依赖）。

export const DEFAULTS = { lead: 0.5, gap: 0.35, tail: 0.9, cps: 4.6, base: 0.45 };

const PUNCT = /[，。？！、…：；,.?!;:"'“”‘’（）()\s—\-]/g;

/** 估算一句话的配音时长（秒），对齐到帧。CJK 按字数，拉丁按词数折算。 */
export function speechDur(text, speed = 1, fps = 24, s = DEFAULTS) {
  const t = String(text || '');
  const cjk = (t.match(/[㐀-鿿぀-ヿ가-힯]/g) || []).length;
  const latinWords = (t.replace(/[㐀-鿿぀-ヿ가-힯]/g, ' ').match(/[A-Za-z0-9]+/g) || []).length;
  const units = cjk + latinWords * 1.6; // 一个英文词约等于 1.6 个汉字的时长
  const raw = (units / s.cps + s.base) / (speed || 1);
  return snap(raw, fps);
}

export const snap = (t, fps = 24) => Math.round(t * fps) / fps;
export const charCount = (text) => String(text || '').replace(PUNCT, '').length;

/** 时间码 HH:MM:SS:FF */
export function tc(t, fps = 24) {
  const f = Math.max(0, Math.round(t * fps));
  const ff = f % fps, s = Math.floor(f / fps);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}:${p(ff)}`;
}
export function parseTc(str, fps = 24) {
  const m = String(str).trim().split(':').map(Number);
  if (m.some(isNaN)) return null;
  while (m.length < 4) m.unshift(0);
  const [h, mi, s, f] = m;
  return h * 3600 + mi * 60 + s + f / fps;
}

export const shotLines = (p, shotId) => p.lines.filter((l) => l.shot === shotId).sort((a, b) => a.off - b.off);

/** 镜头需要的时长 */
export function needDur(p, shot) {
  const s = { ...DEFAULTS, ...(p.settings || {}) };
  const ls = shotLines(p, shot.id);
  const end = ls.length ? Math.max(...ls.map((l) => Math.max(l.off + l.dur, (l.soff ?? l.off) + (l.sdur ?? l.dur)))) + s.tail : 0;
  return Math.max(shot.minDur || 0, end) + (shot.hold || 0);
}

/** 依次排布台词：第一句前 lead，每句间 gap。只动未锁定（lineLock）的台词。 */
export function flowLines(p, shotId) {
  const s = { ...DEFAULTS, ...(p.settings || {}) };
  let off = s.lead;
  for (const l of shotLines(p, shotId)) {
    if (!l.pin) { const d = l.soff - l.off; l.off = snap(off, p.fps); l.soff = snap(l.off + (isFinite(d) ? d : 0), p.fps); }
    off = Math.max(off, l.off + l.dur + s.gap);
  }
}

/** 重新计算所有镜头的时长和起点。返回总时长。 */
export function layout(p) {
  let t = 0;
  const magnet = p.settings?.magnet !== false;
  for (const s of p.shots) {
    if (!s.lock) s.dur = snap(Math.max(1 / p.fps, needDur(p, s)), p.fps);
    if (magnet || s.t0 == null) s.t0 = snap(t, p.fps);
    t = s.t0 + s.dur;
  }
  p.duration = p.shots.length ? Math.max(...p.shots.map((s) => s.t0 + s.dur)) : 0;
  return p.duration;
}

export const shotAt = (p, t) => p.shots.find((s) => t >= s.t0 && t < s.t0 + s.dur) || null;
export const shotById = (p, id) => p.shots.find((s) => s.id === id) || null;
/** 片段的绝对时间：锚在镜头上的东西（台词、音效、文字）跟着镜头走 */
export function absT(p, item, key = 'off') {
  if (item.anchor || item.shot) { const s = shotById(p, item.anchor || item.shot); return s ? s.t0 + (item[key] || 0) : 0; }
  return item.t0 || 0;
}
export const lineT = (p, l) => absT(p, l, 'off');
export const subT = (p, l) => absT(p, l, 'soff');

/** 台词或字幕超出镜头 */
export function overflow(p, shot) {
  return shotLines(p, shot.id).some((l) => l.off + l.dur > shot.dur - 0.04 || (l.soff + l.sdur) > shot.dur - 0.04);
}
