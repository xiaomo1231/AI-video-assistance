// 模型接入层：三种协议（OpenAI 兼容、Anthropic Messages、Gemini）覆盖市面主流 API 与 Token / Coding Plan。
// 内部消息格式：{role:'system'|'user'|'assistant'|'tool', content, images?, tool_calls?:[{id,name,args}], tool_call_id?}

export const PRESETS = [
  // id, 名称, 协议, baseUrl, 默认模型, 说明
  ['anthropic', 'Anthropic Claude（API Key）', 'anthropic', 'https://api.anthropic.com', 'claude-sonnet-5-5', ''],
  ['openai', 'OpenAI（API Key）', 'openai', 'https://api.openai.com/v1', 'gpt-5.1', ''],
  ['gemini', 'Google Gemini（API Key）', 'gemini', 'https://generativelanguage.googleapis.com/v1beta', 'gemini-2.5-pro', ''],
  ['deepseek', 'DeepSeek', 'openai', 'https://api.deepseek.com/v1', 'deepseek-chat', ''],
  ['kimi', 'Kimi（月之暗面）', 'openai', 'https://api.moonshot.cn/v1', 'kimi-k2-0905-preview', ''],
  ['kimi-coding', 'Kimi Coding Plan', 'anthropic', 'https://api.kimi.com/coding', 'kimi-for-coding', 'Coding Plan 走 Anthropic 兼容接口'],
  ['glm', '智谱 GLM（API Key）', 'openai', 'https://open.bigmodel.cn/api/paas/v4', 'glm-4.6', ''],
  ['glm-coding', '智谱 GLM Coding Plan', 'anthropic', 'https://open.bigmodel.cn/api/anthropic', 'glm-4.6', 'Coding Plan 走 Anthropic 兼容接口'],
  ['qwen', '通义千问（阿里云百炼）', 'openai', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'qwen-plus', ''],
  ['qwen-coding', '百炼 Coding Plan', 'anthropic', 'https://coding.dashscope.aliyuncs.com/apps/anthropic', 'qwen3-coder-plus', ''],
  ['doubao', '豆包（火山方舟）', 'openai', 'https://ark.cn-beijing.volces.com/api/v3', 'doubao-seed-1-6-250615', '模型名可填接入点 ID'],
  ['minimax', 'MiniMax', 'openai', 'https://api.minimaxi.com/v1', 'MiniMax-M2', ''],
  ['minimax-coding', 'MiniMax Coding Plan', 'anthropic', 'https://api.minimaxi.com/anthropic', 'MiniMax-M2', ''],
  ['siliconflow', '硅基流动', 'openai', 'https://api.siliconflow.cn/v1', 'deepseek-ai/DeepSeek-V3', ''],
  ['openrouter', 'OpenRouter', 'openai', 'https://openrouter.ai/api/v1', 'anthropic/claude-sonnet-4.5', ''],
  ['ollama', '本地 Ollama', 'openai', 'http://localhost:11434/v1', 'qwen2.5:14b', '不需要 Key'],
  ['lmstudio', '本地 LM Studio', 'openai', 'http://localhost:1234/v1', 'local-model', '不需要 Key'],
  ['custom-openai', '自定义（OpenAI 兼容）', 'openai', '', '', ''],
  ['custom-anthropic', '自定义（Anthropic 兼容）', 'anthropic', '', '', ''],
].map(([id, name, proto, baseUrl, model, note]) => ({ id, name, proto, baseUrl, model, note }));
export const presetById = (id) => PRESETS.find((p) => p.id === id);

// ---------------- OpenAI 兼容 ----------------
function oaMessages(msgs) {
  return msgs.map((m) => {
    if (m.role === 'tool') return { role: 'tool', tool_call_id: m.tool_call_id, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) };
    if (m.role === 'assistant' && m.tool_calls?.length) return { role: 'assistant', content: m.content || null, tool_calls: m.tool_calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args || {}) } })) };
    if (m.images?.length) return { role: m.role, content: [{ type: 'text', text: m.content }, ...m.images.map((u) => ({ type: 'image_url', image_url: { url: u } }))] };
    return { role: m.role, content: m.content };
  });
}
async function openaiChat(cfg, { messages, tools, signal, maxTokens = 4096, temperature }) {
  const body = { model: cfg.model, messages: oaMessages(messages), max_tokens: maxTokens };
  if (temperature != null) body.temperature = temperature;
  if (tools?.length) body.tools = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.desc, parameters: t.input } }));
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.key) headers.Authorization = `Bearer ${cfg.key}`;
  const r = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body), signal });
  const j = await r.json().catch(async () => ({ error: { message: await r.text() } }));
  if (!r.ok) throw new Error(`${cfg.name || cfg.model}：${j.error?.message || r.status}`);
  const c = j.choices?.[0]?.message || {};
  return {
    text: c.content || '', usage: { input: j.usage?.prompt_tokens || 0, output: j.usage?.completion_tokens || 0 },
    tool_calls: (c.tool_calls || []).map((t) => ({ id: t.id, name: t.function.name, args: safeJson(t.function.arguments) })),
  };
}

