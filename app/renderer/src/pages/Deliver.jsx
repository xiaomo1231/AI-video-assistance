// 交付页：体检、导出 MP4 / MOV、字幕和交换格式、版本与对比
import React, { useEffect, useState } from 'react';
import { useStore, S } from '../store.js';
import { api } from '../api.js';
import { health, healthBad } from '../../../core/health.js';
import { summarize } from '../../../core/ai/tools.js';
import { tc } from '../../../core/timing.js';
import { Field, Modal, fmtSize, fmtSec } from '../components/ui.jsx';

export default function Deliver() {
  const p = useStore((s) => s.p); const dir = useStore((s) => s.dir); const info = useStore((s) => s.info); const exporting = useStore((s) => s.exporting);
  const [res, setRes] = useState(null); const [err, setErr] = useState(null); const [vers, setVers] = useState([]); const [msg, setMsg] = useState(''); const [cmp, setCmp] = useState(null);
  const [q, setQ] = useState(null); const ask = (text) => new Promise((resolve) => setQ({ text, resolve }));
  const ex = p.export; const setEx = (patch) => S().edit({ op: 'setExport', args: { patch } }, '导出设置', { silent: true });
  const h = health(p);
  const loadVers = () => api('version:list', dir).then(setVers).catch(() => {});
  useEffect(() => { loadVers(); }, [dir]);

  const run = async () => {
    setErr(null); setRes(null); await S().save(); let voiceFail = null;
    useStore.setState({ exporting: { phase: 'start', pct: 0, text: '准备' } });
    try {
      // 先把缺的配音补上
      const todo = S().p.lines.filter((l) => !l.subOnly && (!l.audio || l.status === 'stale'));
      if (todo.length && ex.autoVoice !== false) {
        let failed = 0, why = '';
        for (const [i, l] of todo.entries()) { useStore.setState({ exporting: { phase: 'voice', pct: i / todo.length, text: `补配音 ${i + 1} / ${todo.length}` } }); try { const r = await api('tts:line', dir, S().p, l.id); S().edit([{ op: 'setLineAudio', args: { id: l.id, audio: r.audio, dur: r.dur } }], '配音', { silent: true }); } catch (e) { failed++; why = e.message; } }
        await S().save();
        if (failed) {
          voiceFail = { failed, total: todo.length, why };
          if (failed === todo.length && !(await ask(`${failed} 句配音全部没做出来，成片会没有人声。\n\n原因：${why}\n\n仍然导出吗？（也可以先到音频页导入自己的录音，或在设置里换配音接口）`))) { useStore.setState({ exporting: null }); setErr(`配音没做出来：${why}`); return; }
        }
      }
      const r = await api('export:start', dir, S().p, {}); setRes({ ...r, voiceFail });
      await api('version:commit', dir, `导出 ${new Date().toLocaleString()}`).catch(() => {}); loadVers();
    } catch (e) { setErr(e.message); }
    useStore.setState({ exporting: null });
  };
  const inter = async (k) => { try { const f = await api('export:interchange', dir, p, k); S().say('已生成 ' + f.split(/[\\/]/).pop()); api('shell:show', f); } catch (e) { S().say(e.message, true); } };
  const jump = (it) => { const st = S(); if (it.shot) { st.setSel({ kind: 'shot', id: it.shot }); const s = p.shots.find((x) => x.id === it.shot); if (s) useStore.setState({ t: s.t0 }); } else if (it.line) { st.setSel({ kind: 'line', id: it.line }); } else if (it.anno) { const a = p.annotations.find((x) => x.id === it.anno); if (a) { st.setSel({ kind: 'shot', id: a.shot }); } } st.setPage('edit'); };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 360px', flex: 1, minHeight: 0 }}>
      <div className="pane" style={{ minWidth: 0 }}>
        <div className="pane-h">成片体检<span className="spacer" /><span className="note">{healthBad(h)} 项要看</span></div>
        <div className="scroll">{h.map((x) => (
          <div key={x.id} className="field">
            <div className="row"><span className={'st ' + x.level}>{x.title}</span><span className="spacer" />{x.items?.length > 0 && x.level !== 'ok' && <button className="btn sm" onClick={() => jump(x.items[0])}>去修改</button>}</div>
            <div className="note" style={{ color: x.level === 'ok' ? 'var(--dim)' : 'var(--fg)', marginTop: 2 }}>{x.detail}</div>
          </div>))}</div>
      </div>
      <div className="pane" style={{ borderLeft: '1px solid var(--line)', minWidth: 0 }}>
        <div className="pane-h">导出</div>
        <div className="scroll">
          <Field label="格式"><div className="chips">{Object.entries(info?.codecs || {}).map(([k, n]) => <button key={k} className={'chip' + (ex.codec === k ? ' on' : '')} onClick={() => setEx({ codec: k })}>{n}</button>)}</div></Field>
          <Field label="分辨率（短边）"><div className="chips">{[720, 1080, 1440, 2160].map((x) => <button key={x} className={'chip' + (ex.height === x ? ' on' : '')} onClick={() => setEx({ height: x })}>{x}p</button>)}</div><div className="note" style={{ marginTop: 4 }}>{p.width > p.height ? `${Math.round(p.width / p.height * ex.height)}×${ex.height}` : `宽 ${ex.height}`}</div></Field>
          <Field label="帧率"><div className="chips">{[24, 25, 30, 50, 60].map((x) => <button key={x} className={'chip' + ((ex.fps || p.fps) === x ? ' on' : '')} onClick={() => setEx({ fps: x })}>{x}</button>)}</div></Field>
          <div className="field col">
            <label className="row" style={{ color: 'var(--fg)' }}><input type="checkbox" checked={ex.srt !== false} onChange={(e) => setEx({ srt: e.target.checked })} />同时导出 SRT 字幕</label>
            <label className="row" style={{ color: 'var(--fg)' }}><input type="checkbox" checked={ex.autoVoice !== false} onChange={(e) => setEx({ autoVoice: e.target.checked })} />导出前自动补齐缺的配音</label>
            <label className="row" style={{ color: 'var(--fg)' }} title="把整体音量拉到平台推荐的响度（-14 LUFS）。ProRes 给剪辑软件的中间片默认不做"><input type="checkbox" checked={ex.normalize ?? !/prores/.test(ex.codec || '')} onChange={(e) => setEx({ normalize: e.target.checked })} />响度归一（发平台推荐打开）</label>
          </div>
          <div className="field">
            {exporting ? <><div className="row"><span>{exporting.text}</span><span className="spacer" />{exporting.eta != null && <span className="note">还要 {fmtSec(exporting.eta)}</span>}<button className="btn sm" onClick={() => api('export:cancel', dir)}>取消</button></div><div className="progress" style={{ marginTop: 6 }}><i style={{ width: (exporting.pct || 0) * 100 + '%' }} /></div></>
              : <button className="btn pri big" style={{ width: '100%' }} disabled={!p.shots.length} onClick={run}>导出 {tc(p.duration, p.fps)}</button>}
          </div>
          {err && <div className="errbox">导出失败：{err}</div>}
          {res && <div className="field" style={{ background: 'rgba(92,194,138,.07)' }}>
            <div className="st ok">导出完成</div>
            <div className="note" style={{ marginTop: 4 }}>{res.out}</div>
            <div className="note">{res.width}×{res.height} · {res.fps} fps · {fmtSec(res.dur)} · {fmtSize(res.size)} · 用时 {fmtSec(res.seconds)}{res.loudness?.measured != null ? ` · 响度 ${res.loudness.measured.toFixed(1)} → ${res.loudness.target} LUFS` : res.loudness?.silent ? ' · 无声音' : res.loudness?.raw ? ' · 保留原始电平' : ''}</div>
            {res.voiceFail && <div className="warnbox" style={{ margin: '6px 0' }}>{res.voiceFail.failed} / {res.voiceFail.total} 句配音没做出来，这些地方没有人声。{res.voiceFail.why}</div>}
            {res.loudness?.capped && <div className="note">{res.loudness.capped}</div>}
            {res.blackSeconds > 0 && <div className="warnbox" style={{ margin: '6px 0' }}>有 {res.blackSeconds} 秒画面接近全黑，看一下是不是素材没加载</div>}
            <div className="row" style={{ marginTop: 6 }}><button className="btn sm" onClick={() => api('shell:open', res.out)}>播放</button><button className="btn sm" onClick={() => api('shell:show', res.out)}>打开文件夹</button></div>
          </div>}
          <Field label="交换格式（给剪映 / Premiere / 达芬奇 / Final Cut 继续精修）">
            <div className="row" style={{ flexWrap: 'wrap' }}><button className="btn sm" onClick={() => inter('srt')}>SRT 字幕</button><button className="btn sm" onClick={() => inter('fcpxml')}>FCPXML</button><button className="btn sm" onClick={() => inter('edl')}>EDL</button><button className="btn sm" onClick={() => inter('script')}>录音稿</button></div>
          </Field>
        </div>
      </div>
      <div className="pane" style={{ borderLeft: '1px solid var(--line)' }}>
        <div className="pane-h">版本</div>
        <div className="field row"><input placeholder="这一版改了什么（可空）" value={msg} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => setMsg(e.target.value)} /><button className="btn sm pri" onClick={async () => { await S().save(); const r = await api('version:commit', dir, msg || '手动保存'); S().say(r.unchanged ? '和上一版一样，没有新建' : '已存一版'); setMsg(''); loadVers(); }}>存一版</button></div>
        <div className="scroll">{vers.map((v, i) => (
          <div key={v.oid} className="field">
            <div className="row"><b style={{ fontWeight: 500 }}>{v.message}</b><span className="spacer" /><span className="note">{new Date(v.at).toLocaleString('zh-CN', { hour12: false })}</span></div>
            <div className="row" style={{ marginTop: 4 }}><button className="btn sm" onClick={async () => setCmp({ v, old: await api('version:read', dir, v.oid) })}>和现在对比</button>
              <button className="btn sm ghost" onClick={async () => { const old = await api('version:read', dir, v.oid); S().replace(old, '回到版本：' + v.message); S().say('已回到这一版，可以撤销'); }}>回到这一版</button></div>
          </div>))}
          {!vers.length && <div className="empty">还没有版本。每次导出会自动存一版。</div>}
        </div>
      </div>
      {q && <Modal title="配音没做出来" onClose={() => { q.resolve(false); setQ(null); }} foot={<><button className="btn" onClick={() => { q.resolve(false); setQ(null); }}>先不导出</button><button className="btn pri" onClick={() => { q.resolve(true); setQ(null); }}>导出无声版</button></>}><div style={{ whiteSpace: 'pre-wrap' }}>{q.text}</div></Modal>}
      {cmp && <Compare v={cmp.v} old={cmp.old} onClose={() => setCmp(null)} />}
    </div>
  );
}

