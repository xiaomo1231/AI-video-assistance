// 小组件：滑块、弹窗、缩略图、标签页
import React, { useEffect, useRef, useState } from 'react';
import { drawCard } from '../player/cards.js';
import { templateById } from '../../../core/templates.js';
import { api } from '../api.js';
import { useStore } from '../store.js';

export function Slider({ label, value, min = -1, max = 1, step = 0.01, fmt = (v) => (+v).toFixed(2), onChange, onStart, onEnd }) {
  const kb = useRef(false); const kt = useRef(null);
  return (
    <div className="sl">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value ?? 0}
        onPointerDown={() => { kb.current = false; onStart?.(); }} onPointerUp={(e) => { onEnd?.(); e.currentTarget.blur(); /* 松手就还焦点，方向键继续管播放头 */ }}
        onKeyDown={(e) => { clearTimeout(kt.current); if (!kb.current && /Arrow|Page|Home|End/.test(e.key)) { kb.current = true; onStart?.(); } }}
        onKeyUp={() => { clearTimeout(kt.current); if (kb.current) kt.current = setTimeout(() => { kb.current = false; onEnd?.(); }, 700); /* 连着按的几下合成一步撤销 */ }}
        onBlur={() => { clearTimeout(kt.current); if (kb.current) { kb.current = false; onEnd?.(); } }}
        onChange={(e) => onChange(+e.target.value)} onDoubleClick={() => { onStart?.(); onChange(0); onEnd?.(); }} />
      <span>{fmt(value ?? 0)}</span>
    </div>
  );
}

export function Modal({ title, children, onClose, foot, wide }) {
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" style={wide ? { width: 'min(980px,94vw)' } : null}>
        <div className="pane-h">{title}<span className="spacer" />{onClose && <button className="ib" onClick={onClose}>✕</button>}</div>
        <div className="scroll" style={{ padding: 14 }}>{children}</div>
        {foot && <div className="foot">{foot}</div>}
      </div>
    </div>
  );
}

export function Tabs({ value, onChange, items, className = 'ptabs' }) {
  return <div className={className}>{items.map(([k, label]) => <button key={k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{label}</button>)}</div>;
}

export function Field({ label, children, note }) {
  return <div className="field"><label>{label}</label>{children}{note && <div className="note" style={{ marginTop: 4 }}>{note}</div>}</div>;
}

/** 输入框：失焦或回车才提交，避免每个字都进撤销栈。
 *  area：台词、花字这类一段话，回车提交，Shift+回车换行；area multi：每行一条的列表，Ctrl+回车提交 */
export function Lazy({ value, onCommit, area, multi, ...rest }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => setV(value ?? ''), [value]);
  const sent = useRef(null);
  const commit = () => { const out = area && !multi ? String(v ?? '').trim() : v; if ((out ?? '') !== (value ?? '') && sent.current !== out) { sent.current = out; onCommit(out); } };
  useEffect(() => { sent.current = null; }, [value]);
  const enterCommits = (e) => (!area ? true : multi ? e.ctrlKey || e.metaKey : !e.shiftKey);
  const P = { ...rest, value: v, onChange: (e) => setV(e.target.value), onBlur: commit, onKeyDown: (e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && enterCommits(e)) { e.preventDefault(); commit(); e.target.blur(); } if (e.key === 'Escape') { setV(value ?? ''); e.target.blur(); } e.stopPropagation(); } };
  if (area && !rest.placeholder) P.placeholder = multi ? '每行一条，Ctrl+回车确认' : '回车确认，Shift+回车换行';
  return area ? <textarea {...P} /> : <input {...P} />;
}

