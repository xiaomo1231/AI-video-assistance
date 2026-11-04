// 开始页：最近工程、Skill、模板、向导
import React, { useEffect, useRef, useState } from 'react';
import { useStore, S } from '../store.js';
import { api } from '../api.js';
import { TEMPLATES, TEMPLATE_CATS, templateById } from '../../../core/templates.js';
import { SKILL_CATS } from '../../../core/workflow/skills.js';
import { suggestTemplate } from '../../../core/offline.js';
import { drawCard } from '../player/cards.js';
import { startWorkflow } from '../App.jsx';
import { Modal } from '../components/ui.jsx';

const RATIOS = { '16:9 横版': [1920, 1080], '9:16 竖版': [1080, 1920], '1:1 方形': [1080, 1080] };
const join = (a, b) => a.replace(/[\\/]+$/, '') + (a.includes('\\') ? '\\' : '/') + b.replace(/[\\/:*?"<>|]/g, '_');

export async function openDir(dir) { const r = await api('project:open', dir); S().load(r); S().setPage('edit'); return r; }
export async function newProject({ name, template, ratio = '16:9 横版', parent }) {
  parent = parent || (await api('dialog:dir', { title: '选一个文件夹放工程' })); if (!parent) return null;
  const [width, height] = RATIOS[ratio] || RATIOS['16:9 横版'];
  const r = await api('project:create', join(parent, name || '新工程'), name || '新工程', { width, height, template });
  S().load(r); return r;
}

export default function Home() {
  const info = useStore((s) => s.info); const p = useStore((s) => s.p);
  const [recent, setRecent] = useState([]); const [skill, setSkill] = useState('promo'); const [cat, setCat] = useState('全部'); const [tpl, setTpl] = useState(null);
  const [lemo, setLemo] = useState(null);
  useEffect(() => { api('project:recent').then(setRecent).catch(() => {}); }, []);
  const skills = [...(info?.skills || []), ...(useStore.getState().settings?.mySkills || []).map((s) => ({ ...s, cat: '我的' }))];
  const sk = skills.find((s) => s.id === skill) || skills[0];
  const open = async () => { const d = await api('dialog:dir', { title: '打开工程文件夹（里面有 project.json）' }); if (d) await openDir(d).catch((e) => S().say(e.message, true)); };
  const sample = async () => { const d = await api('dialog:dir', { title: '示例工程放在哪个文件夹' }); if (!d) return; try { const r = await api('project:sample', join(d, '墨剪示例')); S().load(r); S().setPage('edit'); } catch (e) { S().say(e.message, true); } };
  const shown = TEMPLATES.filter((t) => cat === '全部' || t.cat === cat);

  return (
    <div className="home">
      <div className="pane skills" style={{ borderRight: '1px solid var(--line)' }}>
        <div className="pane-h">开始</div>
        <div style={{ padding: '10px 14px', display: 'grid', gap: 6 }}>
          <button className="btn pri" onClick={() => newProject({ name: '新工程', template: tpl || 'dark-keynote' }).then((r) => r && S().setPage('edit')).catch((e) => S().say(e.message, true))}>＋ 新建空工程</button>
          <div className="grid2"><button className="btn" onClick={open}>打开工程</button><button className="btn" onClick={sample}>示例工程</button></div>
          <button className="btn" onClick={() => setLemo({})}>导入 lemo-opuscar 场景</button>
        </div>
        {recent.length > 0 && <><div className="cat" style={{ padding: '6px 14px', color: 'var(--dim)', fontSize: 12 }}>最近</div>
          <div className="recent">{recent.slice(0, 6).map((r) => <button key={r.dir} onClick={() => openDir(r.dir).catch((e) => S().say(e.message, true))} title={r.dir}><b>{r.name}</b><div className="note" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.dir}</div></button>)}</div></>}
        <div className="scroll">
          {[...SKILL_CATS, '我的'].map((c) => { const list = skills.filter((s) => s.cat === c); if (!list.length) return null; return <div key={c}><div className="cat">{c}</div>
            {list.map((s) => <div key={s.id} className={'skill' + (sk?.id === s.id ? ' on' : '')} onClick={() => setSkill(s.id)}><b>{s.star ? '★ ' : ''}{s.name}</b><span>{s.sub || s.desc?.slice(0, 18)}</span></div>)}</div>; })}
        </div>
      </div>
      <div className="pane" style={{ minWidth: 0 }}>
        <div className="pane-h">风格模板 <span className="note">{TEMPLATES.length} 个 · 点一下选中，向导和新工程会用它</span></div>
        <div className="chips" style={{ padding: '10px 14px 0' }}>{['全部', ...TEMPLATE_CATS].map((c) => <button key={c} className={'chip' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>{c}</button>)}</div>
        <div className="scroll"><div className="tpls">{shown.map((t) => (
          <div key={t.id} className={'tpl' + (tpl === t.id ? ' on' : '')} onClick={() => { setTpl(tpl === t.id ? null : t.id); if (p) S().edit({ op: 'setTemplate', args: { template: t.id } }, '模板：' + t.name); }}>
            <div className="im"><TplCanvas t={t} /><span className="tag">{t.cat}</span></div>
            <div className="meta"><b>{t.name}</b><span>{t.line}</span></div>
          </div>))}</div></div>
      </div>
      <div className="pane" style={{ borderLeft: '1px solid var(--line)' }}>
        {sk && <Wizard key={sk.id} sk={sk} tpl={tpl} />}
      </div>
      {lemo && <LemoImport onClose={() => setLemo(null)} />}
    </div>
  );
}

function TplCanvas({ t }) {
  const cv = useRef(null);
  useEffect(() => { const c = cv.current; c.width = 384; c.height = 216; const g = c.getContext('2d'); g.setTransform(0.2, 0, 0, 0.2, 0, 0); try { drawCard(g, { W: 1920, H: 1080, tpl: t, card: { layout: 'title', heading: t.name, body: t.en }, shot: { id: t.id, font: 1 }, local: 2.5, dur: 4 }); } catch (e) { console.warn(t.id, e); } }, [t.id]);
  return <canvas ref={cv} style={{ width: '100%', height: '100%', display: 'block' }} />;
}

function Wizard({ sk, tpl }) {
  const p = useStore((s) => s.p);
  const [v, setV] = useState(() => Object.fromEntries((sk.inputs || []).map((i) => [i.key, i.default ?? ''])));
  const [where, setWhere] = useState(p ? 'cur' : 'new'); const [busy, setBusy] = useState(false);
  const set = (k, x) => setV({ ...v, [k]: x });
  const go = async () => {
    setBusy(true);
    try {
      const template = tpl || (v.need || v.doc || v.topic ? suggestTemplate(v.need || v.doc || v.topic) : null) || 'dark-keynote';
      if (where === 'new' || !p) { const nm = (v.need || v.doc || v.topic || sk.name).split(/[，。,.\n]/)[0].slice(0, 20) || sk.name; const r = await newProject({ name: nm, template, ratio: v.ratio }); if (!r) { setBusy(false); return; } }
      S().setPage('flow');
      await startWorkflow(sk, { ...v, template });
    } catch (e) { S().say(e.message, true); }
    setBusy(false);
  };
  return <>
    <div className="pane-h">{sk.star ? '★ ' : ''}{sk.name}</div>
    <div className="scroll">
      <div style={{ padding: '10px 14px', color: 'var(--muted)', fontSize: 13 }}>{sk.desc}</div>
      {(sk.inputs || []).map((i) => (
        <div className="field" key={i.key}><label>{i.label}</label>
          {i.type === 'select' ? <div className="chips">{i.options.map((o) => <button key={o} className={'chip' + (v[i.key] === o ? ' on' : '')} onClick={() => set(i.key, o)}>{o}</button>)}</div>
            : i.type === 'area' ? <textarea rows={4} placeholder={i.placeholder} value={v[i.key]} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => set(i.key, e.target.value)} />
            : i.type === 'file' ? <div className="row"><button className="btn sm" onClick={async () => { const f = await api('dialog:files', { multi: i.multi, filters: i.accept === 'image' ? [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] }] : i.accept === 'audio' ? [{ name: '音频', extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'] }] : [{ name: '视频', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'] }] }); if (f.length) set(i.key, i.multi ? f : f[0]); }}>选择文件</button><span className="note" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[].concat(v[i.key] || []).map((x) => x.split(/[\\/]/).pop()).join('、') || '未选'}</span></div>
            : <input placeholder={i.placeholder} value={v[i.key]} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => set(i.key, e.target.value)} />}
        </div>
      ))}
      <div className="field"><label>模板</label><span>{tpl ? templateById(tpl).name : '没选（按需求自动挑一个）'}</span></div>
      <div className="field"><label>放在</label><div className="chips">
        <button className={'chip' + (where === 'new' ? ' on' : '')} onClick={() => setWhere('new')}>新工程</button>
        <button className={'chip' + (where === 'cur' ? ' on' : '')} disabled={!p} onClick={() => setWhere('cur')}>当前工程{p ? `（${p.name}）` : ''}</button></div></div>
      <div className="field"><label>步骤（{sk.steps.length}）</label>
        <ul className="steps" style={{ padding: 0 }}>{sk.steps.map((s, i) => <li key={i}><span className="note" style={{ width: 18 }}>{i + 1}</span><span style={{ flex: 1 }}>{s.name}</span><span className={'tag ' + s.kind}>{{ ai: 'AI', tool: '工具', human: '人工', review: '审片' }[s.kind]}</span></li>)}</ul>
        {sk.loop && <div className="note">第 {sk.loop.from + 1} 步审片不通过会带着意见回到第 {sk.loop.to + 1} 步，最多 {sk.loop.max} 轮</div>}
        {sk.out && <div className="note">产出：{sk.out}</div>}
      </div>
    </div>
    <div style={{ padding: 12, borderTop: '1px solid var(--line)' }}><button className="btn pri big" style={{ width: '100%' }} disabled={busy} onClick={go}>{busy ? '启动中…' : '开始'}</button></div>
  </>;
}

