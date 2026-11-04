// 工作流页：看和改步骤（跳过、排序、增删、改审片回路），存成「我的 Skill」，运行
import React, { useEffect, useMemo, useState } from 'react';
import { useStore, S } from '../store.js';
import { api } from '../api.js';
import { startWorkflow } from '../App.jsx';
import { Icon } from '../components/ui.jsx';

const TOOLS = [
  ['brief', 'human', '需求简报'], ['ai.questions', 'ai', 'AI 提问'], ['ai.treatment', 'ai', '结构候选'], ['ai.outline', 'ai', '拆知识点'], ['ai.storyboard', 'ai', '分镜与台词'],
  ['health', 'tool', '体检'], ['health.show', 'human', '看体检报告'], ['review', 'review', '审片圈注'], ['ai.revise', 'ai', '按圈注修改'], ['tts.all', 'tool', '配音'], ['asr.check', 'tool', '听写校验'],
  ['music.bed', 'tool', '配乐与音效'], ['sfx.auto', 'tool', '自动音效'], ['beats.detect', 'tool', '节拍分析'], ['beats.snap', 'tool', '卡点'], ['mg.auto', 'tool', '花字'], ['ai.keyphrases', 'ai', '找关键句'],
  ['ai.translate', 'ai', '翻译'], ['color.match', 'tool', '颜色匹配'], ['captions.apply', 'tool', '字幕上轨'], ['asr.timeline', 'tool', '时间线转写'], ['capture.url', 'tool', '抓取网页'],
  ['media.import', 'tool', '导入素材'], ['asr.transcribe', 'tool', '转写素材'], ['cut.find', 'tool', '找口误停顿'], ['cut.confirm', 'human', '确认删除'], ['cut.apply', 'tool', '剪掉'],
  ['human.confirm', 'human', '人工确认'], ['export', 'tool', '导出'],
];
const KIND = { ai: 'AI', tool: '工具', human: '人工', review: '审片' };

