import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { speechDur, tc, parseTc, layout, overflow } from '../core/timing.js';
import { emptyProject, apply, normalize } from '../core/project.js';
import { health } from '../core/health.js';
import { toSRT, parseSRT, toFCPXML, toEDL } from '../core/interchange.js';
import { makeContext, callTool, summarize } from '../core/ai/tools.js';
import { similarity, findCuts } from '../core/node/asr.js';
import { makeMusic, makeSfx } from '../core/node/synth.js';
import { decodeWav } from '../core/node/wav.js';
import { TEMPLATES } from '../core/templates.js';
import { SKILLS } from '../core/workflow/skills.js';
import { Run } from '../core/workflow/engine.js';

function sample() {
  const p = emptyProject('测试');
  const [a] = apply(p, [{ op: 'addShot', args: { shot: { title: '开场', minDur: 2 } } }]);
  const [b] = apply(p, [{ op: 'addShot', args: { shot: { title: '第二镜', minDur: 2 } } }]);
  apply(p, [{ op: 'addLine', args: { shot: a, text: '期末前一晚，十一点四十。' } }, { op: 'addLine', args: { shot: a, text: 'AI 一秒就给答案。' } }, { op: 'addLine', args: { shot: b, who: '小墨', text: '我是小墨。' } }]);
  return { p, a, b };
}

test('时间码与估时', () => {
  assert.equal(tc(0), '00:00:00:00');
  assert.equal(tc(61.5), '00:01:01:12');
  assert.equal(parseTc('00:01:01:12'), 61.5);
  const d = speechDur('期末前一晚，十一点四十。');
  assert.ok(d > 2 && d < 3.2, `时长 ${d}`);
  assert.equal(Math.round(d * 24), d * 24);
});

test('台词驱动时长与磁吸', () => {
  const { p, a, b } = sample();
  const s1 = p.shots[0], s2 = p.shots[1];
  assert.equal(s2.t0, s1.dur, '第二镜接在第一镜后面');
  const before = s1.dur;
  const l = p.lines.find((x) => x.shot === a && x.text.startsWith('AI'));
  apply(p, [{ op: 'updateLine', args: { id: l.id, patch: { text: 'AI 一秒就给答案，但是你什么也没学会，第二天考试照样不会。' } } }]);
  assert.ok(s1.dur > before + 2, '台词变长，镜头跟着变长');
  assert.equal(s2.t0, s1.dur, '后面的镜头自动后移');
  assert.equal(overflow(p, s1), false);
  assert.equal(health(p).find((h) => h.id === 'align').level, 'ok');
  assert.equal(health(p).find((h) => h.id === 'subdur').level, 'ok');
  apply(p, [{ op: 'setLock', args: { id: s1.id, lock: true } }, { op: 'trimShot', args: { id: s1.id, dur: 2 } }]);
  assert.equal(health(p).find((h) => h.id === 'align').level, 'error', '锁定后裁短会报警');
  assert.ok(b);
});

test('分割、复制、删除', () => {
  const { p, a } = sample();
  const n = p.shots.length; const d = p.shots[0].dur;
  const [nb] = apply(p, [{ op: 'splitShot', args: { id: a, at: 2.9 } }]);
  assert.equal(p.shots.length, n + 1);
  assert.ok(Math.abs(p.shots[0].dur + p.shots[1].dur - d) < 0.05);
  assert.ok(p.lines.some((l) => l.shot === nb), '第二句台词归到后半段');
  apply(p, [{ op: 'duplicateShot', args: { id: nb } }, { op: 'removeShot', args: { id: a } }]);
  assert.equal(p.shots.length, n + 1);
});

test('SRT / FCPXML / EDL', () => {
  const { p } = sample();
  const srt = toSRT(p); const back = parseSRT(srt);
  assert.equal(back.length, 3); assert.equal(back[2].text, '我是小墨。');
  assert.ok(toFCPXML(p).includes('<fcpxml version="1.10">'));
  assert.ok(toEDL(p).includes('FCM: NON-DROP FRAME'));
});

test('AI 工具：storyboard_write + 修改建议摘要', async () => {
  const { p } = sample();
  const ctx = makeContext(p);
  await callTool(ctx, 'storyboard_write', { template: 'chalkboard', shots: [{ title: '开场', card: { layout: 'title', heading: '先问我' }, lines: [{ text: '你有没有这样的时候？' }] }, { title: '痛点', lines: [{ who: '学生', text: '答案抄了，题还是不会。' }] }] });
  await callTool(ctx, 'shot_update', { shot: 'S01', font: 1.3 });
  await callTool(ctx, 'line_update', { line: 'L2', emotion: 'happy' });
  assert.equal(ctx.p.shots.length, 2); assert.equal(ctx.p.template, 'chalkboard');
  assert.equal(p.shots.length, 2, '原工程不变'); assert.notEqual(p.template, 'chalkboard');
  const ch = summarize(p, ctx.p); assert.ok(ch.length >= 3);
  // 把记录的操作重放到原工程上，结果一致
  const q = normalize(JSON.parse(JSON.stringify(p))); apply(q, ctx.ops);
  assert.equal(q.shots[0].font, 1.3); assert.equal(q.lines.length, ctx.p.lines.length);
});

