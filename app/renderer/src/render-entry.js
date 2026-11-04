// 导出窗口：主进程逐帧调用 seek(t)，然后截图
import { Player } from './player/stage.js';
import { normalize } from '../../core/project.js';

document.body.style.cssText = 'margin:0;background:#000;overflow:hidden';
let pl = null;
window.__mojianRender = {
  async load(project, base, w, h) {
    const host = document.createElement('div'); host.style.cssText = `position:fixed;left:0;top:0;width:${w}px;height:${h}px;overflow:hidden`;
    document.body.appendChild(host);
    pl = new Player(host, { mode: 'render', base });
    pl.setProject(normalize(project), base); pl.setSize(w, h);
    // 预热：所有代码场景先加载好
    const used = new Set(pl.p.shots.filter((s) => s.src?.kind === 'scene').map((s) => s.src.asset));
    const scenes = pl.p.assets.filter((a) => a.kind === 'scene' && used.has(a.id));
    await Promise.all(pl.slots.flatMap((slot) => scenes.map((a) => pl.scene(a, slot).loaded)));
    await document.fonts.ready;
    return true;
  },
  async seek(t) { await pl.frame(t, true); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return true; },
};
