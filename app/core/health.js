// 成片体检：导出前跑；AI 改片后也跑
import { overflow, shotLines, speechDur, tc } from './timing.js';

/** @returns {{id:string, level:'ok'|'warn'|'error', title:string, detail:string, items:Array}[]} */
export function health(p) {
  const res = [];
  const add = (id, level, title, detail, items = []) => res.push({ id, level, title, detail, items });
  const sid = (s) => `S${String(p.shots.indexOf(s) + 1).padStart(2, '0')}`;
  const lno = (l) => p.lines.indexOf(l) + 1;

  const ov = p.shots.filter((s) => overflow(p, s));
  add('align', ov.length ? 'error' : 'ok', '时间对齐', ov.length ? `台词超出镜头：${ov.map(sid).join('、')}，最后一句会被切掉。到「时长」改回「按台词自动」或解锁。` : '台词都在镜头之内，配音、字幕、画面对齐', ov.map((s) => ({ shot: s.id })));

  const short = p.lines.filter((l) => l.sdur < speechDur(l.text, 1, p.fps, p.settings) * 0.8);
  add('subdur', short.length ? 'warn' : 'ok', '字幕停留', short.length ? `第 ${short.map(lno).join('、')} 句字幕停留偏短，读不完` : '每条字幕都够时间读完', short.map((l) => ({ line: l.id })));

  const small = p.shots.filter((s) => (s.font || 1) < 0.9);
  add('font', small.length ? 'warn' : 'ok', '字号', small.length ? `字号小于 90%：${small.map(sid).join('、')}` : '没有过小的字', small.map((s) => ({ shot: s.id })));

  const noAudio = p.lines.filter((l) => !l.audio && !l.subOnly);
  const stale = p.lines.filter((l) => l.status === 'stale');
  // 只是还没配音不算问题（导出时会补），标成提示
  add('voice', stale.length ? 'warn' : noAudio.length ? 'info' : 'ok', '配音',
    stale.length ? `第 ${stale.map(lno).join('、')} 句改过文字，配音需要重做` : noAudio.length ? `还有 ${noAudio.length} 句没有配音（导出时会自动生成）` : '每句都有配音', [...stale, ...noAudio].map((l) => ({ line: l.id })));

  const asrBad = p.lines.filter((l) => l.asr && l.asr.pass === false);
  add('asr', asrBad.length ? 'error' : 'ok', '听写校验', asrBad.length ? `第 ${asrBad.map(lno).join('、')} 句听写和原文对不上，可能读错或漏读` : p.lines.some((l) => l.asr) ? '已校验的句子都读对了' : '还没跑听写校验', asrBad.map((l) => ({ line: l.id })));

  const ann = (p.annotations || []).filter((a) => !a.done);
  add('anno', ann.length ? 'warn' : 'ok', '圈注', ann.length ? `还有 ${ann.length} 条圈注没处理` : '圈注都处理了', ann.map((a) => ({ anno: a.id })));

  const gaps = [];
  for (let i = 1; i < p.shots.length; i++) { const a = p.shots[i - 1], b = p.shots[i]; if (b.t0 - (a.t0 + a.dur) > 1 / p.fps) gaps.push(b); }
  add('gaps', gaps.length ? 'warn' : 'ok', '黑场空隙', gaps.length ? `主轨有空隙：${gaps.map((s) => tc(s.t0, p.fps)).join('、')} 之前` : '主轨没有空隙', gaps.map((s) => ({ shot: s.id })));

  const missing = p.shots.filter((s) => (s.src.kind === 'media' || s.src.kind === 'scene') && !p.assets.find((a) => a.id === s.src.asset));
  add('assets', missing.length ? 'error' : 'ok', '素材', missing.length ? `${missing.map(sid).join('、')} 的素材丢了` : '素材都在', missing.map((s) => ({ shot: s.id })));

  const empty = p.shots.filter((s) => s.src.kind === 'card' && !shotLines(p, s.id).length && !(s.src.card?.heading || s.src.card?.body));
  add('empty', empty.length ? 'warn' : 'ok', '空镜头', empty.length ? `${empty.map(sid).join('、')} 没有文字也没有台词` : '没有空镜头', empty.map((s) => ({ shot: s.id })));
  const fake = /示例数据|请替换|待替换/;
  const demo = p.shots.filter((s) => { const c = s.src.card || {}; return [c.heading, c.body, ...(c.bullets || [])].some((x) => fake.test(x || '')) || shotLines(p, s.id).some((l) => fake.test(l.text)) || p.texts.some((t) => t.anchor === s.id && fake.test(t.text)); });
  add('demo', demo.length ? 'warn' : 'ok', '示例内容', demo.length ? `${demo.map(sid).join('、')} 还是规则版写的示例数据，换成真实内容再发` : '没有留着的示例数据', demo.map((s) => ({ shot: s.id })));
  return res;
}

export const healthBad = (r) => r.filter((x) => x.level === 'warn' || x.level === 'error').length;