function LemoImport({ onClose }) {
  const settings = useStore((s) => s.settings); const p = useStore((s) => s.p); const dir = useStore((s) => s.dir);
  const [folder, setFolder] = useState(''); const [busy, setBusy] = useState(null);
  const go = async () => {
    try {
      let d = dir, q = p;
      if (!p) { const name = folder.split(/[\\/]/).filter(Boolean).slice(-2).join('-'); const r = await newProject({ name: name || 'lemo 导入' }); if (!r) return; d = r.dir; q = r.project; }
      setBusy('分析场景…');
      const r = await api('lemo:import', d, q, folder);
      S().replace(r.project, '导入 lemo 场景'); S().say(`导入完成：${r.shots ?? ''} 个镜头，${r.lines ?? ''} 句台词`); S().setPage('edit'); onClose();
    } catch (e) { S().say(e.message, true); setBusy(null); }
  };
  return <Modal title="导入 lemo-opuscar 场景" onClose={onClose} foot={<><button className="btn" onClick={onClose}>取消</button><button className="btn pri" disabled={!folder || busy} onClick={go}>{busy || '导入'}</button></>}>
    <p className="note">选一个 lemo-opuscar 的场景文件夹（里面有 index.html，可能还有 vo/lines.json）。会按画面切点拆成锁定的镜头，台词按场景里的配音事件对齐；以后可以只改其中一段。</p>
    <div className="row"><input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder={settings?.lemo?.path ? settings.lemo.path + '/styles/…/demo' : '场景文件夹'} />
      <button className="btn" onClick={async () => { const f = await api('dialog:dir', { defaultPath: settings?.lemo?.path || undefined }); if (f) setFolder(f); }}>浏览</button></div>
    {!p && <p className="note">当前没有打开工程，会先新建一个。</p>}
  </Modal>;
}
