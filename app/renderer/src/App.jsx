// 主界面：顶栏（四个阶段）+ 页面 + 右侧停靠栏（AI 助手 / 工作流）+ 设置抽屉
import React, { useEffect } from 'react';
import { useStore, S } from './store.js';
import { api, on, serveRpc } from './api.js';
import { health, healthBad } from '../../core/health.js';
import Dock from './components/Dock.jsx';
import Icon from './components/Icon.jsx';
import { Split } from './components/ui.jsx';
import { deleteSel } from './components/Timeline.jsx';
import Home from './pages/Home.jsx';
import Flow from './pages/Flow.jsx';
import Refine from './pages/Refine.jsx';
import Deliver from './pages/Deliver.jsx';
import Settings from './pages/Settings.jsx';

const STAGES = [['home', '开始'], ['refine', '精修'], ['flow', '工作流'], ['deliver', '交付']];
const NEED_P = new Set(['refine', 'deliver']);
const MODE_KEYS = { 1: 'board', 2: 'edit', 3: 'color', 4: 'audio' };

export default function App() {
  const page = useStore((s) => s.page); const p = useStore((s) => s.p); const toast = useStore((s) => s.toast);
  const dock = useStore((s) => s.dock); const dirty = useStore((s) => s.dirty); const savedAt = useStore((s) => s.savedAt);
  const run = useStore((s) => s.run); const theme = useStore((s) => s.theme); const settingsOpen = useStore((s) => s.settingsOpen); const dockW = useStore((s) => s.layout.dockW);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  // 工作流停下来等你时，右边自动切到「工作流」
  useEffect(() => { if (run?.waiting) S().setDock({ open: true, tab: 'wf' }); }, [run?.waiting?.kind, run?.id]);

  useEffect(() => {
    api('app:info').then((info) => useStore.setState({ info })).catch((e) => S().say('启动失败：' + e.message, true));
    api('settings:get').then((settings) => { useStore.setState({ settings }); if (!S().dock) useStore.setState({ dock: { open: !!settings?.ai?.providers?.find((x) => x.id === settings.ai.active), tab: 'ai' } }); }); // 没配 AI 时助手默认收起，把地方让给画面
    const offs = [
      serveRpc({
        getProject: () => S().p,
        applyOps: ({ ops, label, silent }) => { S().edit(ops, label || '工作流', { silent, flash: true }); return S().p; },
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
      if (e.key === 'Escape' && st.settingsOpen) { useStore.setState({ settingsOpen: false }); return; }
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? st.doRedo() : st.doUndo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); st.doRedo(); return; }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); st.save().then(() => st.say('已保存')); return; }
      if (mod && e.key === ',') { e.preventDefault(); useStore.setState({ settingsOpen: true }); return; }
      if (!st.p) return;
      if (st.page === 'refine' && !mod && !e.altKey && MODE_KEYS[e.key]) { st.setMode(MODE_KEYS[e.key]); return; }
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
  const dir = useStore((s) => s.dir);
  useEffect(() => { if (!p || !dir) return; for (const n of new Set(p.sfx.map((x) => x.synth).filter(Boolean))) ensureSfx(dir, n); }, [p?.sfx, dir]);

  const bad = p ? healthBad(health(p)) : 0;
  const Page = { home: Home, refine: Refine, flow: Flow, deliver: Deliver }[page] || Home;
  const showDock = p && dock?.open && page !== 'home';
  const waiting = !!run?.waiting; const running = run && !['done', 'error', 'cancelled'].includes(run.state);
  return (
    <div className="app">
      <div className="top">
        <div className="brand">
          <span className="seal">墨</span><span className="nm">墨剪</span>
          {p && <div className="proj" title={dirty ? '有改动，马上自动保存' : '已保存'}><span className={'dot' + (dirty ? ' dirty' : '')} /><b>{p.name}</b></div>}
        </div>
        <div className="stages">{STAGES.map(([k, n]) => (
          <button key={k} className={page === k ? 'on' : ''} disabled={NEED_P.has(k) && !p} onClick={() => S().setPage(k)}
            title={k === 'deliver' && bad > 0 ? `成片体检有 ${bad} 项要看` : k === 'flow' && waiting ? '工作流在等你' : k === 'refine' ? '分镜 · 剪辑 · 调色 · 音频' : undefined}>
            {n}{k === 'flow' && (waiting || running) && <i className="pip" style={running && !waiting ? { background: 'var(--acc)' } : null} />}{k === 'deliver' && bad > 0 && <span className="cnt">{bad}</span>}
          </button>))}
        </div>
        <div className="tools">
          {p && <button className="ib" onClick={() => S().doUndo()} title="撤销 Ctrl+Z"><Icon n="undo" /></button>}
          {p && <button className="ib" onClick={() => S().doRedo()} title="重做 Ctrl+Shift+Z"><Icon n="redo" /></button>}
          <button className="ib" onClick={() => S().setTheme(theme === 'light' ? 'dark' : 'light')} title={theme === 'light' ? '换成深色' : '换成浅色'}><Icon n={theme === 'light' ? 'moon' : 'sun'} /></button>
          <button className="ib" onClick={() => useStore.setState({ settingsOpen: true })} title="设置 Ctrl+,"><Icon n="gear" /></button>
          {p && <button className={'ib' + (showDock ? ' on' : '')} onClick={() => S().setDock({ ...(dock || { tab: 'ai' }), open: !dock?.open })} title={showDock ? '收起 AI 助手' : '打开 AI 助手'}><Icon n="spark" />{!showDock && 'AI'}</button>}
        </div>
      </div>
      <div className="body">
        <div className="main"><Page /></div>
        {showDock && <><Split dir="v" k="dockW" sign={-1} min={300} max={620} /><div className="dock" style={{ width: dockW }}><Dock /></div></>}
      </div>
      {settingsOpen && <div className="drawer-bg" onMouseDown={(e) => e.target === e.currentTarget && useStore.setState({ settingsOpen: false })}><div className="drawer"><Settings /></div></div>}
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
