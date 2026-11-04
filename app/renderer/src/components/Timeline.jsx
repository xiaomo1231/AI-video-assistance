// 剪映式时间线：文字 / 主轨（镜头）/ 配音 / 字幕 / 音效 / 音乐。
// 拖动、裁剪、分割、吸附、磁吸；拖动过程走 live 预览，松手进撤销栈。
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, S } from '../store.js';
import { tc, absT, subT, shotAt, overflow, snap } from '../../../core/timing.js';
import { Wave, sid } from './ui.jsx';

const ROWS = [
  { k: 'tx', name: '文字', h: 26 },
  { k: 'v', name: '主轨', h: 56, main: true },
  { k: 'vo', name: '配音', h: 36 },
  { k: 'sub', name: '字幕', h: 26 },
  { k: 'sx', name: '音效', h: 24 },
  { k: 'mu', name: '音乐', h: 36 },
];
const TRANS = ['cut', 'fade', 'wipe', 'push', 'iris', 'flash', 'curtain', 'page'];
export const TRANS_NAMES = { cut: '硬切', fade: '叠化', dissolve: '溶解', wipe: '擦除', push: '推移', slide: '滑入', iris: '圆形', flash: '闪白', curtain: '开幕', page: '翻页', ink: '水墨', erase: '擦除', scroll: '卷轴', fold: '折叠', panel: '分格', bleed: '晕染' };

