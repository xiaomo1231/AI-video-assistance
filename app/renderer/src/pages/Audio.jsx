// 音频页：角色和音色、逐句配音 / 重配 / 录音导入 / 听写校验、配乐
import React, { useState } from 'react';
import { useStore, S } from '../store.js';
import { api } from '../api.js';
import { absT, tc } from '../../../core/timing.js';
import { templateById } from '../../../core/templates.js';
import { Field, Lazy, toUrl, MOOD_CN } from '../components/ui.jsx';

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
    if (!(await api('asr:available'))) { S().say('还没装听写。到「设置 → 听写」选本地 faster-whisper 或接口。', true); return; }
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

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', flex: 1, minHeight: 0 }}>
      <div className="pane" style={{ minWidth: 0 }}>
        <div className="pane-h">台词与配音 <span className="note">{voiced} / {p.lines.length} 句已配音</span><span className="spacer" />
          {busy && <span className="tag">{busy}</span>}
          <button className="btn sm pri" disabled={!!busy} onClick={() => all(false)}>配齐缺的</button>
          <button className="btn sm" disabled={!!busy} onClick={() => all(true)}>全部重配</button>
          <button className="btn sm" disabled={!!busy} onClick={importBatch} title="文件名带段号：line_03.wav 对应第 3 句">批量导入录音</button>
          <button className="btn sm" onClick={async () => { const f = await api('export:interchange', dir, p, 'script'); api('shell:show', f); }}>导出录音稿</button>
          <button className="btn sm" disabled={!!busy} onClick={check}>听写校验</button>
        </div>
        <div className="scroll">
          <table className="t">
            <thead><tr><th style={{ width: 36 }}>#</th><th style={{ width: 70 }}>时间</th><th style={{ width: 90 }}>角色</th><th>台词</th><th style={{ width: 70 }}>时长</th><th style={{ width: 90 }}>状态</th><th style={{ width: 150 }}></th></tr></thead>
            <tbody>{[...p.lines].sort((a, b) => absT(p, a) - absT(p, b)).map((l, i) => (
              <tr key={l.id} className={sel?.id === l.id ? 'on' : ''} onClick={() => { S().setSel({ kind: 'line', id: l.id }); useStore.setState({ t: absT(p, l), playing: false }); }}>
                <td className="mono">{i + 1}</td><td className="mono">{tc(absT(p, l), p.fps).slice(3, 8)}</td>
                <td><select value={l.who} onClick={(e) => e.stopPropagation()} onChange={(e) => S().edit({ op: 'updateLine', args: { id: l.id, patch: { who: e.target.value } } }, '换角色')}>{[...new Set([...Object.keys(p.speakers), l.who])].map((w) => <option key={w}>{w}</option>)}</select></td>
                <td><Lazy value={l.text} onCommit={(v) => S().edit({ op: 'updateLine', args: { id: l.id, patch: { text: v } } }, '改台词')} />{l.say && <div className="note">读作：{l.say}</div>}</td>
                <td className="mono">{l.dur.toFixed(2)}s</td>
                <td>{l.subOnly ? <span className="st draft">只字幕</span> : <span className={'st ' + l.status}>{{ est: '估算', ok: '已配音', stale: '要重配' }[l.status] || l.status}</span>}
                  {l.asr && <div className={'st ' + (l.asr.pass ? 'ok' : 'error')} title={'听到：' + l.asr.heard}>听写 {Math.round(l.asr.score * 100)}%</div>}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <button className="ib" disabled={!!busy || l.subOnly} onClick={async () => { setBusy('配音…'); try { const r = await voiceOne(l); S().say(r.fallback ? '在线配音失败，用了系统语音：' + r.fallback : `第 ${i + 1} 句配好了（第 ${r.take} 条）`, !!r.fallback); } catch (e) { S().say(e.message, true); } setBusy(null); }} title="生成 / 重配这一句">{l.audio ? '↻' : '🎙'}</button>
                  <button className="ib" disabled={!l.audio} onClick={() => play(l)} title="试听">▶</button>
                  <button className="ib" onClick={() => importOne(l)} title="用自己的录音">⤓</button>
                </td>
              </tr>))}</tbody>
          </table>
          {!p.lines.length && <div className="empty">还没有台词。在分镜或剪辑页给镜头加台词。</div>}
        </div>
      </div>
      <div className="pane" style={{ borderLeft: '1px solid var(--line)' }}>
        <div className="pane-h">角色与音色</div>
        <div className="scroll">
          {Object.entries(p.speakers).map(([who, sp]) => (
            <div className="field" key={who}>
              <div className="row" style={{ marginBottom: 6 }}><b>{who}</b><span className="note">{p.lines.filter((l) => l.who === who).length} 句</span><span className="spacer" /><button className="btn sm" onClick={() => preview(who)}>试听</button></div>
              <div className="col">
                <select value={sp.provider || 'edge'} onChange={(e) => S().edit({ op: 'setSpeaker', args: { who, voice: { provider: e.target.value, voice: tts[e.target.value]?.voices?.[0]?.[0] || '' } } }, '换配音接口')}>{Object.entries(tts).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select>
                {tts[sp.provider || 'edge']?.voices?.length ? <select value={sp.voice || ''} onChange={(e) => S().edit({ op: 'setSpeaker', args: { who, voice: { voice: e.target.value } } }, '换音色')}>{tts[sp.provider || 'edge'].voices.map(([k, n]) => <option key={k} value={k}>{n}</option>)}{sp.voice && !tts[sp.provider || 'edge'].voices.some(([k]) => k === sp.voice) && <option value={sp.voice}>{sp.voice}</option>}</select>
                  : <Lazy placeholder="音色 ID" value={sp.voice} onCommit={(v) => S().edit({ op: 'setSpeaker', args: { who, voice: { voice: v } } }, '换音色')} />}
                <div className="row"><span className="note" style={{ width: 40 }}>语速</span><input type="range" min={0.6} max={1.6} step={0.05} value={sp.speed || 1} onChange={(e) => S().edit({ op: 'setSpeaker', args: { who, voice: { speed: +e.target.value } } }, '语速', { silent: true })} /><span className="note">{(sp.speed || 1).toFixed(2)}×</span></div>
                {tts[sp.provider]?.needsKey && <div className="note">这个接口要在「设置 → 配音」填 Key</div>}
              </div>
            </div>))}
          <div className="field row"><input placeholder="新角色名" value={newWho} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => setNewWho(e.target.value)} /><button className="btn sm" disabled={!newWho.trim()} onClick={() => { S().edit({ op: 'setSpeaker', args: { who: newWho.trim(), voice: { provider: 'edge', voice: 'zh-CN-YunxiNeural', speed: 1 } } }, '加角色'); setNewWho(''); }}>加角色</button></div>
          <div className="pane-h" style={{ borderTop: '1px solid var(--line)' }}>配乐</div>
          <Field label="情绪"><div className="chips">{(info?.moods || []).map((m) => <button key={m} className={'chip' + (bed.mood === m ? ' on' : '')} onClick={() => S().replace({ ...S().p, musicBed: { ...bed, mood: m, pending: true } }, '配乐情绪')}>{MOOD_CN[m] || m}</button>)}</div></Field>
          <Field label={`速度 ${bed.bpm} BPM`}><input type="range" min={60} max={160} value={bed.bpm} onChange={(e) => S().replace({ ...S().p, musicBed: { ...bed, bpm: +e.target.value, pending: true } }, 'BPM')} /></Field>
          <Field label={`音量 ${bed.gain} dB`}><input type="range" min={-30} max={-4} value={bed.gain} onChange={(e) => S().replace({ ...S().p, musicBed: { ...bed, gain: +e.target.value, pending: true } }, '配乐音量')} /></Field>
          <div className="field row"><button className="btn pri sm" disabled={!!busy} onClick={() => genBed(bed)}>生成配乐</button><span className="note">离线合成，无版权问题；有人说话时自动压低。也可以在剪辑页导入自己的音乐。</span></div>
          {p.music.map((m) => <div key={m.id} className="field row"><span>♫ {m.name}</span><span className="spacer" /><button className="ib" onClick={() => S().edit({ op: 'removeMusic', args: { id: m.id } }, '删音乐')}>✕</button></div>)}
          <Field label={`成片响度 ${p.export.loudness} LUFS`} note="抖音、B 站、YouTube 都在 -14 左右。导出时两遍测量，精确对齐。"><input type="range" min={-24} max={-9} value={p.export.loudness} onChange={(e) => S().edit({ op: 'setExport', args: { patch: { loudness: +e.target.value } } }, '响度', { silent: true })} /></Field>
        </div>
      </div>
    </div>
  );
}
