// 端到端测试：真的启动墨剪窗口，建示例工程，逐页截图，导出一段 MP4，导入 lemo 场景。
// 用法：xvfb-run -a node scripts/e2e.mjs [输出目录] [lemo 场景文件夹]
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { _electron: electron } = require('playwright');
const OUT = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'mojian-e2e'));
const LEMO = process.argv[3];
await fs.rm(OUT, { recursive: true, force: true }); await fs.mkdir(OUT, { recursive: true });
const userData = path.join(OUT, 'userdata');

const app = await electron.launch({ executablePath: require('electron'), args: ['.', `--user-data-dir=${userData}`], cwd: path.resolve('.'), env: { ...process.env, MOJIAN_E2E: '1' } });
const errors = [];
const win = await app.firstWindow();
win.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
win.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await win.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
await win.waitForSelector('.brand', { timeout: 30000 });
const shot = async (name) => { await win.waitForTimeout(800); await win.screenshot({ path: path.join(OUT, name + '.png') }); console.log('截图', name); };
const st = (fn, arg) => win.evaluate(fn, arg);
await shot('01-home');

// 示例工程
const dir = path.join(OUT, 'sample');
await st(async (d) => { const r = await window.mojian.invoke('project:sample', d); window.__mj.store.getState().load(r); window.__mj.store.getState().setPage('board'); }, dir);
await shot('02-board');
for (const [pg, n] of [['edit', '03-edit'], ['color', '04-color'], ['audio', '05-audio'], ['deliver', '06-deliver'], ['flow', '07-flow'], ['settings', '08-settings']]) {
  await st((p) => window.__mj.store.getState().setPage(p), pg); await shot(n);
}
// 剪辑：选第 3 镜，播放头放中间，拖一下时间线
await st(() => { const s = window.__mj.store.getState(); s.setPage('edit'); const sh = s.p.shots[2]; s.setSel({ kind: 'shot', id: sh.id }); window.__mj.store.setState({ t: sh.t0 + 1 }); });
await shot('09-edit-sel');
// 编辑操作：改台词、分割、撤销
const before = await st(() => window.__mj.store.getState().p.duration);
await st(() => { const s = window.__mj.store.getState(); const l = s.p.lines[0]; s.edit({ op: 'updateLine', args: { id: l.id, patch: { text: l.text + '，这句加长了一些用来测试时长自动变化' } } }, '改台词'); });
const after = await st(() => window.__mj.store.getState().p.duration);
console.log('改台词后时长', before.toFixed(2), '→', after.toFixed(2));
if (!(after > before)) errors.push('改长台词后总时长没有变长');
await st(() => window.__mj.store.getState().doUndo());
const undone = await st(() => window.__mj.store.getState().p.duration);
if (Math.abs(undone - before) > 1e-6) errors.push('撤销后时长没有恢复');

// 导出：只导前 8 秒，720p
const exp = await st(async (d) => {
  const s = window.__mj.store.getState(); const p = structuredClone(s.p);
  let t = 0; p.shots = p.shots.filter((x) => { const keep = t < 8; t += x.dur; return keep; });
  const ids = new Set(p.shots.map((x) => x.id)); p.lines = p.lines.filter((l) => ids.has(l.shot)); p.texts = p.texts.filter((x) => ids.has(x.anchor)); p.sfx = p.sfx.filter((x) => ids.has(x.anchor));
  p.export = { ...p.export, height: 720 }; p.name = 'e2e';
  return window.mojian.invoke('export:start', d, p, { height: 720 });
}, dir);
console.log('导出', exp.out, exp.width + 'x' + exp.height, exp.dur.toFixed(2) + 's', (exp.size / 1e6).toFixed(2) + 'MB', '黑帧秒数', exp.blackSeconds, '响度', JSON.stringify(exp.loudness));
if (exp.blackSeconds > 1) errors.push('导出画面大量黑帧');

// 静帧（缩略图、AI 看画面用）
const still = await st((d) => window.mojian.invoke('render:still', d, window.__mj.store.getState().p, 3, 480), dir);
await fs.writeFile(path.join(OUT, '10-still.jpg'), Buffer.from(still.split(',')[1], 'base64'));

