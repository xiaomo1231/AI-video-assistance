// 开始页：一句话开工、按用途分组的风格画廊、工具与 Skill、最近工程
import React, { useEffect, useRef, useState } from 'react';
import { useStore, S } from '../store.js';
import { api } from '../api.js';
import { TEMPLATES, GALLERY, templateById } from '../../../core/templates.js';
import { suggestTemplate, parseNeed } from '../../../core/offline.js';
import { startWorkflow } from '../App.jsx';
import { Modal, TplCanvas, Icon, aiReady } from '../components/ui.jsx';

const RATIOS = { '16:9 横版': [1920, 1080], '9:16 竖版': [1080, 1920], '1:1 方形': [1080, 1080] };
const join = (a, b) => a.replace(/[\\/]+$/, '') + (a.includes('\\') ? '\\' : '/') + b.replace(/[\\/:*?"<>|]/g, '_');

export async function openDir(dir) { const r = await api('project:open', dir); S().load(r); S().setPage('edit'); return r; }
export async function newProject({ name, template, ratio = '16:9 横版', parent }) {
  parent = parent || (await api('dialog:dir', { title: '选一个文件夹放工程' })); if (!parent) return null;
  const [width, height] = RATIOS[ratio] || RATIOS['16:9 横版'];
  const r = await api('project:create', join(parent, name || '新工程'), name || '新工程', { width, height, template });
  S().load(r); return r;
}

const LENS = ['30 秒', '1 分钟', '3 分钟', '5 分钟'];
const SKILL_IC = { 生成: 'spark', 剪辑: 'cut', 包装: 'layers', 质检: 'check', 我的: 'user' };

/** 开始页：一句话开工、风格画廊、工具、最近工程 */
export default function Home() {
  const info = useStore((s) => s.info); const p = useStore((s) => s.p); const aiOn = useStore(aiReady); const settings = useStore((s) => s.settings);
  const [recent, setRecent] = useState([]); const [tpl, setTpl] = useState(() => p?.template || null);
  const [need, setNeed] = useState(''); const [len, setLen] = useState('1 分钟'); const [ratio, setRatio] = useState('16:9 横版'); const lenTouched = useRef(false);
  const [gtab, setGtab] = useState('all'); const [wiz, setWiz] = useState(null); const [lemo, setLemo] = useState(null); const [busy, setBusy] = useState(false);
  useEffect(() => { if (p?.template) setTpl(p.template); }, [p?.template]);
  useEffect(() => { api('project:recent').then(setRecent).catch(() => {}); }, []);
  const skills = [...(info?.skills || []), ...(settings?.mySkills || []).map((s) => ({ ...s, cat: '我的' }))];
  const open = async () => { const d = await api('dialog:dir', { title: '打开工程文件夹（里面有 project.json）' }); if (d) await openDir(d).catch((e) => S().say(e.message, true)); };
  const sample = async () => { const d = await api('dialog:dir', { title: '示例工程放在哪个文件夹' }); if (!d) return; try { const r = await api('project:sample', join(d, '墨剪示例')); S().load(r); S().setPage('edit'); } catch (e) { S().say(e.message, true); } };
  const blank = () => newProject({ name: '新工程', template: tpl || 'dark-keynote', ratio }).then((r) => r && S().setPage('edit')).catch((e) => S().say(e.message, true));
  const setNeedX = (x) => { setNeed(x); if (!lenTouched.current) { const pn = parseNeed(x); if (pn.hasLen) { const o = LENS.find((o) => secOf(o) === pn.len); if (o) setLen(o); } } };
  // 一句话开工：跑「一句话生成宣传片」，新建一个工程放结果
  const go = async () => {
    const sk = skills.find((x) => x.id === 'promo'); if (!sk || !need.trim()) return; setBusy(true);
    try {
      const template = tpl || suggestTemplate(need) || 'dark-keynote'; const v = { need: need.trim(), len, ratio, refs: '' };
      const r = await newProject({ name: projectName(v, sk), template, ratio }); if (!r) { setBusy(false); return; }
      S().setPage('flow'); await startWorkflow(sk, { ...v, template });
    } catch (e) { S().say(e.message, true); }
    setBusy(false);
  };
  const pickTpl = (t) => {
    if (p) { setTpl(t.id); if (p.template !== t.id) { S().edit({ op: 'setTemplate', args: { template: t.id } }, '模板：' + t.name); S().say(`当前工程换成「${t.name}」，Ctrl+Z 可撤销`); } }
    else setTpl(tpl === t.id ? null : t.id);
  };
  const T = tpl && templateById(tpl);
  const card = (t, v) => (
    <button key={t.id} className={'gc' + (v ? ' v' : '') + (tpl === t.id ? ' on' : '')} onClick={() => pickTpl(t)} title={t.line}>
      <div className="art"><TplCanvas t={t} v={v} />{tpl === t.id && <span className="pick"><Icon n="check" s={11} />{p ? '在用' : '已选'}</span>}</div>
      <div className="gn">{t.name}<span>{t.line}</span></div>
    </button>);

  return (
    <div className="home">
      <div className="wrap">
        <section className="hero">
          <h1>今天想做一支什么片？</h1>
          <p>说一句需求，AI 先问清楚，再出结构、分镜和台词；你看样片、圈注修改，满意了配音配乐出成片。{!aiOn && '没配 AI 也能用：先按规则出一版能看的分镜。'}</p>
          <div className="hero-ask">
            <textarea rows={2} value={need} placeholder="例：给「先问我」做一支 1 分钟宣传片，突出它和普通 AI 的区别" onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) go(); }} onChange={(e) => setNeedX(e.target.value)} />
            <div className="bar">
              <div className="seg">{LENS.map((o) => <button key={o} className={len === o ? 'on' : ''} onClick={() => { lenTouched.current = true; setLen(o); }}>{o}</button>)}</div>
              <div className="seg">{Object.keys(RATIOS).map((o) => <button key={o} className={ratio === o ? 'on' : ''} onClick={() => setRatio(o)}>{o.split(' ')[0]}</button>)}</div>
              {T ? <span className="chosen"><Icon n="palette" s={12} />{T.name}<button className="ib sm" style={{ minWidth: 20, height: 20 }} title="不指定，按需求自动挑" onClick={() => setTpl(null)}><Icon n="x" s={12} /></button></span> : <span className="note">风格：按需求自动挑，或在下面选一个</span>}
              <span className="spacer" />
              <button className="btn pri" disabled={!need.trim() || busy} onClick={go} title="Ctrl+回车"><Icon n="spark" s={14} />{busy ? '启动中…' : '开始做'}</button>
            </div>
          </div>
          {!aiOn && <div className="hint"><i />还没配 AI：标着 AI 的步骤会改用规则版，打回时列出要改的镜头。<button className="btn sm ghost" onClick={() => S().setPage('settings')}>去配 AI</button></div>}
          <div className="quick-acts">
            <button className="btn" onClick={open}><Icon n="folder" s={15} />打开工程</button>
            <button className="btn" onClick={sample}><Icon n="film" s={15} />示例工程</button>
            <button className="btn" onClick={blank}><Icon n="plus" s={15} />新建空工程</button>
            <button className="btn ghost" onClick={() => setLemo({})}><Icon n="import" s={15} />导入 lemo-opuscar 场景</button>
          </div>
        </section>

        <section className="sec">
          <h2>风格<span>{TEMPLATES.length} 种，按用途分好了。{p ? `点一下给「${p.name}」换上，可撤销` : '点一下选中，新工程会用它'}</span></h2>
          <div className="gtabs">
            <button className={gtab === 'all' ? 'on' : ''} onClick={() => setGtab('all')}>全部</button>
            {GALLERY.map((g) => <button key={g.k} className={gtab === g.k ? 'on' : ''} onClick={() => setGtab(g.k)}>{g.n}</button>)}
            <button className={gtab === 'tools' ? 'on' : ''} onClick={() => setGtab('tools')}>工具与 Skill</button>
          </div>
          {gtab === 'all' && GALLERY.map((g) => <Row key={g.k} g={g} onMore={() => setGtab(g.k)}>{TEMPLATES.filter((t) => t.scene === g.k).map((t) => card(t, g.v))}</Row>)}
          {GALLERY.some((g) => g.k === gtab) && (() => { const g = GALLERY.find((x) => x.k === gtab); return <><div className="note" style={{ marginBottom: 12 }}>{g.d}</div><div className={'ggrid' + (g.v ? ' v' : '')}>{TEMPLATES.filter((t) => t.scene === g.k).map((t) => card(t, g.v))}</div></>; })()}
          {gtab === 'tools' && <div className="skills">{skills.filter((x) => x.id !== 'promo').map((sk) => (
            <button key={sk.id} className="skill" onClick={() => setWiz(sk)}><span className="ic"><Icon n={SKILL_IC[sk.cat] || 'flow'} /></span><span><b>{sk.name}</b><span>{sk.sub || sk.desc?.slice(0, 24)}</span></span></button>))}</div>}
        </section>

        {recent.length > 0 && <section className="sec">
          <h2>最近</h2>
          <div className="recent">{recent.slice(0, 8).map((r) => <button key={r.dir} className="rc" onClick={() => openDir(r.dir).catch((e) => S().say(e.message, true))} title={r.dir}><span className="ini">{(r.name || '?').slice(0, 1)}</span><span className="m"><b>{r.name}</b><span>{r.dir}</span></span></button>)}</div>
        </section>}
      </div>
      {wiz && <Wizard key={wiz.id} sk={wiz} tpl={tpl} onClose={() => setWiz(null)} />}
      {lemo && <LemoImport onClose={() => setLemo(null)} />}
    </div>
  );
}

