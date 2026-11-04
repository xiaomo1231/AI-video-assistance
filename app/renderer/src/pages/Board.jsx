// 精修 · 分镜墙：按章节分组的卡片墙。拖动只是先排一个草稿顺序，提交后检查换了顺序的接缝：
// 配了 AI 就让 AI 改承接台词和转场，没配就给规则版建议，逐条勾选。换顺序和衔接修改是同一步撤销。
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, S } from '../store.js';
import { api } from '../api.js';
import { apply as applyOps, clone } from '../../../core/project.js';
import { planSmooth, smoothOps, movedIds } from '../../../core/smooth.js';
import { shotLines, overflow, tc } from '../../../core/timing.js';
import { Thumb, sid, Icon, Split, aiReady } from '../components/ui.jsx';
import PlayerView from '../components/PlayerView.jsx';
import { Props } from './Edit.jsx';

const STATUS = { draft: '草稿', revise: '待改', confirmed: '确认' };

export default function Board() {
  const p = useStore((s) => s.p); const sel = useStore((s) => s.sel); const t = useStore((s) => s.t); const side = useStore((s) => s.layout.boardSide);
  const flash = useStore((s) => s.flash); const aiOn = useStore(aiReady);
  const [order, setOrder] = useState(null); const [dragId, setDragId] = useState(null); const [over, setOver] = useState(null);
  const [q, setQ] = useState(''); const [fold, setFold] = useState({}); const [smooth, setSmooth] = useState(null);
  const ids = p.shots.map((s) => s.id);
  // 卡片列数跟着墙宽走（2–6 列）；章节一组一组往后排，短章节并排放，长章节占满一行再换行
  const wallRef = useRef(null); const [cols, setCols] = useState(4);
  useEffect(() => { const el = wallRef.current; if (!el) return; const ro = new ResizeObserver(() => setCols(Math.max(2, Math.min(6, Math.floor((el.clientWidth - 28 + 12) / (196 + 12)))))); ro.observe(el); return () => ro.disconnect(); }, []);
  // 工程在别处改了镜头（增删）时，草稿顺序作废
  useEffect(() => { if (order && (order.length !== ids.length || order.some((id) => !ids.includes(id)))) { setOrder(null); setSmooth(null); } }, [ids.join()]);
  const byId = useMemo(() => new Map(p.shots.map((s) => [s.id, s])), [p]);
  const list = (order || ids).map((id) => byId.get(id)).filter(Boolean);
  const moved = useMemo(() => new Set(order ? movedIds(ids, order) : []), [order, ids.join()]);
  const cur = sel?.kind === 'shot' ? byId.get(sel.id) : null;
  const t0d = new Map(); { let acc = 0; for (const s of list) { t0d.set(s.id, order ? acc : s.t0); acc += s.dur; } } // 草稿顺序下每镜大概从哪开始
  const pick = (s) => { S().setSel({ kind: 'shot', id: s.id }); useStore.setState({ t: s.t0 + Math.min(0.5, s.dur / 2), playing: false }); };
  const add = () => { const id = S().edit({ op: 'addShot', args: { after: cur?.id, shot: { title: '新镜头', src: { kind: 'card', in: 0, card: { layout: 'statement', heading: '新镜头' } } } } }, '加镜头')[0]; if (id) S().setSel({ kind: 'shot', id }); };
  const stats = { draft: 0, revise: 0, confirmed: 0 }; p.shots.forEach((s) => (stats[s.status] = (stats[s.status] || 0) + 1));
  const hit = (s) => !q || (s.title + (s.prompt || '') + (s.src.card?.heading || '') + shotLines(p, s.id).map((l) => l.text).join('')).includes(q);

  // ---------- 拖动：只改草稿顺序 ----------
  const dropOn = (target, side2) => {
    if (!dragId || dragId === target) return;
    const base = (order || ids).filter((x) => x !== dragId); let k = base.indexOf(target); if (side2 === 'r') k++;
    base.splice(k, 0, dragId);
    const same = base.every((x, i) => x === ids[i]);
    setOrder(same ? null : base); setSmooth(null);
  };
  const reset = () => { setOrder(null); setSmooth(null); };

  // ---------- 提交：检查接缝 ----------
  const submit = async () => {
    const items = planSmooth(p, order); const on = new Set(items.map((x) => x.key));
    if (!aiOn) { setSmooth({ items, on }); return; }
    setSmooth({ busy: true, items, on });
    const qp = clone(p); applyOps(qp, [{ op: 'reorderShots', args: { ids: order } }]);
    const mv = [...moved].map((id) => `${'S' + String(order.indexOf(id) + 1).padStart(2, '0')}（${byId.get(id).title}）`).join('、');
    const prompt = `我刚在分镜墙上调整了镜头顺序，现在的工程已经是新顺序。挪动过的镜头：${mv || '若干'}。请只检查顺序变了的接缝，让前后衔接平滑：必要时补一句承接台词、改转场、调整章节归属，或者让开场 / 结尾仍然成立。不要改动和接缝无关的内容，不要再改镜头顺序。`;
    try {
      const r = await api('ai:run', 'smooth' + Date.now(), S().dir, qp, prompt, { reordered: true, moved: [...moved] }, []);
      setSmooth((x) => x && { ...x, busy: false, ai: r });
    } catch (e) { setSmooth((x) => x && { ...x, busy: false, err: e.message }); }
  };
  const applyRule = () => { const pickd = smooth.items.filter((x) => smooth.on.has(x.key)); S().edit(smoothOps(order, pickd), pickd.length ? `调整顺序，补 ${pickd.length} 处衔接` : '调整顺序', { flash: true }); reset(); };
  const applyAi = () => { S().edit([{ op: 'reorderShots', args: { ids: order } }, ...(smooth.ai.ops || [])], 'AI 衔接：调整顺序'); reset(); };
  const onlyOrder = () => { S().edit({ op: 'reorderShots', args: { ids: order } }, '调整顺序'); reset(); };

  // 相邻同章节的镜头分成一组
  const groups = []; for (const s of list) { const c = s.chapter || ''; const g = groups[groups.length - 1]; if (g && g.name === c) g.shots.push(s); else groups.push({ name: c, key: c + ':' + s.id, shots: [s] }); }

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>
      <div className="wall" ref={wallRef} style={{ minWidth: 0 }}>
        <div className={'reo' + (order ? ' on' : '')}>
          {order ? <>
            <Icon n="grip" /><span>调整了 <b>{moved.size}</b> 个镜头的顺序（虚线框），还没生效</span><span className="spacer" />
            <button className="btn sm ghost" onClick={reset}>放弃</button>
            <button className="btn sm" onClick={onlyOrder} title="直接换，不检查前后衔接">只换顺序</button>
            <button className="btn sm pri" disabled={smooth?.busy} onClick={submit}><Icon n="spark" s={14} />{aiOn ? '提交，让 AI 理顺衔接' : '提交并检查衔接'}</button>
          </> : <>
            <b>分镜</b><span className="note">{p.shots.length} 镜 · {tc(p.duration, p.fps).slice(3, 8)} · 已确认 {stats.confirmed || 0} · 待改 {stats.revise || 0} · 拖动卡片换顺序</span><span className="spacer" />
            <input placeholder="搜索镜头和台词" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} style={{ width: 180, height: 28 }} />
            <button className="btn sm" onClick={add}><Icon n="plus" s={14} />加镜头</button>
            {cur && cur.status !== 'confirmed' && <button className="btn sm" onClick={() => S().edit({ op: 'updateShot', args: { id: cur.id, patch: { status: 'confirmed' } } }, '确认镜头')}><Icon n="check" s={14} />确认这一镜</button>}
          </>}
        </div>
        {smooth && <SmoothCard s={smooth} setS={setSmooth} aiOn={aiOn} onRule={applyRule} onAi={applyAi} onOnly={onlyOrder} />}
        {!p.shots.length ? <div className="empty"><h3>还没有镜头</h3><p>到「开始」说一句需求让 AI 写分镜，或者点「加镜头」自己写。</p></div> :
          <div className="cards" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, rowGap: 18 }}>{groups.map((g) => { const shown = g.shots.filter(hit); if (!shown.length) return null; const f = fold[g.key]; const dur = g.shots.reduce((a, s) => a + s.dur, 0); return (
            <section key={g.key} style={{ gridColumn: `span ${f ? Math.min(2, cols) : Math.min(shown.length, cols)}`, display: 'grid', gridTemplateColumns: 'subgrid', alignContent: 'start', columnGap: 12, rowGap: 12 }}>
              <h6 className={f ? 'fold' : ''} style={{ gridColumn: '1 / -1', margin: 0 }} onClick={() => setFold({ ...fold, [g.key]: !f })} title={f ? '展开' : '收起这一章'}><Icon n="chevd" s={14} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name || '未分章'}</span><span className="faint" style={{ whiteSpace: 'nowrap' }}>{g.shots.length} 镜 · {dur.toFixed(1)}s</span></h6>
              {!f && <>{shown.map((s) => { const ls = shotLines(p, s.id); const an = p.annotations.filter((a) => a.shot === s.id && !a.done).length; const k = list.indexOf(s); return (
                <div key={s.id} className={'card' + (cur?.id === s.id ? ' on' : '') + (moved.has(s.id) ? ' mv' : '') + (dragId === s.id ? ' dragging' : '') + (over?.id === s.id && dragId !== s.id ? (over.side === 'l' ? ' dl' : ' dr') : '') + (flash?.ids?.has(s.id) ? ' flash' : '')}
                  draggable onDragStart={(e) => { setDragId(s.id); e.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => { setDragId(null); setOver(null); }}
                  onDragOver={(e) => { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setOver({ id: s.id, side: e.clientX < r.left + r.width / 2 ? 'l' : 'r' }); }}
                  onDrop={(e) => { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); dropOn(s.id, e.clientX < r.left + r.width / 2 ? 'l' : 'r'); setOver(null); setDragId(null); }}
                  onClick={() => pick(s)} title="拖动换顺序，点一下编辑">
                  <div className="th"><Thumb shot={s} /></div>
                  <div className={'stripe ' + (an ? 'anno' : s.status)} />
                  <div className="meta">
                    <div className="r"><span className="num">{'S' + String(k + 1).padStart(2, '0')} · {tc(t0d.get(s.id), p.fps).slice(3, 8)} · {s.dur.toFixed(1)}s {s.lock && <Icon n="lock" s={11} />}</span>
                      <span className="row" style={{ gap: 4 }}>{an > 0 && <span className="tag review"><Icon n="pen" s={10} />{an}</span>}{overflow(p, s) && <span className="st error">超时</span>}<span className={'st ' + s.status}>{STATUS[s.status]}</span></span></div>
                    <b>{s.title}</b>
                    <div className="ln">{ls.length ? ls.map((l) => `${l.who}：${l.text}`).join(' ') : <i className="faint">没有台词</i>}</div>
                  </div>
                </div>); })}</>}
            </section>); })}</div>}
      </div>
      <Split dir="v" k="boardSide" sign={-1} min={340} max={640} />
      <div className="props" style={{ width: side, flex: 'none' }}>
        <div style={{ height: 270, display: 'flex', flexDirection: 'column', flex: 'none', borderBottom: '1px solid var(--line)' }}><PlayerView title="样片" /></div>
        <Props sel={sel} p={p} t={t} />
      </div>
    </div>
  );
}