// lemo 场景
if (LEMO) {
  const d2 = path.join(OUT, 'lemo');
  const r = await st(async ([d, f]) => { try { const c = await window.mojian.invoke('project:create', d, 'lemo', {}); window.__mj.store.getState().load(c); const r = await window.mojian.invoke('lemo:import', d, c.project, f); window.__mj.store.getState().replace(r.project, '导入'); window.__mj.store.getState().setPage('edit'); return { shots: r.shots, lines: r.lines, dur: r.project.duration }; } catch (e) { return { error: e.message }; } }, [d2, LEMO]);
  if (r.error) { errors.push('lemo 导入失败：' + r.error); }
  console.log('lemo 导入', r);
  if (!r.error) {
  await st(() => window.__mj.store.setState({ t: 4 }));
  await shot('11-lemo-edit');
  const ex2 = await st(async (d) => { const p = structuredClone(window.__mj.store.getState().p); let t = 0; p.shots = p.shots.filter((x) => { const k = t < 6; t += x.dur; return k; }); const ids = new Set(p.shots.map((x) => x.id)); p.lines = p.lines.filter((l) => ids.has(l.shot)); p.music = []; p.name = 'lemo-e2e'; return window.mojian.invoke('export:start', d, p, { height: 540 }); }, d2);
  console.log('lemo 导出', ex2.out, ex2.dur.toFixed(2) + 's', '黑帧秒数', ex2.blackSeconds);
  if (ex2.blackSeconds > 1) errors.push('lemo 导出大量黑帧');
  }
}

// 工作流：「一句话生成宣传片」不配 AI 走规则版，自动回答每个等待
if (!process.env.SKIP_WF) {
  const d3 = path.join(OUT, 'wf');
  await st(async (d) => { const c = await window.mojian.invoke('project:create', d, '工作流测试', { template: 'whiteboard' }); window.__mj.store.getState().load(c); }, d3);
  await st(async (d) => {
    const info = window.__mj.store.getState().info; const wf = info.skills.find((s) => s.id === 'promo');
    await window.__mj.startWorkflow(wf, { need: '给一款记账 App 做 30 秒宣传片，突出语音记账', len: '30 秒', ratio: '16:9 横版', template: 'whiteboard' });
  }, d3);
  const answers = { choose: 0, review: { verdict: 'pass' }, confirm: true, health: true, proposal: true, error: '跳过', questions: { '产品或主角叫什么？': '小账本', '最想让观众记住的 1~3 个卖点？（用顿号隔开）': '语音记账、自动分类', '结尾希望观众做什么？例：下载 App、关注账号': '下载 App' }, fix: true };
  let shotTaken = false; let reviews = 0;
  for (let i = 0; i < 600; i++) {
    const run = await st(() => window.__mj.store.getState().run);
    if (i % 20 === 0) console.log('工作流', run?.state, run?.status?.join(' '), run?.waiting?.kind || '');
    if (['done', 'error', 'cancelled'].includes(run?.state)) { console.log('工作流结束', run.state, JSON.stringify(run.results), run.out); if (run.state !== 'done') errors.push('工作流没有完成：' + run.state); if (!run.out) errors.push('工作流完成后没有成片路径'); if (reviews < 2) errors.push('审片打回后没有回到审片'); break; }
    if (run?.waiting) {
      if (run.waiting.kind === 'review' && !shotTaken) { shotTaken = true; await shot('12-wf-review'); }
      if (run.waiting.kind === 'error') console.log('步骤出错，跳过：', run.waiting.payload.step, run.waiting.payload.error);
      if (run.waiting.kind === 'fix') { await shot('12b-wf-fix'); console.log('手动修改清单', JSON.stringify(run.waiting.payload.items), run.waiting.payload.done); }
      // 第一次审片带意见打回，走一遍规则版修改，第二次通过
      const a = run.waiting.kind === 'review' ? (reviews++ ? { verdict: 'pass' } : { verdict: 'fail', notes: ['整体节奏有点慢', '第 2 镜标题太长'] }) : answers[run.waiting.kind] ?? true;
      await st(([id, a]) => window.mojian.invoke('workflow:respond', id, a), [run.id, a]);
    }
    await win.waitForTimeout(500);
  }
  await st(() => window.__mj.store.getState().setPage('edit'));
  await shot('13-wf-result');
}

await st(() => window.__mj.store.getState().save());
await app.close();
const real = errors.filter((e) => !/Autofill|DevTools|Electron Security Warning/.test(e));
console.log(real.length ? '有错误：\n' + real.join('\n') : '没有界面错误');
process.exit(real.length ? 1 : 0);
