// 分镜换顺序后的衔接建议（没配 AI 或 AI 失败时用的规则版）。
// 只看顺序变了的接缝：补一句承接台词、跨章节改成叠化、被夹在别的章节中间的镜头归入那一章、落版放回最后。
// 每条建议自带操作，界面可以逐条勾选；和重排放进同一步撤销。
import { shotLines } from './timing.js';

const topic = (c) => String(c || '').split(/[·・:：]/).pop().trim();
const BRIDGES = /^(说完.{1,12}?，再看这个：|再往下看：|接着说：)/;

/** 最少挪了哪些镜头：不在最长保序子列里的那些 */
export function movedIds(before, after) {
  const pos = after.map((id) => before.indexOf(id)); const n = pos.length; const L = Array(n).fill(1), pr = Array(n).fill(-1);
  for (let k = 0; k < n; k++) for (let j = 0; j < k; j++) if (pos[j] < pos[k] && L[j] + 1 > L[k]) { L[k] = L[j] + 1; pr[k] = j; }
  let k = n ? L.indexOf(Math.max(...L)) : -1; const keep = new Set(); while (k >= 0) { keep.add(after[k]); k = pr[k]; }
  return after.filter((id) => !keep.has(id));
}

/**
 * @param p 当前工程（还是旧顺序）
 * @param order 新的镜头 id 顺序
 * @returns [{ key, kind, shot, title, why, old, text, ops }]
 */
export function planSmooth(p, order) {
  const byId = new Map(p.shots.map((s) => [s.id, s])); const before = p.shots.map((s) => s.id);
  const prevOf = (id) => before[before.indexOf(id) - 1];
  const moved = new Set(movedIds(before, order)); const out = []; const lineDone = new Set();
  const label = (id) => 'S' + String(order.indexOf(id) + 1).padStart(2, '0');

  order.forEach((id, k) => {
    if (!k || prevOf(id) === order[k - 1]) return; // 这条接缝没变
    const a = byId.get(order[k - 1]), b = byId.get(id);
    const l = shotLines(p, id).filter((x) => !x.subOnly)[0];
    if (l && !lineDone.has(l.id)) {
      lineDone.add(l.id);
      const base = l.text.replace(BRIDGES, '');
      const bridge = a.chapter && b.chapter && a.chapter !== b.chapter ? `说完${topic(a.chapter)}，再看这个：` : '再往下看：';
      out.push({ key: 'line:' + l.id, kind: 'line', shot: id, title: `${label(id)} 开头补一句承接`, old: l.text, text: bridge + base, why: '前面接的镜头变了，补一句话让观众跟上', ops: [{ op: 'updateLine', args: { id: l.id, patch: { text: bridge + base } } }] });
    }
    if (a.chapter !== b.chapter && (b.trans?.type || 'cut') === 'cut') out.push({ key: 'trans:' + id, kind: 'trans', shot: id, title: `${label(order[k - 1])} → ${label(id)} 换章节，转场改成叠化 0.4 秒`, why: '原来是硬切，换章节时画面会跳一下', ops: [{ op: 'updateShot', args: { id, patch: { trans: { type: 'fade', dur: 0.4 } } } }] });
  });

  order.forEach((id, k) => {
    if (!k || k === order.length - 1) return;
    if (!moved.has(id) && prevOf(id) === order[k - 1] && prevOf(order[k + 1]) === id) return; // 两边接缝都没变
    const a = byId.get(order[k - 1]), c = byId.get(order[k + 1]), m = byId.get(id);
    if (a.chapter && a.chapter === c.chapter && a.chapter !== m.chapter) out.push({ key: 'chap:' + id, kind: 'chapter', shot: id, title: `${label(id)} 归入「${topic(a.chapter)}」`, why: '它现在夹在这一章中间，不改的话章节条会断成两段', ops: [{ op: 'updateShot', args: { id, patch: { chapter: a.chapter } } }] });
  });

  const end = p.shots[p.shots.length - 1];
  if (end && end.src?.card?.layout === 'end' && order[order.length - 1] !== end.id) out.push({ key: 'end:' + end.id, kind: 'end', shot: end.id, title: `把落版「${end.title}」放回最后`, why: '片尾卡带着结束语，放在中间会让片子提前收尾', order: [...order.filter((x) => x !== end.id), end.id], ops: [] });
  return out;
}

/** 把勾选的建议和新顺序合成一组操作 */
export function smoothOps(order, items) {
  let ord = order; const ops = [];
  for (const it of items) { if (it.order) ord = it.order; ops.push(...it.ops); }
  return [{ op: 'reorderShots', args: { ids: ord } }, ...ops];
}
