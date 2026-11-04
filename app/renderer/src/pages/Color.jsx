// 调色页：色轮（暗部 / 中间调 / 亮部）、基础参数、风格 LUT、示波器、镜头条、复制粘贴、颜色匹配
import React, { useEffect, useRef, useState } from 'react';
import { useStore, S } from '../store.js';
import { api } from '../api.js';
import { shotAt } from '../../../core/timing.js';
import { defGrade } from '../../../core/project.js';
import { LOOKS, gradePixel, isNeutral } from '../player/grade.js';
import PlayerView from '../components/PlayerView.jsx';
import { Slider, Thumb, sid } from '../components/ui.jsx';

const PH = [0, (2 * Math.PI) / 3, (-2 * Math.PI) / 3];
const toVec = (c) => { const m = (c[0] + c[1] + c[2]) / 3; let x = 0, y = 0; c.forEach((v, i) => { x += (v - m) * Math.cos(PH[i]); y += (v - m) * Math.sin(PH[i]); }); return [(x * 2) / 3, (y * 2) / 3, m]; };
const fromVec = (x, y, m) => PH.map((ph) => +(x * Math.cos(ph) + y * Math.sin(ph) + m).toFixed(4));
const RANGE = 0.25;
let clip = null;

export default function Color() {
  const p = useStore((s) => s.p); const t = useStore((s) => s.t); const sel = useStore((s) => s.sel); const dir = useStore((s) => s.dir);
  const shot = (sel?.kind === 'shot' && p.shots.find((s) => s.id === sel.id)) || shotAt(p, t) || p.shots[0];
  const g = { ...defGrade(), ...(shot?.grade || {}) };
  const live = (patch) => S().live((q) => { const s = q.shots.find((x) => x.id === shot.id); s.grade = { ...defGrade(), ...s.grade, ...patch }; });
  const begin = () => S().beginLive(); const end = (label = '调色') => S().commitLive(label);
  const set = (patch, label) => S().edit({ op: 'updateShot', args: { id: shot.id, patch: { grade: { ...g, ...patch } } } }, label);
  if (!shot) return <div className="empty">还没有镜头</div>;
  const pickShot = (s) => { S().setSel({ kind: 'shot', id: s.id }); useStore.setState({ t: s.t0 + Math.min(1, s.dur / 2), playing: false }); };

  return (
    <div className="color">
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}><PlayerView title={`调色 · ${sid(p, shot)} ${shot.title}`} annotate={false} /></div>
        <div className="strip">{p.shots.map((s) => <button key={s.id} className={s.id === shot.id ? 'on' : ''} onClick={() => pickShot(s)}><div style={{ aspectRatio: '16/9' }}><Thumb shot={s} w={200} /></div><span>{sid(p, s)} {isNeutral(s.grade) ? '' : '●'} {s.title}</span></button>)}</div>
      </div>
      <div className="pane" style={{ borderLeft: '1px solid var(--line)' }}>
        <div className="pane-h">{sid(p, shot)} 一级调色<span className="spacer" />
          <button className="ib" title="复制调色" onClick={() => { clip = g; S().say('已复制调色'); }}>复制</button>
          <button className="ib" title="粘贴到当前镜头" disabled={!clip} onClick={() => clip && set(clip, '粘贴调色')}>粘贴</button>
          <button className="ib" title="当前调色应用到全部镜头" onClick={() => S().edit(p.shots.map((s) => ({ op: 'updateShot', args: { id: s.id, patch: { grade: g } } })), '调色应用到全部')}>应用全部</button>
          <button className="ib" onClick={() => set(defGrade(), '重置调色')}>重置</button>
        </div>
        <div className="scroll">
          <Scopes shot={shot} g={g} p={p} dir={dir} />
          <div className="wheels">{[['lift', '暗部'], ['gamma', '中间调'], ['gain', '亮部']].map(([k, n]) => <Wheel key={k} name={n} v={g[k]} onStart={begin} onEnd={() => end(n)} onChange={(c) => live({ [k]: c })} />)}</div>
          <Slider label="曝光" value={g.exposure} min={-2} max={2} onStart={begin} onEnd={() => end('曝光')} onChange={(v) => live({ exposure: v })} />
          <Slider label="对比度" value={g.contrast} min={-0.6} max={0.6} onStart={begin} onEnd={() => end('对比度')} onChange={(v) => live({ contrast: v })} />
          <Slider label="饱和度" value={g.saturation} min={-1} max={1} onStart={begin} onEnd={() => end('饱和度')} onChange={(v) => live({ saturation: v })} />
          <Slider label="色温" value={g.temp} min={-1} max={1} onStart={begin} onEnd={() => end('色温')} onChange={(v) => live({ temp: v })} />
          <Slider label="色调" value={g.tint} min={-1} max={1} onStart={begin} onEnd={() => end('色调')} onChange={(v) => live({ tint: v })} />
          <div className="field"><label>风格（叠加在手动参数上）</label><div className="chips">{Object.entries(LOOKS).map(([k, l]) => <button key={k} className={'chip' + ((g.look || 'none') === k ? ' on' : '')} onClick={() => set({ look: k === 'none' ? null : k }, '风格：' + l.name)}>{l.name}</button>)}</div></div>
          <div className="field"><label>颜色匹配</label><div className="row"><span className="note">让当前镜头的亮度和色调靠近</span><select defaultValue="" onChange={async (e) => { const ref = p.shots.find((s) => s.id === e.target.value); e.target.value = ''; if (!ref) return; try { const m = await matchTo(dir, p, ref, shot); set(m, `向 ${sid(p, ref)} 匹配`); } catch (er) { S().say(er.message, true); } }}><option value="">选参考镜头…</option>{p.shots.filter((s) => s.id !== shot.id).map((s) => <option key={s.id} value={s.id}>{sid(p, s)} {s.title}</option>)}</select></div></div>
          <div className="note" style={{ padding: '0 14px 14px' }}>双击滑块回到 0。预览和导出用同一套滤镜，看到的就是导出的颜色。</div>
        </div>
      </div>
    </div>
  );
}

