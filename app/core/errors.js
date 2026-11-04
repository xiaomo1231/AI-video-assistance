// 把底层报错翻成人话：网络、Key、额度、找不到程序。原文放在括号里，方便排查。
export function friendly(err) {
  if (err?.friendly) return err.message;
  const m = String(err?.message || err || '');
  const tail = (s) => `${s}（${m.slice(0, 120)}）`;
  if (/getaddrinfo|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|socket hang up|fetch failed|network/i.test(m)) return tail('连不上网络，检查一下网络或代理');
  if (/invalid.*(api[-_ ]?key|x-api-key)|401|unauthori[sz]ed|authentication|invalid_api_key|incorrect api key/i.test(m)) return tail('Key 不对或者过期了，到设置里检查');
  if (/429|rate.?limit|quota|insufficient|余额|额度/i.test(m)) return tail('请求太多或额度用完了，稍后再试，或换一个接口');
  if (/espeak|say: command not found|SAPI|no system voice|系统语音/i.test(m)) return tail('本机没有可用的系统语音（Linux 要装 espeak-ng）');
  if (/ENOENT.*(ffmpeg|whisper|claude|codex)/i.test(m)) return tail('找不到需要的程序，看看设置里的路径');
  return m;
}

/** 已经是人话的错误，后面不再重复翻译 */
export function humanError(msg) { const e = new Error(msg); e.friendly = true; return e; }
