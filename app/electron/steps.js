// 工作流步骤的实现。ctx.svc 由 main.js 提供（读写当前工程、AI、配音、导出等）。
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { GENERATE_SYSTEM } from '../core/ai/agent.js';
import { offlineStoryboard, OFFLINE_TREATMENTS, parseNeed, suggestTemplate } from '../core/offline.js';
import { templateById } from '../core/templates.js';
import { health } from '../core/health.js';
import { withIds, uid, newShot } from '../core/project.js';
import { makeContext, callTool } from '../core/ai/tools.js';
import { findCuts } from '../core/node/asr.js';
import { detectBeats, sceneCuts, colorStats, matchGrade } from '../core/node/analyze.js';
import { snap } from '../core/timing.js';
import { abs } from '../core/node/store.js';

const brief = (ctx) => {
  const i = ctx.inputs || {};
  return [i.need && `需求：${i.need}`, i.len && `时长：${i.len}`, i.ratio && `画幅：${i.ratio}`, i.refs && `参考：${i.refs}`, i.doc && `内容：${String(i.doc).slice(0, 6000)}`, i.topic && `你的内容：${i.topic}`, i.points && `卖点：${i.points}`,
    ctx.vars.answers && `补充回答：${JSON.stringify(ctx.vars.answers)}`, ctx.vars.treatment && `选定结构：${JSON.stringify(ctx.vars.treatment)}`,
    ctx.vars.page && `网页：${ctx.vars.page.title}\n${String(ctx.vars.page.text).slice(0, 4000)}\n可用截图素材 id：${(ctx.vars.page.assets || []).join(', ')}`,
    ctx.vars.transcript && `参考视频听写：${String(ctx.vars.transcript.text).slice(0, 4000)}`, ctx.vars.cuts && Array.isArray(ctx.vars.cuts) && `参考视频切点（秒）：${ctx.vars.cuts.slice(0, 80).map((x) => x.toFixed?.(1) ?? x).join(', ')}`].filter(Boolean).join('\n');
};
const lenSec = (s) => { const m = String(s || '').match(/(\d+)\s*(分钟|秒)/); return m ? (m[2] === '分钟' ? +m[1] * 60 : +m[1]) : 60; };

/** 用模型或规则版把分镜写进工程 */
async function writeStoryboard(ctx, sb, label) {
  const p = await ctx.svc.getProject();
  const c = makeContext(p);
  await callTool(c, 'storyboard_write', sb);
  await ctx.svc.applyOps(c.ops, label);
  return { summary: `写出 ${sb.shots.length} 个镜头`, shots: sb.shots.length };
}

