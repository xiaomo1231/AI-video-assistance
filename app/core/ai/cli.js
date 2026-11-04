// CLI 登录：调用本机已登录的 Claude Code / Codex / Gemini CLI / Qwen Code，用订阅额度，不用另配 Key。
// 墨剪的工具通过 MCP 提供给它们；它们的改动写成修改建议（.mojian/proposal.json）。
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const MCP_SERVER = path.join(HERE, '../mcp/server.js'); // 用 Electron 自带 Node（ELECTRON_RUN_AS_NODE）运行，可直接读 asar

export const CLIS = {
  claude: { name: 'Claude Code', bin: 'claude', login: 'claude（首次运行按提示登录 Claude 账号）', install: 'npm i -g @anthropic-ai/claude-code' },
  codex: { name: 'OpenAI Codex CLI', bin: 'codex', login: 'codex login', install: 'npm i -g @openai/codex' },
  gemini: { name: 'Gemini CLI', bin: 'gemini', login: 'gemini（首次运行选 Login with Google）', install: 'npm i -g @google/gemini-cli' },
  qwen: { name: 'Qwen Code', bin: 'qwen', login: 'qwen（首次运行按提示登录）', install: 'npm i -g @qwen-code/qwen-code' },
};

export function which(bin) {
  return new Promise((res) => {
    const p = spawn(process.platform === 'win32' ? 'where' : 'which', [bin], { shell: process.platform === 'win32' });
    let out = ''; p.stdout?.on('data', (d) => (out += d));
    p.on('error', () => res(null)); p.on('close', (c) => res(c === 0 ? out.split(/\r?\n/)[0].trim() : null));
  });
}
export async function detect() { const r = {}; for (const [k, v] of Object.entries(CLIS)) r[k] = { ...v, path: await which(v.bin) }; return r; }

/** 让 CLI 智能体处理一个请求；返回它最后说的话。改动由 MCP 写进 proposal.json */
export async function runCli(kind, { projectDir, prompt, node = process.execPath, onEvent = () => {}, signal, extraEnv = {} }) {
  const c = CLIS[kind]; if (!c) throw new Error('不支持的 CLI：' + kind);
  const env = { ...process.env, ...extraEnv, MOJIAN_PROJECT: projectDir, MOJIAN_AGENT: kind, ELECTRON_RUN_AS_NODE: '1' };
  const mcp = { command: node, args: [MCP_SERVER, '--project', projectDir], env: { ELECTRON_RUN_AS_NODE: '1' } };
  let args = [], cwd = projectDir;
  const full = `${prompt}\n\n（你正在通过 mojian MCP 工具编辑一个视频工程。先调用 project_read。只用 mojian 工具改工程，不要直接改文件。）`;
  if (kind === 'claude') {
    const cfg = path.join(projectDir, '.mojian', 'mcp.json');
    await fs.mkdir(path.dirname(cfg), { recursive: true });
    await fs.writeFile(cfg, JSON.stringify({ mcpServers: { mojian: mcp } }));
    args = ['-p', full, '--output-format', 'stream-json', '--verbose', '--mcp-config', cfg, '--allowedTools', 'mcp__mojian__*', '--strict-mcp-config'];
  } else if (kind === 'codex') {
    const q = (s) => JSON.stringify(s);
    args = ['exec', '--json', '--skip-git-repo-check', '-c', `mcp_servers.mojian.command=${q(node)}`, '-c', `mcp_servers.mojian.args=${JSON.stringify(mcp.args)}`, '-c', 'mcp_servers.mojian.env={ELECTRON_RUN_AS_NODE="1"}', full];
  } else {
    const dir = path.join(projectDir, kind === 'gemini' ? '.gemini' : '.qwen');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'settings.json'), JSON.stringify({ mcpServers: { mojian: { ...mcp, trust: true } } }, null, 1));
    args = ['-p', full, '--yolo'];
  }
  return new Promise((resolve, reject) => {
    const p = spawn(c.bin, args, { cwd, env, shell: process.platform === 'win32' });
    let out = '', err = '', last = '';
    if (signal) signal.addEventListener('abort', () => p.kill());
    p.stdout.on('data', (d) => {
      out += d;
      for (const ln of String(d).split('\n')) {
        if (!ln.trim()) continue;
        try {
          const j = JSON.parse(ln);
          if (j.type === 'assistant') for (const b of j.message?.content || []) { if (b.type === 'text') { last = b.text; onEvent({ type: 'text', text: b.text }); } if (b.type === 'tool_use') onEvent({ type: 'tool', name: b.name.replace('mcp__mojian__', ''), args: b.input }); }
          if (j.type === 'result' && j.result) last = j.result;
          if (j.msg?.type === 'agent_message') { last = j.msg.message; onEvent({ type: 'text', text: last }); }
          if (j.item?.type === 'agent_message' && j.item.text) { last = j.item.text; onEvent({ type: 'text', text: last }); }
          if (j.item?.type === 'mcp_tool_call') onEvent({ type: 'tool', name: j.item.tool, args: j.item.arguments });
        } catch { if (kind !== 'claude' && kind !== 'codex') { last += ln + '\n'; onEvent({ type: 'text', text: ln }); } }
      }
    });
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => reject(new Error(`找不到 ${c.name}。安装：${c.install}，然后在终端运行 ${c.login}`)));
    p.on('close', (code) => (code === 0 || last ? resolve({ text: last.trim() }) : reject(new Error(`${c.name} 退出（${code}）：${err.slice(-500)}`))));
  });
}