// ---------- 缩略图：卡片直接本地画；素材和代码场景请主进程截一帧 ----------
const stillCache = new Map();
export function Thumb({ shot, w = 320 }) {
  const p = useStore((s) => s.p); const base = useStore((s) => s.base); const dir = useStore((s) => s.dir);
  const cv = useRef(null); const [url, setUrl] = useState(null);
  const src = shot.src || {}; const asset = src.asset && p.assets.find((a) => a.id === src.asset);
  const key = JSON.stringify([shot.id, src, p.template, shot.font, shot.grade]);
  useEffect(() => {
    if (src.kind === 'card' || !asset) {
      const c = cv.current; if (!c) return; const W = p.width, H = p.height; c.width = w; c.height = Math.round(w * H / W);
      const g = c.getContext('2d'); g.setTransform(w / W, 0, 0, w / W, 0, 0);
      const card = src.card || {}; const ia = card.asset && p.assets.find((a) => a.id === card.asset);
      const go = (img) => { try { drawCard(g, { W, H, tpl: templateById(p.template), card, shot, local: Math.min(shot.dur * 0.7, 2.2), dur: shot.dur, img }); } catch (e) { console.warn(e); } };
      if (ia) { const im = new Image(); im.onload = () => go(im); im.onerror = () => go(null); im.src = toUrl(base, ia.path); } else go(null);
      return;
    }
    if (asset.kind === 'image') { setUrl(toUrl(base, asset.path)); return; }
    if (stillCache.has(key)) { setUrl(stillCache.get(key)); return; }
    let dead = false;
    const t = shot.t0 + Math.min(shot.dur * 0.5, 1.5);
    queueStill(() => api('render:still', dir, { ...p, lines: [], texts: [] }, t, w)).then((u) => { stillCache.set(key, u); if (!dead) setUrl(u); }).catch(() => {});
    return () => { dead = true; };
  }, [key, base]);
  if (src.kind === 'card' || !asset) return <canvas ref={cv} style={{ width: '100%', height: '100%', display: 'block' }} />;
  return url ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#666', fontSize: 12 }}>{asset.kind === 'scene' ? '代码场景' : '载入中'}</div>;
}
let stillQ = Promise.resolve();
const queueStill = (fn) => (stillQ = stillQ.then(fn, fn));

export function toUrl(base, rel) {
  if (!rel) return '';
  if (/^(mojian|https?|data|blob):/.test(rel)) return rel;
  if (/^([A-Za-z]:[\\/]|\/)/.test(rel)) return 'mojian://local/fs/' + rel.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/').replace(/^\//, '');
  return base + rel.split('/').map(encodeURIComponent).join('/');
}

export const MOOD_CN = { calm: '平静', warm: '温暖', tech: '科技', 'light-tech': '轻科技', upbeat: '轻快', funk: '律动', news: '新闻', serious: '严肃', emotional: '抒情', lullaby: '童谣', guqin: '古琴', koto: '和风', festive: '喜庆', chiptune: '8 bit', action: '激昂', lofi: 'Lo-fi' };
export const sid = (p, s) => 'S' + String(p.shots.indexOf(s) + 1).padStart(2, '0');
export const fmtSec = (x) => (x == null ? '–' : x < 60 ? x.toFixed(1) + 's' : `${Math.floor(x / 60)}:${String(Math.round(x % 60)).padStart(2, '0')}`);
export const fmtSize = (b) => (b > 1e9 ? (b / 1e9).toFixed(2) + ' GB' : (b / 1e6).toFixed(1) + ' MB');

/** 波形：从主进程取峰值，画到 canvas */
const peakCache = new Map();
export function Wave({ file, color = 'rgba(0,0,0,.45)', from = 0, len, total }) {
  const dir = useStore((s) => s.dir); const cv = useRef(null); const [pk, setPk] = useState(peakCache.get(file));
  useEffect(() => { if (!file || peakCache.has(file)) return; api('asset:peaks', dir, file).then((r) => { peakCache.set(file, r); setPk(r); }).catch(() => {}); }, [file]);
  useEffect(() => {
    const c = cv.current; if (!c || !pk) return; const r = c.getBoundingClientRect(); c.width = Math.max(1, r.width); c.height = Math.max(1, r.height);
    const g = c.getContext('2d'); g.fillStyle = color; const arr = pk.peaks || []; const ps = pk.perSec || 50; const dur = arr.length / ps;
    const a = Math.floor(from * ps), b = Math.floor((from + (len ?? dur)) * ps); const span = Math.max(1, b - a);
    for (let x = 0; x < c.width; x++) { const i = a + Math.floor((x / c.width) * span); const v = Math.abs(arr[i] || 0); const hh = v * c.height * 0.9; g.fillRect(x, (c.height - hh) / 2, 1, Math.max(1, hh)); }
  });
  return <canvas ref={cv} />;
}
