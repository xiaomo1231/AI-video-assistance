// 墨剪给 AI 的工具。内置 AI 和外部 CLI（经 MCP）用同一套定义。
// 读工具直接返回；写工具在工作副本上执行，同时记到 ctx.ops，交给用户「应用 / 不用了」。
import { apply, clone, withIds, ops as OPS } from '../project.js';
import { health } from '../health.js';
import { tc, shotLines, layout } from '../timing.js';
import { TEMPLATES, LAYOUTS } from '../templates.js';

const sid = (p, s) => `S${String(p.shots.indexOf(s) + 1).padStart(2, '0')}`;
/** 允许用 S03 或 内部 id 指代镜头，用 L12 或 id 指代台词 */
export function resolveShot(p, ref) { if (!ref) return null; const m = String(ref).match(/^S(\d+)$/i); return m ? p.shots[+m[1] - 1] : p.shots.find((s) => s.id === ref); }
export function resolveLine(p, ref) { if (!ref) return null; const m = String(ref).match(/^L(\d+)$/i); return m ? p.lines[+m[1] - 1] : p.lines.find((l) => l.id === ref); }

export function overview(p) {
  return {
    name: p.name, size: `${p.width}x${p.height}`, fps: p.fps, duration: tc(p.duration, p.fps), template: p.template,
    speakers: p.speakers,
    shots: p.shots.map((s) => ({ ref: sid(p, s), id: s.id, chapter: s.chapter, title: s.title, start: tc(s.t0, p.fps), dur: +s.dur.toFixed(2), lock: s.lock, status: s.status, source: s.src.kind, layout: s.src.card?.layout, heading: s.src.card?.heading, prompt: s.prompt, camera: s.camera, font: s.font,
      lines: shotLines(p, s.id).map((l) => ({ ref: `L${p.lines.indexOf(l) + 1}`, who: l.who, text: l.text, dur: +l.dur.toFixed(2), audio: !!l.audio, status: l.status })) })),
    music: p.music.map((m) => ({ id: m.id, name: m.name, start: tc(m.t0 || 0, p.fps), dur: m.dur, gain: m.gain })),
    texts: p.texts.map((t) => ({ id: t.id, text: t.text, shot: sid(p, p.shots.find((s) => s.id === t.anchor) || {}), style: t.style })),
    annotations: (p.annotations || []).filter((a) => !a.done).map((a) => ({ id: a.id, shot: sid(p, p.shots.find((s) => s.id === a.shot) || {}), at: tc(a.t, p.fps), text: a.text, rect: a.rect })),
  };
}

const S = (props, req = []) => ({ type: 'object', properties: props, required: req });
const str = (d) => ({ type: 'string', description: d });
const num = (d) => ({ type: 'number', description: d });

const CARD = S({ layout: { type: 'string', enum: Object.keys(LAYOUTS), description: '卡片布局' }, heading: str('大标题'), body: str('正文或副标题'), bullets: { type: 'array', items: { type: 'string' } }, values: { type: 'array', items: { type: 'number' }, description: 'chart 布局的数据' }, labels: { type: 'array', items: { type: 'string' } }, emoji: str('可选的主体图标（一个 emoji）') });
const SHOT_IN = S({ title: str('镜头名'), chapter: str('章节'), prompt: str('画面描述'), camera: str('镜头语言，如 推镜头 · 中景'), minDur: num('最短时长（秒）'), card: CARD, lines: { type: 'array', items: S({ who: str('角色'), text: str('台词') }, ['text']) } }, ['title']);

