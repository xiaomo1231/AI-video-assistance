// AI 改片循环：读上下文 → 工具调用（在副本上）→ 修改建议 → 用户确认 → 应用 → 自检
import { chat } from './providers.js';
import { TOOLS, makeContext, callTool, summarize } from './tools.js';
import { health, healthBad } from '../health.js';
import { templateById } from '../templates.js';

export const SYSTEM = `你是「墨剪」视频工作台里的剪辑助手，帮用户改他们的视频工程。
规则：
1. 改之前先用 project_read 看工程；镜头用 S01、S02，台词用 L01、L02 指代。
2. 只改用户要求的地方，不顺手改别的。改动会先作为「修改建议」给用户确认，所以放心调用写工具。
3. 改完调用 health_check，有新问题就自己修一次。
4. 用户圈了画面（圈注）时，rect 是 [x, y, w, h]，0~1 归一化坐标。处理完调用 annotation_resolve。
5. 最后用一两句话说清楚改了什么、为什么，用中文，不要用 Markdown 标题。
6. 字幕和画面文字要能读完：中文每秒不超过 4.5 个字。`;

export const GENERATE_SYSTEM = `你是「墨剪」的导演。根据用户的一句话需求，用 storyboard_write 一次写出整片分镜。
要求：
- 开头 3 秒内给出钩子；结构清楚（起、承、转、合或 问题、方案、证据、行动）。
- 每个镜头一张卡片：layout 从 title / statement / bullets / quote / chart / compare / number / question / end / lower 里选，heading 不超过 14 个字，body 不超过 30 个字。
- 每个镜头 1~3 句台词，口语化，每句不超过 26 个字；角色可以是 旁白 或具体人物。
- 总时长按用户要求估算：中文配音约每秒 4.6 个字。
- 选一个最合适的风格模板，用 template 字段给出。
写完调用 health_check，然后用一两句话说明结构。`;

/**
 * @param {object} o
 * @param {object} o.cfg 模型配置 {proto, baseUrl, key, model}
 * @param {object} o.project 当前工程（不会被修改）
 * @param {string} o.prompt 用户的话
 * @param {object} [o.context] {page, selection, time, annotation, frame(dataURL)}
 * @param {Array} [o.history] 之前的对话
 * @param {(e:object)=>void} [o.onEvent]
 */
export async function runAgent({ cfg, project, prompt, context = {}, history = [], onEvent = () => {}, signal, system = SYSTEM, maxSteps = 14, budget }) {
  const ctx = makeContext(project);
  const tpl = templateById(project.template);
  const ctxText = [
    context.page && `当前页面：${context.page}`,
    context.selection && `选中：${context.selection}`,
    context.time != null && `播放头：${context.time}`,
    context.annotation && `圈注：${JSON.stringify(context.annotation)}`,
    `风格模板：${tpl.name}（${tpl.prompt}）`,
  ].filter(Boolean).join('\n');
  const messages = [{ role: 'system', content: system }, ...history, { role: 'user', content: `${prompt}\n\n[上下文]\n${ctxText}`, images: context.frame ? [context.frame] : undefined }];
  const usage = { input: 0, output: 0 };
  let text = '';
  for (let step = 0; step < maxSteps; step++) {
    if (budget) budget.check();
    onEvent({ type: 'thinking', step });
    const r = await chat(cfg, { messages, tools: TOOLS, signal });
    usage.input += r.usage.input; usage.output += r.usage.output;
    if (budget) budget.add(r.usage);
    messages.push({ role: 'assistant', content: r.text, tool_calls: r.tool_calls });
    if (r.text) { text = r.text; onEvent({ type: 'text', text: r.text }); }
    if (!r.tool_calls.length) break;
    for (const c of r.tool_calls) {
      onEvent({ type: 'tool', name: c.name, args: c.args });
      let result;
      try { result = await callTool(ctx, c.name, c.args); } catch (e) { result = { error: e.message }; }
      messages.push({ role: 'tool', tool_call_id: c.id, name: c.name, content: JSON.stringify(result).slice(0, 30000) });
    }
  }
  const changes = summarize(project, ctx.p);
  return { text, ops: ctx.ops, changes, after: ctx.p, health: health(ctx.p), bad: healthBad(health(ctx.p)), usage, history: messages.slice(1) };
}
