// 界面状态：当前工程（唯一真相）、选择、播放头、撤销栈、自动保存
import { create } from 'zustand';
import { apply as applyOps, clone, normalize, withIds } from '../../core/project.js';
import { layout } from '../../core/timing.js';
import { api } from './api.js';

let saveTimer = null;
const UNDO_MAX = 200;

// 界面布局记在本机：各栏宽高、布局预设、主题。拿不到 localStorage 时用默认值
export const LAYOUT_DEF = { tlH: 300, propsW: 340, dockW: 360, boardSide: 440, railOpen: true, preset: 'default' };
export const PRESETS = { default: { tlH: 300, propsW: 340 }, preview: { tlH: 220, propsW: 300 }, timeline: { tlH: 460, propsW: 320 } };
const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v ? { ...d, ...JSON.parse(v) } : d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const uiPref = ls.get('mj-ui', { theme: 'dark', dock: null }); // dock：{ open, tab:'ai'|'wf' }，没存过时按有没有配 AI 决定开不开
// 旧的页面名都还能用：分镜 / 剪辑 / 调色 / 音频合进「精修」，设置收进抽屉
const MODES = { board: 'board', edit: 'edit', color: 'color', audio: 'audio' };

/** 两版工程之间改了哪些东西（镜头、台词、文字、音效、音乐的 id），用来让 AI 改过的片段闪一下 */
export function changedIds(a, b) {
  const out = new Set();
  for (const k of ['shots', 'lines', 'texts', 'sfx', 'music']) {
    const m = new Map((a?.[k] || []).map((x) => [x.id, JSON.stringify({ ...x, t0: 0 })]));
    for (const x of b?.[k] || []) if (m.get(x.id) !== JSON.stringify({ ...x, t0: 0 })) out.add(x.id);
  }
  return out;
}

export const useStore = create((set, get) => ({
  info: null, settings: null,
  dir: null, base: '', p: null, dirty: false, savedAt: null,
  page: 'home', mode: 'edit', sel: null, t: 0, playing: false,
  dock: uiPref.dock, settingsOpen: false, layout: ls.get('mj-layout', LAYOUT_DEF), theme: uiPref.theme, flash: null,
  undo: [], redo: [],
  toast: null, aiOpen: true, run: null, wait: null, exporting: null,
  compare: null, // 版本对比：{oid, project}
  annoMode: false,

  setPage(page) {
    if (page === 'settings') { set({ settingsOpen: true }); return; }
    if (MODES[page]) { set({ page: 'refine', mode: MODES[page], settingsOpen: false }); return; }
    set({ page: page === 'refine' || page === 'flow' || page === 'deliver' ? page : 'home', settingsOpen: false });
  },
  setMode: (mode) => set({ page: 'refine', mode }),
  setDock(dock) { set({ dock }); ls.set('mj-ui', { theme: get().theme, dock }); },
  setTheme(theme) { set({ theme }); ls.set('mj-ui', { theme, dock: get().dock }); },
  setLayout(patch) { const layout = { ...get().layout, ...patch }; set({ layout }); ls.set('mj-layout', layout); },
  setSel: (sel) => set({ sel }),
  setT: (t) => set({ t }),
  say(text, err = false) { set({ toast: { text, err, at: Date.now() } }); setTimeout(() => { if (get().toast?.text === text) set({ toast: null }); }, err ? 6000 : 3000); },

  load({ dir, project, base }) { const p = normalize(project); const f = p.shots[0]; set({ dir, base, p, undo: [], redo: [], dirty: false, sel: null, t: f && f.src.kind === 'card' ? Math.min(1.2, f.dur * 0.5) : 0, compare: null }); }, // 卡片第 0 帧还没入场，停在 1 秒左右看得到内容
  close() { set({ dir: null, p: null, page: 'home' }); },
  /** 打开工程后进精修；工作流跑完回来也是这里 */
  goRefine(mode) { set({ page: 'refine', ...(mode ? { mode } : {}) }); },

  /** 唯一的修改入口：一组操作 + 撤销快照 + 自动保存 */
  edit(ops, label = '修改', { silent = false, flash = /^AI/.test(label) } = {}) {
    const { p, undo } = get(); if (!p) return [];
    const before = clone(p); const next = clone(p);
    const list = (Array.isArray(ops) ? ops : [ops]).map((o) => ({ op: o.op, args: withIds(o.op, o.args) }));
    const out = applyOps(next, list);
    set({ p: next, undo: [...undo.slice(-UNDO_MAX), { label, p: before }], redo: [], dirty: true });
    if (flash) get().blink(changedIds(before, next));
    get().autosave();
    if (!silent && label) get().say(label);
    return out;
  },
  /** 被改过的片段在时间线和分镜墙上闪一下 */
  blink(ids) { if (!ids?.size) return; const at = Date.now(); set({ flash: { ids, at } }); setTimeout(() => { if (get().flash?.at === at) set({ flash: null }); }, 2600); },
  /** 直接改 p（拖动过程中的实时预览），不进撤销栈；结束时调用 commitLive */
  live(fn) { const { p } = get(); const next = clone(p); fn(next); layout(next); set({ p: next, dirty: true }); },
  beginLive() { set({ liveBase: clone(get().p) }); },
  commitLive(label) { const { liveBase, undo, p } = get(); if (!liveBase) return; if (JSON.stringify(liveBase) === JSON.stringify(p)) { set({ liveBase: null }); return; } set({ undo: [...undo.slice(-UNDO_MAX), { label, p: liveBase }], redo: [], liveBase: null, dirty: true }); get().autosave(); },
  doUndo() { const { undo, redo, p } = get(); if (!undo.length) return; const u = undo[undo.length - 1]; set({ p: u.p, undo: undo.slice(0, -1), redo: [...redo, { label: u.label, p }], dirty: true }); get().autosave(); get().say('撤销：' + u.label); },
  doRedo() { const { undo, redo, p } = get(); if (!redo.length) return; const r = redo[redo.length - 1]; set({ p: r.p, redo: redo.slice(0, -1), undo: [...undo, { label: r.label, p }], dirty: true }); get().autosave(); get().say('重做：' + r.label); },
  replace(p, label) { const { undo } = get(); set({ undo: [...undo, { label, p: get().p }], p: normalize(p), dirty: true }); get().autosave(); },

  autosave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => get().save(), 600); },
  async save() { const { dir, p } = get(); if (!dir || !p) return; try { await api('project:save', dir, p); set({ dirty: false, savedAt: Date.now() }); } catch (e) { get().say('保存失败：' + e.message, true); } },
}));

export const S = () => useStore.getState();