test('听写比对与口误检测', () => {
  assert.ok(similarity('较九月高点跌去两成多', '较 9 月高点跌去两成多。') > 0.95);
  assert.ok(similarity('一万', '10000') > 0.9);
  assert.ok(similarity('今天天气很好', '明天下雨') < 0.5);
  const cuts = findCuts([{ w: '我们', t0: 0, t1: 0.4 }, { w: '嗯', t0: 0.5, t1: 0.7 }, { w: '开始', t0: 0.8, t1: 1.1 }, { w: '吧', t0: 2.5, t1: 2.7 }]);
  assert.equal(cuts.length, 2); assert.ok(cuts[0].why.includes('嗯')); assert.ok(cuts[1].why.includes('停顿'));
});

test('离线配乐与音效', () => {
  const w = decodeWav(makeMusic({ mood: 'tech', bpm: 120, dur: 4 }));
  assert.equal(w.channels.length, 2); assert.ok(Math.abs(w.dur - 4) < 0.01);
  let peak = 0; for (const v of w.channels[0]) peak = Math.max(peak, Math.abs(v)); assert.ok(peak > 0.3);
  for (const n of ['whoosh', 'pop', 'ding', 'stamp']) assert.ok(decodeWav(makeSfx(n)).dur > 0.2);
});

test('模板与 Skill 数量', () => {
  assert.equal(TEMPLATES.length, 45); assert.equal(new Set(TEMPLATES.map((t) => t.id)).size, 45);
  assert.equal(SKILLS.length, 16);
  for (const s of SKILLS) if (s.loop) assert.equal(s.steps[s.loop.from].tool, 'review', `${s.name} 的回路起点应是审片`);
});

test('工作流引擎：人工节点与回路', async () => {
  const wf = { id: 't', name: '测试', steps: [{ kind: 'ai', name: 'A', tool: 'a' }, { kind: 'review', name: '审', tool: 'review' }, { kind: 'ai', name: '改', tool: 'fix' }, { kind: 'tool', name: '完', tool: 'done' }], loop: { from: 1, to: 2, max: 3 } };
  const seen = []; let reviews = 0;
  const reg = { a: async () => seen.push('a'), review: async (ctx, s, run) => { reviews++; const v = await run.ask('review', {}); return v; }, fix: async (ctx) => seen.push('fix:' + ctx.notes.length), done: async () => seen.push('done') };
  const run = new Run(wf, reg, {}, { onEvent: (e) => { if (e.type === 'wait') setTimeout(() => run.respond(reviews === 1 ? { verdict: 'fail', notes: ['字太小'] } : { verdict: 'pass' })); } });
  const r = await run.start();
  assert.equal(r.state, 'done');
  assert.deepEqual(seen, ['a', 'fix:1', 'done']);
  assert.equal(run.round, 1);
});

test('MCP 服务：列工具、读、写成修改建议', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-mcp-'));
  const { p } = sample();
  await fs.writeFile(path.join(dir, 'project.json'), JSON.stringify(p));
  const srv = spawn(process.execPath, [path.resolve('core/mcp/server.js'), '--project', dir]);
  const replies = []; let buf = '';
  srv.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { replies.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } });
  const call = (id, method, params) => srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  call(1, 'initialize', {}); call(2, 'tools/list', {}); call(3, 'tools/call', { name: 'shot_update', arguments: { shot: 'S01', font: 1.4 } }); call(4, 'tools/call', { name: 'project_read', arguments: {} });
  await new Promise((r) => { const t = setInterval(() => { if (replies.length >= 4) { clearInterval(t); r(); } }, 20); });
  srv.kill();
  assert.ok(replies.find((r) => r.id === 2).result.tools.length > 10);
  const read = JSON.parse(replies.find((r) => r.id === 4).result.content[0].text);
  assert.equal(read.shots[0].font, 1.4, '读到的是含建议的版本');
  const prop = JSON.parse(await fs.readFile(path.join(dir, '.mojian/proposal.json'), 'utf8'));
  assert.equal(prop.ops[0].op, 'updateShot');
  const disk = JSON.parse(await fs.readFile(path.join(dir, 'project.json'), 'utf8'));
  assert.equal(disk.shots[0].font, 1, 'project.json 没被直接改');
});
