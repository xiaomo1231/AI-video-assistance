// 工作流运行面板：步骤进度 + 所有「等你」的交互（提问、选结构、审片、看改动、确认删除…）
import React, { useEffect, useState } from 'react';
import { useStore, S } from '../store.js';
import { api } from '../api.js';
import { fmtSec, Icon } from './ui.jsx';

const STEP_IC = { done: 'check', run: null, error: 'x', skipped: 'minus', warn: 'alert' };
const KIND_CN = { ai: 'AI', tool: '工具', human: '人工', review: '审片' };

export default function WfPanel() {
  const run = useStore((s) => s.run); const [showSteps, setShowSteps] = useState(false);
  if (!run) return <div className="empty"><Icon n="flow" s={28} /><h3>没有在跑的工作流</h3><p>在开始页说一句需求，或到「工作流」挑一个 Skill 运行。跑到要你决定的地方，会在这里等你。</p><button className="btn" onClick={() => S().setPage('flow')}>去工作流</button></div>;
  const wait = run.waiting; const steps = run.steps || [];
  const done = ['done', 'error', 'cancelled'].includes(run.state);
  const respond = (a) => api('workflow:respond', run.id, a).catch((e) => S().say(e.message, true));
  const n = steps.length; const k = Math.min(n, (run.status || []).filter((x) => x === 'done' || x === 'skipped').length);
  return <>
    <div className="wfbox" style={{ borderBottom: '1px solid var(--line)' }}>
      <div className="row"><b style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{run.name}</b>
        <span className={'tag ' + (wait ? 'human' : done && run.state === 'done' ? 'ok' : '')}>{wait ? '等你' : { running: '进行中', done: '完成', error: '出错', cancelled: '已停止', waiting: '等你' }[run.state] || run.state}</span>
        {run.round > 0 && <span className="tag review">第 {run.round + 1} 轮</span>}
        {!done && <button className="btn sm ghost" onClick={() => api('workflow:cancel', run.id)}><Icon n="stop" s={12} />停止</button>}
        {done && <button className="ib sm" title="清掉" onClick={() => useStore.setState({ run: null })}><Icon n="x" s={14} /></button>}</div>
      <div className="progress"><i style={{ width: (n ? k / n : 0) * 100 + '%' }} /></div>
      <div className="note">第 {Math.min(n, (run.i ?? 0) + 1)} / {n} 步 · {steps[run.i]?.name || ''}</div>
    </div>
    <div className="scroll">
      {/* 等你的内容放最上面，不用往下翻；步骤列表有等待时折成一行 */}
      {wait && <Wait key={run.id + run.log?.length} wait={wait} respond={respond} />}
      {run.info && <div className="warnbox">{run.info}</div>}
      {done && run.out && <div className="okbox">
        <div className="st ok">成片已导出，并存了一版</div><div className="note" style={{ wordBreak: 'break-all', margin: '4px 0 8px' }}>{run.out}</div>
        <div className="row" style={{ flexWrap: 'wrap' }}><button className="btn sm pri" onClick={() => api('shell:open', run.out)}><Icon n="play" s={12} />播放成片</button><button className="btn sm" onClick={() => api('shell:show', run.out)}><Icon n="folder" s={14} />打开文件夹</button><button className="btn sm ghost" onClick={() => S().setPage('deliver')}>看交付体检</button></div>
      </div>}
      {wait && !showSteps ? <div className="row note" style={{ padding: '8px 14px' }}><span className="spacer" /><button className="btn sm ghost" onClick={() => setShowSteps(true)}>看全部步骤</button></div>
        : <ul className="steps" style={{ paddingTop: 8 }}>
        {steps.map((s, i) => { const stt = run.status?.[i]; return (
          <li key={i} className={stt}>
            <span className="k">{stt === 'run' ? <span className="spin" /> : STEP_IC[stt] ? <Icon n={STEP_IC[stt]} s={14} /> : <span className="faint">{i + 1}</span>}</span>
            <span style={{ flex: 1 }}>{s.name}<br /><span className="note">{run.results?.[i] || s.desc}</span></span>
            <span className={'tag ' + s.kind}>{KIND_CN[s.kind]}</span>
          </li>); })}
        {wait && <li><button className="btn sm ghost" onClick={() => setShowSteps(false)}>收起步骤</button></li>}
      </ul>}
      {run.progress && !wait && !done && <div style={{ padding: '0 14px 10px' }}><div className="note">{run.progress.text}</div><div className="progress"><i style={{ width: (run.progress.pct || 0) * 100 + '%' }} /></div></div>}
    </div>
  </>;
}

