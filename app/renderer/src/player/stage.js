// 合成器：预览和导出共用。按时间 t 摆好当前镜头（卡片 / 代码场景 / 素材）、转场、调色、花字、字幕。
import { drawCard, drawSubtitle, drawTextClip } from './cards.js';
import { filterXML, isNeutral } from './grade.js';
import { templateById } from '../../../core/templates.js';
import { shotAt, subT, absT } from '../../../core/timing.js';

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const eio = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Player {
  /** @param {HTMLElement} host */
  constructor(host, { mode = 'preview', base = '', onTime } = {}) {
    this.host = host; this.mode = mode; this.base = base; this.onTime = onTime;
    this.p = null; this.t = 0; this.playing = false; this.outW = 1920; this.outH = 1080;
    this.root = document.createElement('div'); this.root.className = 'mj-stage';
    Object.assign(this.root.style, { position: 'absolute', left: 0, top: 0, overflow: 'hidden', background: '#000', transformOrigin: '0 0' });
    host.appendChild(this.root);
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); Object.assign(this.svg.style, { position: 'absolute', width: 0, height: 0 }); this.root.appendChild(this.svg);
    this.slots = [this.mkSlot(), this.mkSlot()];
    this.over = document.createElement('canvas'); Object.assign(this.over.style, { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none' }); this.root.appendChild(this.over);
    this.flash = document.createElement('div'); Object.assign(this.flash.style, { position: 'absolute', inset: 0, background: '#fff', opacity: 0, pointerEvents: 'none' }); this.root.appendChild(this.flash);
    this.scenes = new Map(); this.videos = new Map(); this.images = new Map(); this.gradeKey = '';
    this.audio = new AudioPreview(this);
    this.showSubs = true;
  }
  mkSlot() {
    const el = document.createElement('div'); Object.assign(el.style, { position: 'absolute', inset: 0, overflow: 'hidden', willChange: 'opacity, transform, clip-path' });
    const cv = document.createElement('canvas'); Object.assign(cv.style, { position: 'absolute', inset: 0, width: '100%', height: '100%' }); el.appendChild(cv);
    this.root.insertBefore(el, this.over || null); return { el, cv, ctx: cv.getContext('2d'), child: null };
  }
  url(rel) { if (!rel) return ''; if (/^(mojian|https?|data|blob):/.test(rel)) return rel; if (/^([A-Za-z]:[\\/]|\/)/.test(rel)) return 'mojian://local/fs/' + rel.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/').replace(/^\//, ''); return this.base + rel.split('/').map(encodeURIComponent).join('/'); }

  setProject(p, base) {
    this.p = p; if (base) this.base = base;
    this.tpl = templateById(p.template);
    this.updateGrades(); this.audio.invalidate();
  }
  setSize(w, h) {
    this.outW = Math.round(w); this.outH = Math.round(h);
    const p = this.p || { width: 1920, height: 1080 };
    Object.assign(this.root.style, { width: this.outW + 'px', height: this.outH + 'px' });
    for (const s of this.slots) { s.cv.width = this.outW; s.cv.height = this.outH; }
    this.over.width = this.outW; this.over.height = this.outH;
    for (const f of this.scenes.values()) this.fitScene(f.el);
    this.scale = this.outW / p.width;
  }
  /** 预览：按容器大小缩放 */
  fit(cw, ch) {
    const p = this.p || { width: 1920, height: 1080 }; const s = Math.min(cw / p.width, ch / p.height);
    const w = Math.max(16, Math.floor(p.width * s)), h = Math.max(9, Math.floor(p.height * s));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.setSize(Math.min(p.width, w * dpr), Math.min(p.height, h * dpr));
    this.root.style.transform = `translate(${Math.floor((cw - w) / 2)}px, ${Math.floor((ch - h) / 2)}px) scale(${w / this.outW})`;
    return { w, h, x: Math.floor((cw - w) / 2), y: Math.floor((ch - h) / 2) };
  }
  updateGrades() {
    if (!this.p) return;
    const key = JSON.stringify(this.p.shots.map((s) => [s.id, s.grade]));
    if (key === this.gradeKey) return; this.gradeKey = key;
    this.svg.innerHTML = this.p.shots.filter((s) => !isNeutral(s.grade)).map((s) => filterXML('g_' + s.id, s.grade)).join('');
  }

  // ---------------- 素材 ----------------
  fitScene(el) { const p = this.p || { width: 1920, height: 1080 }; Object.assign(el.style, { width: p.width + 'px', height: p.height + 'px', transform: `scale(${this.outW / p.width})`, transformOrigin: '0 0' }); }
  /** 每个 slot 有自己的场景 iframe：iframe 一旦挪动就会重新加载，而且转场时两边可能是同一个场景 */
  scene(asset, slot = this.slots[1]) {
    const key = this.slots.indexOf(slot) + ':' + asset.id;
    let f = this.scenes.get(key);
    if (!f) {
      const el = document.createElement('iframe'); el.setAttribute('scrolling', 'no');
      Object.assign(el.style, { position: 'absolute', left: 0, top: 0, border: 0, pointerEvents: 'none' }); this.fitScene(el);
      const src = asset.path.replace(/\/?$/, '/') + 'index.html';
      f = { el, ready: false, loaded: null };
      f.loaded = new Promise((res) => { el.onload = async () => { const w = el.contentWindow; for (let i = 0; i < 1800 && !w.READY; i++) await new Promise((r) => setTimeout(r, 50)); f.ready = !!w.READY; res(); if (this.mode === 'preview' && !this.playing) this.frame(this.t); }; });
      el.style.display = 'none'; el.src = this.url(src); slot.el.appendChild(el); this.scenes.set(key, f);
    }
    return f;
  }
  video(asset, slot = this.slots[1]) {
    const key = this.slots.indexOf(slot) + ':' + asset.id;
    let v = this.videos.get(key);
    if (!v) { const el = document.createElement('video'); el.src = this.url(asset.path); el.preload = 'auto'; el.muted = this.mode !== 'preview'; el.playsInline = true; el.crossOrigin = 'anonymous'; Object.assign(el.style, { position: 'absolute', inset: 0, width: '100%', height: '100%' }); v = { el, ready: new Promise((r) => { el.onloadeddata = r; el.onerror = r; }) }; el.style.display = 'none'; slot.el.appendChild(el); this.videos.set(key, v); }
    if (this.mode === 'preview' && key.startsWith('0:')) v.el.muted = true; // 转场时只让一个出声
    return v;
  }
  image(path) {
    let im = this.images.get(path);
    if (!im) { const el = new Image(); el.crossOrigin = 'anonymous'; el.src = this.url(path); im = { el, ready: el.decode().catch(() => {}) }; this.images.set(path, im); }
    return im;
  }

  // ---------------- 画一帧 ----------------
  /** 把镜头 s 在局部时间 local 画到 slot 上；exact=true 时等待视频定位完成 */
  async paint(slot, s, local, exact) {
    const p = this.p, src = s.src || {}; const asset = src.asset && p.assets.find((a) => a.id === src.asset);
    const speed = s.speed || 1; const srcT = (src.in || 0) + Math.min(local, s.dur - (s.hold || 0)) * speed;
    const setChild = (el) => { if (slot.child !== el) { if (slot.child) { slot.child.style.display = 'none'; if (slot.child.tagName === 'VIDEO') slot.child.pause(); } if (el) el.style.display = ''; slot.child = el; } };
    slot.el.style.filter = isNeutral(s.grade) ? '' : `url(#g_${s.id})`;
    slot.el.style.transform = s.mirror ? 'scaleX(-1)' : '';
    if (src.kind === 'scene' && asset) {
      const f = this.scene(asset, slot); setChild(f.el); slot.cv.style.display = 'none';
      if (exact) await f.loaded;
      try { f.el.contentWindow?.render?.(srcT); } catch (e) { console.warn(e); }
      if (exact) await new Promise((r) => requestAnimationFrame(() => r()));
      return;
    }
    if (src.kind === 'media' && asset && asset.kind === 'video') {
      const v = this.video(asset, slot); setChild(v.el); slot.cv.style.display = 'none';
      v.el.style.objectFit = src.fit === 'contain' ? 'contain' : 'cover';
      if (exact) {
        await v.ready;
        if (Math.abs(v.el.currentTime - srcT) > 0.001) await new Promise((r) => { const done = () => { v.el.removeEventListener('seeked', done); r(); }; v.el.addEventListener('seeked', done); v.el.currentTime = srcT + 0.002; setTimeout(done, 3000); }); // 稍微越过帧边界，免得浮点误差取到上一帧
        if (v.el.requestVideoFrameCallback) await new Promise((r) => { v.el.requestVideoFrameCallback(() => r()); setTimeout(r, 120); });
      } else if (this.playing) {
        v.el.playbackRate = speed; if (v.el.paused) v.el.play().catch(() => {});
        if (Math.abs(v.el.currentTime - srcT) > 0.25) v.el.currentTime = srcT;
      } else { if (!v.el.paused) v.el.pause(); if (Math.abs(v.el.currentTime - srcT) > 1 / 30) v.el.currentTime = srcT; }
      return;
    }
    // 卡片和图片：画到 canvas
    setChild(null); slot.cv.style.display = '';
    const c = slot.ctx; const W = p.width, H = p.height; c.setTransform(this.outW / W, 0, 0, this.outH / H, 0, 0); c.clearRect(0, 0, W, H);
    if (src.kind === 'media' && asset && asset.kind === 'image') {
      const im = this.image(asset.path); if (exact) await im.ready;
      const el = im.el; if (el.naturalWidth) { const k = clamp(((src.in || 0) + local) / Math.max(0.5, (src.in || 0) + s.dur)); const z = /拉/.test(s.camera || '') ? 1.08 - 0.08 * k : 1 + 0.08 * k; const sc = (src.fit === 'contain' ? Math.min : Math.max)(W / el.naturalWidth, H / el.naturalHeight) * z; c.fillStyle = '#000'; c.fillRect(0, 0, W, H); c.drawImage(el, (W - el.naturalWidth * sc) / 2, (H - el.naturalHeight * sc) / 2, el.naturalWidth * sc, el.naturalHeight * sc); }
      return;
    }
    const card = src.card || {}; let img = null;
    const imgAsset = card.asset && p.assets.find((a) => a.id === card.asset);
    if (imgAsset) { const im = this.image(imgAsset.path); if (exact) await im.ready; if (im.el.naturalWidth) img = im.el; }
    // 分割或左裁后 src.in 记着已经播过的部分，动画接着往下走，不从头再来
    drawCard(c, { W, H, tpl: this.tpl, card, shot: s, local: (src.in || 0) + local, dur: (src.in || 0) + s.dur, img });
  }

  async frame(t, exact = false) {
    const p = this.p; if (!p) return; this.t = t; this.updateGrades();
    const A = shotAt(p, t) || (t >= p.duration ? p.shots[p.shots.length - 1] : null);
    const [s0, s1] = this.slots;
    if (!A) { s0.el.style.opacity = 0; s1.el.style.opacity = 0; this.drawOverlay(t); return; }
    const i = p.shots.indexOf(A); const prev = p.shots[i - 1];
    const tr = A.trans || {}; const d = tr.dur || 0; const local = t - A.t0;
    const inTrans = prev && tr.type && tr.type !== 'cut' && d > 0 && local < d;
    const jobs = [this.paint(s1, A, local, exact)];
    for (const s of this.slots) Object.assign(s.el.style, { opacity: 1, clipPath: '', zIndex: 0, translate: '' });
    this.flash.style.opacity = 0;
    if (inTrans) {
      jobs.push(this.paint(s0, prev, prev.dur + local, exact));
      const k = eio(clamp(local / d)); s0.el.style.zIndex = 1; s1.el.style.zIndex = 2;
      switch (tr.type) {
        case 'fade': case 'dissolve': case 'ink': case 'bleed': s1.el.style.opacity = k; break;
        case 'wipe': case 'erase': case 'scroll': s1.el.style.clipPath = `inset(0 ${(1 - k) * 100}% 0 0)`; break;
        case 'push': case 'slide': s1.el.style.translate = `${(1 - k) * 100}% 0`; s0.el.style.translate = `${-k * 100}% 0`; break;
        case 'iris': s1.el.style.clipPath = `circle(${k * 75}% at 50% 50%)`; break;
        case 'flash': s1.el.style.opacity = k > 0.5 ? 1 : 0; this.flash.style.opacity = 1 - Math.abs(k - 0.5) * 2; break;
        case 'curtain': case 'fold': s1.el.style.clipPath = `inset(0 ${(1 - k) * 50}% 0 ${(1 - k) * 50}%)`; break;
        case 'page': case 'panel': s1.el.style.clipPath = `polygon(0 0, ${k * 140}% 0, ${k * 140 - 40}% 100%, 0 100%)`; break;
        default: s1.el.style.opacity = k;
      }
    } else { s0.el.style.opacity = 0; if (s0.child && s0.child.tagName === 'VIDEO' && !s0.child.paused) s0.child.pause(); }
    await Promise.all(jobs);
    this.drawOverlay(t);
    this.onTime?.(t);
  }

  drawOverlay(t) {
    const p = this.p, c = this.over.getContext('2d'); const W = p.width, H = p.height;
    c.setTransform(this.outW / W, 0, 0, this.outH / H, 0, 0); c.clearRect(0, 0, W, H);
    for (const x of p.texts) { const t0 = absT(p, x); if (t >= t0 && t < t0 + x.dur) drawTextClip(c, { W, H, t: x, local: t - t0, tpl: this.tpl }); }
    if (this.showSubs && p.subtitle?.burn !== false) {
      for (const l of p.lines) { const s0 = subT(p, l); if (t >= s0 && t < s0 + l.sdur) drawSubtitle(c, { W, H, text: l.orig && p.subtitle?.bilingual ? `${l.text}\n${l.orig}` : l.text, style: p.subtitle?.style || 'clean', tpl: this.tpl, size: p.subtitle?.size || 1, k: (t - s0) / 0.25 }); }
    }
  }

  // ---------------- 播放 ----------------
  play() { if (this.playing || !this.p) return; this.playing = true; if (this.t >= this.p.duration - 0.05) this.t = 0; this.t0 = performance.now() - this.t * 1000; this.audio.start(this.t); const loop = () => { if (!this.playing) return; let t = (performance.now() - this.t0) / 1000; if (t >= this.p.duration) { this.pause(); t = this.p.duration; } this.frame(t); this.raf = requestAnimationFrame(loop); }; this.raf = requestAnimationFrame(loop); }
  pause() { this.playing = false; cancelAnimationFrame(this.raf); this.audio.stop(); for (const v of this.videos.values()) v.el.pause(); }
  toggle() { this.playing ? this.pause() : this.play(); }
  seek(t) { const was = this.playing; if (was) this.pause(); this.frame(Math.max(0, Math.min(t, this.p?.duration || 0))); if (was) this.play(); }
  destroy() { this.pause(); this.root.remove(); this.audio.close(); }
}

/** 预览用的声音：配音、配乐（含闪避）、音效。导出时不用它，导出由 FFmpeg 混音。 */
class AudioPreview {
  constructor(pl) { this.pl = pl; this.ctx = null; this.buf = new Map(); this.nodes = []; }
  invalidate() {}
  async load(url) { if (this.buf.has(url)) return this.buf.get(url); const pr = fetch(url).then((r) => r.arrayBuffer()).then((b) => this.ctx.decodeAudioData(b)).catch(() => null); this.buf.set(url, pr); return pr; }
  async start(t) {
    const pl = this.pl, p = pl.p; if (!p || pl.mode !== 'preview') return;
    if (!this.ctx) this.ctx = new AudioContext(); if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.stop(); const now = this.ctx.currentTime + 0.05; const token = (this.token = {});
    const voiceSpans = p.lines.filter((l) => l.audio && !l.subOnly).map((l) => [absT(p, l), absT(p, l) + l.dur]);
    const sched = async (url, at, off, dur, gainDb, duck) => {
      const b = await this.load(url); if (!b || this.token !== token) return;
      const start = at - t; const o = off + Math.max(0, -start); if (o >= b.duration) return;
      const src = this.ctx.createBufferSource(); src.buffer = b; const g = this.ctx.createGain(); const base = Math.pow(10, (gainDb || 0) / 20);
      g.gain.setValueAtTime(base, now);
      if (duck) for (const [a, e] of voiceSpans) { if (e < t) continue; const sa = now + Math.max(0, a - t), se = now + Math.max(0, e - t); g.gain.setTargetAtTime(base * 0.35, sa, 0.08); g.gain.setTargetAtTime(base, se + 0.15, 0.25); }
      src.connect(g).connect(this.ctx.destination);
      const len = dur ? Math.max(0, dur - Math.max(0, -start)) : undefined;
      src.start(now + Math.max(0, start), o, len); this.nodes.push(src);
    };
    const mute = p.settings?.mute || {};
    for (const l of p.lines) if (!mute.vo && l.audio && !l.subOnly) { const a = absT(p, l); if (a + l.dur > t) sched(pl.url(l.audio), a, 0, l.audioDur || l.dur, l.gain || 0); }
    for (const m of p.music) { if (m.mute || mute.mu) continue; const as = p.assets.find((x) => x.id === m.asset); if (as && absT(p, m) + m.dur > t) sched(pl.url(as.path), absT(p, m), m.in || 0, m.dur, m.gain ?? -12, m.duck !== false); }
    for (const x of p.sfx) { const at = absT(p, x); if (at < t || x.mute || mute.sx) continue; const as = x.asset && p.assets.find((q) => q.id === x.asset); const u = as ? pl.url(as.path) : x.synth ? pl.url(`audio/sfx/${x.synth}.v2.wav`) : null; if (u) sched(u, at, 0, null, x.gain ?? -12); }
  }
  stop() { this.token = null; for (const n of this.nodes) { try { n.stop(); } catch {} } this.nodes = []; }
  close() { this.stop(); this.ctx?.close(); }
}
