// 没配 AI 时的规则版：保证「一句话生成」开箱就能出第一版分镜，之后再用 AI 精修。
import { TEMPLATES } from './templates.js';

const pick = (arr, seed) => arr[Math.abs(seed) % arr.length];
const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);

/** 从需求里抽主题词 */
export function parseNeed(need = '') {
  const s = need.replace(/\s+/g, ' ').trim();
  const name = (s.match(/[「“"《](.+?)[」”"》]/) || [])[1] || (s.match(/给(.{1,12}?)(做|拍|剪|出)/) || [])[1] || s.slice(0, 8);
  const focus = (s.match(/(突出|强调|讲|介绍|说明)(.{2,30}?)([，。,.]|$)/) || [])[2] || '';
  const kind = /讲解|科普|教程|课程|知识/.test(s) ? 'explain' : /广告|种草|带货|商品/.test(s) ? 'ad' : /vlog|日常|旅行/i.test(s) ? 'vlog' : 'promo';
  const len = +(s.match(/(\d+)\s*分钟/) || [])[1] * 60 || +(s.match(/(\d+)\s*秒/) || [])[1] || 60;
  const hasLen = /(\d+)\s*(分钟|秒)/.test(s);
  return { name: name.trim(), focus: focus.trim(), kind, len, hasLen };
}

export function suggestTemplate(need) {
  const k = parseNeed(need).kind; const s = String(need);
  const rules = [[/水墨|武侠|古风|诗/, 'ink-wash'], [/春节|新年|过年|节日/, 'papercut-red'], [/儿童|绘本|睡前/, 'crayon-book'], [/数据|报告|增长|年报/, 'dataviz'], [/游戏|像素/, 'pixel-rpg'], [/新闻|快讯|周报/, 'news-package'], [/课程|知识|黑板|汉字/, 'chalkboard'], [/讲解|科普|原理/, 'whiteboard'], [/美漫|漫画|反转/, 'new-american-comic'], [/二次元|动漫|日系/, 'new-anime-key-visual'], [/vlog|手账|日常|学习/, 'new-journal-collage'], [/产品|发布|app|软件|AI/i, 'dark-keynote']];
  for (const [re, id] of rules) if (re.test(s)) return id;
  return k === 'ad' ? '01-flat-vector' : k === 'explain' ? 'whiteboard' : 'dark-keynote';
}

export const OFFLINE_TREATMENTS = (need) => {
  const { name } = parseNeed(need);
  return [
    { name: '问题 → 方案 → 证据 → 行动', why: '最稳的宣传片结构，先让观众认出自己的问题', beats: [`钩子：一个人人遇到过的场景`, `痛点：现在的做法哪里不好`, `转折：${name} 出场`, `三个关键能力，每个一镜`, `证据：一个数字或一句用户的话`, `行动：一句口号 + 落版`] },
    { name: '一个人的一天', why: '故事线，情绪更强，适合品牌和 vlog', beats: ['早上：主人公遇到麻烦', '中午：试了老办法，失败', `下午：用上 ${name}`, '晚上：结果和变化', '结尾：一句话点题'] },
    { name: '清单型：三件事', why: '信息密度高，适合短视频和讲解', beats: ['标题：关于它你要知道的三件事', '第一件', '第二件', '第三件', '总结 + 行动'] },
  ];
};

/** 规则版分镜：按结构拆镜头，写卡片和台词 */
export function offlineStoryboard({ need, treatment, len = 60, cta }) {
  const { name, focus } = parseNeed(need);
  // 结尾行动：问到的优先，其次是需求里的「引导下载 / 结尾引导关注」
  const act = (cta || (need.match(/引导(?:用户|观众|大家)?(.{1,10}?)(?:[，。,.！!]|$)/) || [])[1] || '').trim().replace(/^去/, '');
  const end = (def) => (act ? (/^(现在|马上|立即)/.test(act) ? act : `现在就${act}`) : def);
  const t = treatment || OFFLINE_TREATMENTS(need)[0];
  const seed = hash(need);
  const hooks = [`你有没有过这样的时候？`, `先问你一个问题。`, `如果只给你一秒钟——`, `这件事，大多数人都做错了。`];
  const feats = (focus ? focus.split(/[、，,和与及]/).filter(Boolean) : []).concat(['更快', '更准', '更省心']).slice(0, 3);
  const shots = [];
  const add = (title, card, lines, chapter = '') => shots.push({ title, chapter, card, lines: lines.map((x) => (typeof x === 'string' ? { who: '旁白', text: x } : x)), minDur: 2.5 });
  if (/清单|三件事/.test(t.name)) {
    add('开场', { layout: 'title', heading: `关于${name}`, body: '你要知道的三件事' }, [pick(hooks, seed), `关于${name}，你只需要记住三件事。`], '开场');
    feats.forEach((f, i) => add(`第${i + 1}件`, { layout: 'number', heading: String(i + 1), body: f }, [`第${'一二三'[i]}件：${f}。`], `第 ${i + 1} 件`));
    add('总结', { layout: 'bullets', heading: '记住这三点', bullets: feats }, ['就这三件事，记住了吗？']);
    add('落版', { layout: 'end', heading: name, body: end('现在就试试') }, [`${name}，${end('现在就试试')}。`], '结尾');
  } else if (/一天|故事/.test(t.name)) {
    add('早上', { layout: 'statement', heading: '早上 8:00', body: '又是手忙脚乱的一天' }, ['早上八点，又是手忙脚乱的一天。'], '早上');
    add('老办法', { layout: 'compare', heading: '老办法', bullets: ['花时间', '容易错'] }, ['试了老办法，还是不行。'], '中午');
    add('转折', { layout: 'title', heading: name, body: focus || '换个方式' }, [`直到用上了${name}。`], '下午');
    feats.forEach((f, i) => add(`变化 ${i + 1}`, { layout: 'statement', heading: f, body: '' }, [`${f}。`]));
    add('结尾', { layout: 'end', heading: name, body: end('让每天轻一点') }, [act ? `${name}，${end('')}。` : `${name}，让每一天轻一点。`], '晚上');
  } else {
    add('钩子', { layout: 'question', heading: pick(['你也这样吗？', '还在这样做？', '一秒钟够吗？'], seed), body: '' }, [pick(hooks, seed)], '开场');
    add('痛点', { layout: 'statement', heading: '问题在这里', body: '花了时间，结果还不对' }, ['花了很多时间，结果还是不对。', '问题不在你，在方法。'], '痛点');
    add('出场', { layout: 'title', heading: name, body: focus || '换一种方式' }, [`所以我们做了${name}。`], '方案');
    feats.forEach((f, i) => add(`能力 ${i + 1}`, { layout: 'statement', heading: f, body: '' }, [`${f}。`], i === 0 ? '能力' : ''));
    add('证据', { layout: 'number', heading: '3×', body: '效率提升（示例数据，请替换）' }, ['这里换成一个真实的数字，或者一句用户原话（请替换）。'], '证据');
    add('行动', { layout: 'end', heading: name, body: end('现在就开始') }, [`${name}，${end('现在就开始')}。`], '结尾');
  }
  // 按目标时长加减：太短就给每镜加一句，太长就合并
  const est = shots.reduce((a, s) => a + s.lines.reduce((b, l) => b + l.text.length / 4.6 + 0.8, 0.9), 0);
  if (est < len * 0.6) for (const s of shots) if (s.card.layout !== 'end') s.minDur = Math.min(8, (len / shots.length) * 0.9);
  return { template: suggestTemplate(need), shots };
}

export const templatesForMood = (mood) => TEMPLATES.filter((t) => t.music.mood === mood);
