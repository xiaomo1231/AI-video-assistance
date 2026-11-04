// 预览窗口：合成器 + 播放控制 + 画面圈注
import React, { useEffect, useRef, useState } from 'react';
import { Player } from '../player/stage.js';
import { useStore, S } from '../store.js';
import { tc, shotAt } from '../../../core/timing.js';
import { sid, Icon } from './ui.jsx';

export const current = { player: null };
let lastSet = 0;

export default function PlayerView({ title, compact, annotate = true, onFrame }) {
  const host = useRef(null); const pl = useRef(null);
  const p = useStore((s) => s.p); const base = useStore((s) => s.base); const t = useStore((s) => s.t);
  const playing = useStore((s) => s.playing); const annoMode = useStore((s) => s.annoMode);
  const [box, setBox] = useState(null); const [draft, setDraft] = useState(null); const [subs, setSubs] = useState(true);

  useEffect(() => {
    const player = new Player(host.current, { mode: 'preview', base, onTime: (tt) => { if (player.playing && performance.now() - lastSet > 60) { lastSet = performance.now(); useStore.setState({ t: tt }); } } });
    pl.current = player; current.player = player;
    const orig = player.pause.bind(player);
    player.pause = () => { orig(); const fps = useStore.getState().p?.fps || 30; useStore.setState({ playing: false, t: Math.round(player.t * fps) / fps }); }; // 停在整帧上，分割和导出才对得上
    const ro = new ResizeObserver(() => { const r = host.current.getBoundingClientRect(); if (player.p) setBox(player.fit(r.width, r.height)); player.frame(player.t); });
    ro.observe(host.current);
    return () => { ro.disconnect(); player.destroy(); if (current.player === player) current.player = null; };
  }, []);
  useEffect(() => { current.player = pl.current; });
  useEffect(() => {
    const player = pl.current; if (!player || !p) return; const first = !player.p;
    player.setProject(p, base);
    if (first) { const r = host.current.getBoundingClientRect(); setBox(player.fit(r.width, r.height)); }
    if (player.playing) { player.pause(); player.play(); } else player.frame(S().t);
  }, [p, base]);
  useEffect(() => { const player = pl.current; if (player && !player.playing && player.p) { player.frame(t); onFrame?.(player, t); } }, [t]);
  useEffect(() => { const player = pl.current; if (!player) return; if (playing && !player.playing) player.play(); if (!playing && player.playing) player.pause(); }, [playing]);
  useEffect(() => { if (pl.current) { pl.current.showSubs = subs; pl.current.frame(S().t); } }, [subs]);

  const shot = p && shotAt(p, t);
  const annos = p ? p.annotations.filter((a) => !a.done && shot && a.shot === shot.id) : [];
  const toRel = (e) => { const r = e.currentTarget.getBoundingClientRect(); return [(e.clientX - r.left - box.x) / box.w, (e.clientY - r.top - box.y) / box.h]; };
  const down = (e) => { if (!box || !shot) return; const [x, y] = toRel(e); setDraft({ x0: x, y0: y, x1: x, y1: y }); e.currentTarget.setPointerCapture(e.pointerId); };
  const move = (e) => { if (!draft || draft.text != null) return; const [x, y] = toRel(e); setDraft({ ...draft, x1: x, y1: y }); };
  const up = () => { if (!draft || draft.text != null) return; if (Math.abs(draft.x1 - draft.x0) < 0.01) { setDraft(null); return; } setDraft({ ...draft, text: '' }); };
  const save = () => {
    const r = [Math.min(draft.x0, draft.x1), Math.min(draft.y0, draft.y1), Math.abs(draft.x1 - draft.x0), Math.abs(draft.y1 - draft.y0)].map((v) => +v.toFixed(3));
    if (draft.text.trim()) S().edit({ op: 'addAnnotation', args: { shot: shot.id, t: +(t - shot.t0).toFixed(2), rect: r, text: draft.text.trim() } }, '圈注');
    setDraft(null);
  };
  const rect = (r) => box && { left: box.x + r[0] * box.w, top: box.y + r[1] * box.h, width: r[2] * box.w, height: r[3] * box.h };

  return (
    <div className="player">
      {!compact && <div className="ph">
        <span>{title || '预览'}</span>{shot && <span className="tag">{sid(p, shot)} · {shot.title}</span>}
        <span className="spacer" />
        <button className={'ib sm' + (subs ? ' on' : '')} onClick={() => setSubs(!subs)} title="预览里显示字幕">字幕</button>
        {annotate && <button className={'ib sm' + (annoMode ? ' on' : '')} onClick={() => useStore.setState({ annoMode: !annoMode })} title="在画面上拖一个框，写一句修改意见"><Icon n="pen" s={14} />圈注</button>}
      </div>}
      <div className="screen" ref={host}>
        {annotate && box && (annoMode || annos.length > 0) && (
          <div className="annoLayer" style={{ pointerEvents: annoMode ? 'auto' : 'none' }} onPointerDown={annoMode ? down : undefined} onPointerMove={move} onPointerUp={up}>
            {annos.map((a) => <div key={a.id} className="annoBox" style={rect(a.rect)}><span>{a.text}</span></div>)}
            {draft && <div className="annoBox" style={rect([Math.min(draft.x0, draft.x1), Math.min(draft.y0, draft.y1), Math.abs(draft.x1 - draft.x0), Math.abs(draft.y1 - draft.y0)])} />}
          </div>
        )}
        {draft?.text != null && box && (
          <div style={{ position: 'absolute', zIndex: 8, left: Math.max(box.x, Math.min(box.x + Math.min(draft.x0, draft.x1) * box.w, box.x + box.w - 260)), top: Math.min(box.y + Math.max(draft.y0, draft.y1) * box.h + 6, box.y + box.h - 110), /* 放在框下面，不挡住圈中的内容 */ width: 250, background: 'var(--ink2)', border: '1px solid var(--line2)', borderRadius: 8, padding: 8, boxShadow: 'var(--shadow)' }} onPointerDown={(e) => e.stopPropagation()}>
            <textarea autoFocus placeholder="这里要怎么改？例：字太小，放大一点" value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); } if (e.key === 'Escape') setDraft(null); }} />
            <div className="row" style={{ marginTop: 6, justifyContent: 'flex-end' }}><button className="btn sm ghost" onClick={() => setDraft(null)}>取消</button><button className="btn sm pri" onClick={save}>保存圈注</button></div>
          </div>
        )}
      </div>
      <Transport />
    </div>
  );
}

