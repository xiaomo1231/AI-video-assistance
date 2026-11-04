// 工作流运行面板：步骤进度 + 所有「等你」的交互（提问、选结构、审片、看改动、确认删除…）
import React, { useEffect, useState } from 'react';
import { useStore, S } from '../store.js';
import { api } from '../api.js';
import { fmtSec } from './ui.jsx';

export default function WfPanel() {
  const run = useStore((s) => s.run); const [min, setMin] = useState(false);
  if (!run) return null;
  const wait = run.waiting; const steps = run.steps || [];
  const done = ['done', 'error', 'cancelled'].includes(run.state);
  const respond = (a) => api('workflow:respond', run.id, a).catch((e) => S().say(e.message, true));
  return (
    <div className="wfpanel" style={min ? { maxHeight: 48 } : null}>
      <div className="pane-h" style={{ cursor: 'pointer' }} onClick={() => setMin(!min)}>
        <span>⚙ {run.name}</span>
        <span className={'tag ' + (wait ? 'human' : '')}>{wait ? '等你' : { running: '进行中', done: '完成', error: '出错', cancelled: '已停止', waiting: '等你' }[run.state] || run.state}</span>
        {run.round > 0 && <span className="tag review">第 {run.round + 1} 轮</span>}
        <span className="spacer" />
        {!done && <button className="ib" onClick={(e) => { e.stopPropagation(); api('workflow:cancel', run.id); }}>停止</button>}
        {done && <button className="ib" onClick={(e) => { e.stopPropagation(); useStore.setState({ run: null }); }}>✕</button>}
      </div>
      {!min && <div className="scroll">
        <ul className="steps" style={{ paddingTop: 8 }}>
          {steps.map((s, i) => (
            <li key={i} className={run.status[i]}>
              <span style={{ width: 16 }}>{{ done: '✓', run: '◌', error: '✕', skipped: '–', todo: '○' }[run.status[i]] || '○'}</span>
              <span style={{ flex: 1 }}>{s.name}<br /><span className="note">{run.results?.[i] || s.desc}</span></span>
              <span className={'tag ' + s.kind}>{{ ai: 'AI', tool: '工具', human: '人工', review: '审片' }[s.kind]}</span>
            </li>
          ))}
        </ul>
        {run.progress && !wait && !done && <div style={{ padding: '0 14px 10px' }}><div className="note">{run.progress.text}</div><div className="progress"><i style={{ width: (run.progress.pct || 0) * 100 + '%' }} /></div></div>}
        {run.info && <div className="warnbox">{run.info}</div>}
        {wait && <Wait key={run.id + run.log?.length} wait={wait} respond={respond} />}
      </div>}
    </div>
  );
}

function Wait({ wait, respond }) {
  const { kind, payload: d } = wait;
  const p = useStore((s) => s.p);
  const [ans, setAns] = useState(() => (kind === 'questions' ? d.questions.map(() => '') : kind === 'cuts' ? d.cuts.map(() => true) : kind === 'pick' ? d.items.map(() => true) : kind === 'textcut' ? d.segments.map(() => true) : ''));
  const box = (children) => <div style={{ padding: '4px 14px 14px', borderTop: '1px solid var(--line)' }}>{children}</div>;
  if (kind === 'confirm') return box(<><p>{d.text}</p><button className="btn pri" onClick={() => respond(true)}>继续</button></>);
  if (kind === 'questions') return box(<>
    <p><b>AI 想先问清楚这几件事</b>（不知道的可以空着）</p>
    {d.questions.map((q, i) => <div key={i} style={{ marginBottom: 8 }}><label>{i + 1}. {q}</label><input value={ans[i]} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => setAns(ans.map((x, k) => (k === i ? e.target.value : x)))} /></div>)}
    <button className="btn pri" onClick={() => respond(Object.fromEntries(d.questions.map((q, i) => [q, ans[i]])))}>回答，继续</button>
  </>);
  if (kind === 'choose') return box(<>
    <p><b>{d.title}</b></p>
    {d.options.map((o, i) => <div key={i} className="recent" style={{ padding: 0, marginBottom: 6 }}><button onClick={() => respond(i)}><b>{o.name}</b><div className="note">{o.why}</div>{o.beats && <ol style={{ margin: '4px 0 0 18px', padding: 0, fontSize: 12.5, color: 'var(--muted)' }}>{o.beats.slice(0, 6).map((b, k) => <li key={k}>{b}</li>)}</ol>}</button></div>)}
  </>);
  if (kind === 'review') {
    const open = (p?.annotations || []).filter((a) => !a.done);
    return box(<>
      <p>{d.text}</p>
      <div className="note">在预览画面上点「✎ 圈注」，拖一个框写一句。现在有 {open.length} 条圈注。</div>
      <textarea style={{ marginTop: 6 }} placeholder="也可以直接写整体意见，例：节奏太慢；第 5 镜换个说法" value={ans} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => setAns(e.target.value)} />
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn pri" onClick={() => respond({ verdict: 'pass' })}>通过</button>
        <button className="btn" disabled={!open.length && !ans.trim()} onClick={() => respond({ verdict: 'fail', notes: [ans.trim(), ...open.map((a) => a.text)].filter(Boolean) })}>带意见打回</button>
        <span className="spacer" /><button className="btn ghost sm" onClick={() => { useStore.setState({ annoMode: true }); S().setPage('edit'); }}>去画面上圈注</button>
      </div>
    </>);
  }
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
