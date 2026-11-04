// 设置：AI 接口（API Key / Coding Plan / CLI 登录 / 本地）、配音接口、听写、工具路径、用量
import React, { useEffect, useState } from 'react';
import { useStore, S } from '../store.js';
import { api } from '../api.js';
import { Field, Tabs } from '../components/ui.jsx';

const save = async (patch) => { const s = await api('settings:set', patch); useStore.setState({ settings: s }); return s; };

export default function Settings() {
  const [tab, setTab] = useState('ai');
  return (
    <div className="pane" style={{ flex: 1 }}>
      <Tabs value={tab} onChange={setTab} items={[['ai', 'AI'], ['tts', '配音'], ['asr', '听写'], ['tools', '工具'], ['usage', '用量'], ['about', '关于']]} />
      <div className="scroll"><div style={{ maxWidth: 860, margin: '0 auto', padding: '10px 0 40px' }}>
        {tab === 'ai' && <AiTab />}{tab === 'tts' && <TtsTab />}{tab === 'asr' && <AsrTab />}{tab === 'tools' && <ToolsTab />}{tab === 'usage' && <UsageTab />}{tab === 'about' && <About />}
      </div></div>
    </div>
  );
}

function AiTab() {
  const s = useStore((x) => x.settings); const info = useStore((x) => x.info);
  const [list, setList] = useState(s?.ai?.providers || []); const [keys, setKeys] = useState({}); const [cli, setCli] = useState(null); const [test, setTest] = useState({});
  useEffect(() => { setList(s?.ai?.providers || []); }, [s]);
  useEffect(() => { api('ai:cli').then(setCli).catch(() => setCli({})); }, []);
  const presets = info?.presets || [];
  // 新加的接口先不启用：CLI 找到了才直接用，填 Key 的要测试通过再用
  const add = (pre, cliKey = 'claude') => { const id = 'ai' + Date.now().toString(36); const n = pre === 'cli' ? { id, preset: 'cli', proto: 'cli', cli: cliKey, name: (info?.clis?.[cliKey]?.name || 'Claude Code') + '（CLI 登录）' } : { id, preset: pre.id, name: pre.name, proto: pre.proto, baseUrl: pre.baseUrl, model: pre.model, priceIn: 0, priceOut: 0, limit: 0 }; const l = [...list, n]; setList(l); persist(l, s.ai.active || (pre === 'cli' && cli?.[cliKey]?.path ? id : null)); if (pre !== 'cli') S().say('填好 Key 点「测试」，通过后就会用它'); };
  const found = Object.entries(cli || {}).filter(([, v]) => v?.path).map(([k]) => k);
  const persist = async (l, active) => { await save({ ai: { providers: l.map((x) => ({ ...x, key: keys[x.id] || '' })), active } }); setKeys({}); };
  const upd = (id, patch) => setList(list.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  return <>
    <div className="field"><b>AI 接口</b><div className="note">支持主流 API Key、各家 Coding Plan（走 Anthropic 兼容接口）、Claude Code / Codex / Gemini / Qwen 的 CLI 登录，以及本地 Ollama / LM Studio。Key 用系统钥匙串加密，只存在本机。</div></div>
    {list.map((x) => (
      <div key={x.id} className="field" style={{ background: s.ai.active === x.id ? 'rgba(240,138,60,.06)' : '' }}>
        <div className="row" style={{ marginBottom: 8 }}><input value={x.name} onChange={(e) => upd(x.id, { name: e.target.value })} style={{ fontWeight: 600 }} />
          {s.ai.active === x.id ? <span className="tag ai">正在用</span> : <button className="btn sm" onClick={() => persist(list, x.id)}>用这个</button>}
          <button className="btn sm" onClick={async () => { await persist(list, s.ai.active); setTest({ ...test, [x.id]: '测试中…' }); try { const r = await api('ai:test', x.id); setTest({ ...test, [x.id]: '✓ ' + (r.text || '连通') }); if (!s.ai.active || s.ai.active !== x.id) await persist(list, x.id); } catch (e) { const off = useStore.getState().settings?.ai?.active === x.id; setTest({ ...test, [x.id]: '✕ ' + e.message + (off ? '。已先停用，修好后再测试' : '') }); if (off) await persist(list, null); } }}>测试</button>
          <button className="btn sm ghost" onClick={() => { const l = list.filter((y) => y.id !== x.id); setList(l); persist(l, s.ai.active === x.id ? l[0]?.id || null : s.ai.active); }}>删除</button></div>
        {x.proto === 'cli' ? <div className="grid2">
          <div><label>CLI</label><select value={x.cli} onChange={(e) => upd(x.id, { cli: e.target.value, name: info.clis[e.target.value].name + '（CLI 登录）' })}>{Object.entries(info?.clis || {}).map(([k, c]) => <option key={k} value={k}>{c.name}</option>)}</select></div>
          <div><label>状态</label><div className="note">{cli ? (cli[x.cli]?.path ? '✓ 找到 ' + cli[x.cli].path : '没找到。安装：' + info.clis[x.cli].install) : '检测中…'}</div><div className="note">登录：{info?.clis?.[x.cli]?.login}</div></div>
        </div> : <div className="grid2">
          <div><label>接口地址</label><input value={x.baseUrl || ''} onChange={(e) => upd(x.id, { baseUrl: e.target.value })} /></div>
          <div><label>模型</label><input value={x.model || ''} onChange={(e) => upd(x.id, { model: e.target.value })} /></div>
          <div><label>协议</label><select value={x.proto} onChange={(e) => upd(x.id, { proto: e.target.value })}><option value="openai">OpenAI 兼容</option><option value="anthropic">Anthropic 兼容</option><option value="gemini">Gemini</option></select></div>
          <div><label>Key {x.hasKey ? '（已设置，留空不改）' : ''}</label><input type="password" value={keys[x.id] || ''} placeholder={x.hasKey ? '••••••••' : 'sk-…'} onChange={(e) => setKeys({ ...keys, [x.id]: e.target.value })} /></div>
          <div><label>价格（元 / 百万 token）输入 · 输出</label><div className="row"><input type="number" value={x.priceIn || 0} onChange={(e) => upd(x.id, { priceIn: +e.target.value })} /><input type="number" value={x.priceOut || 0} onChange={(e) => upd(x.id, { priceOut: +e.target.value })} /></div></div>
          <div><label>本月上限（元，0 = 不限）</label><input type="number" value={x.limit || 0} onChange={(e) => upd(x.id, { limit: +e.target.value })} /></div>
        </div>}
        <div className="row" style={{ marginTop: 8 }}><button className="btn sm pri" onClick={() => persist(list, s.ai.active).then(() => S().say('已保存'))}>保存</button><span className="note">{test[x.id]}</span></div>
      </div>))}
    {found.length > 0 && !list.some((x) => x.proto === 'cli') && <div className="field" style={{ background: 'rgba(92,194,138,.07)' }}><b>推荐：用本机已经登录的 CLI</b><div className="note" style={{ margin: '4px 0 6px' }}>不用填 Key，走你自己的订阅，不额外花钱。</div><div className="row">{found.map((k) => <button key={k} className="btn sm pri" onClick={() => add('cli', k)}>用 {info?.clis?.[k]?.name || k}</button>)}</div></div>}
    {!found.length && !list.length && <div className="note" style={{ padding: '0 14px 8px' }}>推荐顺序：① 装了 Claude Code / Codex 就用「CLI 登录」，不用 Key；② 买了国内 Coding Plan（智谱、Kimi、通义等）用对应的那一项，Key 在对方控制台的「API Key」页面；③ 想完全离线用本地 Ollama。</div>}
    <div className="field"><label>添加</label><div className="chips">
      <button className="chip" onClick={() => add('cli')}>CLI 登录（Claude Code / Codex / Gemini / Qwen）</button>
      {presets.map((p) => <button key={p.id} className="chip" onClick={() => add(p)} title={p.note}>{p.name}</button>)}
    </div></div>
  </>;
}

function TtsTab() {
  const s = useStore((x) => x.settings); const info = useStore((x) => x.info);
  const [t, setT] = useState(s.tts); const [msg, setMsg] = useState('');
  useEffect(() => setT(s.tts), [s]);
  const upd = (k, patch) => setT({ ...t, [k]: { ...t[k], ...patch } });
  const keyIn = (k) => <input type="password" placeholder={s.tts[k]?.hasKey ? '已设置，留空不改' : 'Key'} value={t[k]?.key || ''} onChange={(e) => upd(k, { key: e.target.value })} />;
  const commit = async () => { await save({ tts: t }); S().say('已保存'); };
  const test = async (provider) => { await commit(); setMsg('合成中…'); try { const u = await api('tts:preview', { provider, voice: info.tts[provider]?.voices?.[0]?.[0] || '', text: '你好，这是墨剪的配音测试。', speed: 1 }); new Audio(u).play(); setMsg('✓ ' + provider + ' 可以用'); } catch (e) { setMsg('✕ ' + e.message); } };
  return <>
    <Field label="默认配音接口" note="每个角色可以单独选接口和音色（音频页）。在线接口失败时会自动退回系统语音，保证能出声。">
      <select value={t.default} onChange={(e) => setT({ ...t, default: e.target.value })}>{Object.entries(info?.tts || {}).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select>
    </Field>
    <Field label="MiniMax 语音"><div className="grid2"><div><label>Key</label>{keyIn('minimax')}</div><div><label>Group ID</label><input value={t.minimax?.groupId || ''} onChange={(e) => upd('minimax', { groupId: e.target.value })} /></div><div><label>接口地址</label><input value={t.minimax?.baseUrl || ''} onChange={(e) => upd('minimax', { baseUrl: e.target.value })} /></div><div><label>模型</label><input value={t.minimax?.model || ''} onChange={(e) => upd('minimax', { model: e.target.value })} /></div></div></Field>
    <Field label="OpenAI 语音"><div className="grid2"><div><label>Key</label>{keyIn('openai')}</div><div><label>接口地址</label><input value={t.openai?.baseUrl || ''} onChange={(e) => upd('openai', { baseUrl: e.target.value })} /></div><div><label>模型</label><input value={t.openai?.model || ''} onChange={(e) => upd('openai', { model: e.target.value })} /></div></div></Field>
    <Field label="自定义接口（添加接口）" note="任何 HTTP 配音服务都能接：在地址、请求头、请求体里用 {{text}} {{voice}} {{speed}} {{key}}。返回音频直接用；返回 JSON 就在「结果路径」里写音频地址或 base64 的位置，如 data.audio。">
      <div className="col"><div className="row"><select style={{ width: 100 }} value={t.custom?.method || 'POST'} onChange={(e) => upd('custom', { method: e.target.value })}><option>POST</option><option>GET</option></select><input placeholder="https://…" value={t.custom?.url || ''} onChange={(e) => upd('custom', { url: e.target.value })} /></div>
        <label>请求头（JSON）</label><textarea rows={2} value={t.custom?.headers || ''} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => upd('custom', { headers: e.target.value })} />
        <label>请求体</label><textarea rows={3} value={t.custom?.body || ''} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => upd('custom', { body: e.target.value })} />
        <div className="grid2"><div><label>结果路径</label><input value={t.custom?.resultPath || ''} onChange={(e) => upd('custom', { resultPath: e.target.value })} /></div><div><label>Key</label>{keyIn('custom')}</div></div></div>
    </Field>
    <div className="field row" style={{ flexWrap: 'wrap' }}><button className="btn pri" onClick={commit}>保存</button>{Object.keys(info?.tts || {}).map((k) => <button key={k} className="btn sm" onClick={() => test(k)}>测试 {k}</button>)}<span className="note">{msg}</span></div>
  </>;
}

