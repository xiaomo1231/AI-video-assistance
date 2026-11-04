// 检查一个代码场景：读 DUR、EV，按时间取缩略图做切点检测
let frame = null;
window.__mojianProbe = (url) => new Promise((resolve) => {
  frame = document.createElement('iframe'); document.body.style.cssText = 'margin:0;background:#000;overflow:hidden';
  frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;transform:scale(0.25);transform-origin:0 0';
  frame.onload = async () => {
    const w = frame.contentWindow; let err = null;
    w.addEventListener('error', (e) => { err = err || (e.message || (e.target && e.target.src ? '加载失败：' + e.target.src : '脚本错误')); }, true);
    w.addEventListener('unhandledrejection', (e) => { err = err || String(e.reason?.message || e.reason); });
    for (let i = 0; i < 1800 && !w.READY && !err; i++) await new Promise((r) => setTimeout(r, 50));
    if (!w.READY) return resolve({ ok: false, error: err ? `场景没能就绪（${err}）。常见原因：字体或贴图文件缺失，先在 lemo 里按 README 跑一次 build` : '90 秒内没有 READY' });
    if (typeof w.render !== 'function') return resolve({ ok: false, error: '没有 window.render(t)' });
    resolve({ ok: true, dur: +w.DUR || 0, ev: Array.isArray(w.EV) ? w.EV.slice(0, 5000) : [], hasTexts: typeof w.TEXTS === 'function' });
  };
  frame.onerror = () => resolve({ ok: false, error: '加载失败' });
  frame.src = url; document.body.appendChild(frame);
});
window.__mojianProbeSeek = async (t) => { frame.contentWindow.render(t); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return true; };
const small = document.createElement('canvas'); small.width = 32; small.height = 18;
window.__mojianProbeFrame = async (t) => {
  const w = frame.contentWindow; w.render(t);
  await new Promise((r) => requestAnimationFrame(r));
  const cv = w.document.querySelector('canvas'); const c = small.getContext('2d', { willReadFrequently: true });
  if (cv) c.drawImage(cv, 0, 0, 32, 18); else { c.fillStyle = '#000'; c.fillRect(0, 0, 32, 18); }
  const d = c.getImageData(0, 0, 32, 18).data; const out = []; for (let i = 0; i < d.length; i += 4) out.push((d[i] + d[i + 1] + d[i + 2]) / 3 | 0); return out;
};
