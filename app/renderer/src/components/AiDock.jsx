// AI 助手：用一句话改工程。AI 只出「修改建议」，你点应用才会改；应用后可以撤销。
import React, { useEffect, useRef, useState } from 'react';
import { useStore, S } from '../store.js';
import { api, on } from '../api.js';
import { shotAt } from '../../../core/timing.js';
import { sid } from './ui.jsx';

const QUICK = ['把第 3 镜字号放大到 120%', '整体节奏快一点，每镜少停 0.3 秒', '帮我检查一遍有什么问题', '按圈注逐条修改', '给每个章节开头加一个转场', '换成手绘风模板'];

export default function AiDock() {
  const p = useStore((s) => s.p); const dir = useStore((s) => s.dir); const settings = useStore((s) => s.settings); const page = useStore((s) => s.page);
  const [msgs, setMsgs] = useState([{ role: 'a', text: '我能直接改这个工程：镜头、台词、字号、转场、配乐、模板都行。说一句要改什么，我会先给你看改动，你点「应用」才生效。' }]);
  const [input, setInput] = useState(''); const [busy, setBusy] = useState(null); const hist = useRef([]); const box = useRef(null);
  const active = settings?.ai?.providers?.find((x) => x.id === settings.ai.active);

  useEffect(() => on('ai:event', (e) => {
    if (e.from === 'workflow') return;
    if (e.type === 'tool') setMsgs((m) => [...m, { role: 'tool', text: `→ ${e.name} ${JSON.stringify(e.args || {}).slice(0, 120)}` }]);
  }), []);
  useEffect(() => on('proposal', (j) => { if (j.dir !== S().dir || !j.ops?.length) return; setMsgs((m) => [...m, { role: 'a', text: j.text || '外部 AI 工具提交了一份修改建议：', changes: j.changes, ops: j.ops }]); }), []);
  useEffect(() => { box.current?.scrollTo(0, 1e9); }, [msgs]);

  async function send(text) {
    text = (text ?? input).trim(); if (!text || busy) return; setInput('');
    setMsgs((m) => [...m, { role: 'u', text }]);
    const { t, sel } = S(); const shot = shotAt(p, t);
    const context = { page, playhead: +t.toFixed(2), currentShot: shot && sid(p, shot), selected: sel };
    const reqId = 'r' + Date.now(); setBusy(reqId);
    try {
      const r = await api('ai:run', reqId, dir, p, text, context, hist.current);
      hist.current = (r.history || []).slice(-16);
      setMsgs((m) => [...m, { role: 'a', text: r.text || (r.ops?.length ? '改好了，看一下：' : '（没有改动）'), changes: r.changes, ops: r.ops, bad: r.bad }]);
    } catch (e) { setMsgs((m) => [...m, { role: 'a', text: '出错了：' + e.message, err: true }]); }
    setBusy(null);
  }
  const apply = (i) => { const m = msgs[i]; S().edit(m.ops, 'AI 修改'); setMsgs((ms) => ms.map((x, k) => (k === i ? { ...x, applied: true } : x))); };
  const drop = (i) => setMsgs((ms) => ms.map((x, k) => (k === i ? { ...x, dropped: true } : x)));

  return (
    <div className="aidock">
      <div className="pane-h"><span style={{ whiteSpace: 'nowrap' }}>AI 助手</span><span className="spacer" />
        <span className="tag ai" title="到设置里切换">{active ? active.name : '未配置'}</span>
        <button className="ib" onClick={() => useStore.setState({ aiOpen: false })} title="收起">⟩</button>
      </div>
      {!active && <div className="warnbox">还没配 AI。到「设置 → AI」加一个：API Key、Coding Plan、Claude Code / Codex 等 CLI 登录，或本地 Ollama。<button className="btn sm" style={{ marginTop: 6 }} onClick={() => S().setPage('settings')}>去设置</button></div>}
      <div className="msgs" ref={box}>
        {msgs.map((m, i) => (
          <div key={i} className={'msg ' + m.role} style={m.err ? { color: 'var(--bad)' } : null}>
            {m.text}
            {m.changes?.length > 0 && (
              <div className="diff">
                {m.changes.map((c, k) => <div key={k} className={c.kind}>{c.kind === 'add' ? '+ ' : c.kind === 'del' ? '− ' : '~ '}{c.text}</div>)}
                {m.bad > 0 && <div className="mod" style={{ marginTop: 4 }}>改完后体检有 {m.bad} 项要看</div>}
                <div className="row" style={{ marginTop: 8 }}>
                  {m.applied ? <span className="st ok">已应用（可撤销）</span> : m.dropped ? <span className="st draft">已放弃</span> : <>
                    <button className="btn sm pri" onClick={() => apply(i)}>应用</button><button className="btn sm" onClick={() => drop(i)}>放弃</button></>}
                </div>
              </div>
            )}
          </div>
        ))}
        {busy && <div className="msg tool">思考中… <button className="btn sm ghost" onClick={() => api('ai:cancel', busy)}>停止</button></div>}
      </div>
      <div className="quick">{QUICK.map((q) => <button key={q} disabled={!active} title={active ? '' : '先在设置里配一个 AI'} onClick={() => send(q)}>{q}</button>)}</div>
      <div className="ask">
        <textarea rows={3} placeholder="说一句要改什么。Enter 发送，Shift+Enter 换行" value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <div className="row" style={{ marginTop: 6 }}><span className="note">会把当前镜头和选中的东西一起告诉 AI</span><span className="spacer" /><button className="btn pri sm" disabled={!!busy || !input.trim() || !active} title={active ? '' : '先在设置里配一个 AI'} onClick={() => send()}>发送</button></div>
      </div>
    </div>
  );
}