function AsrTab() {
  const s = useStore((x) => x.settings); const [a, setA] = useState(s.asr); const [ok, setOk] = useState(null);
  useEffect(() => setA(s.asr), [s]);
  const check = async () => { await save({ asr: a }); setOk('检测中…'); try { setOk((await api('asr:available')) ? '✓ 可以用' : '✕ 不可用'); } catch (e) { setOk('✕ ' + e.message); } };
  return <>
    <Field label="听写引擎" note="听写用来校验配音读没读错、自动出字幕、去口误。本地引擎不联网、不花钱。">
      <div className="chips"><button className={'chip' + (a.engine === 'local' ? ' on' : '')} onClick={() => setA({ ...a, engine: 'local' })}>本地 faster-whisper</button><button className={'chip' + (a.engine === 'api' ? ' on' : '')} onClick={() => setA({ ...a, engine: 'api' })}>接口（OpenAI 兼容）</button></div>
    </Field>
    {a.engine === 'local' ? <Field label="本地" note="需要 Python 3.9+，然后运行：pip install faster-whisper。第一次用会下载模型。">
      <div className="grid2"><div><label>Python 路径（留空自动找）</label><input value={a.python || ''} onChange={(e) => setA({ ...a, python: e.target.value })} /></div>
        <div><label>模型</label><select value={a.model} onChange={(e) => setA({ ...a, model: e.target.value })}>{['tiny', 'base', 'small', 'medium', 'large-v3'].map((m) => <option key={m}>{m}</option>)}</select></div></div>
    </Field> : <Field label="接口"><div className="grid2"><div><label>地址</label><input value={a.baseUrl} onChange={(e) => setA({ ...a, baseUrl: e.target.value })} /></div><div><label>模型</label><input value={a.apiModel} onChange={(e) => setA({ ...a, apiModel: e.target.value })} /></div><div><label>Key</label><input type="password" placeholder={s.asr.hasKey ? '已设置，留空不改' : ''} value={a.key || ''} onChange={(e) => setA({ ...a, key: e.target.value })} /></div></div></Field>}
    <div className="field row"><button className="btn pri" onClick={check}>保存并检测</button><span className="note">{ok}</span></div>
  </>;
}

