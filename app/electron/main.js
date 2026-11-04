// 墨剪主进程：窗口、协议、IPC、服务（配音 / 听写 / AI / 导出 / 工作流 / 版本）
import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron';
import fs from 'node:fs/promises';
import { existsSync, watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerScheme, handle, allow, ORIGIN, fsUrl } from './protocol.js';
import * as settings from './settings.js';
import * as versions from './versions.js';
import { exportFilm, still, openRenderer, CODECS } from './export.js';
import { importLemo } from './lemo.js';
import { makeSteps } from './steps.js';
import { createProject, openProject, saveProject, importAsset, cachedPeaks, recent, addRecent, abs, rel } from '../core/node/store.js';
import { setBinaries, probe } from '../core/node/ffmpeg.js';
import { synthLine, importRecording, PROVIDERS as TTS } from '../core/node/tts.js';
import { transcribe, checkLine, localAvailable } from '../core/node/asr.js';
import { makeMusic, makeSfx, MOOD_NAMES, SFX } from '../core/node/synth.js';
import { mixAudio } from '../core/node/mix.js';
import { runAgent } from '../core/ai/agent.js';
import { chat, ping, PRESETS } from '../core/ai/providers.js';
import { detect as detectCli, runCli, CLIS } from '../core/ai/cli.js';
import { Budget } from '../core/ai/budget.js';
import { Run } from '../core/workflow/engine.js';
import { SKILLS } from '../core/workflow/skills.js';
import { normalize, emptyProject, apply, uid, newShot } from '../core/project.js';
import { toSRT, toFCPXML, toEDL, toScript } from '../core/interchange.js';
import { layout, snap } from '../core/timing.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const DIST = path.join(ROOT, 'dist');
const RES = path.join(ROOT, 'resources').replace('app.asar', 'app.asar.unpacked');

registerScheme();
let win = null;
const budget = new Budget(path.join(app.getPath('userData'), 'usage.json'));
const send = (ch, data) => win && !win.isDestroyed() && win.webContents.send(ch, data);

// ---------------- 渲染进程 RPC：工作流通过它读写当前工程（走界面的撤销栈） ----------------
const pending = new Map(); let rpcSeq = 0;
function rpc(method, args) {
  return new Promise((resolve, reject) => {
    const id = ++rpcSeq; pending.set(id, { resolve, reject });
    send('rpc', { id, method, args });
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('界面没有响应：' + method)); } }, 120000);
  });
}
ipcMain.on('rpc:reply', (_e, { id, result, error }) => { const p = pending.get(id); if (!p) return; pending.delete(id); error ? p.reject(new Error(error)) : p.resolve(result); });

// ---------------- 服务 ----------------
function aiCfg(id) { const c = settings.providerCfg(id); if (!c) return null; const pre = PRESETS.find((p) => p.id === c.preset); return { ...c, proto: c.proto || pre?.proto, baseUrl: c.baseUrl || pre?.baseUrl, model: c.model || pre?.model }; }
const meterFor = (c) => budget.meter(c.id, { priceIn: +c.priceIn || 0, priceOut: +c.priceOut || 0, limit: +c.limit || 0 });

async function aiAgent({ dir, project, prompt, context, history, system, onEvent, signal }) {
  const c = aiCfg();
  if (!c) throw new Error('还没配 AI。到「设置 → AI」加一个：API Key、Coding Plan、CLI 登录或本地 Ollama 都行。');
  if (c.proto === 'cli') {
    await fs.rm(path.join(dir, '.mojian/proposal.json'), { force: true });
    await saveProject(dir, project);
    const r = await runCli(c.cli, { projectDir: dir, prompt: `${system ? system + '\n\n' : ''}${prompt}${context ? '\n上下文：' + JSON.stringify(context) : ''}`, onEvent, signal });
    let prop = { ops: [], changes: [] }; try { prop = JSON.parse(await fs.readFile(path.join(dir, '.mojian/proposal.json'), 'utf8')); } catch {}
    await fs.rm(path.join(dir, '.mojian/proposal.json'), { force: true });
    return { text: r.text, ops: prop.ops, changes: prop.changes || [], usage: {} };
  }
  return runAgent({ cfg: c, project, prompt, context, history, system, onEvent, signal, budget: meterFor(c) });
}
async function aiJson(prompt, { dir } = {}) {
  const c = aiCfg(); if (!c) return null;
  let text;
  if (c.proto === 'cli') text = (await runCli(c.cli, { projectDir: dir || app.getPath('temp'), prompt: prompt + '\n只输出 JSON，不要别的文字。' })).text;
  else { const m = meterFor(c); m.check(); const r = await chat(c, { messages: [{ role: 'system', content: '你只输出 JSON，不要 Markdown 代码块，不要解释。' }, { role: 'user', content: prompt }], maxTokens: 6000 }); m.add(r.usage); text = r.text; }
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  try { return JSON.parse(text.slice(s, e + 1)); } catch { return null; }
}