export const TOOLS = [
  { name: 'project_read', desc: '读取整个工程概况：镜头、台词、音乐、文字、未处理的圈注。改之前先读。', input: S({}), read: true,
    run: (ctx) => overview(ctx.p) },
  { name: 'health_check', desc: '运行成片体检：时间对齐、字幕停留、字号、配音、听写、圈注、空隙、素材。', input: S({}), read: true,
    run: (ctx) => health(ctx.p) },
  { name: 'template_list', desc: '列出可用的风格模板。', input: S({}), read: true,
    run: () => TEMPLATES.map((t) => ({ id: t.id, name: t.name, cat: t.cat, uses: t.uses })) },
  { name: 'shot_update', desc: '修改一个镜头：标题、画面描述、镜头语言、字号（1=100%）、卡片内容、状态、时长锁定等。', input: S({ shot: str('镜头，如 S03'), title: str(''), prompt: str(''), camera: str(''), font: num('字号倍数，1 = 100%'), status: { type: 'string', enum: ['draft', 'revise', 'confirmed'] }, minDur: num(''), lock: { type: 'boolean' }, card: CARD, mirror: { type: 'boolean' } }, ['shot']),
    run: (ctx, a) => { const s = resolveShot(ctx.p, a.shot); if (!s) throw new Error('没有镜头 ' + a.shot); const { shot, card, ...patch } = a; if (card) patch.src = { ...s.src, card: { ...(s.src.card || {}), ...card } }; return ctx.do('updateShot', { id: s.id, patch }); } },
  { name: 'shot_add', desc: '在某个镜头后面加一个新镜头（带卡片内容和台词）。', input: S({ after: str('加在哪个镜头后面，留空加到最后'), shot: SHOT_IN }, ['shot']),
    run: (ctx, a) => addShotWithLines(ctx, a.shot, a.after && resolveShot(ctx.p, a.after)?.id) },
  { name: 'shot_remove', desc: '删除一个镜头及其台词。', input: S({ shot: str('') }, ['shot']), run: (ctx, a) => { const s = resolveShot(ctx.p, a.shot); if (!s) throw new Error('没有镜头 ' + a.shot); return ctx.do('removeShot', { id: s.id }); } },
  { name: 'shot_move', desc: '把镜头移动到第 n 个位置（从 1 开始）。', input: S({ shot: str(''), to: num('目标位置') }, ['shot', 'to']), run: (ctx, a) => { const s = resolveShot(ctx.p, a.shot); return ctx.do('moveShot', { id: s.id, to: a.to - 1 }); } },
  { name: 'line_update', desc: '修改一句台词：文字、角色、语气（emotion）、语速。改文字后配音会标为需要重做。', input: S({ line: str('台词，如 L08'), text: str(''), who: str(''), emotion: { type: 'string', enum: ['neutral', 'happy', 'sad', 'angry', 'fearful', 'surprised', 'calm', 'excited'] }, speed: num('语速 0.5~2') }, ['line']),
    run: (ctx, a) => { const l = resolveLine(ctx.p, a.line); if (!l) throw new Error('没有台词 ' + a.line); const patch = {}; if (a.text != null) patch.text = a.text; if (a.who) patch.who = a.who; if (a.emotion || a.speed) patch.voice = { ...l.voice, ...(a.emotion ? { emotion: a.emotion } : {}), ...(a.speed ? { speed: a.speed } : {}) }; if (a.emotion || a.speed) patch.status = l.audio ? 'stale' : l.status; return ctx.do('updateLine', { id: l.id, patch }); } },
  { name: 'line_add', desc: '给镜头加一句台词。', input: S({ shot: str(''), who: str('角色，默认 旁白'), text: str('') }, ['shot', 'text']), run: (ctx, a) => ctx.do('addLine', { shot: resolveShot(ctx.p, a.shot).id, who: a.who || '旁白', text: a.text }) },
  { name: 'line_remove', desc: '删除一句台词。', input: S({ line: str('') }, ['line']), run: (ctx, a) => ctx.do('removeLine', { id: resolveLine(ctx.p, a.line).id }) },
  { name: 'speaker_set', desc: '设置某个角色的配音：接口（edge / minimax / openai / system / custom）、音色、语速。', input: S({ who: str(''), provider: str(''), voice: str(''), speed: num('') }, ['who']), run: (ctx, a) => { const { who, ...voice } = a; return ctx.do('setSpeaker', { who, voice }); } },
  { name: 'grade_set', desc: '调色：exposure/contrast/saturation/temp/tint 取 -1~1；lift/gamma/gain 是 RGB 三元组，取 -0.5~0.5。shot 留空则改全部镜头。', input: S({ shot: str(''), exposure: num(''), contrast: num(''), saturation: num(''), temp: num('色温，正为暖'), tint: num(''), lift: { type: 'array', items: { type: 'number' } }, gamma: { type: 'array', items: { type: 'number' } }, gain: { type: 'array', items: { type: 'number' } } }),
    run: (ctx, a) => { const { shot, ...g } = a; const list = shot ? [resolveShot(ctx.p, shot)] : ctx.p.shots; for (const s of list) ctx.do('updateShot', { id: s.id, patch: { grade: { ...s.grade, ...g } } }); return `已改 ${list.length} 个镜头`; } },
  { name: 'text_add', desc: '在镜头上加一个花字 / 角标 / 标题条。', input: S({ shot: str(''), text: str(''), off: num('镜头内开始时间'), dur: num(''), style: { type: 'string', enum: ['tag', 'title', 'lower', 'burst', 'note'] }, x: num('0~1'), y: num('0~1') }, ['shot', 'text']),
    run: (ctx, a) => ctx.do('addText', { anchor: resolveShot(ctx.p, a.shot).id, off: a.off || 0.5, dur: a.dur || 2.5, text: a.text, style: a.style || 'tag', x: a.x ?? 0.75, y: a.y ?? 0.2 }) },
  { name: 'sfx_add', desc: '在镜头的某个时间点加音效：whoosh pop click ding thump stamp swish rise glitch type chime boom。', input: S({ shot: str(''), off: num(''), sound: str('') }, ['shot', 'sound']),
    run: (ctx, a) => ctx.do('addSfx', { anchor: resolveShot(ctx.p, a.shot).id, off: a.off || 0, synth: a.sound }) },
  { name: 'music_set', desc: '设置整片配乐：情绪（calm warm tech upbeat funk news serious emotional lullaby guqin festive chiptune action lofi）、BPM、音量。生成离线配乐。', input: S({ mood: str(''), bpm: num(''), gain: num('音量 dB，默认 -12') }, ['mood']),
    run: (ctx, a) => { ctx.do('setMusicBed', a); return '已设置配乐：' + a.mood; } },
  { name: 'template_set', desc: '换整片的风格模板。', input: S({ template: str('模板 id') }, ['template']), run: (ctx, a) => ctx.do('setTemplate', { template: a.template }) },
  { name: 'annotation_resolve', desc: '把一条圈注标为已处理（改完对应问题后调用）。', input: S({ id: str('') }, ['id']), run: (ctx, a) => ctx.do('resolveAnnotation', { id: a.id }) },
  { name: 'storyboard_write', desc: '一次写出完整分镜（替换现有全部镜头和台词）。用于从需求生成第一版。每个镜头带卡片内容和台词。', input: S({ template: str('风格模板 id'), speakers: { type: 'object', description: '角色 → {provider, voice}' }, shots: { type: 'array', items: SHOT_IN } }, ['shots']),
    run: (ctx, a) => {
      for (const s of [...ctx.p.shots]) ctx.do('removeShot', { id: s.id });
      if (a.template) ctx.do('setTemplate', { template: a.template });
      for (const [who, v] of Object.entries(a.speakers || {})) ctx.do('setSpeaker', { who, voice: v });
      for (const s of a.shots) addShotWithLines(ctx, s);
      return `已写出 ${a.shots.length} 个镜头`;
    } },
];