/** 画廊的一行：横向滚动，右边有个「往后翻」 */
function Row({ g, children, onMore }) {
  const ref = useRef(null);
  return <div className="grow-wrap">
    <h3>{g.n}<span>{g.d}</span><span className="spacer" /><button className="btn sm ghost" onClick={onMore}>全部<Icon n="chev" s={12} /></button></h3>
    <div className="grow" ref={ref}>{children}</div>
    <button className="gnext" aria-label="往后翻" onClick={() => ref.current?.scrollBy({ left: ref.current.clientWidth * 0.8, behavior: 'smooth' })}><Icon n="chev" s={16} /></button>
  </div>;
}

function Wizard({ sk, tpl, onClose }) {
  const p = useStore((s) => s.p);
  const [v, setV] = useState(() => Object.fromEntries((sk.inputs || []).map((i) => [i.key, i.default ?? ''])));
  const [where, setWhere] = useState(p ? 'cur' : 'new'); const [busy, setBusy] = useState(false);
  const lenTouched = useRef(false);
  const set = (k, x) => {
    const nx = { ...v, [k]: x }; if (k === 'len') lenTouched.current = true;
    // 需求里写了时长、又没手动点过时长按钮时，自动选上对应的按钮
    if (k === 'need' && !lenTouched.current) { const lenIn = (sk.inputs || []).find((i) => i.key === 'len'); const pn = parseNeed(x); if (lenIn && pn.hasLen) { const o = lenIn.options.find((o) => secOf(o) === pn.len); if (o) nx.len = o; } }
    setV(nx);
  };
  const aiOn = useStore(aiReady);
  const go = async () => {
    setBusy(true);
    try {
      const template = tpl || (v.need || v.doc || v.topic ? suggestTemplate(v.need || v.doc || v.topic) : null) || 'dark-keynote';
      if (where === 'new' || !p) { const nm = projectName(v, sk); const r = await newProject({ name: nm, template, ratio: v.ratio }); if (!r) { setBusy(false); return; } }
      S().setPage('flow'); onClose();
      await startWorkflow(sk, { ...v, template });
    } catch (e) { S().say(e.message, true); }
    setBusy(false);
  };
  return <Modal title={sk.name} onClose={onClose} foot={<><button className="btn" onClick={onClose}>取消</button><button className="btn pri" disabled={busy} onClick={go}><Icon n="play" s={12} />{busy ? '启动中…' : '开始'}</button></>}>
    <div className="note" style={{ marginBottom: 12 }}>{sk.desc}</div>
    {!aiOn && sk.steps.some((s) => s.kind === 'ai') && <div className="warnbox" style={{ margin: '0 0 12px' }}>还没配 AI，标着 AI 的步骤会改用规则版：先出一版能看的分镜，打回时会列出要改的镜头，由你动手改。</div>}
    {(sk.inputs || []).map((i) => (
      <div className="fl" key={i.key}><label>{i.label}</label>
        {i.type === 'select' ? <div className="chips">{i.options.map((o) => <button key={o} className={'chip' + (v[i.key] === o ? ' on' : '')} onClick={() => set(i.key, o)}>{o}</button>)}</div>
          : i.type === 'area' ? <textarea rows={4} placeholder={i.placeholder} value={v[i.key]} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => set(i.key, e.target.value)} />
          : i.type === 'file' ? <div className="row"><button className="btn sm" onClick={async () => { const f = await api('dialog:files', { multi: i.multi, filters: i.accept === 'image' ? [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] }] : i.accept === 'audio' ? [{ name: '音频', extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'] }] : [{ name: '视频', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'] }] }); if (f.length) set(i.key, i.multi ? f : f[0]); }}><Icon n="file" s={14} />选择文件</button><span className="note" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[].concat(v[i.key] || []).map((x) => x.split(/[\\/]/).pop()).join('、') || '未选'}</span></div>
          : <input placeholder={i.placeholder} value={v[i.key]} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => set(i.key, e.target.value)} />}
      </div>
    ))}
    <div className="fl"><label>风格</label><span>{tpl ? templateById(tpl).name : '没选（按需求自动挑一个）'}</span></div>
    <div className="fl"><label>放在</label><div className="seg" style={{ alignSelf: 'start' }}>
      <button className={where === 'new' ? 'on' : ''} onClick={() => setWhere('new')}>新工程</button>
      <button className={where === 'cur' ? 'on' : ''} disabled={!p} onClick={() => setWhere('cur')}>当前工程{p ? `（${p.name}）` : ''}</button></div></div>
    <div className="fl"><label>步骤（{sk.steps.length}）</label>
      <ul className="steps" style={{ padding: 0 }}>{sk.steps.map((s, i) => <li key={i}><span className="k faint">{i + 1}</span><span style={{ flex: 1 }}>{s.name}</span><span className={'tag ' + s.kind}>{{ ai: 'AI', tool: '工具', human: '人工', review: '审片' }[s.kind]}</span></li>)}</ul>
      {sk.loop && <div className="note">第 {sk.loop.from + 1} 步审片不通过会带着意见回到第 {sk.loop.to + 1} 步，最多 {sk.loop.max} 轮</div>}
      {sk.out && <div className="note">产出：{sk.out}</div>}
    </div>
  </Modal>;
}

const secOf = (o) => { const m = String(o).match(/(\d+)\s*(分钟|秒)/); return m ? (m[2] === '分钟' ? +m[1] * 60 : +m[1]) : null; };
const KIND_NAME = { promo: '宣传片', explain: '讲解', ad: '广告', vlog: 'vlog' };
/** 工程名：需求里有产品名就用「产品名 宣传片」，否则取第一句的前 16 个字 */
function projectName(v, sk) {
  if (v.need) { const pn = parseNeed(v.need); if (/[「“"《]/.test(v.need) && pn.name) return `${pn.name} ${KIND_NAME[pn.kind] || sk.name}`; }
  return (v.need || v.doc || v.topic || sk.name).split(/[，。,.\n]/)[0].trim().slice(0, 16) || sk.name;
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