async function ttsLine(dir, p, l) {
  const sp = { provider: settings.load().tts.default || 'edge', ...(p.speakers?.[l.who] || p.speakers?.旁白 || {}) };
  const opts = { provider: sp.provider, voice: sp.voice, speed: l.voice?.speed || sp.speed || 1, emotion: l.voice?.emotion, pitch: sp.pitch || 0, text: l.say || l.text };
  const n = (l.take || 0) + 1;
  const out = path.join(dir, 'audio/voice', `${l.id}.${n}.wav`);
  try { const r = await synthLine(opts, settings.ttsCfg(opts.provider), out); return { audio: rel(dir, out), dur: r.dur, take: n, provider: opts.provider }; }
  catch (e) {
    if (opts.provider !== 'system') { // 在线接口失败时退回系统语音，保证能出声
      try { const r = await synthLine({ ...opts, provider: 'system', voice: '' }, {}, out); return { audio: rel(dir, out), dur: r.dur, take: n, provider: 'system', fallback: e.message }; } catch {}
    }
    throw e;
  }
}

async function musicBed(dir, p, { mood, bpm, gain = -14 }) {
  const dur = Math.ceil(p.duration + 2);
  const f = path.join(dir, 'audio/music', `bed_${mood}_${bpm}_${dur}.wav`);
  if (!existsSync(f)) await fs.writeFile(f, makeMusic({ mood, bpm, dur, seed: dur }));
  const asset = { id: uid('a'), name: `配乐 · ${mood} ${bpm} BPM`, kind: 'audio', path: rel(dir, f), dur };
  return { asset, clip: { id: uid('m'), asset: asset.id, name: asset.name, t0: 0, in: 0, dur: p.duration, gain, fadeIn: 0.8, fadeOut: 2, duck: true, bed: true } };
}

async function capturePage(dir, url) {
  const w = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { offscreen: true, javascript: true } });
  try {
    await Promise.race([w.loadURL(url), new Promise((_, r) => setTimeout(() => r(new Error('打开网页超时')), 30000))]);
    await new Promise((r) => setTimeout(r, 1500));
    const info = await w.webContents.executeJavaScript(`({title: document.title, desc: (document.querySelector('meta[name=description]')||{}).content||'', text: [...document.querySelectorAll('h1,h2,h3,p,li')].map(e=>e.innerText.trim()).filter(t=>t.length>3).join('\\n').slice(0,8000), height: document.documentElement.scrollHeight})`);
    const assets = [];
    for (let i = 0; i < 6 && i * 800 < info.height; i++) {
      await w.webContents.executeJavaScript(`window.scrollTo(0, ${i * 800})`); await new Promise((r) => setTimeout(r, 500));
      const img = await w.webContents.capturePage(); const f = path.join(dir, 'media', `page_${Date.now().toString(36)}_${i}.jpg`);
      await fs.writeFile(f, img.toJPEG(88)); const a = await importAsset(dir, f, { copy: false }); assets.push(a);
    }
    await rpc('applyOps', { ops: assets.map((a) => ({ op: 'addAsset', args: { asset: a } })), label: '网页截图' });
    return { title: info.title, text: `${info.desc}\n${info.text}`, assets: assets.map((a) => a.id) };
  } finally { w.destroy(); }
}

