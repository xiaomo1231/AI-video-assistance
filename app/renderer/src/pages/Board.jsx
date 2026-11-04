// 分镜卡片墙：按章节排，拖动换顺序，点开改文字和台词
import React, { useState } from 'react';
import { useStore, S } from '../store.js';
import { shotLines, overflow, tc } from '../../../core/timing.js';
import { Thumb, sid } from '../components/ui.jsx';
import ShotEditor from '../components/ShotEditor.jsx';
import PlayerView from '../components/PlayerView.jsx';

export default function Board() {
  const p = useStore((s) => s.p); const sel = useStore((s) => s.sel);
  const [dragId, setDragId] = useState(null); const [over, setOver] = useState(null); const [q, setQ] = useState('');
  const cur = sel?.kind === 'shot' ? p.shots.find((s) => s.id === sel.id) : null;
  const pick = (s) => { S().setSel({ kind: 'shot', id: s.id }); useStore.setState({ t: s.t0 + Math.min(0.5, s.dur / 2), playing: false }); };
  const shots = p.shots.filter((s) => !q || (s.title + s.prompt + (s.src.card?.heading || '') + shotLines(p, s.id).map((l) => l.text).join('')).includes(q));
  const add = () => { const id = S().edit({ op: 'addShot', args: { after: cur?.id, shot: { title: '新镜头', src: { kind: 'card', in: 0, card: { layout: 'statement', heading: '新镜头' } } } } }, '加镜头')[0]; if (id) S().setSel({ kind: 'shot', id }); };
  const stats = { draft: 0, revise: 0, confirmed: 0 }; p.shots.forEach((s) => stats[s.status] = (stats[s.status] || 0) + 1);

  return (
    <div className="board">
      <div className="pane" style={{ minWidth: 0 }}>
        <div className="pane-h">分镜 <span className="note">{p.shots.length} 镜 · {tc(p.duration, p.fps)} · 已确认 {stats.confirmed || 0} · 待修改 {stats.revise || 0}</span><span className="spacer" />
          <input placeholder="搜索镜头和台词" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} style={{ width: 200 }} />
          <button className="btn sm" onClick={add}>＋ 加镜头</button>
          {cur && <button className="btn sm" onClick={() => S().edit({ op: 'updateShot', args: { id: cur.id, patch: { status: 'confirmed' } } }, '确认镜头')}>✓ 确认这一镜</button>}
        </div>
        {!p.shots.length ? <div className="empty"><h3>还没有镜头</h3><p>到「开始」用一个 Skill 让 AI 写分镜，或者点「＋ 加镜头」自己写。</p></div> :
          <div className="scroll"><div className="cards">
            {shots.map((s, i) => { const prev = shots[i - 1]; const ls = shotLines(p, s.id); const an = p.annotations.filter((a) => a.shot === s.id && !a.done).length; return (
              <React.Fragment key={s.id}>
                {s.chapter && (!prev || prev.chapter !== s.chapter) && <div className="chapter">{s.chapter}</div>}
                <div className={'card' + (cur?.id === s.id ? ' on' : '')} draggable onDragStart={() => setDragId(s.id)} onDragEnd={() => { setDragId(null); setOver(null); }}
                  onDragOver={(e) => { e.preventDefault(); setOver(s.id); }} onDrop={(e) => { e.preventDefault(); if (dragId && dragId !== s.id) S().edit({ op: 'moveShot', args: { id: dragId, to: p.shots.findIndex((x) => x.id === s.id) } }, '调整顺序'); setOver(null); }}
                  onClick={() => pick(s)} style={over === s.id && dragId !== s.id ? { boxShadow: '-4px 0 0 var(--orange)' } : null}>
                  <div className="th"><Thumb shot={s} /></div>
                  <div className="meta">
                    <div className="row"><span className="note">{sid(p, s)} · {tc(s.t0, p.fps).slice(3, 8)} · {s.dur.toFixed(1)}s{s.lock ? ' 🔒' : ''}</span><span className="spacer" />
                      {an > 0 && <span className="tag review">✎ {an}</span>}{overflow(p, s) && <span className="st error">超时</span>}<span className={'st ' + s.status}>{{ draft: '草稿', revise: '待改', confirmed: '确认' }[s.status]}</span></div>
                    <b>{s.title}</b>
                    <div className="ln">{ls.length ? ls.map((l) => `${l.who}：${l.text}`).join(' ') : <i className="note">没有台词</i>}</div>
                  </div>
                </div>
              </React.Fragment>); })}
          </div></div>}
      </div>
      <div className="pane" style={{ borderLeft: '1px solid var(--line)' }}>
        <div style={{ height: 260, display: 'flex', flexDirection: 'column', flex: 'none' }}><PlayerView title="样片" /></div>
        <div className="scroll">{cur ? <ShotEditor shot={cur} /> : <div className="empty">点一张卡片编辑。拖动卡片换顺序。</div>}</div>
      </div>
    </div>
  );
}