export function makeSteps() {
  const S = {
    brief: async (ctx) => ({ summary: brief(ctx).slice(0, 200) }),
    'human.confirm': async (ctx, step, run) => run.ask('confirm', { text: step.desc || step.name }),

    'ai.questions': async (ctx, step, run) => {
      if (!ctx.svc.ai.available()) return { summary: '没配 AI，跳过提问' };
      const q = await ctx.svc.ai.json(`${brief(ctx)}\n\n你是导演。在动手之前，列出你必须问清楚的问题（最多 5 个，事实、必须出现的名字和产品、口吻、是否有自己的素材）。只输出 JSON：{"questions":["..."]}。如果需求已经足够清楚，输出 {"questions":[]}。`);
      const qs = (q?.questions || []).slice(0, 5);
      if (!qs.length) return { summary: '需求已经清楚，不用问' };
      const answers = await run.ask('questions', { questions: qs });
      ctx.vars.answers = answers; return { summary: `问了 ${qs.length} 个问题` };
    },
    'ai.treatment': async (ctx, step, run) => {
      let options;
      if (ctx.svc.ai.available()) { const r = await ctx.svc.ai.json(`${brief(ctx)}\n\n给出三个不同的结构候选。只输出 JSON：{"options":[{"name":"结构名","why":"为什么适合","beats":["第一段做什么", "..."]}]}`); options = r?.options; }
      if (!options?.length) options = OFFLINE_TREATMENTS(ctx.inputs?.need || ctx.inputs?.points || ctx.vars.page?.title || '');
      const i = await run.ask('choose', { title: '选一个结构', options });
      return options[typeof i === 'number' ? i : 0];
    },
    'ai.outline': async (ctx) => {
      if (ctx.svc.ai.available()) { const r = await ctx.svc.ai.json(`${brief(ctx)}\n\n把内容拆成讲解视频的段落，每段一个知识点和一个比喻。只输出 JSON：{"name":"讲解结构","beats":["..."]}`); if (r?.beats) return r; }
      const parts = String(ctx.inputs?.doc || '').split(/\n+|。/).map((s) => s.trim()).filter((s) => s.length > 4).slice(0, 8);
      return { name: '按段落讲解', beats: parts };
    },
    'ai.structure': async (ctx) => {
      if (!ctx.svc.ai.available()) { const n = (ctx.vars.cuts || []).length; return { name: '参考结构', beats: [`参考视频共 ${n + 1} 个镜头`, '开头 3 秒钩子', '中段信息', '结尾行动'] }; }
      return ctx.svc.ai.json(`${brief(ctx)}\n\n拆解参考视频的结构：钩子、节奏、转折、结尾。只学结构，不搬画面和文案。只输出 JSON：{"name":"结构名","beats":["..."],"pace":"平均每镜秒数"}`);
    },
    'ai.storyboard': async (ctx) => {
      const len = lenSec(ctx.inputs?.len);
      const tplHint = ctx.inputs?.template ? `风格模板必须用：${ctx.inputs.template}（${templateById(ctx.inputs.template).name}）` : '';
      if (ctx.svc.ai.available()) {
        const p = await ctx.svc.getProject();
        const r = await ctx.svc.ai.agent({ system: GENERATE_SYSTEM, prompt: `${brief(ctx)}\n${tplHint}\n目标时长约 ${len} 秒。`, project: p });
        if (r.ops.length) { await ctx.svc.applyOps(r.ops, 'AI 写分镜'); if (ctx.inputs?.template) await ctx.svc.applyOps([{ op: 'setTemplate', args: { template: ctx.inputs.template } }], '模板'); return { text: r.text }; }
      }
      const sb = offlineStoryboard({ need: ctx.inputs?.need || ctx.inputs?.doc || ctx.inputs?.topic || ctx.vars.page?.title || '我的视频', treatment: ctx.vars.treatment, len });
      if (ctx.inputs?.template) sb.template = ctx.inputs.template;
      if (ctx.vars.page?.assets?.length) sb.shots.forEach((s, i) => { if (i > 0 && ctx.vars.page.assets[i - 1]) s.card = { ...s.card, layout: 'image', asset: ctx.vars.page.assets[i - 1] }; });
      return writeStoryboard(ctx, sb, '规则版分镜');
    },
    health: async (ctx) => { const h = health(await ctx.svc.getProject()); ctx.vars.health = h; const bad = h.filter((x) => x.level !== 'ok'); return { summary: bad.length ? bad.map((x) => x.title).join('、') + ' 需要看一下' : '体检全部通过', health: h }; },
    'health.show': async (ctx, step, run) => run.ask('health', { health: ctx.vars.health || health(await ctx.svc.getProject()) }),
    review: async (ctx, step, run) => { await ctx.svc.focus('board'); return run.ask('review', { text: '看一遍样片。满意点「通过」；不满意就在画面上圈注并写一句，点「带圈注打回」。' }); },
    'ai.revise': async (ctx, step, run) => {
      const p = await ctx.svc.getProject();
      const notes = (ctx.vars.reviewNotes || []).join('；');
      const open = (p.annotations || []).filter((a) => !a.done);
      if (!ctx.svc.ai.available()) { await run.ask('confirm', { text: `没配 AI，请按圈注手动修改：${notes || open.map((a) => a.text).join('；')}。改完点继续。` }); return { summary: '手动修改' }; }
      const r = await ctx.svc.ai.agent({ prompt: `按审片意见修改。意见：${notes || '见圈注'}。未处理的圈注：${JSON.stringify(open.map((a) => ({ id: a.id, text: a.text, rect: a.rect })))}`, project: p });
      if (!r.ops.length) return { text: r.text };
      const ok = await run.ask('proposal', { text: r.text, changes: r.changes });
      if (ok === false || ok?.apply === false) return { summary: '没有采用' };
      await ctx.svc.applyOps(r.ops, 'AI 按圈注修改'); return { text: r.text };
    },
    'tts.all': async (ctx, step, run) => { const r = await ctx.svc.tts.all((d) => run.emit('progress', d)); return { summary: `配音 ${r.done} 句${r.failed ? `，${r.failed} 句失败：${r.error}` : ''}` }; },
    'asr.check': async (ctx) => { if (!(await ctx.svc.asr.available())) return { summary: '没装听写（设置 → 听写），跳过' }; const r = await ctx.svc.asr.checkAll(); return { summary: `听写校验：${r.pass} 句通过，${r.fail} 句对不上` }; },
    'music.bed': async (ctx) => {
      const p = await ctx.svc.getProject(); const t = templateById(p.template);
      const r = await ctx.svc.music.bed({ mood: p.musicBed?.mood || t.music.mood, bpm: p.musicBed?.bpm || t.music.bpm, gain: p.musicBed?.gain ?? -14 });
      await S['sfx.auto'](ctx); return { summary: `配乐：${r.mood}，${r.bpm} BPM` };
    },
    'sfx.auto': async (ctx) => {
      const p = await ctx.svc.getProject(); const ops = [];
      p.shots.forEach((s, i) => { if (i && (s.chapter || (s.trans?.type && s.trans.type !== 'cut')) && !p.sfx.some((x) => x.anchor === s.id)) ops.push({ op: 'addSfx', args: withIds('addSfx', { anchor: s.id, off: 0, synth: 'whoosh', gain: -10 }) }); });
      for (const t of p.texts) if (!p.sfx.some((x) => x.anchor === t.anchor && Math.abs(x.off - t.off) < 0.1)) ops.push({ op: 'addSfx', args: withIds('addSfx', { anchor: t.anchor, off: t.off, synth: 'pop', gain: -8 }) });
      if (ops.length) await ctx.svc.applyOps(ops, '自动音效'); return { summary: `加了 ${ops.length} 个音效` };
    },
    export: async (ctx, step, run) => { const r = await ctx.svc.export((d) => run.emit('progress', d)); ctx.vars.output = r; return { summary: `已导出 ${path.basename(r.out)}（${Math.round(r.dur)} 秒）`, out: r.out }; },

    'capture.url': async (ctx) => { const r = await ctx.svc.capture(ctx.inputs.url); ctx.vars.page = r; return { summary: r.title, ...r }; },
    'media.import': async (ctx) => {
      const files = [].concat(ctx.inputs.file || ctx.inputs.files || []).filter(Boolean);
      if (!files.length) throw new Error('没有选素材');
      const assets = await ctx.svc.importFiles(files);
      const p = await ctx.svc.getProject();
      if (!p.shots.length) { const ops = assets.filter((a) => a.kind !== 'audio').map((a) => ({ op: 'addShot', args: withIds('addShot', { shot: { title: a.name, src: { kind: 'media', asset: a.id, in: 0, fit: 'cover' }, lock: true, dur: a.dur || 4, minDur: 0.5 } }) })); await ctx.svc.applyOps(ops, '导入素材'); }
      ctx.vars.assets = assets; return { summary: `导入 ${assets.length} 个素材` };
    },
    'asr.transcribe': async (ctx) => {
      if (!(await ctx.svc.asr.available())) throw new Error('没装听写。设置 → 听写：装本地 faster-whisper，或填在线听写的 Key');
      const p = await ctx.svc.getProject();
      const list = (ctx.vars.assets || p.assets.filter((a) => a.kind === 'video' || a.kind === 'audio')).slice(0, 12);
      const all = { text: '', words: [], segments: [], byAsset: {} };
      for (const a of list) { const r = await ctx.svc.asr.transcribe(abs(ctx.dir, a.path)); all.byAsset[a.id] = r; all.text += r.text + '\n'; all.words.push(...r.words.map((w) => ({ ...w, asset: a.id }))); all.segments.push(...r.segments.map((s) => ({ ...s, asset: a.id }))); }
      ctx.vars.transcript = all; return { summary: `听写 ${list.length} 个素材，${all.text.length} 字`, text: all.text.slice(0, 200) };
    },
    'asr.timeline': async (ctx) => { if (!(await ctx.svc.asr.available())) throw new Error('没装听写'); const r = await ctx.svc.asr.timeline(); ctx.vars.transcript = r; return { summary: `识别 ${r.segments.length} 段` }; },
    'captions.apply': async (ctx) => {
      const p = await ctx.svc.getProject(); const segs = ctx.vars.transcript?.segments || []; const ops = [];
      for (const sg of segs) {
        for (const piece of splitCaption(sg)) {
          const s = p.shots.find((x) => piece.t0 >= x.t0 && piece.t0 < x.t0 + x.dur) || p.shots[p.shots.length - 1]; if (!s) continue;
          const a = withIds('addLine', { shot: s.id, who: '字幕', text: piece.text });
          ops.push({ op: 'addLine', args: a }, { op: 'updateLine', args: { id: a.id, patch: { subOnly: true, pin: true, off: snap(piece.t0 - s.t0), soff: snap(piece.t0 - s.t0), dur: snap(piece.t1 - piece.t0), sdur: snap(piece.t1 - piece.t0), status: 'ok' } } });
        }
      }
      ops.push({ op: 'setSettings', args: { patch: {} } });
      if (ctx.inputs?.style) ops.push({ op: 'setExport', args: { patch: {} } });
      await ctx.svc.applyOps(ops, '自动字幕'); return { summary: `上了 ${ops.length / 2 | 0} 条字幕` };
    },
    'cut.find': async (ctx) => { const lv = { 温和: 'gentle', 标准: 'standard', 激进: 'aggressive' }[ctx.inputs?.level] || 'standard'; const cuts = findCuts(ctx.vars.transcript?.words || [], { level: lv }); return cuts; },
    'cut.confirm': async (ctx, step, run) => { const sel = await run.ask('cuts', { cuts: ctx.vars.cuts }); if (Array.isArray(sel)) ctx.vars.cuts = sel; return { summary: `确认 ${ctx.vars.cuts.length} 处` }; },
    'cut.apply': async (ctx) => {
      const p = await ctx.svc.getProject(); const a = (ctx.vars.assets || [])[0] || p.assets.find((x) => x.kind === 'video'); if (!a) throw new Error('没有素材');
      const keep = complement(ctx.vars.cuts || [], a.dur);
      const ops = p.shots.filter((s) => s.src.asset === a.id).map((s) => ({ op: 'removeShot', args: { id: s.id } }));
      keep.forEach((k, i) => ops.push({ op: 'addShot', args: withIds('addShot', { shot: { title: `${a.name} ${i + 1}`, src: { kind: 'media', asset: a.id, in: k.t0, fit: 'cover' }, lock: true, dur: snap(k.t1 - k.t0), minDur: 0.2 } }) }));
      await ctx.svc.applyOps(ops, '去口误和停顿'); const saved = (ctx.vars.cuts || []).reduce((s, c) => s + c.t1 - c.t0, 0);
      return { summary: `剪掉 ${ctx.vars.cuts.length} 处，省下 ${saved.toFixed(1)} 秒` };
    },
    'ai.highlights': async (ctx) => {
      const n = +ctx.inputs?.n || 3; const segs = ctx.vars.transcript?.segments || [];
      if (ctx.svc.ai.available() && segs.length) { const r = await ctx.svc.ai.json(`下面是长视频的分段听写（秒）。找出 ${n} 段最适合做 30~60 秒竖版短视频的高光：信息密度高、有情绪、开头能抓人、能独立成立。只输出 JSON：{"highlights":[{"t0":0,"t1":0,"title":"不超过14字的标题","why":""}]}\n${segs.map((s) => `[${s.t0.toFixed(1)}-${s.t1.toFixed(1)}] ${s.text}`).join('\n').slice(0, 24000)}`); if (r?.highlights?.length) return r.highlights; }
      // 规则版：按 45 秒窗口的字数密度
      const out = []; const win = 45; const total = segs.length ? segs[segs.length - 1].t1 : 0;
      const dens = []; for (let t = 0; t + win <= total + 1; t += 5) { const txt = segs.filter((s) => s.t0 >= t && s.t1 <= t + win).map((s) => s.text).join(''); dens.push({ t0: t, t1: t + win, score: txt.length, title: txt.slice(0, 14) }); }
      dens.sort((a, b) => b.score - a.score); for (const d of dens) if (out.length < n && !out.some((o) => d.t0 < o.t1 && d.t1 > o.t0)) out.push(d);
      return out.sort((a, b) => a.t0 - b.t0);
    },
    'highlights.pick': async (ctx, step, run) => { const r = await run.ask('pick', { items: ctx.vars.highlights || [] }); if (Array.isArray(r)) ctx.vars.highlights = r; return { summary: `选了 ${ctx.vars.highlights.length} 段` }; },
    'shorts.make': async (ctx) => { const r = await ctx.svc.shorts.make(ctx.vars.highlights || [], ctx.vars.transcript, (ctx.vars.assets || [])[0]); ctx.vars.shorts = r; return { summary: `生成 ${r.length} 个短视频工程` }; },
    'shorts.export': async (ctx, step, run) => { const outs = []; for (const d of ctx.vars.shorts || []) outs.push(await ctx.svc.shorts.export(d, (x) => run.emit('progress', x))); return { summary: `导出 ${outs.length} 条`, outs }; },
    'textcut.edit': async (ctx, step, run) => { const r = await run.ask('textcut', { segments: ctx.vars.transcript?.segments || [] }); if (Array.isArray(r)) ctx.vars.keepSegments = r; return { summary: `保留 ${(ctx.vars.keepSegments || []).length} 段` }; },
    'textcut.apply': async (ctx) => {
      const p = await ctx.svc.getProject(); const keep = ctx.vars.keepSegments || ctx.vars.transcript?.segments || [];
      const ops = p.shots.map((s) => ({ op: 'removeShot', args: { id: s.id } }));
      keep.forEach((k, i) => ops.push({ op: 'addShot', args: withIds('addShot', { shot: { title: k.text.slice(0, 14) || `片段 ${i + 1}`, src: { kind: 'media', asset: k.asset, in: Math.max(0, k.t0 - 0.08), fit: 'cover' }, lock: true, dur: snap(k.t1 - k.t0 + 0.16), minDur: 0.2 } }) }));
      await ctx.svc.applyOps(ops, '按文字稿粗剪'); return { summary: `粗剪 ${keep.length} 段` };
    },
    'beats.detect': async (ctx) => {
      const p = await ctx.svc.getProject(); let f = ctx.inputs?.music;
      if (!f) { const m = p.music[0]; const a = m && p.assets.find((x) => x.id === m.asset); f = a && abs(ctx.dir, a.path); }
      if (!f) { await S['music.bed'](ctx); const q = await ctx.svc.getProject(); const a = q.assets.find((x) => x.id === q.music[0]?.asset); f = a && abs(ctx.dir, a.path); }
      const r = await detectBeats(f); ctx.vars.beats = r; return { summary: `${r.bpm} BPM，${r.beats.length} 拍` };
    },
    'beats.snap': async (ctx) => {
      if (!ctx.vars.beats) await S['beats.detect'](ctx);
      const p = await ctx.svc.getProject(); const beats = ctx.vars.beats.beats; const ops = []; let t = 0;
      for (const s of p.shots) {
        const end = t + s.dur; const nb = beats.reduce((a, b) => (Math.abs(b - end) < Math.abs(a - end) ? b : a), end);
        const nd = snap(nb - t); if (nd >= s.dur - 0.01 || s.lock) { const d = nd - s.dur; if (Math.abs(d) > 1 / 24 && nd > 0.4) ops.push({ op: 'updateShot', args: { id: s.id, patch: s.lock ? { dur: nd } : { hold: Math.max(0, (s.hold || 0) + d) } } }); t = nb; } else t = end;
      }
      await ctx.svc.applyOps(ops, '音乐卡点'); return { summary: `对齐了 ${ops.length} 个切点` };
    },
    'ai.translate': async (ctx) => {
      if (!ctx.svc.ai.available()) throw new Error('翻译需要先在设置里配一个 AI');
      const p = await ctx.svc.getProject(); const lang = ctx.inputs?.lang || '英语';
      const r = await ctx.svc.ai.json(`把下面的台词翻译成${lang}，口语化，每句长度尽量接近原句的朗读时长。只输出 JSON：{"lines":[{"id":"","text":""}]}\n${JSON.stringify(p.lines.map((l) => ({ id: l.id, text: l.text })))}`);
      const VO = { 英语: 'en-US-AriaNeural', 日语: 'ja-JP-NanamiNeural', 韩语: 'ko-KR-SunHiNeural', 西班牙语: 'es-ES-ElviraNeural', 法语: 'fr-FR-DeniseNeural' };
      const ops = (r?.lines || []).map((x) => ({ op: 'updateLine', args: { id: x.id, patch: { text: x.text, orig: p.lines.find((l) => l.id === x.id)?.text, audio: null, status: 'est' } } }));
      for (const who of Object.keys(p.speakers)) ops.push({ op: 'setSpeaker', args: { who, voice: { provider: 'edge', voice: VO[lang] || VO.英语 } } });
      await ctx.svc.applyOps(ops, `翻译成${lang}`); return { summary: `翻译 ${ops.length} 句` };
    },
    'ai.keyphrases': async (ctx) => {
      const p = await ctx.svc.getProject();
      if (ctx.svc.ai.available()) { const r = await ctx.svc.ai.json(`从这些台词里挑出最值得加花字强调的 3~8 处（数字、结论、反转、口号）。只输出 JSON：{"items":[{"line":"L3","text":"花字内容，不超过8字"}]}\n${p.lines.map((l, i) => `L${i + 1} ${l.text}`).join('\n')}`); if (r?.items) { ctx.vars.keyphrases = r.items; return { summary: `${r.items.length} 处` }; } }
      ctx.vars.keyphrases = p.lines.map((l, i) => ({ line: `L${i + 1}`, text: (l.text.match(/\d+[%×倍万亿]?|[^，。！？]{2,8}[！!]/) || [])[0] })).filter((x) => x.text).slice(0, 6);
      return { summary: `${ctx.vars.keyphrases.length} 处` };
    },
    'mg.auto': async (ctx) => {
      const p = await ctx.svc.getProject(); if (!ctx.vars.keyphrases) await S['ai.keyphrases'](ctx);
      const style = { 综艺: 'burst', 科技: 'tag', 可爱: 'note' }[ctx.inputs?.tone] || 'burst'; const ops = [];
      for (const k of ctx.vars.keyphrases || []) { const m = String(k.line).match(/\d+/); const l = m ? p.lines[+m[0] - 1] : null; if (!l) continue; ops.push({ op: 'addText', args: withIds('addText', { anchor: l.shot, off: l.off + 0.2, dur: Math.max(1.5, l.dur), text: k.text, style, x: 0.72, y: 0.24 }) }); }
      await ctx.svc.applyOps(ops, '花字'); return { summary: `加了 ${ops.length} 个花字` };
    },
    'logo.cards': async (ctx) => {
      const p = await ctx.svc.getProject(); let asset = null;
      if (ctx.inputs?.logo) [asset] = await ctx.svc.importFiles([ctx.inputs.logo]);
      const brand = ctx.inputs?.brand || p.name; const ops = [];
      const head = withIds('addShot', { shot: { title: '片头', chapter: '片头', minDur: 3, src: { kind: 'card', in: 0, card: { layout: 'title', heading: brand, body: ctx.inputs?.slogan || '', asset: asset?.id } } } });
      ops.push({ op: 'addShot', args: { ...head, after: undefined } }, { op: 'moveShot', args: { id: head.shot.id, to: 0 } });
      ops.push({ op: 'addShot', args: withIds('addShot', { shot: { title: '片尾', chapter: '片尾', minDur: 4, src: { kind: 'card', in: 0, card: { layout: 'end', heading: brand, body: ctx.inputs?.slogan || '', asset: asset?.id } } } }) });
      await ctx.svc.applyOps(ops, '片头片尾'); return { summary: '加了片头和片尾' };
    },
    'chart.card': async (ctx) => {
      const rows = String(ctx.inputs?.data || '').split(/\n+/).map((l) => l.trim().split(/[\s,，:：\t]+/)).filter((r) => r.length >= 2 && isFinite(+r[r.length - 1]));
      if (!rows.length) throw new Error('数据格式：每行「名称 数值」');
      const labels = rows.map((r) => r.slice(0, -1).join(' ')), values = rows.map((r) => +r[r.length - 1]);
      const s = withIds('addShot', { shot: { title: ctx.inputs?.title || '数据', minDur: 5, src: { kind: 'card', in: 0, card: { layout: 'chart', heading: ctx.inputs?.title || '', labels, values } } } });
      await ctx.svc.applyOps([{ op: 'addShot', args: s }], '图表镜头'); ctx.vars.chartShot = s.shot.id; ctx.vars.chart = { labels, values }; return { summary: `${rows.length} 个数据点` };
    },
    'ai.chartline': async (ctx) => {
      const { labels, values } = ctx.vars.chart; let text;
      if (ctx.svc.ai.available()) { const r = await ctx.svc.ai.json(`用一句不超过 26 字的中文口语解读这组数据：${labels.map((l, i) => `${l}:${values[i]}`).join('，')}。只输出 JSON：{"text":""}`); text = r?.text; }
      if (!text) { const a = values[0], b = values[values.length - 1]; text = `从${labels[0]}到${labels[labels.length - 1]}，${b >= a ? '增长' : '下降'}了 ${Math.abs(Math.round(((b - a) / (a || 1)) * 100))}%。`; }
      await ctx.svc.applyOps([{ op: 'addLine', args: withIds('addLine', { shot: ctx.vars.chartShot, text }) }], '图表解读'); return { summary: text };
    },
    'color.match': async (ctx) => {
      const p = await ctx.svc.getProject(); const m = String(ctx.inputs?.ref || 'S01').match(/\d+/); const ref = p.shots[(m ? +m[0] : 1) - 1]; if (!ref) throw new Error('没有这个参考镜头');
      const stat = async (s) => colorStats(await ctx.svc.frameBitmap(s.t0 + s.dur / 2));
      const rs = await stat(ref); const ops = [];
      for (const s of p.shots) { if (s.id === ref.id) continue; const g = matchGrade(await stat(s), rs); ops.push({ op: 'updateShot', args: { id: s.id, patch: { grade: { ...s.grade, exposure: g.exposure, contrast: g.contrast, gain: g.gain } } } }); }
      await ctx.svc.applyOps(ops, '颜色匹配'); return { summary: `匹配了 ${ops.length} 个镜头` };
    },
    'scene.detect': async (ctx) => { const f = ctx.inputs?.ref; if (!f) throw new Error('没有参考视频'); const cuts = await sceneCuts(f); ctx.vars.cuts = cuts; if (await ctx.svc.asr.available()) ctx.vars.transcript = await ctx.svc.asr.transcribe(f).catch(() => null); return cuts; },
  };
  return S;
}

function complement(cuts, dur) { const out = []; let t = 0; for (const c of [...cuts].sort((a, b) => a.t0 - b.t0)) { if (c.t0 - t > 0.1) out.push({ t0: t, t1: c.t0 }); t = Math.max(t, c.t1); } if (dur - t > 0.1) out.push({ t0: t, t1: dur }); return out; }
function splitCaption(sg, max = 16) {
  const txt = sg.text.trim(); if (txt.length <= max) return [sg];
  const parts = txt.split(/(?<=[，。！？,.!?、；;])/).reduce((a, s) => { if (a.length && (a[a.length - 1] + s).length <= max) a[a.length - 1] += s; else a.push(s); return a; }, []);
  const total = txt.length; let t = sg.t0; return parts.map((p) => { const d = ((sg.t1 - sg.t0) * p.length) / total; const r = { t0: t, t1: t + d, text: p.replace(/[，。,.]$/, '') }; t += d; return r; });
}
export { suggestTemplate, parseNeed, uid, newShot, existsSync, fs };
