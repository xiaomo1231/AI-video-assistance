// 第一批 30 个风格模板。每个模板 = 风格提示词 + 配色 + 字体 + 背景处理 + 动效 + 转场 + 配乐倾向。
// 内置卡片渲染器（renderer/player/cards.js）按 bg 字段选背景处理。
// 来源：lemo-opuscar（代码 MIT，样片 CC BY 4.0，署名 LemoLab）、mg-styles-15（MIT）、墨剪自有。

const F = {
  hei: "'Microsoft YaHei','PingFang SC','Noto Sans CJK SC','Source Han Sans SC',sans-serif",
  song: "'SimSun','Songti SC','Noto Serif CJK SC','Source Han Serif SC',serif",
  kai: "'KaiTi','STKaiti','Kaiti SC','AR PL UKai CN',serif",
  round: "'YouYuan','Yuanti SC','Microsoft YaHei','PingFang SC',sans-serif",
  mono: "'Consolas','Menlo','Noto Sans Mono CJK SC',monospace",
  black: "'Microsoft YaHei UI','PingFang SC','Noto Sans CJK SC',sans-serif",
};
const L = 'lemo-opuscar', LL = 'MIT · 样片 CC BY 4.0（LemoLab）', M = 'mg-styles-15';

const T = (id, name, en, cat, uses, src, line, palette, font, bg, motion = 'ease', trans = 'fade', music = { mood: 'calm', bpm: 90 }, prompt = '') =>
  ({ id, name, en, cat, uses, src, lic: src === L ? LL : src === M ? 'MIT' : '墨剪自有', line, palette, font, bg, motion, trans, music, prompt: prompt || `${name}（${en}）风格：${line}` });

