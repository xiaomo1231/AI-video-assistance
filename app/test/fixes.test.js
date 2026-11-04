// 试用报告里修过的问题，各留一个回归测试
import test from 'node:test';
import assert from 'node:assert/strict';
import { atempo } from '../core/node/mix.js';
import { toEDL } from '../core/interchange.js';
import { normalize, apply, maxDur } from '../core/project.js';
import { checkLoop } from '../core/workflow/engine.js';
import { friendly } from '../core/errors.js';
import { offlineStoryboard, parseNeed } from '../core/offline.js';
import { health, healthBad } from '../core/health.js';
import { layout } from '../core/timing.js';

const proj = () => { const p = normalize({ name: 't', fps: 24, width: 1920, height: 1080,
  assets: [{ id: 'amw1nusgA', name: 'A.mp4', kind: 'video', path: 'media/A.mp4', dur: 10 }, { id: 'amw1nusgB', name: 'B.mp4', kind: 'video', path: 'media/B.mp4', dur: 8 }],
  shots: [{ id: 's1', title: 'a', src: { kind: 'media', asset: 'amw1nusgA', in: 0 }, dur: 3, lock: true }, { id: 's2', title: 'b', src: { kind: 'media', asset: 'amw1nusgB', in: 0 }, dur: 2, speed: 4, lock: true }] }); layout(p); return p; };

test('atempo 超过 2 倍时串联', () => {
  assert.equal(atempo(4), 'atempo=2,atempo=2');
  assert.equal(atempo(0.25), 'atempo=0.5,atempo=0.5');
  assert.equal(atempo(3), 'atempo=2,atempo=1.5');
});

test('EDL 卷名按文件名且不重名，变速写 M2', () => {
  const e = toEDL(proj());
  assert.match(e, /001 {2}A {8}V/); assert.match(e, /002 {2}B {8}V/);
  assert.match(e, /M2 {3}B {7}\s+096\.0/);
  assert.match(e, /00:00:00:00 00:00:08:00 00:00:03:00 00:00:05:00/); // 源出点 = 入点 + 2 秒 × 4
});

test('右边裁剪不能超过素材末尾', () => {
  const p = proj(); apply(p, [{ op: 'trimShot', args: { id: 's1', dur: 30 } }]);
  assert.equal(p.shots[0].dur, 10); assert.equal(maxDur(p, p.shots[1]), 2);
});

test('回路存坏了按审片步骤找回来', () => {
  const steps = [{ kind: 'tool' }, { kind: 'review' }, { kind: 'ai' }, { kind: 'tool' }];
  assert.deepEqual(checkLoop({ steps, loop: { from: 1, to: 2, max: 3 } }), { from: 1, to: 2, max: 3 });
  assert.deepEqual(checkLoop({ steps, loop: { from: 2, to: 3, max: 3 } }), { from: 1, to: 3, max: 3 });
  assert.equal(checkLoop({ steps: [{ kind: 'tool' }], loop: { from: 0, to: 0 } }), null);
});

test('报错翻成人话', () => {
  assert.match(friendly(new Error('getaddrinfo ENOTFOUND speech.platform.bing.com')), /连不上网络/);
  assert.match(friendly(new Error('401 invalid x-api-key')), /Key 不对/);
});

test('规则版：需求里的时长和结尾行动', () => {
  const need = '给我们公司的智能记账 App「小记」做一支 30 秒宣传片，突出语音记账，结尾引导下载';
  assert.equal(parseNeed(need).hasLen, true); assert.equal(parseNeed(need).len, 30);
  const sb = offlineStoryboard({ need, len: 30 }); const last = sb.shots[sb.shots.length - 1];
  assert.match(last.card.body, /下载/);
});

test('体检：只是还没配音不算问题，只做字幕的台词不算没配音，示例数据要提醒', () => {
  const p = normalize({ name: 't', fps: 24, shots: [{ id: 's1', title: 'a', src: { kind: 'card', card: { heading: '3×', body: '效率提升（示例数据，请替换）' } } }], lines: [{ id: 'l1', shot: 's1', text: '你好', who: '旁白' }, { id: 'l2', shot: 's1', text: '字幕', who: '字幕', subOnly: true }] }); layout(p);
  const h = health(p);
  assert.equal(h.find((x) => x.id === 'voice').level, 'info');
  assert.match(h.find((x) => x.id === 'voice').detail, /1 句/);
  assert.equal(h.find((x) => x.id === 'demo').level, 'warn');
  assert.equal(healthBad(h), h.filter((x) => x.level === 'warn' || x.level === 'error').length);
});