function addShotWithLines(ctx, s, after) {
  const id = ctx.do('addShot', { after, shot: { title: s.title, chapter: s.chapter || '', prompt: s.prompt || '', camera: s.camera || '', minDur: s.minDur ?? 2.5, src: { kind: 'card', in: 0, card: { layout: 'statement', ...(s.card || {}), heading: s.card?.heading ?? s.title } } } });
  for (const l of s.lines || []) ctx.do('addLine', { shot: id, who: l.who || '旁白', text: l.text });
  return id;
}

/** 建一个工具上下文：在副本上执行，记录操作 */
export function makeContext(project) {
  const p = clone(project); const opsList = [];
  return {
    p, ops: opsList,
    do(op, args) { const a = withIds(op, args); opsList.push({ op, args: a }); const r = apply(p, [{ op, args: a }])[0]; return r ?? 'ok'; },
  };
}

export function toolByName(n) { return TOOLS.find((t) => t.name === n); }
export async function callTool(ctx, name, args) {
  const t = toolByName(name); if (!t) throw new Error('没有这个工具：' + name);
  const r = await t.run(ctx, args || {});
  layout(ctx.p);
  return r;
}

/** 生成「修改建议」的可读摘要（diff），给用户确认 */
export function summarize(before, after) {
  const out = [];
  const bS = new Map(before.shots.map((s) => [s.id, s])), aS = new Map(after.shots.map((s) => [s.id, s]));
  const name = (p, s) => `${sid(p, s)} ${s.title}`;
  for (const s of after.shots) {
    const o = bS.get(s.id);
    if (!o) { out.push({ kind: 'add', text: `新增镜头 ${name(after, s)}` }); continue; }
    if (o.title !== s.title) out.push({ kind: 'mod', text: `${sid(after, s)} 标题：${o.title} → ${s.title}` });
    if (o.prompt !== s.prompt) out.push({ kind: 'mod', text: `${sid(after, s)} 画面描述改了` });
    if ((o.font || 1) !== (s.font || 1)) out.push({ kind: 'mod', text: `${sid(after, s)} 字号 ${Math.round((o.font || 1) * 100)}% → ${Math.round((s.font || 1) * 100)}%` });
    if (JSON.stringify(o.src.card) !== JSON.stringify(s.src.card)) out.push({ kind: 'mod', text: `${sid(after, s)} 画面文字：${s.src.card?.heading || ''}` });
    if (JSON.stringify(o.grade) !== JSON.stringify(s.grade)) out.push({ kind: 'mod', text: `${sid(after, s)} 调色改了` });
    if (o.status !== s.status) out.push({ kind: 'mod', text: `${sid(after, s)} 状态 → ${s.status}` });
    if (Math.abs(o.dur - s.dur) > 0.04) out.push({ kind: 'mod', text: `${sid(after, s)} 时长 ${o.dur.toFixed(1)}s → ${s.dur.toFixed(1)}s` });
  }
  for (const s of before.shots) if (!aS.has(s.id)) out.push({ kind: 'del', text: `删除镜头 ${name(before, s)}` });
  const bL = new Map(before.lines.map((l) => [l.id, l]));
  for (const l of after.lines) {
    const o = bL.get(l.id);
    if (!o) out.push({ kind: 'add', text: `新增台词「${l.text}」` });
    else { if (o.text !== l.text) out.push({ kind: 'mod', text: `台词「${o.text}」→「${l.text}」` }); if (JSON.stringify(o.voice) !== JSON.stringify(l.voice)) out.push({ kind: 'mod', text: `台词「${l.text.slice(0, 12)}」语气 / 语速改了` }); }
  }
  for (const l of before.lines) if (!after.lines.find((x) => x.id === l.id)) out.push({ kind: 'del', text: `删除台词「${l.text}」` });
  if (before.template !== after.template) out.push({ kind: 'mod', text: `模板 → ${after.template}` });
  if (after.musicBed && JSON.stringify(before.musicBed) !== JSON.stringify(after.musicBed)) out.push({ kind: 'mod', text: `配乐 → ${after.musicBed.mood}` });
  if (before.texts.length !== after.texts.length) out.push({ kind: 'add', text: `花字 ${before.texts.length} → ${after.texts.length} 个` });
  if (before.sfx.length !== after.sfx.length) out.push({ kind: 'add', text: `音效 ${before.sfx.length} → ${after.sfx.length} 个` });
  const ba = (before.annotations || []).filter((a) => !a.done).length, aa = (after.annotations || []).filter((a) => !a.done).length;
  if (ba !== aa) out.push({ kind: 'mod', text: `处理了 ${ba - aa} 条圈注` });
  return out;
}
export { OPS };