function ToolsTab() {
  const s = useStore((x) => x.settings); const [f, setF] = useState(s.ffmpeg); const [l, setL] = useState(s.lemo);
  return <>
    <Field label="FFmpeg" note="已经内置，一般不用改。想用自己装的版本（比如带硬件编码）就填路径。"><div className="grid2"><div><label>ffmpeg</label><input value={f.path || ''} onChange={(e) => setF({ ...f, path: e.target.value })} placeholder="内置" /></div><div><label>ffprobe</label><input value={f.ffprobe || ''} onChange={(e) => setF({ ...f, ffprobe: e.target.value })} placeholder="内置" /></div></div></Field>
    <Field label="lemo-opuscar 文件夹" note="导入场景时默认从这里找。"><div className="row"><input value={l.path || ''} onChange={(e) => setL({ ...l, path: e.target.value })} /><button className="btn sm" onClick={async () => { const d = await api('dialog:dir'); if (d) setL({ ...l, path: d }); }}>浏览</button></div></Field>
    <div className="field"><button className="btn pri" onClick={async () => { await save({ ffmpeg: f, lemo: l }); S().say('已保存'); }}>保存</button></div>
  </>;
}

function UsageTab() {
  const s = useStore((x) => x.settings); const [u, setU] = useState(null);
  useEffect(() => { api('ai:usage').then(setU); }, []);
  if (!u) return null;
  const name = (id) => s.ai.providers.find((p) => p.id === id)?.name || id;
  return <>
    <div className="field"><b>{u.month} 用量</b><div className="note">价格和上限在「AI」里按接口填。CLI 登录和本地模型不计费。</div></div>
    <table className="t"><thead><tr><th>接口</th><th>调用</th><th>输入 token</th><th>输出 token</th><th>花费（元）</th><th>上限</th></tr></thead>
      <tbody>{Object.entries(u.byProvider || {}).map(([id, e]) => { const pr = s.ai.providers.find((p) => p.id === id); return <tr key={id}><td>{name(id)}</td><td>{e.calls}</td><td>{e.input.toLocaleString()}</td><td>{e.output.toLocaleString()}</td><td>{e.cost.toFixed(2)}</td><td>{pr?.limit ? pr.limit : '不限'}</td></tr>; })}</tbody></table>
    {!Object.keys(u.byProvider || {}).length && <div className="empty">这个月还没用过</div>}
  </>;
}

function About() {
  const info = useStore((x) => x.info);
  return <div className="field"><b>墨剪 {info?.version}</b><div className="note">本地 AI 视频工作台。工程是一个普通文件夹：project.json + 素材 + 配音 + 版本记录。数据只在你的电脑上。<br />数据目录：{info?.userData}</div>
    <div className="note" style={{ marginTop: 8 }}>快捷键：空格 播放 · ← → 逐帧（Shift 一秒）· S 分割 · Delete 删除 · Ctrl+Z / Ctrl+Shift+Z 撤销重做 · Ctrl+S 保存 · Ctrl+滚轮 缩放时间线</div></div>;
}