export default function Flow() {
  const info = useStore((s) => s.info); const run = useStore((s) => s.run); const settings = useStore((s) => s.settings); const p = useStore((s) => s.p);
  const all = useMemo(() => [...(info?.skills || []), ...(settings?.mySkills || [])], [info, settings]);
  const [naming, setNaming] = useState(null);
  const [id, setId] = useState(run?.wf || 'promo'); const [wf, setWf] = useState(null); const [sel, setSel] = useState(null);
  useEffect(() => { if (run?.wf) setId(run.wf); }, [run?.wf]);
  useEffect(() => { const s = all.find((x) => x.id === id); if (s) { setWf(JSON.parse(JSON.stringify(s))); setSel(null); } }, [id, all.length]);
  if (!wf) return <div className="empty">载入中…</div>;
  const live = run && run.wf === wf.id ? run : null;
  const upd = (fn) => { const n = JSON.parse(JSON.stringify(wf)); fn(n); setWf(n); };
  const st = sel != null ? wf.steps[sel] : null;
  const saveMine = async (name) => {
    setNaming(null); if (!name) return;
    const mine = { ...wf, id: wf.id.startsWith('my_') ? wf.id : 'my_' + Date.now().toString(36), name, cat: '我的', star: false };
    const list = [...(settings.mySkills || []).filter((x) => x.id !== mine.id), mine];
    const s = await api('settings:set', { mySkills: list }); useStore.setState({ settings: s }); setId(mine.id); S().say('已存成我的 Skill');
  };
  const runIt = async () => { try { await startWorkflow(wf, Object.fromEntries((wf.inputs || []).map((i) => [i.key, i.default ?? '']))); } catch (e) { S().say(e.message, true); } };
  const busy = run && !['done', 'error', 'cancelled'].includes(run.state);

  return (
    <div className="flow">
      <div className="flowcv">
        <div className="flowbar">
          <select value={id} onChange={(e) => setId(e.target.value)} style={{ width: 260 }}>{all.map((s) => <option key={s.id} value={s.id}>{s.star ? '★ ' : ''}{s.name}</option>)}</select>
          {naming == null ? <button className="btn" onClick={() => setNaming(wf.name.replace(/（我的）$/, '') + '（我的）')}>存成我的 Skill</button>
            : <><input autoFocus value={naming} style={{ width: 200 }} onChange={(e) => setNaming(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') saveMine(naming); if (e.key === 'Escape') setNaming(null); }} /><button className="btn pri" onClick={() => saveMine(naming)}>保存</button></>}
          {wf.id.startsWith('my_') && <button className="btn ghost" onClick={async () => { const s = await api('settings:set', { mySkills: (settings.mySkills || []).filter((x) => x.id !== wf.id) }); useStore.setState({ settings: s }); setId('promo'); }}><Icon n="trash" s={14} />删除</button>}
          <span className="spacer" />
          {live?.waiting && <button className="btn" onClick={() => S().setDock({ open: true, tab: 'wf' })}><Icon n="alert" s={14} />有一步在等你</button>}
          <button className="btn pri" disabled={!p || busy} onClick={runIt} title={p ? '' : '先在开始页新建或打开工程'}><Icon n="play" s={12} />在当前工程运行</button>
        </div>
        <div className="nodes" style={{ '--cols': 4 }}>
          {wf.steps.map((s, i) => { const status = live?.status?.[i]; const waiting = live?.waiting && live.i === i; return (
            <button key={i} className={'node' + (sel === i ? ' on' : '') + (waiting ? ' waiting' : status ? ' ' + status : s.skip ? ' skipped' : '')} onClick={() => setSel(i)}>
              <span className="r"><span className="faint num">{String(i + 1).padStart(2, '0')}</span><span className={'tag ' + s.kind}>{KIND[s.kind]}</span>{wf.loop?.from === i && <span className="tag review" title={`不通过回到第 ${wf.loop.to + 1} 步`}>回路</span>}{s.skip && <span className="tag">跳过</span>}</span>
              <b>{s.name}</b><div className="d">{live?.results?.[i] || s.desc || TOOLS.find((x) => x[0] === s.tool)?.[2] || ''}</div>
              {status === 'done' && <span className="ok"><Icon n="check" s={14} /></span>}{status === 'run' && <span className="ok"><span className="spin" /></span>}
            </button>); })}
        </div>
        {wf.loop && <div className="loopnote"><i />审片「{wf.steps[wf.loop.from]?.name}」不通过，带着意见回到第 {wf.loop.to + 1} 步「{wf.steps[wf.loop.to]?.name}」，最多 {wf.loop.max} 轮</div>}
      </div>
      <div className="pane" style={{ borderLeft: '1px solid var(--line)' }}>
        <div className="pane-h">{st ? `步骤 ${sel + 1}` : wf.name}</div>
        <div className="scroll">
          {!st && <>
            <div className="field"><label>说明</label><div style={{ fontSize: 13 }}>{wf.desc}</div></div>
            <div className="field"><label>审片回路</label>
              {wf.loop ? <div className="col"><div className="row"><span>审片步骤</span><select value={wf.loop.from} onChange={(e) => upd((n) => { n.loop.from = +e.target.value; })}>{wf.steps.map((s, i) => <option key={i} value={i}>{i + 1}. {s.name}</option>)}</select></div>
                <div className="row"><span>修改到</span><select value={wf.loop.to} onChange={(e) => upd((n) => { n.loop.to = +e.target.value; })}>{wf.steps.map((s, i) => <option key={i} value={i}>{i + 1}. {s.name}</option>)}</select></div>
                <div className="row"><span>最多</span><input type="number" min={1} max={20} value={wf.loop.max} onChange={(e) => upd((n) => { n.loop.max = +e.target.value; })} style={{ width: 80 }} /><span>轮</span></div>
                <button className="btn sm ghost" onClick={() => upd((n) => { n.loop = null; })}>去掉回路</button></div>
                : <button className="btn sm" onClick={() => upd((n) => { const r = n.steps.findIndex((s) => s.kind === 'review'); n.loop = { from: Math.max(0, r), to: Math.min(n.steps.length - 1, Math.max(0, r) + 1), max: 5 }; })}>加审片回路</button>}
            </div>
            <div className="field"><label>加一步</label><select value="" onChange={(e) => { const t = TOOLS.find((x) => x[0] === e.target.value); if (t) upd((n) => { n.steps.push({ kind: t[1], name: t[2], tool: t[0], desc: '' }); }); }}><option value="">选择…</option>{TOOLS.map((t) => <option key={t[0]} value={t[0]}>{KIND[t[1]]} · {t[2]}</option>)}</select></div>
            {live && <div className="field"><label>运行记录</label><div style={{ maxHeight: 300, overflow: 'auto', font: '12px var(--mono)', color: 'var(--muted)' }}>{(live.log || []).map((e, i) => <div key={i}>{e.at?.slice(11, 19)} {e.type} {e.step || ''} {e.error || e.text || ''}</div>)}</div></div>}
          </>}
          {st && <>
            <div className="field"><label>名称</label><input value={st.name} onChange={(e) => upd((n) => { n.steps[sel].name = e.target.value; })} onKeyDown={(e) => e.stopPropagation()} /></div>
            <div className="field"><label>说明</label><textarea value={st.desc || ''} onChange={(e) => upd((n) => { n.steps[sel].desc = e.target.value; })} onKeyDown={(e) => e.stopPropagation()} /></div>
            <div className="field"><label>做什么</label><select value={st.tool} onChange={(e) => { const t = TOOLS.find((x) => x[0] === e.target.value); upd((n) => { n.steps[sel].tool = t[0]; n.steps[sel].kind = t[1]; }); }}>{TOOLS.map((t) => <option key={t[0]} value={t[0]}>{KIND[t[1]]} · {t[2]}</option>)}{!TOOLS.some((t) => t[0] === st.tool) && <option value={st.tool}>{st.tool}</option>}</select></div>
            <div className="field row" style={{ flexWrap: 'wrap' }}>
              <button className="btn sm" onClick={() => upd((n) => { n.steps[sel].skip = !n.steps[sel].skip; })}>{st.skip ? '恢复这一步' : '跳过这一步'}</button>
              <button className="btn sm" disabled={sel === 0} onClick={() => { upd((n) => keepLoop(n, () => { const [x] = n.steps.splice(sel, 1); n.steps.splice(sel - 1, 0, x); })); setSel(sel - 1); }}>上移</button>
              <button className="btn sm" disabled={sel === wf.steps.length - 1} onClick={() => { upd((n) => keepLoop(n, () => { const [x] = n.steps.splice(sel, 1); n.steps.splice(sel + 1, 0, x); })); setSel(sel + 1); }}>下移</button>
              <button className="btn sm" onClick={() => { upd((n) => keepLoop(n, () => { n.steps.splice(sel, 1); })); setSel(null); }}>删除</button>
              <button className="btn sm ghost" onClick={() => setSel(null)}>返回</button>
            </div>
            <div className="note" style={{ padding: '0 14px' }}>改动只在这里生效；点「存成我的 Skill」保存下来，以后在开始页直接用。</div>
          </>}
        </div>
      </div>
    </div>
  );
}

/** 增删、移动步骤后，审片回路跟着原来的步骤走，而不是停在原来的序号上 */
function keepLoop(n, fn) {
  const L = n.loop; const from = L && n.steps[L.from]; const to = L && n.steps[L.to]; const mids = L ? n.steps.slice(L.from + 1, L.to + 1) : [];
  fn();
  if (!L) return;
  const f = n.steps.indexOf(from);
  if (f < 0 || from.kind !== 'review') { n.loop = null; return; } // 审片步骤删了，回路也就没了
  let t = n.steps.indexOf(to);
  if (t < 0) t = Math.max(...mids.map((x) => n.steps.indexOf(x)), -1); // 修改的最后一步删了，退到还在的那一步
  n.loop = t > f ? { ...L, from: f, to: t } : null;
}