function SmoothCard({ s, setS, aiOn, onRule, onAi, onOnly }) {
  const toggle = (k) => { const on = new Set(s.on); on.has(k) ? on.delete(k) : on.add(k); setS({ ...s, on }); };
  if (s.busy) return <div className="smooth"><h5><span className="spin" />AI 正在看换了顺序的接缝…</h5><div className="note">只看前后接上的地方，别的不动。</div></div>;
  if (s.ai && s.ai.ops?.length) return <div className="smooth">
    <h5><Icon n="spark" s={14} />AI 的衔接修改<span className="spacer" /><span className="note">和换顺序一起应用，一步撤销</span></h5>
    {s.ai.text && <div style={{ whiteSpace: 'pre-wrap' }}>{s.ai.text}</div>}
    <div className="diff">{(s.ai.changes || []).map((c, k) => <div key={k} className={c.kind}>{c.kind === 'add' ? '+ ' : c.kind === 'del' ? '− ' : '~ '}{c.text}</div>)}</div>
    <div className="row"><button className="btn sm pri" onClick={onAi}>应用</button><button className="btn sm" onClick={() => setS({ ...s, ai: null })}>改看规则版建议</button><button className="btn sm ghost" onClick={onOnly}>只换顺序</button></div>
  </div>;
  return <div className="smooth">
    <h5><Icon n="check" s={14} />{s.items.length ? `换了顺序的接缝，建议改 ${s.items.length} 处` : '接缝看着都顺，不用改'}<span className="spacer" />
      {s.err ? <span className="note" style={{ color: 'var(--warn)' }}>AI 没跑通（{s.err.slice(0, 60)}），先用规则版</span> : s.ai ? <span className="note">AI 觉得不用改，下面是规则版建议</span> : !aiOn && <span className="note">没配 AI，按规则给的建议</span>}</h5>
    {s.items.map((it) => <label key={it.key}><input type="checkbox" checked={s.on.has(it.key)} onChange={() => toggle(it.key)} />
      <span><b>{it.title}</b><br /><span className="note">{it.why}</span>{it.old != null && <><br /><span className="old">{it.old}</span> → <span>{it.text}</span></>}</span></label>)}
    <div className="row"><button className="btn sm pri" onClick={onRule}>{s.items.length ? `应用勾选的 ${s.on.size} 条并换顺序` : '换顺序'}</button>{s.items.length > 0 && <button className="btn sm ghost" onClick={onOnly}>只换顺序</button>}<button className="btn sm ghost" onClick={() => setS(null)}>关掉</button></div>
  </div>;
}
