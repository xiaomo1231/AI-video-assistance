// 精修 · 剪辑：图标栏 + 预览 + 属性 + 时间线
import React, { useState } from 'react';
import { useStore, S } from '../store.js';
import { withIds } from '../../../core/project.js';
import { TEMPLATES, GALLERY, templateById } from '../../../core/templates.js';
import { api, pathOf } from '../api.js';
import { shotAt, snap, shotLines } from '../../../core/timing.js';
import PlayerView from '../components/PlayerView.jsx';
import Timeline from '../components/Timeline.jsx';
import ShotEditor, { LineRow, SHOT_TABS } from '../components/ShotEditor.jsx';
import { Field, Lazy, toUrl, fmtSec, MOOD_CN, Split, TplCanvas, Icon, sid } from '../components/ui.jsx';

export async function importFiles(files) {
  const { dir } = S(); if (!files?.length) return [];
  const as = await api('asset:import', dir, files);
  S().edit(as.map((a) => ({ op: 'addAsset', args: { asset: a } })), `导入 ${as.length} 个素材`);
  return as;
}
export function addAssetToTimeline(a) {
  const { p, t } = S(); const cur = shotAt(p, t);
  if (a.kind === 'audio') { S().edit({ op: 'addMusic', args: { asset: a.id, name: a.name, t0: snap(t, p.fps), dur: Math.min(a.dur || 10, Math.max(1, p.duration - t) || a.dur || 10) } }, '加音乐'); return; }
  const kind = a.kind === 'scene' ? 'scene' : 'media';
  const dur = a.kind === 'image' ? 4 : snap(a.dur || 4, p.fps);
  const args = withIds('addShot', { after: cur?.id, shot: { title: a.name.replace(/\.\w+$/, ''), src: { kind, asset: a.id, in: 0, fit: 'cover' }, lock: a.kind !== 'image', dur, minDur: a.kind === 'image' ? 4 : dur } });
  S().edit({ op: 'addShot', args }, '加到主轨');
  // 播放头挪到新片段末尾，连着点几个素材就按点的顺序往后排
  const n = S().p.shots.find((x) => x.id === args.shot.id); if (n) useStore.setState({ t: Math.max(0, n.t0 + n.dur - 1 / p.fps), playing: false });
}

/** 剪辑模式：左边图标栏（素材 / 音频 / 文字 / 音效 / 模板），中间预览，右边属性，下面时间线 */
export default function Edit() {
  const p = useStore((s) => s.p); const sel = useStore((s) => s.sel); const t = useStore((s) => s.t); const L = useStore((s) => s.layout);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
      onDrop={(e) => { const fs = [...e.dataTransfer.files].map(pathOf).filter(Boolean); if (fs.length) { e.preventDefault(); importFiles(fs).catch((er) => S().say(er.message, true)); } }}>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <Rail />
        <PlayerView />
        <Split dir="v" k="propsW" sign={-1} min={280} max={560} />
        <div className="props" style={{ width: L.propsW, flex: 'none' }}><Props sel={sel} p={p} t={t} /></div>
      </div>
      <Split dir="h" k="tlH" sign={-1} min={180} max={Math.max(240, window.innerHeight - 320)} />
      <Timeline height={L.tlH} />
    </div>
  );
}

const RAIL = [['media', 'film', '素材'], ['audio', 'music', '音频'], ['text', 'type', '文字'], ['sfx', 'sfx', '音效'], ['tpl', 'tpl', '模板']];
const TEXT_STYLES = [['tag', '角标', '重点'], ['lower', '人物条', '张三 · 产品经理'], ['note', '便签', '小提示'], ['burst', '综艺花字', '太好用了！'], ['title', '大标题', '第一章']];

