// 镜头属性：画面、卡片文字、台词、时长、转场、素材、单镜 AI 重做、圈注
import React, { useState } from 'react';
import { useStore, S } from '../store.js';
import { api } from '../api.js';
import { LAYOUTS } from '../../../core/templates.js';
import { shotLines, overflow, needDur } from '../../../core/timing.js';
import { Lazy, Field, sid, Modal, Icon } from './ui.jsx';
import { TRANS_NAMES } from './Timeline.jsx';

export const SHOT_TABS = [['pic', '画面'], ['lines', '台词'], ['time', '时长变速'], ['trans', '转场'], ['more', '更多']];

/** 镜头属性，分成几页：画面 / 台词 / 时长变速 / 转场 / 更多。tab 由外面的标签栏决定 */
export default function ShotEditor({ shot: s, tab = 'pic' }) {
  const p = useStore((st) => st.p); const dir = useStore((st) => st.dir);
  const [redo, setRedo] = useState(null);
  const aiOn = useStore((x) => !!x.settings?.ai?.providers?.find((y) => y.id === x.settings.ai.active));
  if (!s) return <div className="empty">选一个镜头</div>;
  const up = (patch, label = '改镜头') => S().edit({ op: 'updateShot', args: { id: s.id, patch } }, label);
  const card = s.src.card || {}; const upCard = (c, label = '改画面文字') => up({ src: { ...s.src, card: { ...card, ...c } } }, label);
  const lines = shotLines(p, s.id); const annos = p.annotations.filter((a) => a.shot === s.id && !a.done);
  const media = p.assets.filter((a) => a.kind === 'video' || a.kind === 'image' || a.kind === 'scene');
  const ov = overflow(p, s);
  const chk = (checked, onChange, text) => <label className="row" style={{ color: 'var(--paper)', fontSize: 13, margin: 0 }}><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{text}</label>;

  return (
    <div>
      {ov && <div className="errbox">台词超出镜头，最后一句会被切掉。<div style={{ marginTop: 6 }}><button className="btn sm" onClick={() => S().edit({ op: 'setLock', args: { id: s.id, lock: false } }, '按台词自动')}>改回按台词自动</button></div></div>}
      {annos.map((a) => <div key={a.id} className="warnbox row"><Icon n="pen" s={14} /><span style={{ flex: 1 }}>{a.text}</span><button className="btn sm" onClick={() => S().edit({ op: 'resolveAnnotation', args: { id: a.id } }, '圈注已处理')}>已处理</button></div>)}

      {tab === 'pic' && <>
        <div className="field row"><Lazy value={s.title} title="镜头名，只在列表和时间线上显示；画面上的字在下面改" placeholder="镜头名（不上画面）" onCommit={(v) => up({ title: v }, '改镜头名')} />
          <select value={s.status} style={{ width: 92, flex: 'none' }} onChange={(e) => up({ status: e.target.value }, '状态')}><option value="draft">草稿</option><option value="revise">待修改</option><option value="confirmed">已确认</option></select></div>
        <div className="field row"><button className="btn sm" disabled={!aiOn} title={aiOn ? '' : '先在设置里配一个 AI'} onClick={() => setRedo({ text: annos.map((a) => a.text).join('；') })}><Icon n="spark" s={14} />让 AI 重做这一镜</button><span className="note">{aiOn ? '只改这一镜，别的不动' : '没配 AI，到设置里加一个就能用'}</span></div>
        <Field label="画面来源">
          <div className="seg" style={{ marginBottom: 8 }}>
            {[['card', '模板卡片'], ['media', '素材'], ['scene', '代码场景']].map(([k, n]) => <button key={k} className={s.src.kind === k ? 'on' : ''} onClick={() => { const a = k === 'card' ? null : media.find((x) => (k === 'scene' ? x.kind === 'scene' : x.kind !== 'scene')); if (k !== 'card' && !a) { S().say('素材库里还没有' + (k === 'scene' ? '代码场景' : '视频或图片')); return; } up({ src: { ...s.src, kind: k, asset: a?.id, in: 0 } }, '换画面来源'); }}>{n}</button>)}
          </div>
          {s.src.kind !== 'card' && <div className="col">
            <select value={s.src.asset || ''} onChange={(e) => up({ src: { ...s.src, asset: e.target.value } }, '换素材')}>{media.filter((a) => (s.src.kind === 'scene' ? a.kind === 'scene' : a.kind !== 'scene')).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            <div className="row"><span className="note">入点</span><Lazy type="number" step="0.04" style={{ width: 80 }} value={(s.src.in || 0).toFixed(2)} onCommit={(v) => up({ src: { ...s.src, in: Math.max(0, +v) } }, '入点')} /><span className="note">秒</span>
              {s.src.kind === 'media' && <select style={{ width: 90 }} value={s.src.fit || 'cover'} onChange={(e) => up({ src: { ...s.src, fit: e.target.value } }, '画面适配')}><option value="cover">铺满</option><option value="contain">完整</option></select>}</div>
            {chk(!!s.mirror, (v) => up({ mirror: v }, '镜像'), '镜像')}
            {s.src.kind === 'media' && chk(!s.muted, (v) => up({ muted: !v }, '原声'), '保留原声')}
          </div>}
        </Field>
        {s.src.kind === 'card' && <Field label="卡片">
          <div className="col">
            <select value={card.layout || 'title'} onChange={(e) => upCard({ layout: e.target.value }, '换版式')}>{Object.entries(LAYOUTS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
            <label>画面上的大标题</label>
            <Lazy placeholder="大标题" value={card.heading} onCommit={(v) => upCard({ heading: v })} />
            <label>画面上的副标题</label>
            <Lazy area multi rows={2} placeholder="副标题 / 说明（Ctrl+回车确认）" value={card.body} onCommit={(v) => upCard({ body: v })} />
            {['bullets', 'compare'].includes(card.layout) && <Lazy area multi rows={3} placeholder="每行一条，Ctrl+回车确认" value={(card.bullets || []).join('\n')} onCommit={(v) => upCard({ bullets: v.split('\n').map((x) => x.trim()).filter(Boolean) })} />}
            {card.layout === 'chart' && <Lazy area multi rows={3} placeholder="每行：名称 数值，Ctrl+回车确认" value={(card.labels || []).map((l, i) => `${l} ${card.values?.[i] ?? ''}`).join('\n')} onCommit={(v) => { const rows = v.split('\n').map((r) => r.trim().split(/\s+/)).filter((r) => r.length >= 2); upCard({ labels: rows.map((r) => r.slice(0, -1).join(' ')), values: rows.map((r) => +r[r.length - 1] || 0) }, '改图表'); }} />}
            <div className="row"><Lazy placeholder="角标符号" title="卡片上的小图标，可以是一个字或符号" style={{ width: 90 }} value={card.emoji} onCommit={(v) => upCard({ emoji: v })} />
              <select value={card.asset || ''} onChange={(e) => upCard({ asset: e.target.value || null }, '卡片配图')}><option value="">不配图</option>{p.assets.filter((a) => a.kind === 'image').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
            <div className="row"><span className="note" style={{ width: 40, flex: 'none' }}>字号</span><input type="range" min={0.6} max={1.6} step={0.05} value={s.font || 1} onChange={(e) => S().live((q) => { q.shots.find((x) => x.id === s.id).font = +e.target.value; })} onPointerDown={() => S().beginLive()} onPointerUp={() => S().commitLive('字号')} /><span className="note" style={{ width: 40, textAlign: 'right' }}>{Math.round((s.font || 1) * 100)}%</span></div>
          </div>
        </Field>}
      </>}

      {tab === 'lines' && <div className="field">
        {lines.map((l) => <LineRow key={l.id} l={l} />)}
        {!lines.length && <div className="note" style={{ marginBottom: 8 }}>这一镜没有台词，时长按最短时长 {s.minDur} 秒算。</div>}
        <button className="btn sm" onClick={() => S().edit({ op: 'addLine', args: { shot: s.id, who: lines[lines.length - 1]?.who || Object.keys(p.speakers)[0] || '旁白', text: '新台词' } }, '加台词')}><Icon n="plus" s={14} />加一句</button>
      </div>}

      {tab === 'time' && <>
        <Field label="时长">
          <div className="row">
            <div className="seg"><button className={!s.lock ? 'on' : ''} onClick={() => S().edit({ op: 'setLock', args: { id: s.id, lock: false } }, '按台词自动')}>按台词自动</button><button className={s.lock ? 'on' : ''} onClick={() => S().edit({ op: 'setLock', args: { id: s.id, lock: true } }, '锁定时长')}><Icon n="lock" s={12} />锁定</button></div>
            <Lazy type="number" step="0.1" style={{ width: 80 }} value={s.dur.toFixed(2)} onCommit={(v) => S().edit({ op: 'trimShot', args: { id: s.id, dur: +v } }, '改时长')} /><span className="note">秒</span>
          </div>
          <div className="note" style={{ marginTop: 6 }}>台词需要 {needDur(p, s).toFixed(2)} 秒{s.hold ? ` · 定格 ${s.hold} 秒` : ''}</div>
          <div className="row" style={{ marginTop: 6 }}><span className="note">最短</span><Lazy type="number" step="0.5" style={{ width: 70 }} value={s.minDur} onCommit={(v) => up({ minDur: +v }, '最短时长')} /><span className="note">秒（没有台词时用）</span></div>
        </Field>
        {s.src.kind !== 'card' && <Field label="变速" note="和剪映一样：变速后时长跟着变，用到的素材长度不变">
          <div className="chips">{[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].map((k) => <button key={k} className={'chip' + ((s.speed || 1) === k ? ' on' : '')} onClick={() => { const old = s.speed || 1; const play = s.dur - (s.hold || 0);
            S().edit({ op: 'updateShot', args: { id: s.id, patch: { speed: k, ...(s.src.kind === 'media' ? { dur: Math.max(1 / p.fps, Math.round(((play * old) / k + (s.hold || 0)) * p.fps) / p.fps), lock: true } : {}) } } }, `变速 ${k}×`); }}>{k}×</button>)}</div>
        </Field>}
        <Field label="定格"><div className="row"><button className="btn sm" onClick={() => S().edit({ op: 'freeze', args: { id: s.id, sec: 2 } }, '定格 2 秒')}><Icon n="snow" s={14} />末尾定格 2 秒</button></div></Field>
      </>}

      {tab === 'trans' && <Field label="进入这一镜的转场">
        <div className="chips" style={{ marginBottom: 10 }}>{Object.entries(TRANS_NAMES).filter(([k]) => !['dissolve', 'slide', 'erase'].includes(k)).map(([k, n]) => <button key={k} className={'chip' + ((s.trans?.type || 'cut') === k ? ' on' : '')} onClick={() => up({ trans: { type: k, dur: k === 'cut' ? 0 : s.trans?.dur || 0.5 } }, '转场：' + n)}>{n}</button>)}</div>
        {(s.trans?.type || 'cut') !== 'cut' && <div className="row"><span className="note">时长</span><Lazy type="number" step="0.1" style={{ width: 70 }} value={s.trans?.dur || 0} onCommit={(v) => up({ trans: { ...s.trans, dur: Math.max(0, +v) } }, '转场时长')} /><span className="note">秒</span></div>}
        <div className="note" style={{ marginTop: 8 }}>时间线上两个镜头中间的小方块也能点着换。</div>
      </Field>}

      {tab === 'more' && <>
        <Field label="画面描述（给 AI 和自己看）"><Lazy area multi rows={3} value={s.prompt} onCommit={(v) => up({ prompt: v }, '画面描述')} /></Field>
        <Field label="镜头语言"><Lazy value={s.camera} placeholder="如 推镜头 · 中景" onCommit={(v) => up({ camera: v }, '镜头语言')} /></Field>
        <Field label="章节"><Lazy value={s.chapter} onCommit={(v) => up({ chapter: v }, '章节')} /></Field>
        <div className="field row" style={{ flexWrap: 'wrap' }}>
          <button className="btn sm" onClick={() => S().edit({ op: 'duplicateShot', args: { id: s.id } }, '复制镜头')}><Icon n="copy" s={14} />复制镜头</button>
          <button className="btn sm danger" onClick={() => { S().edit({ op: 'removeShot', args: { id: s.id } }, '删镜头'); S().setSel(null); }}><Icon n="trash" s={14} />删除镜头</button>
        </div>
      </>}
      {redo && <RedoShot shot={s} init={redo.text} onClose={() => setRedo(null)} dir={dir} />}
    </div>
  );
}

export function LineRow({ l, showShot }) {
  const p = useStore((st) => st.p); const dir = useStore((st) => st.dir); const [busy, setBusy] = useState(false);
  const voice = async () => {
    setBusy(true);
    try { const r = await api('tts:line', dir, p, l.id); S().edit([{ op: 'setLineAudio', args: { id: l.id, audio: r.audio, dur: r.dur } }, { op: 'updateLine', args: { id: l.id, patch: { take: r.take, provider: r.provider } } }], r.fallback ? '配音（在线失败，用了系统语音）' : '配音'); }
    catch (e) { S().say('配音失败：' + e.message, true); }
    setBusy(false);
  };
  const play = () => { if (!l.audio) return; const a = new Audio(S().base + l.audio.split('/').map(encodeURIComponent).join('/')); a.play(); };
  return (
    <div className="lineEd">
      <select value={l.who} onChange={(e) => S().edit({ op: 'updateLine', args: { id: l.id, patch: { who: e.target.value } } }, '换角色')}>{[...new Set([...Object.keys(p.speakers), l.who])].map((w) => <option key={w}>{w}</option>)}</select>
      <Lazy area rows={2} value={l.text} onCommit={(v) => S().edit({ op: 'updateLine', args: { id: l.id, patch: { text: v } } }, '改台词')} />
      <div className="col" style={{ gap: 2 }}>
        <span className={'st ' + l.status} title={{ est: '估算时长', ok: '已配音', stale: '文字改过，要重配' }[l.status]}>{l.dur.toFixed(1)}s</span>
        <button className="ib sm" disabled={busy} onClick={voice} title={l.audio ? '重新配音' : '配音'}>{busy ? <span className="spin" /> : <Icon n={l.audio ? 'refresh' : 'mic'} s={14} />}</button>
        {l.audio && <button className="ib sm" onClick={play} title="试听"><Icon n="play" s={12} /></button>}
        <button className="ib sm" onClick={() => S().edit({ op: 'removeLine', args: { id: l.id } }, '删台词')} title="删除"><Icon n="x" s={14} /></button>
      </div>
    </div>
  );
}

function RedoShot({ shot, init, onClose, dir }) {
  const p = useStore((s) => s.p); const [text, setText] = useState(init || ''); const [r, setR] = useState(null); const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { const res = await api('ai:run', 'redo' + Date.now(), dir, p, `只重做镜头 ${sid(p, shot)}（${shot.title}），其他镜头一律不要改。要求：${text || '换一种更好的表达'}`, { onlyShot: sid(p, shot) }, []); setR(res); }
    catch (e) { S().say(e.message, true); }
    setBusy(false);
  };
  return <Modal title={`AI 重做 ${sid(p, shot)} · ${shot.title}`} onClose={onClose} foot={r?.ops?.length ? <><button className="btn" onClick={() => setR(null)}>再来一版</button><button className="btn pri" onClick={() => { S().edit(r.ops, `AI 重做 ${sid(p, shot)}`); onClose(); }}>应用</button></> : <button className="btn pri" disabled={busy} onClick={go}>{busy ? '生成中…' : '生成'}</button>}>
    {!r && <textarea rows={4} autoFocus placeholder="怎么改？例：标题更口语一点；换成对比版式；台词短一半" value={text} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => setText(e.target.value)} />}
    {r && <><p>{r.text}</p><div className="diff">{(r.changes || []).map((c, k) => <div key={k} className={c.kind}>{c.kind === 'add' ? '+ ' : c.kind === 'del' ? '− ' : '~ '}{c.text}</div>)}{!r.ops?.length && <div>没有改动</div>}</div></>}
  </Modal>;
}
