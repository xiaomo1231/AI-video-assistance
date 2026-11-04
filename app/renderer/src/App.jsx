// 主界面：顶栏 + 页面 + AI 助手 + 工作流面板
import React, { useEffect } from 'react';
import { useStore, S } from './store.js';
import { api, on, serveRpc } from './api.js';
import { health, healthBad } from '../../core/health.js';
import { tc } from '../../core/timing.js';
import AiDock from './components/AiDock.jsx';
import WfPanel from './components/WfPanel.jsx';
import { deleteSel } from './components/Timeline.jsx';
import Home from './pages/Home.jsx';
import Flow from './pages/Flow.jsx';
import Board from './pages/Board.jsx';
import Edit from './pages/Edit.jsx';
import Color from './pages/Color.jsx';
import Audio from './pages/Audio.jsx';
import Deliver from './pages/Deliver.jsx';
import Settings from './pages/Settings.jsx';

const PAGES = [['home', '开始'], ['flow', '工作流'], ['board', '分镜'], ['edit', '剪辑'], ['color', '调色'], ['audio', '音频'], ['deliver', '交付'], ['settings', '设置']];
const NEED_P = new Set(['board', 'edit', 'color', 'audio', 'deliver']);

export default function App() {
  const page = useStore((s) => s.page); const p = useStore((s) => s.p); const toast = useStore((s) => s.toast);
  const aiOpen = useStore((s) => s.aiOpen); const dirty = useStore((s) => s.dirty); const savedAt = useStore((s) => s.savedAt); const dir = useStore((s) => s.dir);

  useEffect(() => {
    api('app:info').then((info) => useStore.setState({ info })).catch((e) => S().say('启动失败：' + e.message, true));
    api('settings:get').then((settings) => useStore.setState({ settings, aiOpen: !!settings?.ai?.providers?.find((x) => x.id === settings.ai.active) })); // 没配 AI 时助手默认收起，把地方让给画面
    const offs = [
      serveRpc({
        getProject: () => S().p,
        applyOps: ({ ops, label, silent }) => { S().edit(ops, label || '工作流', { silent }); return S().p; },
        focus: ({ page }) => { const st = S(); if (st.p) { st.setPage(page); const f = st.p.shots[0]; if (st.t === 0 && f?.src.kind === 'card') useStore.setState({ t: Math.min(1.2, f.dur * 0.5) }); } return true; }, // 停在第 0 帧时卡片还没入场，看着像空白
      }),
      on('workflow:event', (e) => {
        // 事件可能比 workflow:start 的返回值先到：先按 run id 记下来
        const prev = early.get(e.run) || {}; const acc = { ...prev, ...(e.snapshot || {}) };
        if (e.out) acc.out = e.out;
        if (e.type === 'step' && e.result) acc.results = { ...(prev.results || {}), [e.i]: e.result };
        early.set(e.run, acc);
        const r = S().run; if (!r || e.run !== r.id) return;
        const nx = { ...r, ...(e.snapshot || {}) };
        if (e.type === 'step' && e.result) nx.results = { ...(r.results || {}), [e.i]: e.result };
        if (e.type === 'progress') nx.progress = e;
        if (e.out) nx.out = e.out;
        if (e.type === 'finish' || (e.type === 'answer' && e.answer?.verdict === 'pass')) nx.info = null; // 打回意见在通过或结束后收起
        if (e.type === 'info' || e.type === 'loop') nx.info = e.type === 'loop' ? `打回第 ${e.round} 轮：${(e.notes || []).join('；')}` : e.text;
        if (e.type === 'finish') { S().say(e.state === 'done' ? `「${r.name}」完成` : `「${r.name}」${e.state === 'error' ? '出错停止' : '已停止'}`, e.state === 'error'); }
        useStore.setState({ run: nx });
      }),
      on('export:progress', (d) => useStore.setState({ exporting: d.phase === 'done' ? null : d })),
    ];
    const key = (e) => {
      if (e.target.closest('input,textarea,select,[contenteditable]')) return;
      const st = S(); const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? st.doRedo() : st.doUndo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); st.doRedo(); return; }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); st.save().then(() => st.say('已保存')); return; }
      if (!st.p) return;
      const f = 1 / st.p.fps;
      if (e.key === ' ') { e.preventDefault(); useStore.setState({ playing: !st.playing }); }
      else if (e.key === 'ArrowLeft') useStore.setState({ t: Math.max(0, st.t - (e.shiftKey ? 1 : f)), playing: false });
      else if (e.key === 'ArrowRight') useStore.setState({ t: Math.min(st.p.duration, st.t + (e.shiftKey ? 1 : f)), playing: false });
      else if (e.key === 'k' || e.key === 'K') useStore.setState({ playing: false });
      else if (e.key === 'l' || e.key === 'L') useStore.setState({ playing: true });
      else if (e.key === 'j' || e.key === 'J') useStore.setState({ t: Math.max(0, st.t - 2), playing: false });
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { // 跳到上一个 / 下一个剪辑点
        e.preventDefault(); const cuts = [0, ...st.p.shots.map((x) => x.t0 + x.dur)]; const eps = 1e-4;
        const to = e.key === 'ArrowUp' ? [...cuts].reverse().find((c) => c < st.t - eps) : cuts.find((c) => c > st.t + eps);
        if (to != null) useStore.setState({ t: Math.min(st.p.duration, to), playing: false });
      }
      else if (e.key === 'Home') useStore.setState({ t: 0, playing: false });
      else if (e.key === 'End') useStore.setState({ t: st.p.duration, playing: false });
      else if (e.key === 'Delete' || e.key === 'Backspace') deleteSel();
      else if (e.key.toLowerCase() === 's' && !mod) { const s = st.p.shots.find((x) => st.t > x.t0 && st.t < x.t0 + x.dur); if (s) st.edit({ op: 'splitShot', args: { id: s.id, at: st.t - s.t0 } }, '分割'); }
      else if (e.key === 'Escape') { st.setSel(null); useStore.setState({ annoMode: false }); }
    };
    window.addEventListener('keydown', key);
    const bye = () => { if (S().dirty) S().save(); };
    window.addEventListener('beforeunload', bye);
    return () => { offs.forEach((f) => f?.()); window.removeEventListener('keydown', key); window.removeEventListener('beforeunload', bye); };
  }, []);

  // 预览要用到的合成音效先生成好
  useEffect(() => { if (!p || !dir) return; for (const n of new Set(p.sfx.map((x) => x.synth).filter(Boolean))) ensureSfx(dir, n); }, [p?.sfx, dir]);

  const bad = p ? healthBad(health(p)) : 0;
  const Page = { home: Home, flow: Flow, board: Board, edit: Edit, color: Color, audio: Audio, deliver: Deliver, settings: Settings }[page] || Home;
  return (
    <div className="app">
      <div className="top">
        <div className="brand"><i />墨剪</div>
        <div className="proj">{p ? <><b>{p.name}</b> · {tc(p.duration, p.fps)} · {p.shots.length} 镜 · {p.lines.length} 句 · {dirty ? '未保存' : savedAt ? '已保存' : ''}</> : '没有打开工程'}</div>
        <div className="tabs">{PAGES.map(([k, n]) => <button key={k} className={page === k ? 'on' : ''} disabled={NEED_P.has(k) && !p} title={k === 'deliver' && bad > 0 ? `成片体检有 ${bad} 项要看` : undefined} onClick={() => S().setPage(k)}>{n}{k === 'deliver' && bad > 0 ? ` ⚠${bad}` : ''}</button>)}</div>
        {p && <button className="ib" onClick={() => S().doUndo()} title="撤销 Ctrl+Z">↶</button>}
        {p && <button className="ib" onClick={() => S().doRedo()} title="重做">↷</button>}
        {!aiOpen && <button className="btn sm" onClick={() => useStore.setState({ aiOpen: true })}>AI 助手</button>}
      </div>
      <div className="body">
        <div className="main"><Page /></div>
        {aiOpen && p && <AiDock />}
      </div>
      <WfPanel />
      {toast && <div className={'toast' + (toast.err ? ' err' : '')}>{toast.text}</div>}
    </div>
  );
}

const early = new Map();
const sfxDone = new Set();
function ensureSfx(dir, n) { const k = dir + n; if (sfxDone.has(k)) return; sfxDone.add(k); api('sfx:make', dir, n).catch(() => sfxDone.delete(k)); }

/** 开工作流：页面都可以调 */
export async function startWorkflow(wf, inputs) {
  const st = S(); if (!st.dir) throw new Error('先打开或新建一个工程');
  await st.save();
  const snap = await api('workflow:start', st.dir, wf, inputs);
  const got = early.get(snap.id) || {};
  useStore.setState({ run: { ...snap, ...got, steps: wf.steps, results: got.results || {} } });
}