function Wait({ wait, respond }) {
  const { kind, payload: d } = wait;
  const p = useStore((s) => s.p);
  const [ans, setAns] = useState(() => (kind === 'questions' ? d.questions.map(() => '') : kind === 'cuts' ? d.cuts.map(() => true) : kind === 'pick' ? d.items.map(() => true) : kind === 'textcut' ? d.segments.map(() => true) : ''));
  const box = (children) => <div className="wait" style={{ margin: 12 }}><h5><Icon n="alert" s={14} />等你决定</h5>{children}</div>;
  if (kind === 'confirm') return box(<><p>{d.text}</p><button className="btn pri" onClick={() => respond(true)}>继续</button></>);
  if (kind === 'questions') return box(<>
    <p><b>{d.offline ? '先问清楚这几件事，会写进分镜' : 'AI 想先问清楚这几件事'}</b>（不知道的可以空着）</p>
    {d.questions.map((q, i) => <div key={i} style={{ marginBottom: 8 }}><label>{i + 1}. {q}</label><input value={ans[i]} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => setAns(ans.map((x, k) => (k === i ? e.target.value : x)))} /></div>)}
    <button className="btn pri" onClick={() => respond(Object.fromEntries(d.questions.map((q, i) => [q, ans[i]])))}>回答，继续</button>
  </>);
  if (kind === 'choose') return box(<>
    <p><b>{d.title}</b></p>
    {d.options.map((o, i) => <button key={i} className="optcard" onClick={() => respond(i)}><b>{o.name}</b><div className="note">{o.why}</div>{o.beats && <ol style={{ margin: '4px 0 0 18px', padding: 0, fontSize: 12.5, color: 'var(--dim)' }}>{o.beats.slice(0, 6).map((b, k) => <li key={k}>{b}</li>)}</ol>}</button>)}
  </>);
  if (kind === 'review') {
    const open = (p?.annotations || []).filter((a) => !a.done);
    return box(<>
      <p>{d.text}</p>
      <div className="note">在预览画面上点「圈注」，拖一个框写一句。现在有 {open.length} 条圈注。</div>
      <textarea style={{ marginTop: 6 }} placeholder="也可以直接写整体意见，例：节奏太慢；第 5 镜换个说法" value={ans} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => setAns(e.target.value)} />
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn pri" onClick={() => respond({ verdict: 'pass' })}>通过</button>
        <button className="btn" disabled={!open.length && !ans.trim()} onClick={() => respond({ verdict: 'fail', notes: [ans.trim(), ...open.map((a) => a.text)].filter(Boolean) })}>带意见打回</button>
        <span className="spacer" /><button className="btn ghost sm" onClick={() => { useStore.setState({ annoMode: true }); S().setPage('edit'); }}><Icon n="pen" s={14} />去画面上圈注</button>
      </div>
    </>);
  }
  if (kind === 'fix') return <FixList d={d} respond={respond} box={box} />;
  if (kind === 'proposal') return box(<>
    <p>{d.text}</p>
    <div className="diff">{(d.changes || []).map((c, k) => <div key={k} className={c.kind}>{c.kind === 'add' ? '+ ' : c.kind === 'del' ? '− ' : '~ '}{c.text}</div>)}</div>
    <div className="row" style={{ marginTop: 8 }}><button className="btn pri" onClick={() => respond(true)}>应用</button><button className="btn" onClick={() => respond(false)}>不用</button></div>
  </>);
  if (kind === 'health') return box(<>
    {d.health.map((h) => <div key={h.id} className="row" style={{ padding: '3px 0', alignItems: 'flex-start' }}><span className={'st ' + h.level} style={{ width: 80, flex: 'none' }}>{h.title}</span><span className="note" style={{ color: h.level === 'ok' ? 'var(--dim)' : 'var(--fg)' }}>{h.detail}</span></div>)}
    <button className="btn pri" style={{ marginTop: 8 }} onClick={() => respond(true)}>知道了</button>
  </>);
  if (kind === 'error') return box(<>
    <div className="errbox" style={{ margin: '6px 0' }}>「{d.step}」出错：{d.error}</div>
    <div className="row">{d.options.map((o) => <button key={o} className={'btn' + (o === '重试' ? ' pri' : '')} onClick={() => respond(o)}>{o}</button>)}</div>
  </>);
  if (kind === 'cuts') return box(<>
    <p><b>标出 {d.cuts.length} 处</b>，取消勾选的会保留。共省下 {fmtSec(d.cuts.filter((c, i) => ans[i]).reduce((s, c) => s + c.t1 - c.t0, 0))}</p>
    <div style={{ maxHeight: 260, overflow: 'auto' }}>{d.cuts.map((c, i) => <label key={i} className="row" style={{ color: 'var(--fg)' }}><input type="checkbox" checked={ans[i]} onChange={() => setAns(ans.map((x, k) => (k === i ? !x : x)))} />
      <span className="mono note" style={{ width: 90 }}>{c.t0.toFixed(2)}–{c.t1.toFixed(2)}</span><span className="tag">{c.why || c.kind}</span><span>{c.text || ''}</span></label>)}</div>
    <button className="btn pri" style={{ marginTop: 8 }} onClick={() => respond(d.cuts.filter((c, i) => ans[i]))}>确认删除</button>
  </>);
  if (kind === 'pick') return box(<>
    <p><b>找到 {d.items.length} 段高光</b>，勾选要做成短视频的</p>
    {d.items.map((h, i) => <label key={i} className="row" style={{ color: 'var(--fg)', alignItems: 'flex-start' }}><input type="checkbox" checked={ans[i]} onChange={() => setAns(ans.map((x, k) => (k === i ? !x : x)))} />
      <span><b>{h.title}</b> <span className="note">{fmtSec(h.t0)}–{fmtSec(h.t1)} · {h.score ?? ''}</span><br /><span className="note">{h.why}</span></span></label>)}
    <button className="btn pri" style={{ marginTop: 8 }} onClick={() => respond(d.items.filter((h, i) => ans[i]))}>做这几条</button>
  </>);
  if (kind === 'textcut') return box(<>
    <p><b>在文字稿里删句子</b>：取消勾选就是剪掉这段画面</p>
    <div style={{ maxHeight: 320, overflow: 'auto' }}>{d.segments.map((s, i) => <label key={i} className="row" style={{ color: ans[i] ? 'var(--fg)' : 'var(--dim)', textDecoration: ans[i] ? '' : 'line-through', alignItems: 'flex-start' }}><input type="checkbox" checked={ans[i]} onChange={() => setAns(ans.map((x, k) => (k === i ? !x : x)))} /><span className="note" style={{ width: 52, flex: 'none' }}>{fmtSec(s.t0)}</span><span>{s.text}</span></label>)}</div>
    <button className="btn pri" style={{ marginTop: 8 }} onClick={() => respond(d.segments.filter((s, i) => ans[i]))}>按文字稿剪</button>
  </>);
  return box(<><p>{JSON.stringify(d).slice(0, 300)}</p><button className="btn pri" onClick={() => respond(true)}>继续</button></>);
}

