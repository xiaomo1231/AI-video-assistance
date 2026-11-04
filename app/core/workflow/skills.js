// 第一批 16 个 Skill：打包好的工作流 + 需要用户填的几项。都可以在工作流页改步骤、存成「我的 Skill」。
// 步骤 tool 名对应 electron/steps.js 里的实现。

const st = (kind, name, tool, desc = '', extra = {}) => ({ kind, name, tool, desc, ...extra });
const sel = (key, label, options, def) => ({ key, label, type: 'select', options, default: def ?? options[0] });
const txt = (key, label, ph = '', def = '') => ({ key, label, type: 'text', placeholder: ph, default: def });
const area = (key, label, ph = '', def = '') => ({ key, label, type: 'area', placeholder: ph, default: def });
const file = (key, label, accept = 'video', multi = false) => ({ key, label, type: 'file', accept, multi });

export const SKILLS = [
  { id: 'promo', cat: '生成', star: true, name: '一句话生成宣传片', sub: '你文档里的流程', desc: '说一句想做什么片，AI 先问清楚，再出结构和分镜；你看样片、圈注修改，满意后配音、配乐、出成片。没配 AI 也能用：会按规则先出一版分镜。',
    inputs: [area('need', '一句话需求', '例：给「先问我」做一支 3 分钟宣传片，突出它和普通 AI 的区别'), sel('len', '时长', ['30 秒', '1 分钟', '3 分钟', '5 分钟'], '1 分钟'), sel('ratio', '画幅', ['16:9 横版', '9:16 竖版', '1:1 方形']), txt('refs', '参考资料（可选）', '网址或要点')],
    steps: [st('human', '需求简报', 'brief', '确认一句话需求和参考资料'), st('ai', 'AI 提问', 'ai.questions', '一次问清所有不确定的点'), st('ai', '三个结构候选', 'ai.treatment', '选一个结构', { saveAs: 'treatment' }), st('ai', '分镜与台词', 'ai.storyboard', '写出镜头、卡片和台词'), st('tool', '估时与体检', 'health', '台词驱动时长，检查对齐'), st('review', '审片圈注', 'review', '不满意就圈出来写一句，AI 回去改'), st('ai', '按圈注修改', 'ai.revise', '只改圈到的地方'), st('tool', '配音', 'tts.all', '按句生成，换接口和音色在音频页'), st('tool', '听写校验', 'asr.check', '没装听写会跳过'), st('tool', '配乐与音效', 'music.bed', '按模板情绪生成配乐，转场加音效'), st('tool', '成片渲染', 'export', 'MP4 / MOV'), st('tool', '交付体检', 'health', '')],
    loop: { from: 5, to: 6, max: 9 }, out: '成片 MP4、字幕 SRT、录音稿、可继续编辑的工程' },
  { id: 'screen', cat: '生成', name: '产品录屏宣传片', sub: '抓网页 + 镜头配方', desc: '给一个产品网址，抓取页面截图和文案，AI 按卖点排镜头，卡点剪成宣传片。',
    inputs: [txt('url', '产品网址', 'https://'), sel('len', '时长', ['30 秒', '60 秒', '90 秒']), sel('ratio', '画幅', ['16:9 横版', '9:16 竖版'])],
    steps: [st('tool', '抓取页面', 'capture.url', '截图 + 标题 + 文案', { saveAs: 'page' }), st('ai', '卖点与分镜', 'ai.storyboard', '每镜一个卖点，截图做画面'), st('tool', '配乐', 'music.bed'), st('tool', '卡点', 'beats.snap', '镜头切点对齐音乐节拍'), st('review', '审片圈注', 'review'), st('ai', '按圈注修改', 'ai.revise'), st('tool', '配音', 'tts.all'), st('tool', '导出', 'export')], loop: { from: 4, to: 5, max: 5 }, out: '成片 MP4、FCPXML' },
  { id: 'explain', cat: '生成', name: '讲解视频', sub: '白板、黑板、信息图', desc: '把一篇文章或一个知识点做成有旁白的讲解视频，每句旁白配一个画面。',
    inputs: [area('doc', '讲什么（粘贴文章或要点）'), sel('len', '时长', ['1 分钟', '3 分钟', '5 分钟']), sel('tplHint', '画面', ['白板讲解', '黑板粉笔', '等距信息图', '数据叙事'])],
    steps: [st('ai', '拆知识点', 'ai.outline', '按逻辑分段', { saveAs: 'treatment' }), st('ai', '旁白与画面', 'ai.storyboard', '口语化，每段一个比喻'), st('tool', '配音', 'tts.all'), st('review', '审片', 'review'), st('ai', '修改', 'ai.revise'), st('tool', '配乐', 'music.bed'), st('tool', '导出', 'export')], loop: { from: 3, to: 4, max: 5 }, out: '讲解视频、字幕' },
  { id: 'recreate', cat: '生成', name: '仿拍爆款结构', sub: 'Recreate a Video', desc: '给一条参考视频，拆出它的节奏、镜头和钩子，套到你的内容上。只学结构，不搬画面。',
    inputs: [file('ref', '参考视频', 'video'), area('topic', '你的内容')],
    steps: [st('tool', '镜头切分', 'scene.detect', '找出每个切点', { saveAs: 'cuts' }), st('tool', '听写', 'asr.transcribe', '没装听写会跳过', { saveAs: 'transcript' }), st('ai', '结构拆解', 'ai.structure', '钩子、转折、节奏', { saveAs: 'treatment' }), st('ai', '套到你的内容', 'ai.storyboard'), st('review', '确认', 'review'), st('ai', '修改', 'ai.revise'), st('tool', '配音配乐', 'tts.all'), st('tool', '配乐', 'music.bed'), st('tool', '导出', 'export')], loop: { from: 4, to: 5, max: 5 }, out: '结构分析 + 新分镜 + 成片' },
  { id: 'ugc', cat: '生成', name: '产品广告 / 种草', sub: 'Product ads', desc: '读商品页，整理卖点，出三个脚本版本，你挑一个做成竖版广告。',
    inputs: [txt('url', '商品页链接'), area('points', '补充卖点（可选）'), sel('ratio', '画幅', ['9:16 竖版', '1:1 方形'])],
    steps: [st('tool', '读商品页', 'capture.url', '', { saveAs: 'page' }), st('ai', '三个脚本', 'ai.treatment', '痛点型、对比型、清单型', { saveAs: 'treatment' }), st('ai', '分镜', 'ai.storyboard'), st('tool', '花字与音效', 'mg.auto'), st('tool', '配音', 'tts.all'), st('tool', '配乐', 'music.bed'), st('review', '审片', 'review'), st('ai', '修改', 'ai.revise'), st('tool', '导出', 'export')], loop: { from: 6, to: 7, max: 5 }, out: '竖版广告 MP4' },
  { id: 'clean', cat: '剪辑', name: '去口误和停顿', sub: 'Speech Cleanup', desc: '口播素材一键标出嗯、啊、重复和长停顿，确认后剪掉，保留自然呼吸。',
    inputs: [file('file', '口播素材', 'video'), sel('level', '力度', ['温和', '标准', '激进'], '标准')],
    steps: [st('tool', '导入素材', 'media.import'), st('tool', '语音转文字', 'asr.transcribe', '字级时间戳', { saveAs: 'transcript' }), st('tool', '标出口误和停顿', 'cut.find', '', { saveAs: 'cuts' }), st('human', '确认删除', 'cut.confirm'), st('tool', '剪掉', 'cut.apply')], out: '干净的口播时间线' },
  { id: 'caption', cat: '剪辑', name: '自动字幕', sub: 'Add captions', desc: '识别时间线上的人声生成字幕，按断句规则拆行，可以烧进画面或另存 SRT。',
    inputs: [sel('style', '字幕样式', ['简洁白字', '综艺花字', '底条字幕'])],
    steps: [st('tool', '语音转文字', 'asr.timeline', '', { saveAs: 'transcript' }), st('tool', '断句上轨', 'captions.apply'), st('human', '检查', 'human.confirm', '到字幕轨上改错字')], out: '字幕轨 + SRT' },
  { id: 'shorts', cat: '剪辑', name: '长视频切短视频', sub: 'Long to shorts', desc: '从长视频里找高光，切成竖版短视频，自动加标题和字幕。',
    inputs: [file('file', '长视频', 'video'), sel('n', '切几条', ['3', '5', '8'])],
    steps: [st('tool', '导入', 'media.import'), st('tool', '转写', 'asr.transcribe', '', { saveAs: 'transcript' }), st('ai', '找高光', 'ai.highlights', '按信息密度和情绪打分', { saveAs: 'highlights' }), st('human', '挑选', 'highlights.pick'), st('tool', '生成短视频工程', 'shorts.make', '竖版、标题、字幕'), st('tool', '批量导出', 'shorts.export')], out: '多条竖版短视频' },
  { id: 'textcut', cat: '剪辑', name: '按文字稿剪辑', sub: 'vlog 粗剪', desc: '把素材转成文字稿，在文字稿里删句子就是删画面。',
    inputs: [file('files', '素材（可多选）', 'video', true)],
    steps: [st('tool', '导入素材', 'media.import'), st('tool', '批量转写', 'asr.transcribe', '', { saveAs: 'transcript' }), st('human', '在文字稿里删改', 'textcut.edit'), st('tool', '生成粗剪', 'textcut.apply')], out: '粗剪时间线' },
  { id: 'beat', cat: '剪辑', name: '音乐卡点', sub: '踩点剪辑', desc: '分析音乐节拍，把镜头切点对齐到最近的重拍上。',
    inputs: [file('music', '音乐（留空用当前配乐）', 'audio')],
    steps: [st('tool', '节拍分析', 'beats.detect', 'BPM + 重拍', { saveAs: 'beats' }), st('tool', '切点对齐', 'beats.snap', '误差小于 1 帧'), st('human', '预览确认', 'human.confirm')], out: '卡点后的时间线' },
  { id: 'trans', cat: '剪辑', name: '视频翻译配音', sub: 'Video Translation', desc: '把台词翻译成其他语言，重新配音，长度贴近原句，字幕双语。',
    inputs: [sel('lang', '目标语言', ['英语', '日语', '韩语', '西班牙语', '法语'])],
    steps: [st('ai', '翻译与压缩', 'ai.translate', '长度贴近原句'), st('tool', '换配音', 'tts.all'), st('tool', '体检', 'health'), st('tool', '导出', 'export')], out: '译制版 MP4 + 双语字幕' },
  { id: 'mg', cat: '包装', name: '动态字幕与花字', sub: 'Motion Graphics', desc: '找出关键句，加花字、角标和强调动画。',
    inputs: [sel('tone', '风格', ['综艺', '科技', '可爱'])],
    steps: [st('ai', '找关键句', 'ai.keyphrases'), st('tool', '生成花字', 'mg.auto'), st('human', '确认', 'human.confirm')], out: '文字轨动效' },
  { id: 'logo', cat: '包装', name: '片头片尾 / Logo 落版', sub: '', desc: '用 Logo 和一句口号做 3~5 秒的片头和片尾。',
    inputs: [file('logo', 'Logo 图片', 'image'), txt('slogan', '口号'), txt('brand', '品牌名')],
    steps: [st('tool', '生成片头片尾', 'logo.cards'), st('tool', '加音效', 'sfx.auto'), st('human', '确认', 'human.confirm')], out: '片头片尾各一段' },
  { id: 'chart', cat: '包装', name: '数据图表动画', sub: '', desc: '粘贴一组数据，生成一个会长出来的柱状图镜头，配一句解读。',
    inputs: [area('data', '数据（每行：名称 数值）', '2021 12\n2022 18\n2023 31'), txt('title', '图表标题')],
    steps: [st('tool', '生成图表镜头', 'chart.card'), st('ai', '写一句解读', 'ai.chartline'), st('human', '确认', 'human.confirm')], out: '图表镜头' },
  { id: 'qc', cat: '质检', name: '成片体检', sub: '导出前必跑', desc: '时间对齐、字幕停留、字号、配音、听写、圈注、空隙、素材，一次查完。',
    inputs: [], steps: [st('tool', '体检', 'health'), st('tool', '听写校验', 'asr.check'), st('human', '看报告', 'health.show')], out: '体检报告' },
  { id: 'match', cat: '质检', name: '镜头颜色匹配', sub: '调色', desc: '选一个参考镜头，让其他镜头的亮度和色调向它靠拢。',
    inputs: [txt('ref', '参考镜头（如 S01）', 'S01', 'S01')],
    steps: [st('tool', '颜色匹配', 'color.match'), st('human', '确认', 'human.confirm')], out: '调色参数' },
];

export const SKILL_CATS = ['生成', '剪辑', '包装', '质检'];
export const skillById = (id) => SKILLS.find((s) => s.id === id);