function Wheel({ name, v = [0, 0, 0], onChange, onStart, onEnd }) {
  const cv = useRef(null); const [x, y, m] = toVec(v);
  useEffect(() => {
    const c = cv.current; const S2 = 220; c.width = S2; c.height = S2; const g = c.getContext('2d'); const R = S2 / 2 - 8;
    for (let a = 0; a < 360; a += 2) { g.beginPath(); g.moveTo(S2 / 2, S2 / 2); g.arc(S2 / 2, S2 / 2, R, (a * Math.PI) / 180, ((a + 3) * Math.PI) / 180); g.fillStyle = `hsl(${-a},70%,45%)`; g.fill(); }
    const rg = g.createRadialGradient(S2 / 2, S2 / 2, 0, S2 / 2, S2 / 2, R); rg.addColorStop(0, 'rgba(40,36,30,1)'); rg.addColorStop(1, 'rgba(40,36,30,0)'); g.fillStyle = rg; g.beginPath(); g.arc(S2 / 2, S2 / 2, R, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.2)'; g.beginPath(); g.moveTo(S2 / 2 - 8, S2 / 2); g.lineTo(S2 / 2 + 8, S2 / 2); g.moveTo(S2 / 2, S2 / 2 - 8); g.lineTo(S2 / 2, S2 / 2 + 8); g.stroke();
    const px = S2 / 2 + (x / RANGE) * R, py = S2 / 2 + (y / RANGE) * R; g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.arc(px, py, 7, 0, 7); g.fill(); g.stroke();
  });
  const at = (e) => { const r = cv.current.getBoundingClientRect(); let dx = ((e.clientX - r.left) / r.width - 0.5) * 2, dy = ((e.clientY - r.top) / r.height - 0.5) * 2; const d = Math.hypot(dx, dy); if (d > 1) { dx /= d; dy /= d; } onChange(fromVec(dx * RANGE * 0.96, dy * RANGE * 0.96, m)); };
  return (
    <div className="wheel">
      <canvas ref={cv} onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onStart(); at(e); }} onPointerMove={(e) => e.buttons && at(e)} onPointerUp={onEnd} onDoubleClick={() => { onStart(); onChange([0, 0, 0]); onEnd(); }} />
      <span>{name}</span>
      <input type="range" min={-0.3} max={0.3} step={0.005} value={m} style={{ width: '100%' }} onPointerDown={onStart} onPointerUp={onEnd} onChange={(e) => onChange(fromVec(x, y, +e.target.value))} title="整体明暗" />
    </div>
  );
}