/** 没配 AI 时的手动修改清单：按镜头列出，点一条跳过去，改完标已处理 */
function FixList({ d, respond, box }) {
  const p = useStore((s) => s.p); const [ok, setOk] = useState({});
  const go = (it) => { const s = p.shots.find((x) => x.id === it.shot); if (s) { S().setSel({ kind: 'shot', id: s.id }); useStore.setState({ t: s.t0 + Math.min(1, s.dur / 2), playing: false }); } S().setPage('edit'); };
  const mark = (it) => { setOk({ ...ok, [it.anno || it.text]: true }); if (it.anno) S().edit({ op: 'resolveAnnotation', args: { id: it.anno } }, '圈注已处理'); };
  return box(<>
    <p>{d.text}</p>
    {d.done?.length > 0 && <div className="note" style={{ marginBottom: 6 }}>已自动处理：{d.done.join('；')}</div>}
    {d.items.map((it, i) => { const k = it.anno || it.text; return <div key={i} className="row" style={{ padding: '4px 0', alignItems: 'flex-start', opacity: ok[k] ? 0.5 : 1 }}>
      <span className="tag review" style={{ flex: 'none' }}>{it.label}</span><span style={{ flex: 1, textDecoration: ok[k] ? 'line-through' : '' }}>{it.text}</span>
      {it.shot && <button className="btn sm" onClick={() => go(it)}>去这一镜</button>}<button className="btn sm ghost" disabled={ok[k]} onClick={() => mark(it)}>已处理</button></div>; })}
    <button className="btn pri" style={{ marginTop: 8 }} onClick={() => respond(true)}>改好了，再审一遍</button>
  </>);
}