async function makeShorts(dir, highlights, transcript, asset) {
  const p = await rpc('getProject'); const a = asset || p.assets.find((x) => x.kind === 'video'); if (!a) throw new Error('没有长视频素材');
  const out = [];
  for (const [i, h] of highlights.entries()) {
    const d = path.join(dir, 'shorts', String(i + 1).padStart(2, '0'));
    const q = existsSync(path.join(d, 'project.json')) ? await openProject(d) : await createProject(d, `${p.name} 短视频 ${i + 1}`, { width: 1080, height: 1920, template: p.template });
    q.width = 1080; q.height = 1920; q.shots = []; q.lines = []; q.texts = []; q.assets = [{ ...a, path: abs(dir, a.path) }];
    const s = newShot({ title: h.title || `高光 ${i + 1}`, src: { kind: 'media', asset: a.id, in: h.t0, fit: 'cover' }, lock: true, dur: snap(h.t1 - h.t0) }); q.shots.push(s);
    for (const sg of (transcript?.segments || []).filter((x) => x.t0 >= h.t0 && x.t1 <= h.t1 + 0.5)) q.lines.push({ id: uid('l'), shot: s.id, who: '字幕', text: sg.text, off: snap(sg.t0 - h.t0), dur: snap(sg.t1 - sg.t0), soff: snap(sg.t0 - h.t0), sdur: snap(sg.t1 - sg.t0), subOnly: true, pin: true, voice: {}, status: 'ok' });
    q.texts.push({ id: uid('t'), anchor: s.id, off: 0, dur: Math.min(5, s.dur), text: h.title || '', style: 'title', x: 0.5, y: 0.14, anim: 'pop' });
    layout(q); await saveProject(d, q); out.push(d);
  }
  return out;
}

const runs = new Map();
function workflowServices(dir, signal) {
  return {
    getProject: () => rpc('getProject'),
    applyOps: (ops, label) => rpc('applyOps', { ops, label }),
    focus: (page) => rpc('focus', { page }).catch(() => {}),
    ai: {
      available: () => !!aiCfg(),
      agent: async ({ prompt, project, system }) => aiAgent({ dir, project, prompt, system, signal, onEvent: (e) => send('ai:event', { ...e, from: 'workflow' }) }),
      json: (prompt) => aiJson(prompt, { dir }),
    },
    tts: {
      all: async (onP) => {
        const p = await rpc('getProject'); const todo = p.lines.filter((l) => !l.subOnly && (!l.audio || l.status === 'stale'));
        let done = 0, failed = 0, error = '';
        for (const l of todo) {
          if (signal?.aborted) break;
          try { const r = await ttsLine(dir, p, l); await rpc('applyOps', { ops: [{ op: 'setLineAudio', args: { id: l.id, audio: r.audio, dur: r.dur } }, { op: 'updateLine', args: { id: l.id, patch: { take: r.take, provider: r.provider } } }], label: '配音', silent: true }); done++; }
          catch (e) { failed++; error = e.message; }
          onP?.({ text: `配音 ${done + failed} / ${todo.length}`, pct: (done + failed) / todo.length });
        }
        return { done, failed, error };
      },
    },
    asr: {
      available: async () => { const c = settings.asrCfg(); return c.engine === 'api' ? !!c.key : localAvailable(c); },
      transcribe: (file) => transcribe(file, { cfg: settings.asrCfg(), lang: 'zh' }),
      checkAll: async () => {
        const p = await rpc('getProject'); let pass = 0, fail = 0; const ops = [];
        for (const l of p.lines.filter((x) => x.audio && !x.subOnly)) { const r = await checkLine(abs(dir, l.audio), l.say || l.text, { cfg: settings.asrCfg(), lang: 'zh' }); r.pass ? pass++ : fail++; ops.push({ op: 'updateLine', args: { id: l.id, patch: { asr: { pass: r.pass, score: r.score, heard: r.heard } } } }); }
        await rpc('applyOps', { ops, label: '听写校验', silent: true }); return { pass, fail };
      },
      timeline: async () => { const p = await rpc('getProject'); const f = path.join(dir, '.mojian/cache/asr_mix.wav'); await mixAudio(dir, { ...p, music: [], sfx: [] }, f); return transcribe(f, { cfg: settings.asrCfg(), lang: 'zh' }); },
    },
    music: { bed: async (o) => { const p = await rpc('getProject'); const { asset, clip } = await musicBed(dir, p, o); await rpc('applyOps', { ops: [{ op: 'addAsset', args: { asset } }, ...p.music.filter((m) => m.bed).map((m) => ({ op: 'removeMusic', args: { id: m.id } })), { op: 'addMusic', args: clip }], label: '配乐' }); return o; } },
    export: async (onP) => { const p = await rpc('getProject'); await saveProject(dir, p); return exportFilm({ dir, project: p, onProgress: (d) => { onP?.(d); send('export:progress', d); }, signal }); },
    capture: (url) => capturePage(dir, url),
    importFiles: async (files) => { const as = []; for (const f of files) as.push(await importAsset(dir, f)); await rpc('applyOps', { ops: as.map((a) => ({ op: 'addAsset', args: { asset: a } })), label: '导入素材' }); return as; },
    frameBitmap: async (t) => { const p = await rpc('getProject'); const r = await openRenderer({ width: 320, height: Math.round(320 * p.height / p.width / 2) * 2, project: p, dir }); try { return (await r.frame(t)).toBitmap(); } finally { r.close(); } },
    shorts: { make: (h, tr, a) => makeShorts(dir, h, tr, a), export: async (d, onP) => { const q = await openProject(d); return exportFilm({ dir: d, project: q, onProgress: onP, signal }); } },
  };
}