export function Transport() {
  const p = useStore((s) => s.p); const t = useStore((s) => s.t); const playing = useStore((s) => s.playing);
  if (!p) return null; const step = 1 / p.fps;
  const go = (x) => useStore.setState({ t: Math.max(0, Math.min(p.duration, x)), playing: false });
  return (
    <div className="ctrl">
      <button className="ib sm" onClick={() => go(0)} title="到开头 Home"><Icon n="prev" s={14} /></button>
      <button className="ib sm" onClick={() => go(t - step)} title="上一帧 ←"><Icon n="stepb" s={14} /></button>
      <button className="playb" onClick={() => useStore.setState({ playing: !playing })} title={playing ? '暂停（空格）' : '播放（空格）'} aria-label={playing ? '暂停' : '播放'}><Icon n={playing ? 'pause' : 'play'} s={15} /></button>
      <button className="ib sm" onClick={() => go(t + step)} title="下一帧 →"><Icon n="stepf" s={14} /></button>
      <button className="ib sm" onClick={() => go(p.duration)} title="到结尾 End"><Icon n="next" s={14} /></button>
      <span className="tc num">{tc(t, p.fps)} <small>/ {tc(p.duration, p.fps)}</small></span>
      <span className="spacer" />
      <span className="note faint res">{p.width}×{p.height} · {p.fps} fps</span>
    </div>
  );
}
