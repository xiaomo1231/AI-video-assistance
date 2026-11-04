// 交付页：体检、导出 MP4 / MOV、字幕和交换格式、版本与对比
import React, { useEffect, useState } from 'react';
import { useStore, S } from '../store.js';
import { api } from '../api.js';
import { health } from '../../../core/health.js';
import { summarize } from '../../../core/ai/tools.js';
import { tc } from '../../../core/timing.js';
import { Modal, fmtSize, fmtSec, Icon } from '../components/ui.jsx';

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
  const bad = h.filter((x) => x.level !== 'ok'); const good = h.filter((x) => x.level === 'ok'); const errN = h.filter((x) => x.level === 'error').length; const must = h.filter((x) => x.level === 'warn' || x.level === 'error').length;
  const preset = PRESET.find((x) => x.match(ex)); const out = p.width > p.height ? `${Math.round(p.width / p.height * ex.height)}×${ex.height}` : `${ex.height}×${Math.round(p.height / p.width * ex.height)}`;

  return (
    <div className="deliver">
      <div className="wrap">
        <div className={'verdict ' + (must ? 'warn' : 'ok')}>
          <Icon n={must ? 'alert' : 'check'} s={28} />
          <div style={{ flex: 1, minWidth: 0 }}><h3>{must ? (errN ? `有 ${errN} 项会影响成片` : `还有 ${must} 项要看一下`) : bad.length ? '可以交付了，有 ' + bad.length + ' 条提示' : '可以交付了'}</h3>
            <div className="note">{tc(p.duration, p.fps).slice(3, 8)} · {p.shots.length} 镜 · {p.lines.filter((l) => l.audio).length} / {p.lines.length} 句已配音 · 导出 {out} {ex.fps || p.fps} fps</div></div>
          {exporting ? <div style={{ width: 260 }}><div className="row"><span className="note">{exporting.text}</span><span className="spacer" />{exporting.eta != null && <span className="note">还要 {fmtSec(exporting.eta)}</span>}<button className="btn sm ghost" onClick={() => api('export:cancel', dir)}>取消</button></div><div className="progress" style={{ marginTop: 6 }}><i style={{ width: (exporting.pct || 0) * 100 + '%' }} /></div></div>
            : <button className="btn pri big" disabled={!p.shots.length} onClick={run}><Icon n="export" s={16} />导出成片</button>}
        </div>
        {err && <div className="errbox" style={{ margin: 0 }}>导出失败：{err}</div>}
        {res && <div className="okbox" style={{ margin: 0 }}>
          <div className="st ok">导出完成，已经存了一版</div>
          <div className="note" style={{ marginTop: 4, wordBreak: 'break-all' }}>{res.out}</div>
          <div className="note">{res.width}×{res.height} · {res.fps} fps · {fmtSec(res.dur)} · {fmtSize(res.size)} · 用时 {fmtSec(res.seconds)}{res.loudness?.measured != null ? ` · 响度 ${res.loudness.measured.toFixed(1)} → ${res.loudness.target} LUFS` : res.loudness?.silent ? ' · 无声音' : res.loudness?.raw ? ' · 保留原始电平' : ''}</div>
          {res.voiceFail && <div className="warnbox" style={{ margin: '6px 0' }}>{res.voiceFail.failed} / {res.voiceFail.total} 句配音没做出来，这些地方没有人声。{res.voiceFail.why}</div>}
          {res.loudness?.capped && <div className="note">{res.loudness.capped}</div>}
          {res.blackSeconds > 0 && <div className="warnbox" style={{ margin: '6px 0' }}>有 {res.blackSeconds} 秒画面接近全黑，看一下是不是素材没加载</div>}
          <div className="row" style={{ marginTop: 8 }}><button className="btn sm pri" onClick={() => api('shell:open', res.out)}><Icon n="play" s={12} />播放</button><button className="btn sm" onClick={() => api('shell:show', res.out)}><Icon n="folder" s={14} />打开文件夹</button></div>
        </div>}

        <section className="sec">
          <h2>成片体检<span>{bad.length ? `${bad.length} 项要看，${good.length} 项通过` : `${good.length} 项全部通过`}</span></h2>
          <div className="checks">
            {bad.map((x) => <div key={x.id} className="chk"><span className={'st ' + x.level} /><b>{x.title}</b><span className="note">{x.detail}</span>{x.items?.length > 0 && <button className="btn sm" onClick={() => jump(x.items[0])}>去修改<Icon n="chev" s={12} /></button>}</div>)}
            {good.length > 0 && <details className="adv"><summary><Icon n="chev" s={14} />通过的 {good.length} 项</summary><div className="in" style={{ gap: 6 }}>{good.map((x) => <div key={x.id} className="row" style={{ alignItems: 'flex-start' }}><span className="st ok" style={{ width: 96, flex: 'none' }}>{x.title}</span><span className="note">{x.detail}</span></div>)}</div></details>}
          </div>
        </section>

        <section className="sec">
          <h2>导出设置<span>{preset ? `用的是「${preset.n}」` : '自定义'}</span></h2>
          <div className="presets">{PRESET.map((x) => <button key={x.k} className={'pre' + (preset?.k === x.k ? ' on' : '')} onClick={() => setEx(x.patch)}><b>{x.n}</b><span className="note">{x.d}</span></button>)}</div>
          <details className="adv" style={{ marginTop: 12 }}>
            <summary><Icon n="chev" s={14} />高级：格式、分辨率、帧率、字幕和交换格式</summary>
            <div className="in">
              <div><label>格式</label><div className="chips">{Object.entries(info?.codecs || {}).map(([k, n]) => <button key={k} className={'chip' + (ex.codec === k ? ' on' : '')} onClick={() => setEx({ codec: k })}>{n}</button>)}</div></div>
              <div><label>分辨率（短边）· 导出 {out}</label><div className="seg">{[720, 1080, 1440, 2160].map((x) => <button key={x} className={ex.height === x ? 'on' : ''} onClick={() => setEx({ height: x })}>{x}p</button>)}</div></div>
              <div><label>帧率</label><div className="seg">{[24, 25, 30, 50, 60].map((x) => <button key={x} className={(ex.fps || p.fps) === x ? 'on' : ''} onClick={() => setEx({ fps: x })}>{x}</button>)}</div></div>
              <div className="col">
                <label className="row" style={{ color: 'var(--paper)', fontSize: 13 }}><input type="checkbox" checked={ex.srt !== false} onChange={(e) => setEx({ srt: e.target.checked })} />同时导出 SRT 字幕</label>
                <label className="row" style={{ color: 'var(--paper)', fontSize: 13 }}><input type="checkbox" checked={ex.autoVoice !== false} onChange={(e) => setEx({ autoVoice: e.target.checked })} />导出前自动补齐缺的配音</label>
                <label className="row" style={{ color: 'var(--paper)', fontSize: 13 }} title="把整体音量拉到平台推荐的响度（-14 LUFS）。ProRes 给剪辑软件的中间片默认不做"><input type="checkbox" checked={ex.normalize ?? !/prores/.test(ex.codec || '')} onChange={(e) => setEx({ normalize: e.target.checked })} />响度归一（发平台推荐打开）</label>
              </div>
              <div><label>交换格式（给剪映 / Premiere / 达芬奇 / Final Cut 继续精修）</label><div className="row" style={{ flexWrap: 'wrap' }}><button className="btn sm" onClick={() => inter('srt')}>SRT 字幕</button><button className="btn sm" onClick={() => inter('fcpxml')}>FCPXML</button><button className="btn sm" onClick={() => inter('edl')}>EDL</button><button className="btn sm" onClick={() => inter('script')}>录音稿</button></div></div>
            </div>
          </details>
        </section>

        <section className="sec">
          <h2>版本<span>每次导出自动存一版，也可以手动存</span></h2>
          <div className="row" style={{ marginBottom: 12 }}><input placeholder="这一版改了什么（可空）" value={msg} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => setMsg(e.target.value)} /><button className="btn pri" onClick={async () => { await S().save(); const r = await api('version:commit', dir, msg || '手动保存'); S().say(r.unchanged ? '和上一版一样，没有新建' : '已存一版'); setMsg(''); loadVers(); }}><Icon n="clock" s={14} />存一版</button></div>
          <div className="vers">
            {vers.map((v, i) => (
              <div key={v.oid} className={'ver' + (i === 0 ? ' cur' : '')}>
                <div className="im">{i < 6 && <VerThumb dir={dir} v={v} />}</div>
                <div style={{ minWidth: 0 }}><b style={{ fontWeight: 600 }}>{v.message}</b><div className="note">{new Date(v.at).toLocaleString('zh-CN', { hour12: false })}{i === 0 ? ' · 最新' : ''}</div></div>
                <div className="row"><button className="btn sm" onClick={async () => setCmp({ v, old: await api('version:read', dir, v.oid) })}>和现在对比</button>
                  <button className="btn sm ghost" onClick={async () => { const old = await api('version:read', dir, v.oid); S().replace(old, '回到版本：' + v.message); S().say('已回到这一版，可以撤销'); }}>回到这一版</button></div>
              </div>))}
            {!vers.length && <div className="note">还没有版本。每次导出会自动存一版。</div>}
          </div>
        </section>
      </div>
      {q && <Modal title="配音没做出来" onClose={() => { q.resolve(false); setQ(null); }} foot={<><button className="btn" onClick={() => { q.resolve(false); setQ(null); }}>先不导出</button><button className="btn pri" onClick={() => { q.resolve(true); setQ(null); }}>导出无声版</button></>}><div style={{ whiteSpace: 'pre-wrap' }}>{q.text}</div></Modal>}
      {cmp && <Compare v={cmp.v} old={cmp.old} onClose={() => setCmp(null)} />}
    </div>
  );
}

