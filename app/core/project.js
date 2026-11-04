// 工程模型：创建、校验、迁移、编辑操作（纯函数，渲染进程与主进程共用）
import { layout, speechDur, flowLines, snap, shotLines, DEFAULTS } from './timing.js';

export const SCHEMA = 'mojian/1';
let seq = 0;
export const uid = (p = 'x') => `${p}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export const defGrade = () => ({ lift: [0, 0, 0], gamma: [0, 0, 0], gain: [0, 0, 0], exposure: 0, contrast: 0, saturation: 0, temp: 0, tint: 0, look: null });

export function emptyProject(name = '未命名工程', o = {}) {
  return {
    schema: SCHEMA, name, fps: o.fps || 24, width: o.width || 1920, height: o.height || 1080,
    template: o.template || 'dark-keynote', created: new Date().toISOString(),
    settings: { ...DEFAULTS, magnet: true, snap: true, link: true },
    speakers: { 旁白: { provider: 'edge', voice: 'zh-CN-XiaoxiaoNeural', speed: 1 } },
    assets: [], shots: [], lines: [], music: [], sfx: [], texts: [], annotations: [],
    subtitle: { style: 'clean', burn: true, size: 1 },
    export: { format: 'mp4', codec: 'h264', height: 1080, fps: o.fps || 24, loudness: -14, srt: true },
    workflow: null, duration: 0,
  };
}

export function newShot(o = {}) {
  return {
    id: o.id || uid('s'), title: o.title || '新镜头', chapter: o.chapter || '', prompt: o.prompt || '', camera: o.camera || '',
    src: o.src || { kind: 'card', in: 0, card: { layout: 'title', heading: o.title || '', body: '' } },
    minDur: o.minDur ?? 2, lock: !!o.lock, dur: o.dur ?? 3, hold: 0, t0: 0, status: o.status || 'draft',
    font: 1, mirror: false, speed: 1, grade: defGrade(), trans: o.trans || { type: 'cut', dur: 0 }, notes: '',
  };
}

export function newLine(p, shotId, who, text, o = {}) {
  const sp = p.speakers?.[who] || p.speakers?.旁白 || {};
  const d = speechDur(text, o.speed || sp.speed || 1, p.fps, { ...DEFAULTS, ...p.settings });
  return { id: o.id || uid('l'), shot: shotId, who, text, say: o.say || '', off: 0, dur: d, soff: 0, sdur: d, pin: false,
    voice: { emotion: 'neutral', ...(o.voice || {}) }, audio: null, audioDur: null, asr: null, status: 'est' };
}

/** 校验并补齐缺省字段；返回新对象 */
export function normalize(raw) {
  const p = { ...emptyProject(raw.name), ...raw };
  p.settings = { ...emptyProject().settings, ...(raw.settings || {}) };
  for (const k of ['assets', 'shots', 'lines', 'music', 'sfx', 'texts', 'annotations']) p[k] = Array.isArray(raw[k]) ? raw[k] : [];
  p.shots = p.shots.map((s) => ({ ...newShot(), ...s, grade: { ...defGrade(), ...(s.grade || {}) } }));
  p.lines = p.lines.map((l) => ({ soff: l.off, sdur: l.dur, voice: {}, ...l }));
  layout(p);
  return p;
}

export const clone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

// ---------- 编辑操作：每个操作是 (p, args) => void，直接改 p。撤销由调用方存快照 ----------
export const ops = {
  updateShot(p, { id, patch }) { const s = p.shots.find((x) => x.id === id); if (!s) throw new Error('没有镜头 ' + id); Object.assign(s, patch); if (patch.grade) s.grade = { ...defGrade(), ...patch.grade }; },
  addShot(p, { after, shot }) { const s = newShot(shot); const i = after ? p.shots.findIndex((x) => x.id === after) + 1 : p.shots.length; p.shots.splice(i, 0, s); return s.id; },
  removeShot(p, { id }) { p.shots = p.shots.filter((s) => s.id !== id); p.lines = p.lines.filter((l) => l.shot !== id); p.sfx = p.sfx.filter((x) => x.anchor !== id); p.texts = p.texts.filter((x) => x.anchor !== id); },
  moveShot(p, { id, to }) { const i = p.shots.findIndex((s) => s.id === id); if (i < 0) return; const [s] = p.shots.splice(i, 1); p.shots.splice(Math.max(0, Math.min(to, p.shots.length)), 0, s); },
  duplicateShot(p, { id, newId }) {
    const i = p.shots.findIndex((s) => s.id === id); if (i < 0) return;
    const s = clone(p.shots[i]); s.id = newId || uid('s'); s.title += ' 副本'; p.shots.splice(i + 1, 0, s);
    for (const l of shotLines(p, id)) p.lines.push({ ...clone(l), id: uid('l'), shot: s.id, audio: null, status: 'est' });
    return s.id;
  },
  /** 在镜头内的相对时间 at 处一分为二；台词按位置归属 */
  splitShot(p, { id, at, newId }) {
    const i = p.shots.findIndex((s) => s.id === id); const s = p.shots[i];
    if (!s || at <= 1 / p.fps || at >= s.dur - 1 / p.fps) return null;
    const b = clone(s); b.id = newId || uid('s'); b.title = s.title + '（下）';
    b.src = { ...s.src, in: (s.src.in || 0) + at * (s.speed || 1) };
    s.dur = snap(at, p.fps); s.lock = true; b.dur = snap(b.dur - at, p.fps); b.lock = true; b.trans = { type: 'cut', dur: 0 };
    p.shots.splice(i + 1, 0, b);
    for (const l of shotLines(p, id)) if (l.off >= at) { l.shot = b.id; l.off = snap(l.off - at, p.fps); l.soff = snap(l.soff - at, p.fps); }
    for (const x of [...p.sfx, ...p.texts]) if (x.anchor === id && x.off >= at) { x.anchor = b.id; x.off -= at; }
    return b.id;
  },
  /** 裁剪镜头：左边裁 dl 秒（源入点后移），右边定长 */
  trimShot(p, { id, left = 0, dur }) {
    const s = p.shots.find((x) => x.id === id); if (!s) return;
    if (left) left = snap(Math.max(-(s.src.in || 0) / (s.speed || 1), left), p.fps); // 左边对齐到帧，不能裁到素材开头之前
    if (left) { s.src = { ...s.src, in: Math.max(0, (s.src.in || 0) + left * (s.speed || 1)) }; s.dur = snap(Math.max(1 / p.fps, s.dur - left), p.fps); for (const l of shotLines(p, id)) { l.off = Math.max(0, l.off - left); l.soff = Math.max(0, l.soff - left); } }
    if (dur != null) s.dur = snap(Math.max(1 / p.fps, dur), p.fps);
    const m = maxDur(p, s); if (m != null && s.dur > m) s.dur = snap(m, p.fps);
    s.lock = true;
  },
  freeze(p, { id, sec = 2 }) { const s = p.shots.find((x) => x.id === id); if (s) { s.hold = (s.hold || 0) + sec; if (s.lock) s.dur += sec; } },
  setLock(p, { id, lock }) { const s = p.shots.find((x) => x.id === id); if (s) s.lock = lock; },

  updateLine(p, { id, patch }) {
    const l = p.lines.find((x) => x.id === id); if (!l) throw new Error('没有台词 ' + id);
    const textChanged = patch.text != null && patch.text !== l.text;
    Object.assign(l, patch);
    if ((textChanged || patch.voice?.speed) && !l.audio) {
      const sp = p.speakers?.[l.who] || {}; const d = speechDur(l.say || l.text, l.voice?.speed || sp.speed || 1, p.fps, { ...DEFAULTS, ...p.settings });
      l.dur = d; l.sdur = d; l.status = 'est'; flowLines(p, l.shot);
    }
    if (textChanged && l.audio) { l.status = 'stale'; }
  },
  addLine(p, { shot, who = '旁白', text = '', after, id }) {
    const l = newLine(p, shot, who, text, { id });
    const ls = shotLines(p, shot); const prev = after ? ls.find((x) => x.id === after) : ls[ls.length - 1];
    l.off = prev ? prev.off + prev.dur + (p.settings.gap ?? 0.35) - 0.001 : p.settings.lead ?? 0.5; l.soff = l.off;
    p.lines.push(l); flowLines(p, shot); return l.id;
  },
  removeLine(p, { id }) { const l = p.lines.find((x) => x.id === id); p.lines = p.lines.filter((x) => x.id !== id); if (l) flowLines(p, l.shot); },
  moveLine(p, { id, off, shot }) { const l = p.lines.find((x) => x.id === id); if (!l) return; const d = l.soff - l.off; if (shot) l.shot = shot; l.off = snap(Math.max(0, off), p.fps); l.soff = snap(l.off + d, p.fps); l.pin = true; },
  setLineAudio(p, { id, audio, dur }) { const l = p.lines.find((x) => x.id === id); if (!l) return; l.audio = audio; l.audioDur = dur; l.dur = snap(dur, p.fps); l.sdur = Math.max(l.sdur, l.dur); l.status = 'ok'; flowLines(p, l.shot); },
  setSubtitle(p, { id, soff, sdur }) { const l = p.lines.find((x) => x.id === id); if (!l) return; if (soff != null) l.soff = snap(Math.max(0, soff), p.fps); if (sdur != null) l.sdur = snap(Math.max(0.2, sdur), p.fps); },
  setSpeaker(p, { who, voice }) { p.speakers[who] = { ...(p.speakers[who] || {}), ...voice }; },

  addMusic(p, { asset, t0 = 0, dur, name, gain = -12, id }) { const m = { id: id || uid('m'), asset, name: name || '音乐', t0, in: 0, dur, gain, fadeIn: 0.5, fadeOut: 1.5, duck: true }; p.music.push(m); return m.id; },
  updateMusic(p, { id, patch }) { const m = p.music.find((x) => x.id === id); if (m) Object.assign(m, patch); },
  removeMusic(p, { id }) { p.music = p.music.filter((x) => x.id !== id); },
  addSfx(p, { anchor, off = 0, asset, synth, name, gain = -12, id }) { const x = { id: id || uid('x'), anchor, off, asset: asset || null, synth: synth || null, name: name || synth || '音效', gain, dur: 0.6 }; p.sfx.push(x); return x.id; },
  updateSfx(p, { id, patch }) { const x = p.sfx.find((q) => q.id === id); if (x) Object.assign(x, patch); },
  removeSfx(p, { id }) { p.sfx = p.sfx.filter((x) => x.id !== id); },
  addText(p, { anchor, off = 0, dur = 3, text = '文字', style = 'tag', x = 0.5, y = 0.2, id }) { const t = { id: id || uid('t'), anchor, off, dur, text, style, x, y, anim: 'pop' }; p.texts.push(t); return t.id; },
  updateText(p, { id, patch }) { const t = p.texts.find((q) => q.id === id); if (t) Object.assign(t, patch); },
  removeText(p, { id }) { p.texts = p.texts.filter((x) => x.id !== id); },
  addAsset(p, { asset }) { const a = { id: uid('a'), ...asset }; p.assets.push(a); return a.id; },
  addAnnotation(p, { shot, t, rect, text, id }) { const a = { id: id || uid('n'), shot, t, rect, text, done: false, created: new Date().toISOString() }; p.annotations.push(a); return a.id; },
  resolveAnnotation(p, { id }) { const a = p.annotations.find((x) => x.id === id); if (a) a.done = true; },
  setTemplate(p, { template }) { p.template = template; },
  /** 整片配乐：由主进程按情绪生成离线配乐并挂到音乐轨 */
  setMusicBed(p, { mood, bpm, gain = -12 }) { p.musicBed = { mood, bpm, gain, pending: true }; p.music = p.music.filter((m) => !m.bed); },
  setSettings(p, { patch }) { Object.assign(p.settings, patch); },
  setExport(p, { patch }) { Object.assign(p.export, patch); },
};

/** 给新增类操作预先分配 id，这样记录下来的操作可以原样重放（修改建议、撤销、MCP） */
export function withIds(op, args = {}) {
  const a = { ...args };
  if (op === 'addShot') a.shot = { ...(a.shot || {}), id: a.shot?.id || uid('s') };
  else if (op === 'duplicateShot' || op === 'splitShot') a.newId = a.newId || uid('s');
  else if (op === 'addLine') a.id = a.id || uid('l');
  else if (op === 'addMusic') a.id = a.id || uid('m');
  else if (op === 'addSfx') a.id = a.id || uid('x');
  else if (op === 'addText') a.id = a.id || uid('t');
  else if (op === 'addAnnotation') a.id = a.id || uid('n');
  else if (op === 'addAsset') a.asset = { ...(a.asset || {}), id: a.asset?.id || uid('a') };
  return a;
}

/** 执行一组操作并重新排布；返回各操作的返回值 */
export function apply(p, list) {
  const out = [];
  for (const { op, args } of list) {
    if (!ops[op]) throw new Error('未知操作 ' + op);
    out.push(ops[op](p, args || {}));
  }
  layout(p);
  return out;
}

/** 视频片段最多能拉到多长（源素材剩下的部分按速度换算，加上定格）；不是视频返回 null */
export function maxDur(p, s) {
  const a = s.src?.kind === 'media' && s.src.asset && p.assets.find((x) => x.id === s.src.asset);
  if (!a || a.kind !== 'video' || !a.dur) return null;
  return Math.max(1 / p.fps, (a.dur - (s.src.in || 0)) / (s.speed || 1) + (s.hold || 0));
}
