// 设置与密钥。密钥用系统钥匙串加密（Windows DPAPI / macOS Keychain），只存在本机。
import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const file = () => path.join(app.getPath('userData'), 'settings.json');
const DEF = {
  ai: { active: null, providers: [] }, // providers: [{id, preset, name, proto, baseUrl, model, key(enc), priceIn, priceOut, limit}]
  tts: { default: 'edge', minimax: { baseUrl: 'https://api.minimaxi.com', model: 'speech-2.8-hd', groupId: '' }, openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini-tts' }, custom: { url: '', method: 'POST', headers: '{"Content-Type":"application/json"}', body: '{"text":"{{text}}","voice":"{{voice}}"}', resultPath: '' } },
  asr: { engine: 'local', python: '', model: 'small', baseUrl: 'https://api.openai.com/v1', apiModel: 'whisper-1' },
  ffmpeg: { path: '', ffprobe: '' },
  lemo: { path: '' },
  ui: { theme: 'dark' },
  mySkills: [],
};
let cache = null;

const enc = (s) => (s ? (safeStorage.isEncryptionAvailable() ? 'enc:' + safeStorage.encryptString(s).toString('base64') : 'raw:' + Buffer.from(s).toString('base64')) : '');
const dec = (s) => { if (!s) return ''; try { if (s.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(s.slice(4), 'base64')); if (s.startsWith('raw:')) return Buffer.from(s.slice(4), 'base64').toString(); } catch {} return ''; };

export function load() {
  if (cache) return cache;
  try { const j = JSON.parse(fs.readFileSync(file(), 'utf8')); cache = { ...DEF, ...j, tts: { ...DEF.tts, ...j.tts }, asr: { ...DEF.asr, ...j.asr }, ai: { ...DEF.ai, ...j.ai } }; } catch { cache = structuredClone(DEF); }
  return cache;
}
function save() { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file(), JSON.stringify(cache, null, 1)); }

/** 给渲染进程看的设置：密钥只给出「已设置」 */
export function publicSettings() {
  const s = load();
  const mask = (o) => (o && o.key ? { ...o, key: undefined, hasKey: true } : { ...o, hasKey: false });
  return { ...s, ai: { ...s.ai, providers: s.ai.providers.map(mask) }, tts: { ...s.tts, minimax: mask(s.tts.minimax), openai: mask(s.tts.openai), custom: mask(s.tts.custom) }, asr: mask(s.asr) };
}

/** 合并更新；key 字段为 '' 表示不改，为 null 表示清除 */
export function update(patch) {
  const s = load();
  const mergeKey = (old = {}, nu = {}) => { const o = { ...old, ...nu }; if (nu.key === undefined || nu.key === '') o.key = old.key; else if (nu.key === null) o.key = ''; else o.key = enc(nu.key); delete o.hasKey; return o; };
  if (patch.ai) {
    if (patch.ai.providers) s.ai.providers = patch.ai.providers.map((p) => mergeKey(s.ai.providers.find((q) => q.id === p.id), p));
    if ('active' in patch.ai) s.ai.active = patch.ai.active;
  }
  if (patch.tts) for (const k of Object.keys(patch.tts)) s.tts[k] = typeof patch.tts[k] === 'object' ? mergeKey(s.tts[k], patch.tts[k]) : patch.tts[k];
  if (patch.asr) s.asr = mergeKey(s.asr, patch.asr);
  for (const k of ['ffmpeg', 'lemo', 'ui']) if (patch[k]) s[k] = { ...s[k], ...patch[k] };
  if (patch.mySkills) s.mySkills = patch.mySkills;
  save();
  return publicSettings();
}

export const providerCfg = (id) => { const p = load().ai.providers.find((x) => x.id === (id || load().ai.active)); return p ? { ...p, key: dec(p.key) } : null; };
export const ttsCfg = (provider) => { const c = load().tts[provider]; return c && typeof c === 'object' ? { ...c, key: dec(c.key) } : {}; };
export const asrCfg = () => { const c = load().asr; return { ...c, key: dec(c.key), model: c.engine === 'api' ? c.apiModel : c.model }; };