const PRESET = [
  { k: 'social', n: '发平台', d: 'H.264 1080p，响度 -14 LUFS，带 SRT。抖音、B 站、视频号直接传', patch: { codec: 'h264', height: 1080, normalize: true, srt: true }, match: (e) => e.codec === 'h264' && e.height === 1080 && e.normalize !== false },
  { k: 'hq', n: '高清存档', d: 'H.265 2160p，体积小画质高，留作母版', patch: { codec: 'h265', height: 2160, normalize: true, srt: true }, match: (e) => e.codec === 'h265' && e.height === 2160 },
  { k: 'edit', n: '给剪辑软件', d: 'ProRes 422 HQ，保留原始电平，再配一份 FCPXML 接着剪', patch: { codec: 'prores', height: 1080, normalize: false, srt: true }, match: (e) => e.codec === 'prores' },
];

/** 版本缩略图：把那一版的工程截一帧 */
const verCache = new Map();
function VerThumb({ dir, v }) {
  const [u, setU] = useState(verCache.get(v.oid));
  useEffect(() => { if (u) return; let dead = false; const h = setTimeout(async () => { try { const old = await api('version:read', dir, v.oid); const t = Math.min(old.duration * 0.3, 3); const url = await api('render:still', dir, { ...old, lines: [], texts: [] }, t, 224); verCache.set(v.oid, url); if (!dead) setU(url); } catch {} }, 300); return () => { dead = true; clearTimeout(h); }; }, [v.oid]);
  return u ? <img src={u} alt="" /> : null;
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