// ---------------- Anthropic Messages（含各家 Coding Plan 的 Anthropic 兼容接口） ----------------
function anMessages(msgs) {
  const out = [];
  for (const m of msgs) {
    if (m.role === 'system') continue;
    if (m.role === 'tool') {
      const block = { type: 'tool_result', tool_use_id: m.tool_call_id, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) };
      const last = out[out.length - 1];
      if (last?.role === 'user' && Array.isArray(last.content) && last.content.every((b) => b.type === 'tool_result')) last.content.push(block); else out.push({ role: 'user', content: [block] });
      continue;
    }
    if (m.role === 'assistant') {
      const content = []; if (m.content) content.push({ type: 'text', text: m.content });
      for (const c of m.tool_calls || []) content.push({ type: 'tool_use', id: c.id, name: c.name, input: c.args || {} });
      out.push({ role: 'assistant', content }); continue;
    }
    const content = [{ type: 'text', text: m.content }];
    for (const u of m.images || []) { const [, mt, b64] = u.match(/^data:(.*?);base64,(.*)$/) || []; if (b64) content.push({ type: 'image', source: { type: 'base64', media_type: mt, data: b64 } }); }
    out.push({ role: 'user', content });
  }
  return out;
}
async function anthropicChat(cfg, { messages, tools, signal, maxTokens = 4096, temperature }) {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const body = { model: cfg.model, max_tokens: maxTokens, messages: anMessages(messages) };
  if (system) body.system = system;
  if (temperature != null) body.temperature = temperature;
  if (tools?.length) body.tools = tools.map((t) => ({ name: t.name, description: t.desc, input_schema: t.input }));
  const r = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/v1/messages`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.key || '', Authorization: `Bearer ${cfg.key || ''}`, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body) });
  const j = await r.json().catch(async () => ({ error: { message: await r.text() } }));
  if (!r.ok) throw new Error(`${cfg.name || cfg.model}：${j.error?.message || r.status}`);
  return {
    text: (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(''),
    tool_calls: (j.content || []).filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, args: b.input })),
    usage: { input: j.usage?.input_tokens || 0, output: j.usage?.output_tokens || 0 },
  };
}

// ---------------- Gemini ----------------
function cleanSchema(s) { if (!s || typeof s !== 'object') return s; if (Array.isArray(s)) return s.map(cleanSchema); const o = {}; for (const [k, v] of Object.entries(s)) if (!['additionalProperties', '$schema'].includes(k)) o[k] = cleanSchema(v); if (o.type === 'object' && o.properties && !Object.keys(o.properties).length) delete o.properties; return o; }
async function geminiChat(cfg, { messages, tools, signal, maxTokens = 4096, temperature }) {
  const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const contents = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'tool') { contents.push({ role: 'user', parts: [{ functionResponse: { name: m.name, response: { result: m.content } } }] }); continue; }
    if (m.role === 'assistant') { const parts = []; if (m.content) parts.push({ text: m.content }); for (const c of m.tool_calls || []) parts.push({ functionCall: { name: c.name, args: c.args || {} } }); contents.push({ role: 'model', parts }); continue; }
    const parts = [{ text: m.content }]; for (const u of m.images || []) { const [, mt, b64] = u.match(/^data:(.*?);base64,(.*)$/) || []; if (b64) parts.push({ inlineData: { mimeType: mt, data: b64 } }); }
    contents.push({ role: 'user', parts });
  }
  const body = { contents, generationConfig: { maxOutputTokens: maxTokens, ...(temperature != null ? { temperature } : {}) } };
  if (sys) body.systemInstruction = { parts: [{ text: sys }] };
  if (tools?.length) body.tools = [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.desc, parameters: cleanSchema(t.input) })) }];
  const r = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/models/${cfg.model}:generateContent?key=${encodeURIComponent(cfg.key || '')}`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Gemini：${j.error?.message || r.status}`);
  const parts = j.candidates?.[0]?.content?.parts || [];
  return {
    text: parts.filter((p) => p.text).map((p) => p.text).join(''),
    tool_calls: parts.filter((p) => p.functionCall).map((p, i) => ({ id: `g${Date.now()}${i}`, name: p.functionCall.name, args: p.functionCall.args || {} })),
    usage: { input: j.usageMetadata?.promptTokenCount || 0, output: j.usageMetadata?.candidatesTokenCount || 0 },
  };
}

function safeJson(s) { try { return typeof s === 'string' ? JSON.parse(s || '{}') : s || {}; } catch { return {}; } }

export async function chat(cfg, req) {
  const proto = cfg.proto || presetById(cfg.preset)?.proto || 'openai';
  if (proto === 'anthropic') return anthropicChat(cfg, req);
  if (proto === 'gemini') return geminiChat(cfg, req);
  return openaiChat(cfg, req);
}

/** 连通测试 */
export async function ping(cfg) {
  const t0 = Date.now();
  const r = await chat(cfg, { messages: [{ role: 'user', content: '只回复两个字：好的' }], maxTokens: 20 });
  return { ok: true, ms: Date.now() - t0, text: r.text.slice(0, 40), usage: r.usage };
}