// ---------------- IPC ----------------
function h(ch, fn) { ipcMain.handle(ch, async (_e, ...a) => { try { return { ok: true, data: await fn(...a) } } catch (e) { console.error(ch, e); return { ok: false, error: e.message || String(e) }; } }); }

function registerIpc() {
  const appDir = app.getPath('userData');
  h('app:info', () => ({ version: app.getVersion(), platform: process.platform, userData: appDir, resources: fsUrl(RES), codecs: Object.fromEntries(Object.entries(CODECS).map(([k, v]) => [k, v.label])), moods: MOOD_NAMES, sfx: SFX, tts: Object.fromEntries(Object.entries(TTS).map(([k, v]) => [k, { name: v.name, voices: v.voices, needsKey: v.needsKey }])), presets: PRESETS, clis: CLIS, skills: SKILLS }));
  h('dialog:dir', async (o = {}) => { const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], ...o }); return r.canceled ? null : r.filePaths[0]; });
  h('dialog:files', async (o = {}) => { const r = await dialog.showOpenDialog(win, { properties: ['openFile', ...(o.multi ? ['multiSelections'] : [])], filters: o.filters }); return r.canceled ? [] : r.filePaths; });
  h('dialog:save', async (o = {}) => { const r = await dialog.showSaveDialog(win, o); return r.canceled ? null : r.filePath; });
  h('shell:open', (f) => shell.openPath(f));
  h('shell:show', (f) => shell.showItemInFolder(f));
  h('shell:url', (u) => /^https?:/.test(u) && shell.openExternal(u));

  h('project:recent', () => recent(appDir));
  h('project:create', async (dir, name, opts) => { const p = await createProject(dir, name, opts); allow(dir); await addRecent(appDir, dir, p.name); watchProposal(dir); return { dir, project: p, base: fsUrl(dir) + '/' }; });
  h('project:open', async (dir) => { const p = await openProject(dir); allow(dir); for (const a of p.assets) if (a.path && path.isAbsolute(a.path)) allow(path.dirname(a.path)); await addRecent(appDir, dir, p.name); watchProposal(dir); return { dir, project: p, base: fsUrl(dir) + '/' }; });
  h('project:save', (dir, p) => saveProject(dir, p));
  h('project:sample', async (dir) => { const p = await createSample(dir); allow(dir); await addRecent(appDir, dir, p.name); return { dir, project: p, base: fsUrl(dir) + '/' }; });

  h('asset:import', async (dir, files) => { const out = []; for (const f of files) { const a = await importAsset(dir, f); if (path.isAbsolute(a.path)) allow(path.dirname(a.path)); out.push(a); } return out; });
  h('asset:peaks', (dir, file) => cachedPeaks(dir, abs(dir, file)));
  h('asset:probe', (f) => probe(f));
  h('lemo:import', async (dir, p, folder) => { allow(folder); const q = normalize(p); const r = await importLemo(dir, q, folder, { onProgress: (x) => send('lemo:progress', x) }); return { project: q, ...r }; });

  h('tts:line', async (dir, p, lineId) => { const l = p.lines.find((x) => x.id === lineId); if (!l) throw new Error('没有这句台词'); return ttsLine(dir, p, l); });
  h('tts:preview', async (opts) => { const f = path.join(app.getPath('temp'), `mj_prev_${Date.now()}.wav`); await synthLine(opts, settings.ttsCfg(opts.provider), f); allow(path.dirname(f)); return fsUrl(f); });
  h('tts:import', async (dir, lineId, file) => { const out = path.join(dir, 'audio/voice', `${lineId}.rec${Date.now().toString(36)}.wav`); const r = await importRecording(file, out); return { audio: rel(dir, out), dur: r.dur }; });
  h('tts:importBatch', async (dir, p, files) => { // 按段号自动对应：line_03.wav → 第 3 句
    const out = []; for (const f of files) { const m = path.basename(f).match(/(\d+)/); const l = m && p.lines[+m[1] - 1]; if (!l) continue; const o = path.join(dir, 'audio/voice', `${l.id}.rec${Date.now().toString(36)}.wav`); const r = await importRecording(f, o); out.push({ id: l.id, audio: rel(dir, o), dur: r.dur }); } return out; });
  h('asr:available', async () => { const c = settings.asrCfg(); return c.engine === 'api' ? !!c.key : localAvailable(c); });
  h('asr:check', async (dir, p, lineId) => { const l = p.lines.find((x) => x.id === lineId); return checkLine(abs(dir, l.audio), l.say || l.text, { cfg: settings.asrCfg(), lang: 'zh' }); });
  h('asr:transcribe', async (dir, file) => transcribe(abs(dir, file), { cfg: settings.asrCfg(), lang: 'zh' }));
  h('music:bed', async (dir, p, o) => musicBed(dir, p, o));
  h('sfx:make', async (dir, name) => { const f = path.join(dir, 'audio/sfx', `${name}.wav`); if (!existsSync(f)) await fs.writeFile(f, makeSfx(name)); return rel(dir, f); });

  h('settings:get', () => settings.publicSettings());
  h('settings:set', (patch) => { const r = settings.update(patch); const s = settings.load(); setBinaries({ ffmpeg: s.ffmpeg.path || undefined, ffprobe: s.ffmpeg.ffprobe || undefined }); return r; });
  h('ai:test', async (id) => { const c = aiCfg(id); if (!c) throw new Error('没有这个配置'); if (c.proto === 'cli') { const d = await detectCli(); if (!d[c.cli]?.path) throw new Error(`没找到 ${CLIS[c.cli].name}。安装：${CLIS[c.cli].install}`); return { ok: true, text: `找到 ${d[c.cli].path}` }; } return ping(c); });
  h('ai:cli', () => detectCli());
  h('ai:usage', () => budget.summary());
  const aiRuns = new Map();
  h('ai:run', async (reqId, dir, p, prompt, context, hist) => {
    const ac = new AbortController(); aiRuns.set(reqId, ac);
    try { return await aiAgent({ dir, project: normalize(p), prompt, context, history: hist, signal: ac.signal, onEvent: (e) => send('ai:event', { ...e, reqId }) }); }
    finally { aiRuns.delete(reqId); }
  });
  h('ai:cancel', (reqId) => aiRuns.get(reqId)?.abort());
  h('ai:frame', async (dir, p, t) => 'data:image/jpeg;base64,' + (await still({ dir, project: normalize(p), t, width: 960 })).toString('base64'));

  const exports = new Map();
  h('export:start', async (dir, p, opts) => {
    const ac = new AbortController(); exports.set(dir, ac);
    const q = normalize(p);
    if (q.musicBed?.pending) { const { asset, clip } = await musicBed(dir, q, q.musicBed); q.assets.push(asset); q.music = q.music.filter((m) => !m.bed); q.music.push(clip); q.musicBed.pending = false; }
    try { return await exportFilm({ dir, project: q, opts, signal: ac.signal, onProgress: (d) => send('export:progress', d) }); } finally { exports.delete(dir); }
  });
  h('export:cancel', (dir) => exports.get(dir)?.abort());
  h('export:interchange', async (dir, p, kind) => {
    const q = normalize(p); const base = path.join(dir, 'out', q.name.replace(/[\\/:*?"<>|]/g, '_'));
    await fs.mkdir(path.join(dir, 'out'), { recursive: true });
    const map = { srt: ['.srt', toSRT(q)], fcpxml: ['.fcpxml', toFCPXML(q, { renderedVideo: base + '.mp4', assetPath: (a) => abs(dir, a.path) })], edl: ['.edl', toEDL(q)], script: ['_录音稿.txt', toScript(q)] };
    const [ext, text] = map[kind]; await fs.writeFile(base + ext, text); return base + ext;
  });
  h('render:still', async (dir, p, t, width) => 'data:image/jpeg;base64,' + (await still({ dir, project: normalize(p), t, width })).toString('base64'));

  h('version:commit', (dir, msg) => versions.commit(dir, msg));
  h('version:list', (dir) => versions.list(dir));
  h('version:read', (dir, oid) => versions.read(dir, oid).then(normalize));

  h('workflow:start', async (dir, wf, inputs) => {
    const ac = new AbortController();
    const run = new Run(wf, makeSteps(), { dir, inputs, svc: workflowServices(dir, ac.signal) }, { onEvent: (e) => send('workflow:event', { ...e, snapshot: runs.get(run.id)?.run.snapshot() }) });
    runs.set(run.id, { run, ac });
    run.start().then((r) => fs.writeFile(path.join(dir, '.mojian', `${run.id}.json`), JSON.stringify({ wf: wf.id, inputs, ...r }, null, 1)).catch(() => {}));
    return run.snapshot();
  });
  h('workflow:respond', (runId, answer) => runs.get(runId)?.run.respond(answer));
  h('workflow:cancel', (runId) => { const r = runs.get(runId); r?.ac.abort(); r?.run.cancel(); });
  h('workflow:snapshot', (runId) => runs.get(runId)?.run.snapshot());
}

// 外部 CLI 写的修改建议
const watched = new Set();
function watchProposal(dir) {
  if (watched.has(dir)) return; watched.add(dir);
  const d = path.join(dir, '.mojian'); let t = null;
  try { watch(d, (_ev, f) => { if (f !== 'proposal.json') return; clearTimeout(t); t = setTimeout(async () => { try { const j = JSON.parse(await fs.readFile(path.join(d, f), 'utf8')); send('proposal', { dir, ...j }); } catch {} }, 300); }); } catch {}
}

/** 示例工程：「先问我」宣传片的前几镜，打开就能看、能改、能导出 */
async function createSample(dir) {
  const p = await createProject(dir, '示例 · 先问我宣传片', { template: 'dark-keynote' });
  const sb = JSON.parse(await fs.readFile(path.join(RES, 'sample', 'storyboard.json'), 'utf8'));
  const { makeContext, callTool } = await import('../core/ai/tools.js');
  const c = makeContext(p); await callTool(c, 'storyboard_write', sb);
  const q = c.p; q.name = '示例 · 先问我宣传片'; q.musicBed = { mood: 'tech', bpm: 118, gain: -14, pending: true };
  await saveProject(dir, q); return q;
}

app.whenReady().then(async () => {
  await budget.load();
  handle(DIST); allow(RES); allow(app.getPath('temp'));
  const s = settings.load(); setBinaries({ ffmpeg: s.ffmpeg.path || undefined, ffprobe: s.ffmpeg.ffprobe || undefined });
  if (s.lemo?.path) allow(s.lemo.path);
  registerIpc();
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({ width: 1600, height: 1000, minWidth: 1100, minHeight: 700, backgroundColor: '#17140f', title: '墨剪', show: !process.env.MOJIAN_HIDDEN, webPreferences: { preload: path.join(HERE, 'preload.cjs'), contextIsolation: true, sandbox: false, backgroundThrottling: false } });
  win.loadURL(process.env.ELECTRON_DEV_URL || `${ORIGIN}/app/index.html`);
  if (process.env.MOJIAN_DEVTOOLS) win.webContents.openDevTools();
  globalThis.__mojianWin = win;
});
app.on('window-all-closed', () => app.quit());
export { win, rpc };
