// 界面优化四批里加到核心层的东西：分镜重排后的衔接建议、可增删的轨道、新模板
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, apply, trackOff } from '../core/project.js';
import { planSmooth, smoothOps, movedIds } from '../core/smooth.js';
import { TEMPLATES, GALLERY, templateById } from '../core/templates.js';
import { layout } from '../core/timing.js';

const card = (layout, heading) => ({ kind: 'card', in: 0, card: { layout, heading } });
const proj = () => { const p = normalize({ name: 't', fps: 24,
  shots: [
    { id: 'a', title: '开场', chapter: '开场', src: card('title', '开场') },
    { id: 'b', title: '问题', chapter: '第 1 关 · 作业讲解', src: card('statement', '问题') },
    { id: 'c', title: '讲义', chapter: '第 1 关 · 作业讲解', src: card('bullets', '讲义') },
    { id: 'd', title: '来源', chapter: '第 2 关 · 每句有出处', src: card('statement', '来源') },
    { id: 'e', title: '落版', chapter: '结尾', src: card('end', '落版') },
  ],
  lines: [{ id: 'l1', shot: 'a', who: '旁白', text: '期末前一晚。', off: 0, dur: 2 }, { id: 'l2', shot: 'b', who: '旁白', text: '一看就会。', off: 0, dur: 2 }, { id: 'l3', shot: 'c', who: '旁白', text: '拍一下题。', off: 0, dur: 2 }, { id: 'l4', shot: 'd', who: '旁白', text: '答案是 B。', off: 0, dur: 2 }] });
  layout(p); return p; };

test('只算最少挪动的镜头', () => {
  assert.deepEqual(movedIds(['a', 'b', 'c', 'd'], ['a', 'd', 'b', 'c']), ['d']);
  assert.deepEqual(movedIds(['a', 'b'], ['a', 'b']), []);
});

test('分镜换顺序：只对变了的接缝给建议，落版被挪走会提醒放回', () => {
  const p = proj();
  const items = planSmooth(p, ['a', 'd', 'b', 'c', 'e']);
  const kinds = items.map((x) => x.kind + ':' + x.shot);
  assert.ok(kinds.includes('line:d'), '挪到前面的镜头补承接'); assert.ok(kinds.includes('line:b'), '后面被接上的镜头也补');
  assert.ok(kinds.includes('trans:d'), '跨章节改叠化');
  assert.ok(!kinds.some((k) => k.endsWith(':c')), 'b→c 这条接缝没变，不动');
  assert.match(items.find((x) => x.kind === 'line' && x.shot === 'd').text, /^说完开场，再看这个：/);
  const end = planSmooth(p, ['a', 'e', 'b', 'c', 'd']).find((x) => x.kind === 'end');
  assert.ok(end && end.order.at(-1) === 'e');
});

test('夹在别的章节中间的镜头会建议归入那一章；应用后一步撤销', () => {
  const p = proj();
  const items = planSmooth(p, ['a', 'b', 'd', 'c', 'e']);
  assert.ok(items.some((x) => x.kind === 'chapter' && x.shot === 'd'));
  apply(p, smoothOps(['a', 'b', 'd', 'c', 'e'], items));
  assert.deepEqual(p.shots.map((s) => s.id), ['a', 'b', 'd', 'c', 'e']);
  assert.equal(p.shots.find((s) => s.id === 'd').chapter, '第 1 关 · 作业讲解');
  assert.ok(p.shots[2].t0 > p.shots[1].t0, '时间重排');
  // 再算一次不会叠两层承接语
  const again = planSmooth(p, ['a', 'd', 'b', 'c', 'e']).find((x) => x.kind === 'line' && x.shot === 'd');
  assert.equal((again.text.match(/再看这个|再往下看/g) || []).length, 1);
});

test('轨道：加文字轨插在主轨上面，删轨连片段一起删；配音轨删了只是静音', () => {
  const p = proj();
  const [id] = apply(p, [{ op: 'addTrack', args: { kind: 'tx', id: 'tx2' } }]);
  assert.equal(id, 'tx2'); assert.ok(p.tracks.findIndex((t) => t.id === 'tx2') < p.tracks.findIndex((t) => t.kind === 'v'));
  apply(p, [{ op: 'addText', args: { anchor: 'a', text: '花字', id: 't1' } }, { op: 'updateText', args: { id: 't1', patch: { track: 'tx2' } } }, { op: 'addText', args: { anchor: 'a', text: '默认轨', id: 't2' } }]);
  apply(p, [{ op: 'removeTrack', args: { id: 'tx2' } }]);
  assert.deepEqual(p.texts.map((x) => x.id), ['t2']);
  apply(p, [{ op: 'removeTrack', args: { id: 'vo' } }]);
  assert.equal(p.lines.length, 4); assert.ok(trackOff(p, 'vo', p.lines[0]));
  apply(p, [{ op: 'addTrack', args: { kind: 'vo' } }]);
  assert.ok(!trackOff(p, 'vo', p.lines[0])); assert.ok(p.tracks.some((t) => t.id === 'vo'));
  apply(p, [{ op: 'removeTrack', args: { id: 'v' } }]);
  assert.ok(p.tracks.some((t) => t.kind === 'v'), '主轨删不掉');
});

test('旧工程没有轨道表时补上默认六条', () => {
  const p = normalize({ name: 'old' });
  assert.deepEqual(p.tracks.map((t) => t.id), ['tx', 'v', 'vo', 'sub', 'sx', 'mu']);
});

test('风格画廊：每个模板都归到一个用途分组，新模板能找到', () => {
  const groups = new Set(GALLERY.map((g) => g.k));
  for (const t of TEMPLATES) assert.ok(groups.has(t.scene), t.id + ' 没有分组');
  assert.ok(TEMPLATES.length >= 40);
  assert.equal(templateById('red-black').name, '红黑硬核');
});