// ---------- 示波器：取一帧未调色的画面，在本地套用调色参数，所以拖动时实时变化 ----------
const raw = new Map();
async function rawFrame(dir, p, shot, t) {
  const k = shot.id + ':' + JSON.stringify(shot.src) + ':' + t.toFixed(1); if (raw.has(k)) return raw.get(k);
  const q = { ...p, lines: [], texts: [], annotations: [], shots: p.shots.map((s) => ({ ...s, grade: defGrade() })) };
  const pr = api('render:still', dir, q, t, 240).then((url) => new Promise((res, rej) => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); res(g.getImageData(0, 0, c.width, c.height)); }; im.onerror = rej; im.src = url; }));
  raw.set(k, pr); pr.catch(() => raw.delete(k)); return pr;
}
async function matchTo(dir, p, ref, cur) {
  const stats = async (s, g) => { const d = await rawFrame(dir, p, s, s.t0 + Math.min(1, s.dur / 2)); let n = 0; const sum = [0, 0, 0]; for (let i = 0; i < d.data.length; i += 16) { const c = gradePixel([d.data[i] / 255, d.data[i + 1] / 255, d.data[i + 2] / 255], g); c.forEach((v, k) => (sum[k] += v)); n++; } return sum.map((v) => v / n); };
  const a = await stats(ref, ref.grade), b = await stats(cur, { ...defGrade() });
  const la = (a[0] + a[1] + a[2]) / 3, lb = (b[0] + b[1] + b[2]) / 3;
  const exposure = +Math.max(-1.5, Math.min(1.5, Math.log2(Math.max(0.02, la) / Math.max(0.02, lb)))).toFixed(3);
  const gain = a.map((v, i) => +Math.max(-0.25, Math.min(0.25, v / Math.max(0.02, la) - b[i] / Math.max(0.02, lb))).toFixed(3));
  return { exposure, gain }; // 只动曝光和亮部色彩，风格、暗部、饱和度等原有调色保留
}

function Scopes({ shot, g, p, dir }) {
  const t = useStore((s) => s.t); const [img, setImg] = useState(null); const wf = useRef(null); const vs = useRef(null);
  const at = shotAt(p, t)?.id === shot.id ? t : shot.t0 + Math.min(1, shot.dur / 2);
  useEffect(() => { let dead = false; const h = setTimeout(() => rawFrame(dir, p, shot, Math.round(at * 2) / 2).then((d) => !dead && setImg(d)).catch(() => {}), 250); return () => { dead = true; clearTimeout(h); }; }, [shot.id, JSON.stringify(shot.src), Math.round(at * 2), p.template]);
  useEffect(() => {
    if (!img) return; const W = 300, H = 150;
    for (const c of [wf.current, vs.current]) { c.width = W; c.height = H; const g2 = c.getContext('2d'); g2.fillStyle = '#0b0a08'; g2.fillRect(0, 0, W, H); }
    const a = wf.current.getContext('2d'), b = vs.current.getContext('2d');
    a.strokeStyle = 'rgba(255,255,255,.08)'; for (let i = 1; i < 4; i++) { a.beginPath(); a.moveTo(0, (H * i) / 4); a.lineTo(W, (H * i) / 4); a.stroke(); }
    b.strokeStyle = 'rgba(255,255,255,.1)'; b.beginPath(); b.arc(W / 2, H / 2, H / 2 - 4, 0, 7); b.stroke();
    const d = img.data, iw = img.width; a.globalCompositeOperation = 'lighter'; b.globalCompositeOperation = 'lighter';
    const cols = ['rgba(255,60,60,.12)', 'rgba(60,255,60,.12)', 'rgba(80,120,255,.12)'];
    for (let i = 0; i < d.length; i += 8) {
      const px = (i / 4) % iw; const c = gradePixel([d[i] / 255, d[i + 1] / 255, d[i + 2] / 255], g); const x = (px / iw) * W;
      for (let k = 0; k < 3; k++) { a.fillStyle = cols[k]; a.fillRect(x, H - c[k] * H, 1.2, 1.2); }
      const u = -0.169 * c[0] - 0.331 * c[1] + 0.5 * c[2], v = 0.5 * c[0] - 0.419 * c[1] - 0.081 * c[2];
      b.fillStyle = `rgba(${c[0] * 255 | 0},${c[1] * 255 | 0},${c[2] * 255 | 0},.25)`; b.fillRect(W / 2 + u * H * 1.6, H / 2 - v * H * 1.6, 1.5, 1.5);
    }
  }, [img, JSON.stringify(g)]);
  return <div className="scopes"><div><div className="note">RGB 分量</div><canvas ref={wf} /></div><div><div className="note">矢量示波器</div><canvas ref={vs} /></div></div>;
}
