// 音频页：角色和音色、逐句配音 / 重配 / 录音导入 / 听写校验、配乐
import React, { useState } from 'react';
import { useStore, S } from '../store.js';
import { api } from '../api.js';
import { absT, tc } from '../../../core/timing.js';
import { templateById } from '../../../core/templates.js';
import { Field, Lazy, toUrl, MOOD_CN, Icon } from '../components/ui.jsx';

export default function AudioPage() {
  const p = useStore((s) => s.p); const dir = useStore((s) => s.dir); const info = useStore((s) => s.info); const sel = useStore((s) => s.sel);
  const [busy, setBusy] = useState(null); const [newWho, setNewWho] = useState('');
  const tts = info?.tts || {};
  const voiceOne = async (l, q = S().p) => {
    const r = await api('tts:line', dir, q, l.id);
    S().edit([{ op: 'setLineAudio', args: { id: l.id, audio: r.audio, dur: r.dur } }, { op: 'updateLine', args: { id: l.id, patch: { take: r.take, provider: r.provider } } }], '配音', { silent: true });
    return r;
  };
  const all = async (force) => {
    const todo = p.lines.filter((l) => !l.subOnly && (force || !l.audio || l.status === 'stale')); let ok = 0, bad = 0, err = '', fb = 0;
    for (const [i, l] of todo.entries()) { setBusy(`配音 ${i + 1} / ${todo.length}`); try { const r = await voiceOne(l); ok++; if (r.fallback) fb++; } catch (e) { bad++; err = e.message; } }
    setBusy(null); S().say(`配好 ${ok} 句${fb ? `（${fb} 句在线失败，用了系统语音）` : ''}${bad ? `，${bad} 句失败：${err}` : ''}`, bad > 0);
  };
  const check = async () => {
    if (!(await api('asr:available'))) { S().say('还没装听写。到设置里的「听写」选本地 faster-whisper 或接口。', true); return; }
    const ls = p.lines.filter((l) => l.audio && !l.subOnly); const ops = [];
    for (const [i, l] of ls.entries()) { setBusy(`听写 ${i + 1} / ${ls.length}`); try { const r = await api('asr:check', dir, S().p, l.id); ops.push({ op: 'updateLine', args: { id: l.id, patch: { asr: { pass: r.pass, score: r.score, heard: r.heard } } } }); } catch (e) { S().say(e.message, true); break; } }
    setBusy(null); if (ops.length) S().edit(ops, '听写校验');
  };
  const importBatch = async () => {
    const f = await api('dialog:files', { multi: true, filters: [{ name: '录音', extensions: ['wav', 'mp3', 'm4a', 'aac', 'flac', 'ogg'] }] }); if (!f.length) return;
    setBusy('导入录音…'); try { const r = await api('tts:importBatch', dir, p, f); S().edit(r.map((x) => ({ op: 'setLineAudio', args: { id: x.id, audio: x.audio, dur: x.dur } })), `导入 ${r.length} 段录音`); S().say(`按文件名里的段号对上了 ${r.length} 句`); } catch (e) { S().say(e.message, true); } setBusy(null);
  };
  const importOne = async (l) => { const f = await api('dialog:files', { filters: [{ name: '录音', extensions: ['wav', 'mp3', 'm4a', 'aac', 'flac', 'ogg'] }] }); if (!f.length) return; const r = await api('tts:import', dir, l.id, f[0]); S().edit({ op: 'setLineAudio', args: { id: l.id, audio: r.audio, dur: r.dur } }, '导入录音'); };
  const play = (l) => l.audio && new Audio(toUrl(S().base, l.audio)).play();
  const preview = async (who) => { const sp = p.speakers[who]; try { const u = await api('tts:preview', { provider: sp.provider || 'edge', voice: sp.voice, speed: sp.speed || 1, text: '你好，这是' + who + '的声音，听听合不合适。' }); new Audio(u).play(); } catch (e) { S().say('试听失败：' + e.message, true); } };
  const tp = templateById(p.template); const bed = p.musicBed || { mood: tp.music.mood, bpm: tp.music.bpm, gain: -14 };
  const genBed = async (o) => { setBusy('生成配乐…'); try { const r = await api('music:bed', dir, S().p, o); S().edit([{ op: 'addAsset', args: { asset: r.asset } }, ...S().p.music.filter((m) => m.bed).map((m) => ({ op: 'removeMusic', args: { id: m.id } })), { op: 'addMusic', args: r.clip }], '配乐'); S().replace({ ...S().p, musicBed: { ...o, pending: false } }, '配乐设置'); } catch (e) { S().say(e.message, true); } setBusy(null); };
  const voiced = p.lines.filter((l) => l.audio).length;
  const whos = [...new Set([...Object.keys(p.speakers), ...p.lines.map((l) => l.who)])]; const color = (w) => SW[Math.max(0, whos.indexOf(w)) % SW.length];
  const rows = [...p.lines].sort((a, b) => absT(p, a) - absT(p, b));
  const stale = p.lines.filter((l) => !l.subOnly && (!l.audio || l.status === 'stale')).length;
  const one = async (l, i) => { setBusy('配音…'); try { const r = await voiceOne(l); S().say(r.fallback ? '在线配音失败，用了系统语音：' + r.fallback : `第 ${i + 1} 句配好了（第 ${r.take} 条）`, !!r.fallback); } catch (e) { S().say(e.message, true); } setBusy(null); };

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <div className="alist" style={{ minWidth: 0 }}>
        <div className="h">
          <b>台词与配音</b><div className="prog" title={`${voiced} / ${p.lines.length} 句已配音`}><i style={{ width: (p.lines.length ? voiced / p.lines.length : 0) * 100 + '%' }} /></div><span className="note num">{voiced} / {p.lines.length} 句</span>
          {busy && <span className="tag row"><span className="spin" />{busy}</span>}
          <span className="spacer" />
          <button className="btn sm pri" disabled={!!busy || !stale} onClick={() => all(false)}><Icon n="mic" s={14} />配齐缺的{stale ? ` ${stale} 句` : ''}</button>
          <button className="btn sm" disabled={!!busy} onClick={() => all(true)}>全部重配</button>
          <button className="btn sm" disabled={!!busy} onClick={check} title="用听写检查有没有读错"><Icon n="check" s={14} />听写校验</button>
          <button className="ib sm" disabled={!!busy} onClick={importBatch} title="批量导入录音：文件名带段号，line_03.wav 对应第 3 句"><Icon n="import" s={15} /></button>
          <button className="ib sm" onClick={async () => { const f = await api('export:interchange', dir, p, 'script'); api('shell:show', f); }} title="导出录音稿"><Icon n="file" s={15} /></button>
        </div>
        {rows.map((l, i) => { const on = sel?.id === l.id; return (
          <React.Fragment key={l.id}>
            <div className={'ar' + (on ? ' on' : '')} onClick={() => { S().setSel(on ? null : { kind: 'line', id: l.id }); useStore.setState({ t: absT(p, l), playing: false }); }}>
              <span className="faint num">{i + 1}</span><span className="note num">{tc(absT(p, l), p.fps).slice(3, 8)}</span>
              <span className="swatch" style={{ background: color(l.who) }} title={l.who} />
              <span className="x"><span className="faint">{l.who}　</span>{l.text}{l.say && <span className="faint">（读作 {l.say}）</span>}</span>
              <span className="note num">{l.dur.toFixed(1)}s</span>
              <span>{l.subOnly ? <span className="st draft">只字幕</span> : <span className={'st ' + l.status}>{{ est: '估算', ok: '已配音', stale: '要重配' }[l.status] || l.status}</span>}
                {l.asr && <span className={'st ' + (l.asr.pass ? 'ok' : 'error')} style={{ marginLeft: 8 }} title={'听到：' + l.asr.heard}>听写 {Math.round(l.asr.score * 100)}%</span>}</span>
              <span className="acts" onClick={(e) => e.stopPropagation()}>
                <button className="ib sm" disabled={!!busy || l.subOnly} onClick={() => one(l, i)} title={l.audio ? '重配这一句' : '配这一句'}><Icon n={l.audio ? 'refresh' : 'mic'} s={14} /></button>
                <button className="ib sm" disabled={!l.audio} onClick={() => play(l)} title="试听"><Icon n="play" s={12} /></button>
                <button className="ib sm" onClick={() => importOne(l)} title="用自己的录音"><Icon n="import" s={14} /></button>
              </span>
            </div>
            {on && <div className="ar-ed" onClick={(e) => e.stopPropagation()}>
              <div className="row"><select value={l.who} style={{ width: 120, flex: 'none' }} onChange={(e) => S().edit({ op: 'updateLine', args: { id: l.id, patch: { who: e.target.value } } }, '换角色')}>{whos.map((w) => <option key={w}>{w}</option>)}</select>
                <Lazy value={l.text} onCommit={(v) => S().edit({ op: 'updateLine', args: { id: l.id, patch: { text: v } } }, '改台词')} /></div>
              <div className="row"><span className="note" style={{ width: 64, flex: 'none' }}>实际读法</span><Lazy value={l.say} placeholder="多音字、数字、英文，留空就读原文" onCommit={(v) => S().edit({ op: 'updateLine', args: { id: l.id, patch: { say: v } } }, '改读法')} /></div>
              <div className="row"><span className="note" style={{ width: 64, flex: 'none' }}>语速</span><input type="range" min={0.6} max={1.6} step={0.05} value={l.voice?.speed || 1} onChange={(e) => S().edit({ op: 'updateLine', args: { id: l.id, patch: { voice: { ...l.voice, speed: +e.target.value } } } }, '语速', { silent: true })} /><span className="note num" style={{ width: 44 }}>{(l.voice?.speed || 1).toFixed(2)}×</span>
                <label className="row" style={{ color: 'var(--paper)', margin: 0, whiteSpace: 'nowrap' }}><input type="checkbox" checked={!!l.subOnly} onChange={(e) => S().edit({ op: 'updateLine', args: { id: l.id, patch: { subOnly: e.target.checked } } }, '只做字幕')} />只做字幕</label></div>
            </div>}
          </React.Fragment>); })}
        {!p.lines.length && <div className="empty">还没有台词。在分镜或剪辑里给镜头加台词。</div>}
      </div>
      <div className="props" style={{ width: 360, flex: 'none' }}>
        <div className="pane-h"><Icon n="user" s={15} />角色与音色</div>
        <div className="scroll">
          <table className="voices"><tbody>{Object.entries(p.speakers).map(([who, sp]) => (
            <tr key={who}>
              <td style={{ width: 80 }}><div className="row" style={{ gap: 6 }}><span className="swatch" style={{ background: color(who) }} /><b style={{ fontWeight: 600 }}>{who}</b></div><div className="faint" style={{ fontSize: 11.5 }}>{p.lines.filter((l) => l.who === who).length} 句</div></td>
              <td><div className="col" style={{ gap: 4 }}>
                <select value={sp.provider || 'edge'} style={{ height: 28 }} onChange={(e) => S().edit({ op: 'setSpeaker', args: { who, voice: { provider: e.target.value, voice: tts[e.target.value]?.voices?.[0]?.[0] || '' } } }, '换配音接口')}>{Object.entries(tts).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select>
                {tts[sp.provider || 'edge']?.voices?.length ? <select value={sp.voice || ''} style={{ height: 28 }} onChange={(e) => S().edit({ op: 'setSpeaker', args: { who, voice: { voice: e.target.value } } }, '换音色')}>{tts[sp.provider || 'edge'].voices.map(([k, n]) => <option key={k} value={k}>{n}</option>)}{sp.voice && !tts[sp.provider || 'edge'].voices.some(([k]) => k === sp.voice) && <option value={sp.voice}>{sp.voice}</option>}</select>
                  : <Lazy placeholder="音色 ID" value={sp.voice} onCommit={(v) => S().edit({ op: 'setSpeaker', args: { who, voice: { voice: v } } }, '换音色')} />}
                <div className="row"><input type="range" min={0.6} max={1.6} step={0.05} value={sp.speed || 1} onChange={(e) => S().edit({ op: 'setSpeaker', args: { who, voice: { speed: +e.target.value } } }, '语速', { silent: true })} /><span className="note num" style={{ width: 40 }}>{(sp.speed || 1).toFixed(2)}×</span></div>
                {tts[sp.provider]?.needsKey && <div className="note">这个接口要在设置里填 Key</div>}
              </div></td>
              <td style={{ width: 36 }}><button className="ib sm" onClick={() => preview(who)} title="试听"><Icon n="play" s={12} /></button></td>
            </tr>))}</tbody></table>
          <div className="field row"><input placeholder="新角色名" value={newWho} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => setNewWho(e.target.value)} /><button className="btn sm" disabled={!newWho.trim()} onClick={() => { S().edit({ op: 'setSpeaker', args: { who: newWho.trim(), voice: { provider: 'edge', voice: 'zh-CN-YunxiNeural', speed: 1 } } }, '加角色'); setNewWho(''); }}><Icon n="plus" s={14} />加角色</button></div>
          <div className="pane-h" style={{ borderTop: '1px solid var(--line)' }}><Icon n="music" s={15} />配乐</div>
          <Field label="情绪"><div className="chips">{(info?.moods || []).map((m) => <button key={m} className={'chip' + (bed.mood === m ? ' on' : '')} onClick={() => S().replace({ ...S().p, musicBed: { ...bed, mood: m, pending: true } }, '配乐情绪')}>{MOOD_CN[m] || m}</button>)}</div></Field>
          <Field label={`速度 ${bed.bpm} BPM`}><input type="range" min={60} max={160} value={bed.bpm} onChange={(e) => S().replace({ ...S().p, musicBed: { ...bed, bpm: +e.target.value, pending: true } }, 'BPM')} /></Field>
          <Field label={`音量 ${bed.gain} dB`}><input type="range" min={-30} max={-4} value={bed.gain} onChange={(e) => S().replace({ ...S().p, musicBed: { ...bed, gain: +e.target.value, pending: true } }, '配乐音量')} /></Field>
          <div className="field"><button className="btn pri sm" disabled={!!busy} onClick={() => genBed(bed)}>生成配乐</button><div className="note" style={{ marginTop: 6 }}>离线合成，无版权问题；有人说话时自动压低。也可以在剪辑里导入自己的音乐。</div></div>
          {p.music.map((m) => <div key={m.id} className="field row"><Icon n="music" s={14} /><span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span><button className="ib sm" title="删掉" onClick={() => S().edit({ op: 'removeMusic', args: { id: m.id } }, '删音乐')}><Icon n="x" s={14} /></button></div>)}
          <Field label={`成片响度 ${p.export.loudness} LUFS`} note="抖音、B 站、YouTube 都在 -14 左右。导出时两遍测量，精确对齐。"><input type="range" min={-24} max={-9} value={p.export.loudness} onChange={(e) => S().edit({ op: 'setExport', args: { patch: { loudness: +e.target.value } } }, '响度', { silent: true })} /></Field>
        </div>
      </div>
    </div>
  );
}

const SW = ['#4fa3a5', '#c8452e', '#d2a84a', '#7d8fd0', '#6db38a', '#b07cc6', '#d07a5a'];
