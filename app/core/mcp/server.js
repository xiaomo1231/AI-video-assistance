#!/usr/bin/env node
// 墨剪 MCP 工具服务（stdio）。让 Claude Code、Codex、Gemini CLI 等外部 AI 读写墨剪工程。
// 写操作不会直接改 project.json，而是记到 .mojian/proposal.json，墨剪里会弹出「修改建议」让你确认。
// 用法：node core/mcp/server.js --project <工程文件夹>
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { TOOLS, makeContext, callTool, summarize } from '../ai/tools.js';
import { normalize, apply } from '../project.js';

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const DIR = path.resolve(arg('--project') || process.env.MOJIAN_PROJECT || '.');
const PJ = path.join(DIR, 'project.json'), PROP = path.join(DIR, '.mojian', 'proposal.json');

function load() {
  const base = normalize(JSON.parse(fs.readFileSync(PJ, 'utf8')));
  let prop = { ops: [], note: '' };
  try { prop = JSON.parse(fs.readFileSync(PROP, 'utf8')); } catch {}
  const ctx = makeContext(base);
  if (prop.ops.length) { apply(ctx.p, prop.ops); ctx.ops.push(...prop.ops); }
  return { base, ctx, prop };
}
function saveProposal(base, ctx, note) {
  fs.mkdirSync(path.dirname(PROP), { recursive: true });
  fs.writeFileSync(PROP, JSON.stringify({ ops: ctx.ops, changes: summarize(base, ctx.p), note, at: new Date().toISOString(), source: process.env.MOJIAN_AGENT || 'mcp' }, null, 1));
}

const send = (o) => process.stdout.write(JSON.stringify(o) + '\n');
const rl = readline.createInterface({ input: process.stdin });
let queue = Promise.resolve();
rl.on('line', (line) => { queue = queue.then(() => handle(line)); });
async function handle(line) {
  let msg; try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params } = msg;
  const reply = (result) => id != null && send({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => id != null && send({ jsonrpc: '2.0', id, error: { code, message } });
  try {
    if (method === 'initialize') return reply({ protocolVersion: params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'mojian', version: '0.1.0' }, instructions: '墨剪视频工程工具。先调用 project_read。写操作会成为修改建议，由用户在墨剪里确认。' });
    if (method === 'ping') return reply({});
    if (method === 'tools/list') return reply({ tools: TOOLS.map((t) => ({ name: t.name, description: t.desc, inputSchema: t.input })) });
    if (method === 'tools/call') {
      const t = TOOLS.find((x) => x.name === params.name); if (!t) return fail(-32602, '没有这个工具');
      const { base, ctx } = load();
      const r = await callTool(ctx, params.name, params.arguments || {});
      if (!t.read) saveProposal(base, ctx, '');
      return reply({ content: [{ type: 'text', text: typeof r === 'string' ? r : JSON.stringify(r, null, 1) }] });
    }
    if (method?.startsWith('notifications/')) return;
    fail(-32601, '不支持的方法 ' + method);
  } catch (e) {
    if (method === 'tools/call') return reply({ content: [{ type: 'text', text: '出错：' + e.message }], isError: true });
    fail(-32000, e.message);
  }
}