export default function Timeline({ height = 300 }) {
  const p = useStore((s) => s.p); const t = useStore((s) => s.t); const sel = useStore((s) => s.sel);
  const [pps, setPps] = useState(60); const [hover, setHover] = useState(null); const [drop, setDrop] = useState(null);
  const sc = useRef(null); const drag = useRef(null);
  const W = Math.max(800, (p.duration + 10) * pps);
  const muted = p.settings.mute || {};

  // 吸附点：镜头边、播放头、台词起点
  const snaps = useMemo(() => { const a = [0, p.duration]; for (const s of p.shots) a.push(s.t0, s.t0 + s.dur); for (const l of p.lines) a.push(absT(p, l)); return a; }, [p]);
  const snapT = (x, skip) => { if (p.settings.snap === false) return x; const th = 8 / pps; let best = x, d = th; for (const c of [...snaps, S().t]) { if (skip && Math.abs(c - skip) < 1e-6) continue; if (Math.abs(c - x) < d) { d = Math.abs(c - x); best = c; } } return best; };

  const xOf = (sec) => sec * pps;
  const tAt = (e) => { const r = sc.current.getBoundingClientRect(); return Math.max(0, (e.clientX - r.left + sc.current.scrollLeft) / pps); };
  const seek = (x) => useStore.setState({ t: Math.max(0, Math.min(p.duration, snap(x, p.fps))), playing: false });

  // 自动跟随播放头
  useEffect(() => { const el = sc.current; if (!el) return; const x = xOf(t); if (x < el.scrollLeft + 20 || x > el.scrollLeft + el.clientWidth - 60) { if (useStore.getState().playing || x > el.scrollLeft + el.clientWidth || x < el.scrollLeft) el.scrollLeft = Math.max(0, x - el.clientWidth * 0.3); } }, [t, pps]);

  // ---------------- 拖动 ----------------
  function start(e, kind, item, mode) {
    if (e.button !== 0) return; e.stopPropagation();
    const base = S().p; const x0 = e.clientX; const T0 = tAt(e);
    drag.current = { kind, id: item.id, mode, x0, T0, moved: false, base };
    S().setSel({ kind, id: item.id });
    const mv = (ev) => {
      const d = drag.current; if (!d) return; const dx = ev.clientX - d.x0; if (!d.moved && Math.abs(dx) < 3) return;
      if (!d.moved) { d.moved = true; if (!(kind === 'shot' && mode === 'move' && p.settings.magnet !== false)) S().beginLive(); }
      const dt = dx / pps; onMove(d, dt, ev);
    };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); const d = drag.current; drag.current = null; if (!d?.moved) return; onEnd(d); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  }
  const findIn = (q, kind, id) => (kind === 'shot' ? q.shots : kind === 'line' || kind === 'sub' ? q.lines : kind === 'sfx' ? q.sfx : kind === 'text' ? q.texts : q.music).find((x) => x.id === id);
  const anchorAt = (q, T) => { const s = shotAt(q, T) || q.shots[q.shots.length - 1]; return { anchor: s.id, off: snap(Math.max(0, T - s.t0), q.fps) }; };

  function onMove(d, dt) {
    const b = d.base; const o = findIn(b, d.kind, d.id); const fps = p.fps;
    if (d.kind === 'shot' && d.mode === 'move' && p.settings.magnet !== false) {
      const T = d.T0 + dt; let to = b.shots.findIndex((s) => T < s.t0 + s.dur / 2); if (to < 0) to = b.shots.length;
      setDrop({ to, x: to < b.shots.length ? b.shots[to].t0 : b.duration }); return;
    }
    S().live((q) => {
      const x = findIn(q, d.kind, d.id); if (!x) return;
      if (d.kind === 'shot') {
        if (d.mode === 'r') { x.dur = snap(Math.max(1 / fps, snapT(o.t0 + o.dur + dt, o.t0 + o.dur) - o.t0), fps); x.lock = true; }
        else if (d.mode === 'l') { const k = Math.min(o.dur - 1 / fps, Math.max(-(o.src.in || 0) / (o.speed || 1), dt)); x.src = { ...o.src, in: Math.max(0, (o.src.in || 0) + k * (o.speed || 1)) }; x.dur = snap(o.dur - k, fps); x.lock = true; }
        else { x.t0 = snap(Math.max(0, snapT(o.t0 + dt, o.t0)), fps); }
      } else if (d.kind === 'line') {
        const T = snapT(absT(b, o) + dt, absT(b, o)); const a = anchorAt(b, T); const diff = o.soff - o.off;
        x.shot = a.anchor; x.off = a.off; x.soff = snap(a.off + diff, fps); x.pin = true;
      } else if (d.kind === 'sub') {
        if (d.mode === 'r') x.sdur = snap(Math.max(0.2, o.sdur + dt), fps);
        else { const T = snapT(subT(b, o) + dt, subT(b, o)); const s = b.shots.find((y) => y.id === o.shot); x.soff = snap(Math.max(0, T - s.t0), fps); }
      } else if (d.kind === 'sfx' || d.kind === 'text') {
        if (d.mode === 'r') x.dur = snap(Math.max(0.2, o.dur + dt), fps);
        else { const a = anchorAt(b, snapT(absT(b, o) + dt, absT(b, o))); x.anchor = a.anchor; x.off = a.off; }
      } else if (d.kind === 'music') {
        if (d.mode === 'r') x.dur = snap(Math.max(0.5, o.dur + dt), fps);
        else if (d.mode === 'l') { const k = Math.max(-(o.in || 0), Math.min(o.dur - 0.5, dt)); x.t0 = snap(o.t0 + k, fps); x.in = (o.in || 0) + k; x.dur = o.dur - k; }
        else x.t0 = snap(Math.max(0, snapT(o.t0 + dt, o.t0)), fps);
      }
    });
  }
  function onEnd(d) {
    if (d.kind === 'shot' && d.mode === 'move' && p.settings.magnet !== false) {
      const dr = dropRef.current; setDrop(null); if (!dr) return; const from = d.base.shots.findIndex((s) => s.id === d.id);
      const to = dr.to > from ? dr.to - 1 : dr.to; if (to !== from) S().edit({ op: 'moveShot', args: { id: d.id, to } }, '移动镜头');
      return;
    }
    const L = { shot: d.mode === 'move' ? '移动镜头' : '裁剪镜头', line: '移动台词', sub: '调整字幕', sfx: '移动音效', text: '移动文字', music: '调整音乐' };
    S().commitLive(L[d.kind]);
  }
  // 磁吸拖动时的落点要在 onEnd 里拿到最新值
  const dropRef = useRef(null); dropRef.current = drop;

  // ---------------- 工具栏动作 ----------------
  const selShot = sel?.kind === 'shot' ? p.shots.find((s) => s.id === sel.id) : shotAt(p, t);
  const act = {
    split: () => { const s = shotAt(p, t); if (!s) return; S().edit({ op: 'splitShot', args: { id: s.id, at: snap(t - s.t0, p.fps) } }, '分割'); },
    del: () => deleteSel(),
    dup: () => selShot && S().edit({ op: 'duplicateShot', args: { id: selShot.id } }, '复制镜头'),
    freeze: () => selShot && S().edit({ op: 'freeze', args: { id: selShot.id, sec: 2 } }, '定格 2 秒'),
    auto: () => selShot && S().edit({ op: 'setLock', args: { id: selShot.id, lock: false } }, '时长按台词自动'),
    text: () => { const a = anchorAt(p, t); S().edit({ op: 'addText', args: { ...a, text: '花字', style: 'tag' } }, '加文字'); },
    sfx: () => { const a = anchorAt(p, t); S().edit({ op: 'addSfx', args: { ...a, synth: 'pop', name: 'pop' } }, '加音效'); },
    fit: () => { const w = sc.current?.clientWidth || 1000; setPps(Math.max(4, Math.min(400, (w - 40) / Math.max(1, p.duration)))); },
  };
  useEffect(() => { act.fit(); }, [p.shots.length === 0]);

  return (
    <div className="tl" style={{ height }}>
      <div className="tl-bar">
        <button className="ib" onClick={() => S().doUndo()} title="撤销 Ctrl+Z">↶</button>
        <button className="ib" onClick={() => S().doRedo()} title="重做 Ctrl+Shift+Z">↷</button>
        <span style={{ width: 8 }} />
        <button className="ib" onClick={act.split} title="在播放头处分割 S">✂ 分割</button>
        <button className="ib" onClick={act.del} title="删除 Delete">🗑 删除</button>
        <button className="ib" onClick={act.dup}>⧉ 复制</button>
        <button className="ib" onClick={act.freeze}>❄ 定格</button>
        <button className="ib" onClick={act.auto} title="让这个镜头的时长重新跟着台词走">⟲ 按台词</button>
        <button className="ib" onClick={act.text}>T 文字</button>
        <button className="ib" onClick={act.sfx}>♪ 音效</button>
        <span className="spacer" style={{ minWidth: 12 }} />
        <button className={'ib' + (p.settings.magnet !== false ? ' on' : '')} onClick={() => S().edit({ op: 'setSettings', args: { patch: { magnet: p.settings.magnet === false } } }, p.settings.magnet === false ? '磁吸开' : '磁吸关')} title="主轨磁吸：镜头首尾相接，没有空隙">🧲 磁吸</button>
        <button className={'ib' + (p.settings.snap !== false ? ' on' : '')} onClick={() => S().edit({ op: 'setSettings', args: { patch: { snap: p.settings.snap === false } } }, '吸附')} title="拖动时吸附到镜头边和播放头">⌖ 吸附</button>
        <button className="ib" onClick={() => setPps(Math.max(4, pps / 1.4))}>－</button>
        <input type="range" min={4} max={400} value={pps} onChange={(e) => setPps(+e.target.value)} style={{ width: 100 }} />
        <button className="ib" onClick={() => setPps(Math.min(400, pps * 1.4))}>＋</button>
        <button className="ib" onClick={act.fit}>适合</button>
      </div>
      <div className="tl-body">
        <div className="heads">
          <div className="rh" />
          {ROWS.map((r) => (
            <div key={r.k} className="head" style={{ height: r.h }}>
              <b>{r.name}</b>
              {['vo', 'sx', 'mu'].includes(r.k) && <button className={muted[r.k] ? 'on' : ''} title="静音这条轨（预览和导出）" onClick={() => S().edit({ op: 'setSettings', args: { patch: { mute: { ...muted, [r.k]: !muted[r.k] } } } }, '轨道静音')}>{muted[r.k] ? '🔇' : '🔊'}</button>}
            </div>
          ))}
        </div>
        <div className="tl-scroll" ref={sc}
          onWheel={(e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); const k = e.deltaY < 0 ? 1.15 : 1 / 1.15; setPps(Math.max(4, Math.min(400, pps * k))); } }}
          onPointerMove={(e) => setHover(tAt(e))} onPointerLeave={() => setHover(null)}>
          <div className="tl-inner" style={{ width: W }}>
            <Ruler p={p} pps={pps} W={W} onSeek={(x) => seek(x)} tAt={tAt} />
            {/* 文字 */}
            <div className="track" style={{ height: ROWS[0].h }}>
              {p.texts.map((x) => <Clip key={x.id} cls="tx" x={xOf(absT(p, x))} w={xOf(x.dur)} sel={sel?.id === x.id} name={x.text} onDown={(e, m) => start(e, 'text', x, m)} trimR />)}
            </div>
            {/* 主轨 */}
            <div className="track main" style={{ height: ROWS[1].h }} onDoubleClick={(e) => seek(tAt(e))}>
              {p.shots.map((s, i) => (
                <React.Fragment key={s.id}>
                  <Clip cls={'v' + (overflow(p, s) ? ' over' : '')} x={xOf(s.t0)} w={xOf(s.dur)} sel={sel?.id === s.id} name={`${sid(p, s)} ${s.title}`} dur={s.dur}
                    badge={(s.lock ? '🔒' : '') + (s.hold ? '❄' : '') + (s.src.kind === 'scene' ? '◆' : s.src.kind === 'media' ? '▣' : '')}
                    onDown={(e, m) => start(e, 'shot', s, m)} trimL trimR title={`${s.title}\n${s.dur.toFixed(2)} 秒${s.lock ? '（锁定时长）' : '（按台词自动）'}${overflow(p, s) ? '\n⚠ 台词超出镜头' : ''}`} />
                  {i > 0 && <div className="trn" title={'转场：' + (TRANS_NAMES[s.trans?.type] || '硬切') + '，点击切换'} style={{ left: xOf(s.t0), background: s.trans?.type && s.trans.type !== 'cut' ? 'var(--orange)' : '#fff' }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); const cur = TRANS.indexOf(s.trans?.type || 'cut'); const nx = TRANS[(cur + 1) % TRANS.length]; S().edit({ op: 'updateShot', args: { id: s.id, patch: { trans: { type: nx, dur: nx === 'cut' ? 0 : s.trans?.dur || 0.5 } } } }, '转场：' + TRANS_NAMES[nx]); }} />}
                </React.Fragment>
              ))}
              {drop && <div style={{ position: 'absolute', left: xOf(drop.x) - 2, top: 0, bottom: 0, width: 4, background: 'var(--orange)', zIndex: 7 }} />}
            </div>
            {/* 配音 */}
            <div className="track" style={{ height: ROWS[2].h, opacity: muted.vo ? 0.4 : 1 }}>
              {p.lines.filter((l) => !l.subOnly).map((l) => (
                <Clip key={l.id} cls={'vo' + (l.status === 'stale' ? ' stale' : '')} x={xOf(absT(p, l))} w={xOf(l.dur)} sel={sel?.id === l.id && sel.kind === 'line'} name={`${p.lines.indexOf(l) + 1}. ${l.text}`}
                  wave={l.audio} onDown={(e, m) => start(e, 'line', l, m)} title={`${l.who}：${l.text}\n${l.audio ? '已配音' : '估算时长'}${l.status === 'stale' ? '（文字改过，需重配）' : ''}${l.pin ? '\n位置已固定' : ''}`} />
              ))}
            </div>
            {/* 字幕 */}
            <div className="track" style={{ height: ROWS[3].h }}>
              {p.lines.map((l) => <Clip key={l.id} cls="sub" x={xOf(subT(p, l))} w={xOf(l.sdur)} sel={sel?.id === l.id && sel.kind === 'sub'} name={l.text} onDown={(e, m) => start(e, 'sub', l, m)} trimR />)}
            </div>
            {/* 音效 */}
            <div className="track" style={{ height: ROWS[4].h, opacity: muted.sx ? 0.4 : 1 }}>
              {p.sfx.map((x) => <Clip key={x.id} cls="sx" x={xOf(absT(p, x))} w={Math.max(18, xOf(x.dur || 0.6))} sel={sel?.id === x.id} name={x.name} onDown={(e, m) => start(e, 'sfx', x, m)} />)}
            </div>
            {/* 音乐 */}
            <div className="track" style={{ height: ROWS[5].h, opacity: muted.mu ? 0.4 : 1 }}>
              {p.music.map((m) => { const a = p.assets.find((x) => x.id === m.asset); return <Clip key={m.id} cls="mu" x={xOf(m.t0)} w={xOf(m.dur)} sel={sel?.id === m.id} name={m.name} wave={a?.path} from={m.in} len={m.dur} onDown={(e, md) => start(e, 'music', m, md)} trimL trimR />; })}
              {p.musicBed?.pending && !p.music.some((m) => m.bed) && <div className="clip mu" style={{ left: 0, width: xOf(p.duration), opacity: 0.45, cursor: 'default' }}><span className="nm">配乐：{p.musicBed.mood} {p.musicBed.bpm} BPM（导出时生成，或到音频页点「生成配乐」）</span></div>}
            </div>
            <div className="playhead" style={{ left: xOf(t) }} />
            {hover != null && !drag.current && <div className="hoverline" style={{ left: xOf(hover) }}><span>{tc(hover, p.fps)}</span></div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Ruler({ p, pps, W, onSeek, tAt }) {
  const stepS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120].find((s) => s * pps >= 70) || 300;
  const ticks = []; for (let s = 0; s * pps < W; s += stepS) ticks.push(s);
  const down = (e) => { onSeek(tAt(e)); const mv = (ev) => onSeek(tAt(ev)); const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); }; window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); };
  return (
    <div className="ruler" onPointerDown={down}>
      {ticks.map((s) => <React.Fragment key={s}><div className="tk" style={{ left: s * pps, height: 10 }} /><div className="lb" style={{ left: s * pps }}>{stepS < 1 ? tc(s, p.fps).slice(3) : tc(s, p.fps).slice(3, 8)}</div></React.Fragment>)}
      {p.shots.filter((s, i) => s.chapter && (i === 0 || p.shots[i - 1].chapter !== s.chapter)).map((s) => <div key={s.id} className="chap" style={{ left: s.t0 * pps }}>{s.chapter}</div>)}
    </div>
  );
}

function Clip({ cls, x, w, sel, name, onDown, trimL, trimR = true, badge, dur, wave, from = 0, len, title }) {
  return (
    <div className={`clip ${cls}${sel ? ' sel' : ''}`} style={{ left: x, width: Math.max(4, w - 1) }} onPointerDown={(e) => onDown(e, 'move')} title={title || name}>
      {wave && <Wave file={wave} from={from} len={len} />}
      <span className="nm">{badge ? badge + ' ' : ''}{name}</span>
      {dur != null && w > 60 && <span className="dur">{dur.toFixed(1)}s</span>}
      {trimL && <div className="h l" onPointerDown={(e) => onDown(e, 'l')} />}
      {trimR && <div className="h r" onPointerDown={(e) => onDown(e, 'r')} />}
    </div>
  );
}

export function deleteSel() {
  const { sel, p } = S(); if (!sel) return;
  const m = { shot: 'removeShot', line: 'removeLine', sub: 'removeLine', sfx: 'removeSfx', text: 'removeText', music: 'removeMusic' }[sel.kind];
  if (m) { S().edit({ op: m, args: { id: sel.id } }, '删除'); S().setSel(null); }
}