function Rail() {
  const p = useStore((s) => s.p); const info = useStore((s) => s.info); const dir = useStore((s) => s.dir); const base = useStore((s) => s.base); const open = useStore((s) => s.layout.railOpen);
  const [tab, setTab] = useState('media');
  const pick = async (filters) => { const f = await api('dialog:files', { multi: true, filters }); if (f.length) importFiles(f).catch((e) => S().say(e.message, true)); };
  const at = () => { const { p: q, t } = S(); const s = shotAt(q, t) || q.shots[q.shots.length - 1]; return s ? { anchor: s.id, off: snap(t - s.t0, q.fps) } : null; };
  const click = (k) => { if (k === tab && open) S().setLayout({ railOpen: false }); else { setTab(k); S().setLayout({ railOpen: true }); } };
  const name = RAIL.find((r) => r[0] === tab)[2];
  return (
    <div className="rail">
      <div className="icons">{RAIL.map(([k, ic, n]) => <button key={k} className={tab === k && open ? 'on' : ''} onClick={() => click(k)} title={n}><Icon n={ic} s={18} />{n}</button>)}</div>
      {open && <div className="drawer-in">
        <div className="pane-h" style={{ height: 40 }}>{name}<span className="spacer" /><button className="ib sm" title="收起" onClick={() => S().setLayout({ railOpen: false })}><Icon n="chevl" s={14} /></button></div>
        <div className="lib-body">
          {tab === 'media' && <>
            <button className="btn sm full" onClick={() => pick([{ name: '视频和图片', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'png', 'jpg', 'jpeg', 'webp', 'gif'] }])}><Icon n="import" s={14} />导入（也可以拖进窗口）</button>
            {p.assets.filter((a) => ['video', 'image', 'scene'].includes(a.kind)).map((a) => (
              <div key={a.id} className="item" onDoubleClick={() => addAssetToTimeline(a)} title={a.name + '\n双击或点 + 加到播放头后面'}>
                <div className="th" style={a.kind === 'image' ? { backgroundImage: `url("${toUrl(base, a.path)}")` } : null}>{a.kind === 'video' ? <Icon n="film" s={18} /> : a.kind === 'scene' ? <Icon n="box" s={18} /> : null}</div>
                <span>{a.name}{a.dur ? ' · ' + fmtSec(a.dur) : ''}</span><button className="add" title="加到主轨" onClick={() => addAssetToTimeline(a)}><Icon n="plus" s={14} /></button>
              </div>))}
            {!p.assets.some((a) => ['video', 'image', 'scene'].includes(a.kind)) && <div className="note full">还没有素材。没有素材也能做片：主轨默认用模板卡片。</div>}
          </>}
          {tab === 'audio' && <>
            <button className="btn sm full" onClick={() => pick([{ name: '音频', extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'] }])}><Icon n="import" s={14} />导入音乐</button>
            {p.assets.filter((a) => a.kind === 'audio').map((a) => <div key={a.id} className="item full" onDoubleClick={() => addAssetToTimeline(a)}><span className="row"><Icon n="music" s={14} />{a.name} · {fmtSec(a.dur)}</span><button className="add" onClick={() => addAssetToTimeline(a)}><Icon n="plus" s={14} /></button></div>)}
            <h4>按情绪生成配乐（离线，可商用）</h4>
            {(info?.moods || []).map((m) => <button key={m} className="btn sm" onClick={async () => { try { const tp = templateById(p.template); const r = await api('music:bed', dir, S().p, { mood: m, bpm: tp.music.bpm }); S().edit([{ op: 'addAsset', args: { asset: r.asset } }, ...S().p.music.filter((x) => x.bed).map((x) => ({ op: 'removeMusic', args: { id: x.id } })), { op: 'addMusic', args: r.clip }], '配乐：' + m); } catch (e) { S().say(e.message, true); } }}>{MOOD_CN[m] || m}</button>)}
          </>}
          {tab === 'text' && <>
            <h4>点一下加到播放头</h4>
            {TEXT_STYLES.map(([st, n, txt]) => (
              <button key={st} className="item" onClick={() => { const a = at(); if (a) S().edit({ op: 'addText', args: { ...a, text: txt, style: st, y: st === 'lower' ? 0.78 : st === 'title' ? 0.16 : 0.22 } }, '加文字'); }}><div className="th" style={{ fontSize: 14, color: 'var(--paper)' }}>{n}</div><span>{txt}</span></button>))}
          </>}
          {tab === 'sfx' && <>
            <h4>合成音效（离线），点一下加到播放头</h4>
            {Object.entries(info?.sfx || {}).map(([n, cn]) => <div key={n} className="item" onClick={async () => { const a = at(); if (!a) return; await api('sfx:make', dir, n); S().edit({ op: 'addSfx', args: { ...a, synth: n, name: cn } }, '加音效'); }}><div className="th"><Icon n="sfx" s={18} /></div><span>{cn}</span>
              <button className="add" onClick={async (e) => { e.stopPropagation(); const f = await api('sfx:make', dir, n); new Audio(toUrl(S().base, f)).play(); }} title="试听"><Icon n="play" s={12} /></button></div>)}
            <button className="btn sm full" onClick={async () => { const f = await api('dialog:files', { filters: [{ name: '音效', extensions: ['wav', 'mp3', 'ogg', 'm4a'] }] }); if (!f.length) return; const [as] = await importFiles(f); const a = at(); if (a && as) S().edit({ op: 'addSfx', args: { ...a, asset: as.id, name: as.name } }, '加音效'); }}><Icon n="import" s={14} />导入音效文件</button>
          </>}
          {tab === 'tpl' && <>
            <h4>换模板只换样子，台词和时长不变</h4>
            {GALLERY.map((g) => <React.Fragment key={g.k}><h4>{g.n}</h4>{TEMPLATES.filter((t) => t.scene === g.k).map((t) => (
              <button key={t.id} className={'item' + (p.template === t.id ? ' on' : '')} style={p.template === t.id ? { borderColor: 'var(--acc)' } : null} onClick={() => p.template !== t.id && S().edit({ op: 'setTemplate', args: { template: t.id } }, '模板：' + t.name)} title={t.line}>
                <div className="th"><TplCanvas t={t} /></div><span>{t.name}</span></button>))}</React.Fragment>)}
          </>}
        </div>
      </div>}
    </div>
  );
}

const ITEM_NAME = { line: '台词', sub: '字幕', text: '文字', sfx: '音效', music: '音乐' };
/** 右边属性：选中镜头时分页（画面 / 台词 / 时长变速 / 转场 / 更多），选中别的就是那一样的属性；最后一页总是「工程」 */
export function Props({ sel, p, t }) {
  const [tab, setTab] = useState('pic');
  const shot = sel?.kind === 'shot' ? p.shots.find((s) => s.id === sel.id) : shotAt(p, t);
  const line = (sel?.kind === 'line' || sel?.kind === 'sub') && p.lines.find((l) => l.id === sel.id);
  const text = sel?.kind === 'text' && p.texts.find((x) => x.id === sel.id);
  const sfx = sel?.kind === 'sfx' && p.sfx.find((x) => x.id === sel.id);
  const mus = sel?.kind === 'music' && p.music.find((x) => x.id === sel.id);
  const other = line || text || sfx || mus;
  const tabs = other ? [['item', ITEM_NAME[sel.kind]], ['proj', '工程']] : [...SHOT_TABS, ['proj', '工程']];
  const cur = tabs.some((x) => x[0] === tab) ? tab : tabs[0][0];
  return <>
    <div className="ptabs">
      {!other && shot && <span className="sid">{sid(p, shot)}</span>}
      {tabs.map(([k, n]) => <button key={k} className={cur === k ? 'on' : ''} onClick={() => setTab(k)}>{n}{k === 'lines' && shot ? <span className="faint"> {shotLines(p, shot.id).length}</span> : null}</button>)}
    </div>
    <div className="pbody" style={{ padding: 0 }}>
      {cur === 'proj' ? <ProjectProps p={p} /> :
        line ? <LineProps l={line} p={p} /> :
        text ? <TextProps x={text} /> :
        sfx ? <SfxProps x={sfx} /> :
        mus ? <MusicProps m={mus} /> :
        <ShotEditor shot={shot} tab={cur} />}
    </div>
  </>;
}

function LineProps({ l, p }) {
  const up = (patch, label) => S().edit({ op: 'updateLine', args: { id: l.id, patch } }, label);
  return <>
    <div className="field"><LineRow l={l} /></div>
    <Field label="实际读法（多音字、数字、英文，留空就读原文）"><Lazy value={l.say} placeholder={l.text} onCommit={(v) => up({ say: v }, '改读法')} /></Field>
    <Field label="语气"><select value={l.voice?.emotion || 'neutral'} onChange={(e) => up({ voice: { ...l.voice, emotion: e.target.value } }, '语气')}>{[['neutral', '平稳'], ['happy', '开心'], ['sad', '低沉'], ['angry', '有力'], ['surprised', '惊讶'], ['calm', '舒缓']].map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></Field>
    <Field label="语速"><div className="row"><input type="range" min={0.6} max={1.6} step={0.05} value={l.voice?.speed || 1} onChange={(e) => up({ voice: { ...l.voice, speed: +e.target.value } }, '语速')} /><span className="note">{(l.voice?.speed || 1).toFixed(2)}×</span></div></Field>
    <Field label="字幕" note="字幕默认跟配音同起同止；可以单独拖动。">
      <div className="row"><span className="note">起点</span><Lazy type="number" step="0.04" style={{ width: 80 }} value={l.soff.toFixed(2)} onCommit={(v) => S().edit({ op: 'setSubtitle', args: { id: l.id, soff: +v } }, '字幕起点')} />
        <span className="note">时长</span><Lazy type="number" step="0.04" style={{ width: 80 }} value={l.sdur.toFixed(2)} onCommit={(v) => S().edit({ op: 'setSubtitle', args: { id: l.id, sdur: +v } }, '字幕时长')} /></div>
      <label className="row" style={{ color: 'var(--paper)', marginTop: 6 }}><input type="checkbox" checked={!!l.pin} onChange={(e) => { up({ pin: e.target.checked }, e.target.checked ? '固定位置' : '自动排位'); }} />固定位置（不跟着前一句自动排）</label>
      <label className="row" style={{ color: 'var(--paper)' }}><input type="checkbox" checked={!!l.subOnly} onChange={(e) => up({ subOnly: e.target.checked }, '只做字幕')} />只做字幕，不配音</label>
    </Field>
    <Field label="音量"><div className="row"><input type="range" min={-20} max={10} step={0.5} value={l.gain || 0} onChange={(e) => up({ gain: +e.target.value }, '配音音量')} /><span className="note">{(l.gain || 0).toFixed(1)} dB</span></div></Field>
    {l.asr && <Field label="听写校验"><span className={'st ' + (l.asr.pass ? 'ok' : 'error')}>{l.asr.pass ? '读对了' : '对不上'} · {Math.round((l.asr.score || 0) * 100)}%</span><div className="note">听到：{l.asr.heard}</div></Field>}
  </>;
}
function TextProps({ x }) {
  const up = (patch, label = '改文字') => S().edit({ op: 'updateText', args: { id: x.id, patch } }, label);
  return <>
    <Field label="内容"><Lazy area rows={2} value={x.text} onCommit={(v) => up({ text: v })} /></Field>
    <Field label="样式"><select value={x.style} onChange={(e) => up({ style: e.target.value }, '文字样式')}>{[['tag', '角标'], ['lower', '人物条'], ['note', '便签'], ['burst', '综艺花字'], ['title', '大标题']].map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></Field>
    <Field label="位置"><div className="row"><span className="note">横</span><input type="range" min={0} max={1} step={0.01} value={x.x} onChange={(e) => up({ x: +e.target.value }, '位置')} /><span className="note">竖</span><input type="range" min={0} max={1} step={0.01} value={x.y} onChange={(e) => up({ y: +e.target.value }, '位置')} /></div></Field>
    <Field label="时长"><Lazy type="number" step="0.1" value={x.dur} onCommit={(v) => up({ dur: Math.max(0.2, +v) }, '文字时长')} /></Field>
    <Field label="动画"><select value={x.anim || 'pop'} onChange={(e) => up({ anim: e.target.value }, '动画')}>{[['pop', '弹出'], ['fade', '淡入'], ['slide', '滑入'], ['type', '打字']].map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></Field>
  </>;
}
function SfxProps({ x }) {
  const info = useStore((s) => s.info);
  const up = (patch, label = '改音效') => S().edit({ op: 'updateSfx', args: { id: x.id, patch } }, label);
  return <>
    <Field label="音效">{x.synth ? <select value={x.synth} onChange={(e) => up({ synth: e.target.value, name: info.sfx[e.target.value] || e.target.value })}>{Object.entries(info?.sfx || {}).map(([n, cn]) => <option key={n} value={n}>{cn}</option>)}</select> : <span>{x.name}</span>}</Field>
    <Field label="音量"><div className="row"><input type="range" min={-30} max={6} step={0.5} value={x.gain ?? -12} onChange={(e) => up({ gain: +e.target.value })} /><span className="note">{(x.gain ?? -12).toFixed(1)} dB</span></div></Field>
    <label className="field row" style={{ color: 'var(--paper)' }}><input type="checkbox" checked={!!x.mute} onChange={(e) => up({ mute: e.target.checked }, '静音')} />静音</label>
  </>;
}
function MusicProps({ m }) {
  const up = (patch, label = '改音乐') => S().edit({ op: 'updateMusic', args: { id: m.id, patch } }, label);
  return <>
    <Field label="名称"><Lazy value={m.name} onCommit={(v) => up({ name: v })} /></Field>
    <Field label="音量"><div className="row"><input type="range" min={-40} max={6} step={0.5} value={m.gain ?? -12} onChange={(e) => up({ gain: +e.target.value })} /><span className="note">{(m.gain ?? -12).toFixed(1)} dB</span></div></Field>
    <Field label="淡入 / 淡出（秒）"><div className="row"><Lazy type="number" step="0.1" value={m.fadeIn} onCommit={(v) => up({ fadeIn: +v })} /><Lazy type="number" step="0.1" value={m.fadeOut} onCommit={(v) => up({ fadeOut: +v })} /></div></Field>
    <label className="field row" style={{ color: 'var(--paper)' }}><input type="checkbox" checked={m.duck !== false} onChange={(e) => up({ duck: e.target.checked }, '闪避')} />有人说话时自动压低（闪避）</label>
    <label className="field row" style={{ color: 'var(--paper)' }}><input type="checkbox" checked={!!m.mute} onChange={(e) => up({ mute: e.target.checked }, '静音')} />静音</label>
    <Field label="位置"><div className="note">起点 {m.t0.toFixed(2)}s · 入点 {(m.in || 0).toFixed(2)}s · 长度 {m.dur.toFixed(2)}s</div></Field>
  </>;
}
function ProjectProps({ p }) {
  const set = (patch, label) => S().edit({ op: 'setSettings', args: { patch } }, label);
  return <>
    <Field label="工程名"><Lazy value={p.name} onCommit={(v) => S().replace({ ...S().p, name: v }, '改名')} /></Field>
    <Field label="台词驱动时长" note="镜头时长 = 最后一句台词结束 + 收尾。改这里所有没锁定的镜头都会重排。">
      {[['lead', '第一句前'], ['gap', '句间停顿'], ['tail', '最后收尾'], ['cps', '每秒字数']].map(([k, n]) => <div key={k} className="row" style={{ marginBottom: 4 }}><span style={{ width: 80 }} className="note">{n}</span><Lazy type="number" step="0.05" value={p.settings[k]} onCommit={(v) => set({ [k]: +v }, n)} /></div>)}
    </Field>
    <Field label="字幕">
      <div className="row"><select value={p.subtitle.style} onChange={(e) => S().replace({ ...S().p, subtitle: { ...p.subtitle, style: e.target.value } }, '字幕样式')}><option value="clean">简洁白字</option><option value="box">底条</option><option value="variety">综艺</option></select>
        <input type="range" min={0.6} max={1.6} step={0.05} value={p.subtitle.size || 1} onChange={(e) => S().replace({ ...S().p, subtitle: { ...p.subtitle, size: +e.target.value } }, '字幕字号')} /></div>
      <label className="row" style={{ color: 'var(--paper)', marginTop: 6 }}><input type="checkbox" checked={p.subtitle.burn !== false} onChange={(e) => S().replace({ ...S().p, subtitle: { ...p.subtitle, burn: e.target.checked } }, '烧录字幕')} />字幕烧进画面</label>
      <label className="row" style={{ color: 'var(--paper)' }}><input type="checkbox" checked={!!p.subtitle.bilingual} onChange={(e) => S().replace({ ...S().p, subtitle: { ...p.subtitle, bilingual: e.target.checked } }, '双语字幕')} />双语（翻译后显示原文）</label>
    </Field>
    <Field label="风格模板" note="换模板只换卡片和字幕的样子，台词和时长不变，可以撤销。左边「模板」能看缩略图"><select value={p.template} onChange={(e) => { const t = templateById(e.target.value); S().edit({ op: 'setTemplate', args: { template: t.id } }, '模板：' + t.name); }}>{GALLERY.map((g) => <optgroup key={g.k} label={g.n}>{TEMPLATES.filter((t) => t.scene === g.k).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>)}</select></Field>
    <Field label="画幅与帧率" note="导出时还可以另选分辨率">
      <div className="row"><select value={`${p.width}x${p.height}`} onChange={(e) => { const [w, h] = e.target.value.split('x').map(Number); S().replace({ ...S().p, width: w, height: h }, '画幅'); }}>{[['1920x1080', '16:9 横版'], ['1080x1920', '9:16 竖版'], ['1080x1080', '1:1 方形'], ['1440x1080', '4:3'], ['2560x1080', '21:9 宽银幕']].map(([k, n]) => <option key={k} value={k}>{n} · {k.replace('x', '×')}</option>)}{![`1920x1080`, '1080x1920', '1080x1080', '1440x1080', '2560x1080'].includes(`${p.width}x${p.height}`) && <option value={`${p.width}x${p.height}`}>{p.width}×{p.height}</option>}</select>
        <select value={p.fps} style={{ width: 90 }} onChange={(e) => S().replace({ ...S().p, fps: +e.target.value }, '帧率')}>{[24, 25, 30, 50, 60].map((x) => <option key={x} value={x}>{x} fps</option>)}</select></div>
      {(() => { const v = p.assets.find((a) => a.kind === 'video' && a.fps); return v && Math.round(v.fps) !== p.fps ? <button className="btn sm" style={{ marginTop: 6 }} onClick={() => S().replace({ ...S().p, fps: Math.round(v.fps), ...(v.w && v.h ? { width: v.w, height: v.h } : {}) }, '按素材设置')}>按素材「{v.name}」设置（{v.w}×{v.h} · {Math.round(v.fps)} fps）</button> : null; })()}
    </Field>
  </>;
}