export const TEMPLATES = [
  T('crayon-book', '蜡笔儿童绘本', 'Crayon Picture Book', '手绘与绘画', ['绘本', '睡前故事', '儿童学习'], L, '月亮失眠了，小女孩爬上屋顶给它唱摇篮曲。', { bg: '#1d2a5c', fg: '#fff6d8', accent: '#ffd23f', accent2: '#ff7b54', sub: '#c9d3ff' }, { head: F.round, body: F.round }, 'crayon', 'wobble', 'page', { mood: 'lullaby', bpm: 72 }),
  T('watercolor', '水彩笔刷', 'Watercolor Brush', '手绘与绘画', ['自然纪录', '旅行', '科普'], L, '跟着降雨从澳洲红色腹地一路画到绿色海岸，一镜到底。', { bg: '#f6f0e4', fg: '#3a2f28', accent: '#d2553b', accent2: '#4f8f8b', sub: '#7d6f62' }, { head: F.kai, body: F.song }, 'watercolor', 'bleed', 'dissolve', { mood: 'warm', bpm: 84 }),
  T('ink-wash', '中国水墨', 'Chinese Ink Wash', '手绘与绘画', ['武侠', '文化品牌', '诗词'], L, '侠客踏水过江，一剑断流。', { bg: '#efe8d8', fg: '#1b1a17', accent: '#b3261e', accent2: '#56524a', sub: '#6d675c' }, { head: F.kai, body: F.kai }, 'ink', 'brush', 'ink', { mood: 'guqin', bpm: 66 }),
  T('impasto', '油画厚涂', 'Impasto Oil Painting', '手绘与绘画', ['MV', '艺术文化', '情感广告'], L, '灰色雨中广场，第一把红伞撑开，圆舞曲把整个广场刷上颜色。', { bg: '#3b3f46', fg: '#f6efe3', accent: '#d8402e', accent2: '#e7b347', sub: '#c4bdb2' }, { head: F.song, body: F.song }, 'oil', 'ease', 'dissolve', { mood: 'waltz', bpm: 132 }),
  T('whiteboard', '白板讲解', 'Whiteboard Explainer', '手绘与绘画', ['讲解视频', '网课', '科学'], L, '手机怎么知道你在哪：GPS、原子钟，和相对论每天多出的 38 微秒。', { bg: '#fbfbf8', fg: '#1d1d1f', accent: '#e4572e', accent2: '#2a6fdb', sub: '#6b6b70' }, { head: F.hei, body: F.hei }, 'whiteboard', 'draw', 'wipe', { mood: 'curious', bpm: 100 }),
  T('urban-sketch', '钢笔淡彩', 'Urban Sketch · Pen & Wash', '手绘与绘画', ['城市旅行', '建筑', '生活品牌'], L, '公园只是一张钢笔速写，风把草帽吹到哪里，哪里才有颜色。', { bg: '#f7f3ea', fg: '#2b2925', accent: '#e39b3b', accent2: '#5b9a6e', sub: '#7a746a' }, { head: F.kai, body: F.hei }, 'sketch', 'draw', 'dissolve', { mood: 'acoustic', bpm: 96 }),
  T('chalkboard', '黑板粉笔', 'Chalkboard', '手绘与绘画', ['汉字词源', '辟谣', '课程'], L, '粉笔写下网上的说法，再一擦，把「射」写回三千年前。', { bg: '#23382f', fg: '#eef0e6', accent: '#ffd36b', accent2: '#ff8c8c', sub: '#b9c6bd' }, { head: F.kai, body: F.kai }, 'chalk', 'draw', 'erase', { mood: 'classroom', bpm: 92 }),
  T('shadow-puppet', '皮影戏', 'Shadow Puppetry', '东方传统', ['神话传说', '非遗', '节庆'], L, '十日炙烤大地，后羿张弓射日。', { bg: '#f2c46b', fg: '#2a1408', accent: '#a3271d', accent2: '#3d6b4f', sub: '#6b3d1c' }, { head: F.kai, body: F.kai }, 'shadow', 'ease', 'curtain', { mood: 'opera', bpm: 108 }),
  T('ukiyoe', '浮世绘', 'Ukiyo-e', '东方传统', ['旅行', '日本文化', '诗词'], L, '旅人走向远山，每个镜头都是一幅版画。', { bg: '#efe2c4', fg: '#1f2a44', accent: '#c0392b', accent2: '#2e5e8c', sub: '#5a5244' }, { head: F.song, body: F.song }, 'ukiyo', 'ease', 'scroll', { mood: 'koto', bpm: 76 }),
  T('papercut-red', '红色窗花剪纸', 'Red Paper-cut', '东方传统', ['春节', '节日祝福', '民间故事'], L, '除夕年兽进村，小女孩剪出的大窗花照亮全村。', { bg: '#fbf1dc', fg: '#c1121f', accent: '#c1121f', accent2: '#e9a825', sub: '#8a1c14' }, { head: F.kai, body: F.kai }, 'papercut', 'unfold', 'fold', { mood: 'festive', bpm: 120 }),
  T('risograph', 'Risograph 孔版印刷', 'Risograph Print', '印刷与版画', ['独立品牌', '独立刊物', '生活方式'], L, '周日早晨骑车穿过城市，每到一处加一版油墨。', { bg: '#f4efe4', fg: '#2b3a8c', accent: '#ff5f7e', accent2: '#ffd400', sub: '#2b3a8c' }, { head: F.black, body: F.hei }, 'riso', 'slide', 'wipe', { mood: 'indie', bpm: 112 }),
  T('halftone-dossier', '复古半调案卷', 'Halftone Dossier', '印刷与版画', ['搞笑', '萌宠', '社交短视频'], L, '橘猫胖橘被立案审查，最后无罪释放。', { bg: '#efe6cf', fg: '#1a1a1a', accent: '#d7263d', accent2: '#1b4965', sub: '#544e44' }, { head: F.black, body: F.mono }, 'halftone', 'stamp', 'slide', { mood: 'detective', bpm: 104 }),
  T('woodcut', '木刻版画', 'Woodcut Print', '印刷与版画', ['民间故事', '手作品牌', '图书预告'], L, '村子用一整个冬天铸一口钟，钟声第一次响起，雪停了。', { bg: '#efe7d6', fg: '#171412', accent: '#9e2a2b', accent2: '#3c3a36', sub: '#4a4540' }, { head: F.song, body: F.song }, 'woodcut', 'stamp', 'cut', { mood: 'folk', bpm: 80 }),
  T('dark-keynote', '暗色科技发布', 'Dark Tech Keynote', '信息与发布', ['产品发布', 'SaaS', '发布会'], L, '一键把几百个窗口归位的发布片。', { bg: '#0b0d12', fg: '#f5f7fa', accent: '#5b8cff', accent2: '#9b6bff', sub: '#8b93a7' }, { head: F.black, body: F.hei }, 'dark', 'rise', 'fade', { mood: 'tech', bpm: 118 }),
  T('living-screencast', '活体实机录屏', 'Living Screencast', '信息与发布', ['产品教程', '功能发布', '新手引导'], L, '一镜到底演示产品的关键功能。', { bg: '#eef1f6', fg: '#14161b', accent: '#d97757', accent2: '#3b82f6', sub: '#5d6472' }, { head: F.hei, body: F.hei }, 'screen', 'rise', 'push', { mood: 'light-tech', bpm: 110 }),
  T('iso-infographic', '等距信息图', 'Isometric Infographic', '信息与发布', ['流程讲解', '供应链', '年报'], L, '一杯咖啡从种植园到你手里的旅程。', { bg: '#eaf3f2', fg: '#183a37', accent: '#f28f3b', accent2: '#2a9d8f', sub: '#4b6b68' }, { head: F.hei, body: F.hei }, 'iso', 'rise', 'push', { mood: 'corporate', bpm: 104 }),
  T('dataviz', '数据叙事', 'Data Storytelling', '信息与发布', ['数据新闻', '报告', '气候科学'], L, '一百年的夏季气温，图表本身就是故事。', { bg: '#101418', fg: '#eef2f5', accent: '#ef5b3f', accent2: '#3fa7ef', sub: '#8f9aa4' }, { head: F.black, body: F.hei }, 'data', 'grow', 'fade', { mood: 'serious', bpm: 90 }),
  T('rubber-hose', '1930s 橡皮管卡通', '1930s Rubber Hose Cartoon', '卡通与动画', ['美食饮品', '复古广告', '儿童'], L, '一只咖啡杯满厨房追一块逃跑的方糖。', { bg: '#e9dcc0', fg: '#141210', accent: '#141210', accent2: '#b5402c', sub: '#4a4237' }, { head: F.black, body: F.hei }, 'vintage', 'bounce', 'iris', { mood: 'ragtime', bpm: 140 }),
  T('cel-anime-80s', '80 年代赛璐璐动画', '80s Cel Anime', '卡通与动画', ['MV', '游戏预告', '怀旧'], L, '快递少女骑车穿过雨后霓虹都市。', { bg: '#1b1036', fg: '#fff2f8', accent: '#ff4f9a', accent2: '#3fe0ff', sub: '#c7a8ff' }, { head: F.black, body: F.hei }, 'cel80', 'slide', 'wipe', { mood: 'citypop', bpm: 116 }),
  T('midcentury-toon', '50s 扁平卡通', 'Mid-century Cartoon', '卡通与动画', ['安装指南', '帮助中心', '教程'], L, '用 50 年代教育片的口吻，三步教你装好一台扫地机。', { bg: '#f3e6c9', fg: '#2d2a26', accent: '#e05d3a', accent2: '#2f8f83', sub: '#6e655a' }, { head: F.round, body: F.hei }, 'midcentury', 'bounce', 'wipe', { mood: 'swing', bpm: 128 }),
  T('new-american-comic', '美漫分格', 'American Comic', '卡通与动画', ['反转剧情', '爽点短视频', 'vlog'], '墨剪', '粗黑描边、网点阴影、分格推进和拟声字。', { bg: '#fff7d6', fg: '#111111', accent: '#e63946', accent2: '#1d70d6', sub: '#333333' }, { head: F.black, body: F.black }, 'comic', 'punch', 'panel', { mood: 'action', bpm: 140 }),
  T('new-anime-key-visual', '日系二次元', 'Anime Key Visual', '卡通与动画', ['情绪短片', '校园', 'vlog'], '墨剪', '赛璐璐上色、逆光和速度线。', { bg: '#9fd3ff', fg: '#ffffff', accent: '#ff7eb6', accent2: '#ffd36e', sub: '#ffffff' }, { head: F.round, body: F.hei }, 'anime', 'slide', 'flash', { mood: 'emotional', bpm: 96 }),
  T('pixel-rpg', '16-bit 像素 RPG', '16-bit Pixel RPG', '游戏', ['游戏预告', '回顾', '怀旧'], L, '勇士在最终 Boss 门前存档，存档画面闪回一路冒险。', { bg: '#14143c', fg: '#ffffff', accent: '#ffd23f', accent2: '#4ade80', sub: '#a5b4fc' }, { head: F.mono, body: F.mono }, 'pixel', 'type', 'cut', { mood: 'chiptune', bpm: 128 }),
  T('microgame', '微游戏快闪', 'Microgame Frenzy', '游戏', ['游戏预告', '新手引导', '社交短视频'], L, '五秒训练营，越来越快。', { bg: '#ffef3a', fg: '#151515', accent: '#ff2e63', accent2: '#08d9d6', sub: '#151515' }, { head: F.black, body: F.black }, 'microgame', 'punch', 'cut', { mood: 'frantic', bpm: 160 }),
  T('game-show', '综艺节奏扁平', 'Game Show Flat', '游戏', ['科技史', '年度回顾', '综艺'], L, '把一段历史做成一局节奏游戏，最后发成绩单。', { bg: '#2b2dbf', fg: '#ffffff', accent: '#ffcf33', accent2: '#ff4d8d', sub: '#c9caff' }, { head: F.black, body: F.black }, 'gameshow', 'punch', 'wipe', { mood: 'gameshow', bpm: 126 }),
  T('news-package', '电视新闻包装', 'Broadcast News Package', '剪辑与纪实', ['新闻汇总', '快讯', '市场动态'], L, '一整套电视台包装：串联单、标题条、翻牌价格表。', { bg: '#0d1b2a', fg: '#ffffff', accent: '#e63946', accent2: '#f4a261', sub: '#a8b5c4' }, { head: F.black, body: F.hei }, 'news', 'slide', 'push', { mood: 'news', bpm: 120 }),
  T('01-flat-vector', '扁平矢量', 'Flat Vector', '图形与排版', ['产品宣传', '社交短视频'], M, '干净的扁平图形和几何动效。', { bg: '#f7f4ef', fg: '#1f2041', accent: '#ff6b4a', accent2: '#4a7dff', sub: '#6c6d8a' }, { head: F.black, body: F.hei }, 'flat', 'pop', 'wipe', { mood: 'upbeat', bpm: 120 }),
  T('04-3d-render', '3D 软萌渲染', '3D Render', '材质与 3D', ['产品宣传', '社交短视频'], M, '软光照、圆润体块和轻微景深。', { bg: '#e9e4ff', fg: '#25204a', accent: '#ff8fab', accent2: '#7c6cff', sub: '#5c5680' }, { head: F.round, body: F.hei }, 'soft3d', 'pop', 'dissolve', { mood: 'cute', bpm: 108 }),
  T('06-collage', '拼贴', 'Collage', '印刷与版画', ['产品宣传', '社交短视频'], M, '剪报、撕纸和错位排版。', { bg: '#efe9de', fg: '#181818', accent: '#ff4d2e', accent2: '#2e6bff', sub: '#555049' }, { head: F.black, body: F.song }, 'collage', 'stamp', 'cut', { mood: 'quirky', bpm: 112 }),
  T('new-journal-collage', '手账拼贴', 'Journal Collage', '手绘与绘画', ['vlog', '学习记录', '旅行'], '墨剪', '胶带、贴纸、手写字和便签。', { bg: '#fdf6ec', fg: '#3b2f2f', accent: '#f28b82', accent2: '#8ecae6', sub: '#8a7b70' }, { head: F.kai, body: F.round }, 'journal', 'wobble', 'page', { mood: 'lofi', bpm: 84 }),
];

export const TEMPLATE_CATS = ['手绘与绘画', '东方传统', '印刷与版画', '信息与发布', '卡通与动画', '游戏', '剪辑与纪实', '图形与排版', '材质与 3D'];
export const templateById = (id) => TEMPLATES.find((t) => t.id === id) || TEMPLATES.find((t) => t.id === 'dark-keynote');

/** 卡片布局 */
export const LAYOUTS = {
  title: '片名', statement: '大字金句', bullets: '要点列表', quote: '引语', chart: '柱状图', compare: '左右对比',
  image: '图片 + 说明', number: '大数字', question: '提问', end: '片尾落版', lower: '人物条 / 标题条',
};