function Compare({ v, old, onClose }) {
  const p = useStore((s) => s.p); const dir = useStore((s) => s.dir);
  const [t, setT] = useState(useStore.getState().t); const [imgs, setImgs] = useState([null, null]);
  const changes = summarize(old, p);
  useEffect(() => { let dead = false; const h = setTimeout(async () => { const [a, b] = await Promise.all([api('render:still', dir, old, Math.min(t, old.duration - 0.01), 640).catch(() => null), api('render:still', dir, p, Math.min(t, p.duration - 0.01), 640).catch(() => null)]); if (!dead) setImgs([a, b]); }, 200); return () => { dead = true; clearTimeout(h); }; }, [t]);
  return <Modal wide title={`版本对比 · ${v.message}`} onClose={onClose}>
    <div className="grid2">
      <div><div className="note">旧版 · {tc(old.duration, old.fps)} · {old.shots.length} 镜</div>{imgs[0] ? <img src={imgs[0]} style={{ width: '100%', borderRadius: 6 }} /> : <div style={{ aspectRatio: '16/9', background: '#000' }} />}</div>
      <div><div className="note">现在 · {tc(p.duration, p.fps)} · {p.shots.length} 镜</div>{imgs[1] ? <img src={imgs[1]} style={{ width: '100%', borderRadius: 6 }} /> : <div style={{ aspectRatio: '16/9', background: '#000' }} />}</div>
    </div>
    <div className="row" style={{ margin: '10px 0' }}><span className="tc">{tc(t, p.fps)}</span><input type="range" min={0} max={Math.max(p.duration, old.duration)} step={0.1} value={t} onChange={(e) => setT(+e.target.value)} style={{ flex: 1 }} /></div>
    <div className="diff">{changes.length ? changes.map((c, k) => <div key={k} className={c.kind}>{c.kind === 'add' ? '+ ' : c.kind === 'del' ? '− ' : '~ '}{c.text}</div>) : <div>没有差别</div>}</div>
  </Modal>;
}
