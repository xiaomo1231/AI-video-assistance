// 内置卡片渲染器：按风格模板画背景、标题、要点、图表、落版。纯函数：同一个 t 永远画出同一帧。
// 坐标以 1920×1080 为基准（竖版按短边缩放）。

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const eo = (t) => 1 - Math.pow(1 - t, 3);
const back = (t, s = 1.6) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

// ---------------- 背景处理 ----------------
const BG = {
  paper(c, W, H, P, t, r) { c.fillStyle = P.bg; c.fillRect(0, 0, W, H); grain(c, W, H, r, 0.05, '#000'); },
  crayon(c, W, H, P, t, r) { c.fillStyle = P.bg; c.fillRect(0, 0, W, H); c.globalAlpha = 0.18; for (let i = 0; i < 260; i++) { c.strokeStyle = i % 3 ? P.sub : P.accent2; c.lineWidth = 2 + r() * 3; c.beginPath(); const x = r() * W, y = r() * H; c.moveTo(x, y); c.lineTo(x + 30 + r() * 60, y + (r() - 0.5) * 20); c.stroke(); } c.globalAlpha = 1; for (let i = 0; i < 40; i++) { c.fillStyle = rgba(P.accent, 0.5 + 0.5 * Math.sin(t * 2 + i)); c.beginPath(); c.arc(r() * W, r() * H * 0.6, 2 + r() * 3, 0, 7); c.fill(); } },
  watercolor(c, W, H, P, t, r) { c.fillStyle = P.bg; c.fillRect(0, 0, W, H); for (let i = 0; i < 9; i++) { const x = r() * W, y = r() * H, R = 200 + r() * 420; const g = c.createRadialGradient(x, y, 0, x, y, R); g.addColorStop(0, rgba(i % 2 ? P.accent : P.accent2, 0.16)); g.addColorStop(1, rgba(P.bg, 0)); c.fillStyle = g; c.fillRect(0, 0, W, H); } grain(c, W, H, r, 0.04, '#5a4630'); },
  ink(c, W, H, P, t, r) { c.fillStyle = P.bg; c.fillRect(0, 0, W, H); for (let k = 0; k < 3; k++) { c.fillStyle = rgba(P.fg, 0.08 + k * 0.07); c.beginPath(); c.moveTo(0, H); let x = 0; const base = H * (0.62 + k * 0.1); while (x <= W) { c.lineTo(x, base - (Math.sin(x / (260 - k * 60) + k + t * 0.05) * 0.5 + 0.5) * (180 - k * 40) - r() * 8); x += 24; } c.lineTo(W, H); c.fill(); } c.fillStyle = P.accent; c.beginPath(); c.arc(W * 0.82, H * 0.2, 46, 0, 7); c.fill(); grain(c, W, H, r, 0.05, '#3a3226'); },
  oil(c, W, H, P, t, r) { c.fillStyle = P.bg; c.fillRect(0, 0, W, H); for (let i = 0; i < 520; i++) { const x = r() * W, y = r() * H; c.strokeStyle = rgba(r() < 0.12 ? P.accent : r() < 0.5 ? P.sub : P.fg, 0.05 + r() * 0.07); c.lineWidth = 8 + r() * 18; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 90, y + (r() - 0.5) * 40); c.stroke(); } },
  whiteboard(c, W, H, P, t, r) { c.fillStyle = P.bg; c.fillRect(0, 0, W, H); c.strokeStyle = 'rgba(0,0,0,0.04)'; c.lineWidth = 1; for (let x = 0; x < W; x += 48) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); } for (let y = 0; y < H; y += 48) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); } },
  sketch(c, W, H, P, t, r) { BG.paper(c, W, H, P, t, r); c.strokeStyle = rgba(P.fg, 0.25); c.lineWidth = 1.5; for (let i = 0; i < 28; i++) { const x = r() * W, y = H * 0.7 + r() * H * 0.3; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 4 + r() * 10, y - 40 - r() * 80); c.stroke(); } c.fillStyle = rgba(P.accent2, 0.12); c.fillRect(0, H * 0.82, W, H * 0.18); },
  chalk(c, W, H, P, t, r) { c.fillStyle = P.bg; c.fillRect(0, 0, W, H); grain(c, W, H, r, 0.06, '#ffffff'); c.strokeStyle = 'rgba(255,255,255,0.06)'; c.lineWidth = 50; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(r() * W, r() * H); c.bezierCurveTo(r() * W, r() * H, r() * W, r() * H, r() * W, r() * H); c.stroke(); } c.fillStyle = '#6b4a2b'; c.fillRect(0, H - 26, W, 26); },
  shadow(c, W, H, P, t, r) { const g = c.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, W * 0.7); g.addColorStop(0, '#ffe6a8'); g.addColorStop(1, P.bg); c.fillStyle = '#2a1408'; c.fillRect(0, 0, W, H); c.fillStyle = g; c.fillRect(W * 0.04, H * 0.06, W * 0.92, H * 0.88); c.strokeStyle = '#2a1408'; c.lineWidth = 14; c.strokeRect(W * 0.04, H * 0.06, W * 0.92, H * 0.88); c.fillStyle = rgba(P.fg, 0.85); c.beginPath(); c.moveTo(W * 0.04, H * 0.94); for (let x = 0; x <= W * 0.92; x += 40) c.lineTo(W * 0.04 + x, H * 0.86 - Math.abs(Math.sin(x / 90)) * 30); c.lineTo(W * 0.96, H * 0.94); c.fill(); },
  ukiyo(c, W, H, P, t, r) { c.fillStyle = P.bg; c.fillRect(0, 0, W, H); c.strokeStyle = rgba(P.accent2, 0.5); c.lineWidth = 3; for (let row = 0; row < 6; row++) for (let x = -60; x < W + 60; x += 120) { const y = H * 0.72 + row * 50, ox = (row % 2) * 60 + Math.sin(t * 0.6) * 10; for (let k = 1; k <= 3; k++) { c.beginPath(); c.arc(x + ox, y, k * 16, Math.PI, 0); c.stroke(); } } c.fillStyle = P.accent; c.beginPath(); c.arc(W * 0.8, H * 0.25, 70, 0, 7); c.fill(); grain(c, W, H, r, 0.05, '#4a3b22'); },
  papercut(c, W, H, P, t, r) { c.fillStyle = P.bg; c.fillRect(0, 0, W, H); c.fillStyle = P.accent; for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) { c.save(); c.translate(x, y); for (let k = 0; k < 10; k++) { c.rotate(Math.PI / 20); c.fillRect(0, -6, 160 - k * 8, 12); } c.restore(); } c.strokeStyle = P.accent; c.lineWidth = 10; c.strokeRect(40, 40, W - 80, H - 80); },
  riso(c, W, H, P, t, r) { c.fillStyle = P.bg; c.fillRect(0, 0, W, H); c.globalCompositeOperation = 'multiply'; c.fillStyle = rgba(P.accent, 0.85); c.beginPath(); c.arc(W * 0.78 + 6, H * 0.36, 240, 0, 7); c.fill(); c.fillStyle = rgba(P.accent2, 0.85); c.fillRect(W * 0.62, H * 0.5, 520, 260); c.fillStyle = rgba(P.fg, 0.7); c.beginPath(); c.arc(W * 0.78 - 8, H * 0.36 + 6, 240, 0, 7); c.lineWidth = 3; c.strokeStyle = P.fg; c.stroke(); c.globalCompositeOperation = 'source-over'; grain(c, W, H, r, 0.08, P.fg); },
  halftone(c, W, H, P, t, r) { c.fillStyle = P.bg; c.fillRect(0, 0, W, H); c.fillStyle = rgba(P.accent, 0.5); for (let y = 0; y < H; y += 22) for (let x = 0; x < W; x += 22) { const d = Math.hypot(x - W * 0.85, y - H * 0.2) / W; const R = Math.max(0, 9 - d * 18); if (R > 0.3) { c.beginPath(); c.arc(x, y, R, 0, 7); c.fill(); } } c.fillStyle = rgba(P.fg, 0.9); c.fillRect(0, H - 90, W, 90); grain(c, W, H, r, 0.05, '#000'); },
  woodcut(c, W, H, P, t, r) { c.fillStyle = P.bg; c.fillRect(0, 0, W, H); c.strokeStyle = P.fg; for (let y = H * 0.6; y < H; y += 10) { c.lineWidth = 2 + ((y - H * 0.6) / (H * 0.4)) * 5; c.beginPath(); c.moveTo(0, y); for (let x = 0; x <= W; x += 30) c.lineTo(x, y + Math.sin(x / 60 + y) * 3); c.stroke(); } c.fillStyle = P.accent; c.beginPath(); c.arc(W * 0.2, H * 0.24, 60, 0, 7); c.fill(); },
  dark(c, W, H, P, t, r) { c.fillStyle = P.bg; c.fillRect(0, 0, W, H); const g = c.createRadialGradient(W * 0.7, H * 0.3, 0, W * 0.7, H * 0.3, W * 0.6); g.addColorStop(0, rgba(P.accent, 0.28)); g.addColorStop(1, rgba(P.bg, 0)); c.fillStyle = g; c.fillRect(0, 0, W, H); const g2 = c.createRadialGradient(W * 0.15, H * 0.9, 0, W * 0.15, H * 0.9, W * 0.5); g2.addColorStop(0, rgba(P.accent2, 0.2)); g2.addColorStop(1, rgba(P.bg, 0)); c.fillStyle = g2; c.fillRect(0, 0, W, H); c.strokeStyle = 'rgba(255,255,255,0.035)'; for (let x = 0; x < W; x += 80) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); } },
  screen(c, W, H, P, t, r) { c.fillStyle = P.bg; c.fillRect(0, 0, W, H); c.fillStyle = '#fff'; rr(c, W * 0.08, H * 0.1, W * 0.84, H * 0.8, 22); c.fill(); c.fillStyle = '#e8ebf0'; rr(c, W * 0.08, H * 0.1, W * 0.84, 56, 22); c.fill(); for (const [i, col] of ['#ff5f57', '#febc2e', '#28c840'].entries()) { c.fillStyle = col; c.beginPath(); c.arc(W * 0.08 + 30 + i * 26, H * 0.1 + 28, 8, 0, 7); c.fill(); } },
  iso(c, W, H, P, t, r) { c.fillStyle = P.bg; c.fillRect(0, 0, W, H); c.strokeStyle = rgba(P.accent2, 0.15); c.lineWidth = 1; for (let k = -H; k < W; k += 60) { c.beginPath(); c.moveTo(k, H); c.lineTo(k + H / Math.tan(Math.PI / 6) * 0.58, 0); c.stroke(); c.beginPath(); c.moveTo(k, 0); c.lineTo(k + H * 1.0, H); c.stroke(); } },
  data(c, W, H, P, t, r) { c.fillStyle = P.bg; c.fillRect(0, 0, W, H); c.strokeStyle = 'rgba(255,255,255,0.06)'; for (let y = H * 0.2; y < H; y += 90) { c.beginPath(); c.moveTo(80, y); c.lineTo(W - 80, y); c.stroke(); } },
  vintage(c, W, H, P, t, r) { c.fillStyle = P.bg; c.fillRect(0, 0, W, H); const g = c.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.65); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)'); c.fillStyle = g; c.fillRect(0, 0, W, H); grain(c, W, H, mulberry(Math.floor(t * 12)), 0.12, '#000'); if (Math.floor(t * 12) % 7 === 0) { c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(r() * W, 0, 2, H); } },
  cel80(c, W, H, P, t, r) { const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, P.bg); g.addColorStop(0.62, '#ff4f9a'); g.addColorStop(0.63, '#140a26'); g.addColorStop(1, '#140a26'); c.fillStyle = g; c.fillRect(0, 0, W, H); c.fillStyle = '#ffd36e'; c.beginPath(); c.arc(W / 2, H * 0.6, 200, Math.PI, 0); c.fill(); c.strokeStyle = rgba(P.accent2, 0.6); c.lineWidth = 2; for (let k = 0; k < 12; k++) { const y = H * 0.63 + Math.pow(k / 12, 2) * H * 0.37 + ((t * 40) % 30) * (k / 12); c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); } for (let x = -W; x < W * 2; x += 140) { c.beginPath(); c.moveTo(W / 2, H * 0.63); c.lineTo(x, H); c.stroke(); } },
  midcentury(c, W, H, P, t, r) { c.fillStyle = P.bg; c.fillRect(0, 0, W, H); c.fillStyle = rgba(P.accent2, 0.85); c.beginPath(); c.ellipse(W * 0.82, H * 0.75, 320, 200, -0.3, 0, 7); c.fill(); c.fillStyle = rgba(P.accent, 0.9); for (let i = 0; i < 5; i++) { c.save(); c.translate(W * 0.1 + i * 70, H * 0.15); c.rotate(t * 0.5 + i); c.fillRect(-14, -3, 28, 6); c.fillRect(-3, -14, 6, 28); c.restore(); } },
  comic(c, W, H, P, t, r) { c.fillStyle = P.bg; c.fillRect(0, 0, W, H); c.fillStyle = rgba(P.accent2, 0.25); for (let y = 0; y < H; y += 18) for (let x = (y / 18) % 2 ? 9 : 0; x < W; x += 18) { c.beginPath(); c.arc(x, y, 3.2, 0, 7); c.fill(); } c.strokeStyle = rgba('#000000', 0.18); c.lineWidth = 3; for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; c.beginPath(); c.moveTo(W / 2 + Math.cos(a) * 380, H / 2 + Math.sin(a) * 300); c.lineTo(W / 2 + Math.cos(a) * W, H / 2 + Math.sin(a) * W); c.stroke(); } c.strokeStyle = '#111'; c.lineWidth = 14; c.strokeRect(24, 24, W - 48, H - 48); },
  anime(c, W, H, P, t, r) { const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#5aa9ff'); g.addColorStop(0.7, P.bg); g.addColorStop(1, '#ffe2f0'); c.fillStyle = g; c.fillRect(0, 0, W, H); for (let i = 0; i < 6; i++) { c.fillStyle = 'rgba(255,255,255,0.85)'; const x = ((r() * W + t * 30 * (i + 1)) % (W + 400)) - 200, y = r() * H * 0.5; for (let k = 0; k < 5; k++) { c.beginPath(); c.arc(x + k * 50, y + Math.sin(k) * 14, 40 + (k % 2) * 16, 0, 7); c.fill(); } } const sg = c.createRadialGradient(W * 0.85, H * 0.15, 0, W * 0.85, H * 0.15, 500); sg.addColorStop(0, 'rgba(255,255,230,0.9)'); sg.addColorStop(1, 'rgba(255,255,230,0)'); c.fillStyle = sg; c.fillRect(0, 0, W, H); },
  pixel(c, W, H, P, t, r) { c.fillStyle = P.bg; c.fillRect(0, 0, W, H); const s = 24; for (let i = 0; i < 90; i++) { c.fillStyle = r() < 0.5 ? '#ffffff' : P.sub; const blink = Math.sin(t * 4 + i) > 0 ? 1 : 0.4; c.globalAlpha = blink; c.fillRect(Math.floor((r() * W) / s) * s, Math.floor((r() * H * 0.6) / s) * s, s / 3, s / 3); } c.globalAlpha = 1; c.fillStyle = '#2d6a4f'; for (let x = 0; x < W; x += s) c.fillRect(x, H - s * 4 - (Math.floor(x / s) % 3) * s, s, s * 6); },
  microgame(c, W, H, P, t, r) { c.fillStyle = P.bg; c.fillRect(0, 0, W, H); c.save(); c.translate(W / 2, H / 2); c.rotate(t * 0.3); for (let i = 0; i < 16; i++) { c.fillStyle = i % 2 ? rgba(P.accent, 0.25) : rgba(P.accent2, 0.25); c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, W, (i / 16) * Math.PI * 2, ((i + 1) / 16) * Math.PI * 2); c.fill(); } c.restore(); },
  gameshow(c, W, H, P, t, r) { c.fillStyle = P.bg; c.fillRect(0, 0, W, H); for (let i = 0; i < 24; i++) { star(c, r() * W, r() * H, 6 + r() * 12, rgba(P.accent, 0.5 + 0.5 * Math.sin(t * 5 + i))); } c.fillStyle = rgba('#000000', 0.25); c.fillRect(0, H - 120, W, 120); },
  news(c, W, H, P, t, r) { const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, P.bg); g.addColorStop(1, '#1d3557'); c.fillStyle = g; c.fillRect(0, 0, W, H); c.strokeStyle = 'rgba(255,255,255,0.05)'; c.lineWidth = 2; for (let i = 0; i < 12; i++) { c.beginPath(); c.arc(W * 0.8, H * 0.4, 80 + i * 60 + ((t * 40) % 60), 0, 7); c.stroke(); } c.fillStyle = P.accent; c.fillRect(0, H - 110, W, 8); c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(0, H - 102, W, 62); },
  flat(c, W, H, P, t, r) { c.fillStyle = P.bg; c.fillRect(0, 0, W, H); c.fillStyle = P.accent; c.beginPath(); c.arc(W * 0.86, H * 0.2 + Math.sin(t) * 10, 120, 0, 7); c.fill(); c.fillStyle = P.accent2; c.save(); c.translate(W * 0.12, H * 0.82); c.rotate(t * 0.4); c.fillRect(-70, -70, 140, 140); c.restore(); c.strokeStyle = P.fg; c.lineWidth = 6; c.beginPath(); for (let x = 0; x < 300; x += 10) c.lineTo(W * 0.68 + x, H * 0.88 + Math.sin(x / 20 + t * 3) * 14); c.stroke(); },
  soft3d(c, W, H, P, t, r) { const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, P.bg); g.addColorStop(1, '#ffffff'); c.fillStyle = g; c.fillRect(0, 0, W, H); for (const [x, y, R, col] of [[0.84, 0.3, 150, P.accent], [0.14, 0.78, 110, P.accent2], [0.72, 0.82, 70, '#ffd36e']]) { c.fillStyle = 'rgba(0,0,0,0.08)'; c.beginPath(); c.ellipse(W * x, H * y + R * 0.95, R * 0.9, R * 0.22, 0, 0, 7); c.fill(); const s = c.createRadialGradient(W * x - R * 0.35, H * y - R * 0.4 + Math.sin(t) * 6, R * 0.1, W * x, H * y, R); s.addColorStop(0, '#ffffff'); s.addColorStop(0.35, col); s.addColorStop(1, rgba(col, 0.85)); c.fillStyle = s; c.beginPath(); c.arc(W * x, H * y + Math.sin(t + x * 9) * 6, R, 0, 7); c.fill(); } },
  collage(c, W, H, P, t, r) { c.fillStyle = P.bg; c.fillRect(0, 0, W, H); for (let i = 0; i < 7; i++) { c.save(); c.translate(r() * W, r() * H); c.rotate((r() - 0.5) * 0.4); c.fillStyle = [P.accent, P.accent2, '#ffffff', '#f2d45c'][i % 4]; c.globalAlpha = 0.7; c.beginPath(); c.moveTo(-160, -90); for (let k = 0; k < 12; k++) c.lineTo(-160 + k * 30, -90 + (r() - 0.5) * 12); c.lineTo(200, 100); c.lineTo(-160, 100); c.fill(); c.restore(); } c.globalAlpha = 1; grain(c, W, H, r, 0.06, '#000'); },
  journal(c, W, H, P, t, r) { c.fillStyle = P.bg; c.fillRect(0, 0, W, H); c.strokeStyle = rgba(P.accent2, 0.35); c.lineWidth = 1.5; for (let y = 120; y < H; y += 54) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); } c.strokeStyle = rgba(P.accent, 0.5); c.beginPath(); c.moveTo(150, 0); c.lineTo(150, H); c.stroke(); for (const [x, y, a, col] of [[0.8, 0.08, 0.3, P.accent], [0.12, 0.9, -0.2, P.accent2], [0.9, 0.86, 0.5, '#f9d56e']]) { c.save(); c.translate(W * x, H * y); c.rotate(a); c.fillStyle = rgba(col, 0.6); c.fillRect(-90, -22, 180, 44); c.restore(); } },
};
function grain(c, W, H, r, a, col) { c.fillStyle = col; c.globalAlpha = a; for (let i = 0; i < 1800; i++) c.fillRect(r() * W, r() * H, 1.6, 1.6); c.globalAlpha = 1; }
function rr(c, x, y, w, h, R) { c.beginPath(); c.moveTo(x + R, y); c.arcTo(x + w, y, x + w, y + h, R); c.arcTo(x + w, y + h, x, y + h, R); c.arcTo(x, y + h, x, y, R); c.arcTo(x, y, x + w, y, R); c.closePath(); }
function star(c, x, y, R, col) { c.fillStyle = col; c.beginPath(); for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr2 = i % 2 ? R * 0.45 : R; c.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); } c.fill(); }

// 深色背景上用亮字，浅色用深字（保证对比度，不跟随系统主题）
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255); };

// ---------------- 文字动效 ----------------
function reveal(motion, k, i = 0) {
  const d = clamp(k * 1.6 - i * 0.18);
  switch (motion) {
    case 'pop': case 'bounce': case 'punch': return { a: clamp(d * 3), s: back(d), y: 0, r: motion === 'punch' ? (1 - d) * -0.08 : 0 };
    case 'slide': return { a: d, s: 1, y: 0, x: (1 - eo(d)) * -160 };
    case 'rise': case 'grow': return { a: d, s: 1, y: (1 - eo(d)) * 60 };
    case 'stamp': return { a: d > 0 ? 1 : 0, s: 1 + (1 - eo(clamp(d * 2))) * 0.8, y: 0 };
    case 'wobble': return { a: d, s: 1, y: Math.sin(d * 10) * (1 - d) * 18, r: Math.sin(d * 8) * (1 - d) * 0.05 };
    case 'type': case 'draw': case 'brush': case 'bleed': case 'unfold': return { a: 1, s: 1, y: 0, chars: d };
    default: return { a: eo(d), s: 1, y: (1 - eo(d)) * 30 };
  }
}
function drawText(c, text, x, y, { font, size, color, align = 'center', weight = 800, maxW = 1600, motion, k, i, stroke, shadow }) {
  const R = reveal(motion, k, i);
  let s = String(text || ''); if (R.chars != null) s = s.slice(0, Math.ceil(s.length * R.chars));
  c.save(); c.globalAlpha *= R.a; c.translate(x + (R.x || 0), y + (R.y || 0)); c.rotate(R.r || 0); c.scale(R.s, R.s);
  c.font = `${weight} ${size}px ${font}`; c.textAlign = align; c.textBaseline = 'middle';
  const lines = wrap(c, s, maxW);
  lines.forEach((ln, j) => {
    const yy = (j - (lines.length - 1) / 2) * size * 1.22;
    if (shadow) { c.fillStyle = shadow; c.fillText(ln, 6, yy + 6); }
    if (stroke) { c.lineWidth = size * 0.14; c.strokeStyle = stroke; c.lineJoin = 'round'; c.strokeText(ln, 0, yy); }
    c.fillStyle = color; c.fillText(ln, 0, yy);
  });
  c.restore();
  return lines.length * size * 1.22;
}
export function wrap(c, s, maxW) {
  const out = []; let cur = '';
  for (const ch of String(s)) { if (ch === '\n') { out.push(cur); cur = ''; continue; } const t = cur + ch; if (c.measureText(t).width > maxW && cur) { out.push(cur); cur = /[，。！？、,.!?]/.test(ch) ? '' : ch; if (!cur) out[out.length - 1] += ch; } else cur = t; }
  if (cur) out.push(cur); return out.length ? out : [''];
}

/**
 * 画一张卡片
 * @param {CanvasRenderingContext2D} c 已缩放到 W×H 坐标的上下文
 */
export function drawCard(c, { W, H, tpl, card = {}, shot, local, dur, img, emojiScale = 1 }) {
  const P = tpl.palette, F = tpl.font; const r = mulberry(hash(shot.id + tpl.id));
  const u = Math.min(W / 1920, H / 1080) * (shot.font || 1); // 字号单位
  const portrait = H > W;
  // 镜头运动（推 / 拉 / 摇）
  const cam = String(shot.camera || ''); const k = clamp(local / Math.max(0.5, dur));
  c.save();
  const z = /推/.test(cam) ? 1 + 0.06 * k : /拉/.test(cam) ? 1.06 - 0.06 * k : 1 + 0.015 * Math.sin(local * 0.4);
  const px = /摇|横移|平移/.test(cam) ? (k - 0.5) * -40 : 0;
  c.translate(W / 2 + px, H / 2); c.scale(z, z); c.translate(-W / 2, -H / 2);
  (BG[tpl.bg] || BG.paper)(c, W, H, P, local, r);
  c.restore();

  const fg = lum(P.bg) > 0.4 ? P.fg : P.fg; const acc = P.accent;
  const tIn = clamp(local / 0.9); const L = card.layout || 'statement';
  const cx = W / 2, cy = H * (portrait ? 0.42 : 0.46);
  const head = card.heading || shot.title || '';
  const stroke = ['comic', 'microgame', 'gameshow'].includes(tpl.bg) ? '#111' : null;
  const shadow = ['comic', 'rubber-hose', 'vintage'].includes(tpl.bg) ? 'rgba(0,0,0,0.35)' : null;
  const T = (text, x, y, size, o = {}) => drawText(c, text, x, y, { font: F.head, size: size * u, color: fg, motion: tpl.motion, k: tIn, maxW: W * (portrait ? 0.84 : 0.78), stroke, shadow, ...o });
  const B = (text, x, y, size, o = {}) => drawText(c, text, x, y, { font: F.body, size: size * u, color: P.sub, weight: 500, motion: 'rise', k: clamp((local - 0.35) / 0.9), maxW: W * (portrait ? 0.84 : 0.7), ...o });

  if (card.emoji && L !== 'chart') { c.save(); c.globalAlpha = clamp(local / 0.6); c.font = `${150 * u * emojiScale}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(card.emoji, portrait ? W / 2 : W * 0.84, (portrait ? H * 0.2 : H * 0.24) + Math.sin(local * 2) * 8 * u); c.restore(); }

  switch (L) {
    case 'title': {
      c.fillStyle = acc; c.globalAlpha = clamp(local / 0.5); c.fillRect(cx - 60 * u, cy - 120 * u, 120 * u * eo(tIn), 8 * u); c.globalAlpha = 1;
      T(head, cx, cy, 128); if (card.body) B(card.body, cx, cy + 130 * u, 46); break;
    }
    case 'question': T(head, cx, cy, 120, { color: acc }); if (card.body) B(card.body, cx, cy + 130 * u, 44); break;
    case 'number': {
      const n = String(card.heading || '');
      const num = parseFloat(n); const shown = isFinite(num) && /^\d/.test(n) ? n.replace(String(num), (Math.round(num * eo(clamp(local / 1.2)) * 10) / 10).toString()) : n;
      drawText(c, shown, cx, cy - 20 * u, { font: F.head, size: 260 * u, color: acc, motion: 'pop', k: tIn, stroke, shadow });
      if (card.body) B(card.body, cx, cy + 170 * u, 48); break;
    }
    case 'bullets': {
      T(head, portrait ? cx : W * 0.1, H * 0.2, 84, { align: portrait ? 'center' : 'left' });
      (card.bullets || []).slice(0, 5).forEach((b, i) => {
        const y = H * (portrait ? 0.38 : 0.38) + i * 120 * u; const kk = clamp((local - 0.5 - i * 0.45) / 0.6);
        c.save(); c.globalAlpha = eo(kk); c.translate((1 - eo(kk)) * -60 * u, 0);
        c.fillStyle = acc; c.beginPath(); c.arc(W * (portrait ? 0.12 : 0.11), y, 14 * u, 0, 7); c.fill();
        drawText(c, b, W * (portrait ? 0.16 : 0.14), y, { font: F.body, size: 56 * u, color: fg, align: 'left', weight: 600, k: 1, maxW: W * 0.72 });
        c.restore();
      });
      if (card.body) B(card.body, cx, H * 0.88, 36); break;
    }
    case 'quote': {
      c.fillStyle = acc; c.globalAlpha = 0.25; c.font = `900 ${380 * u}px Georgia,serif`; c.textAlign = 'left'; c.fillText('“', W * 0.08, H * 0.48); c.globalAlpha = 1;
      T(head, cx, cy, 86, { weight: 700 }); if (card.body) B('—— ' + card.body, cx, cy + 160 * u, 40); break;
    }
    case 'compare': {
      const items = card.bullets?.length ? card.bullets : [head, card.body || ''];
      for (const [i, side] of [[0, -1], [1, 1]]) {
        const x = cx + side * W * 0.22; const kk = clamp((local - 0.2 - i * 0.5) / 0.7);
        c.save(); c.globalAlpha = eo(kk); c.fillStyle = i ? rgba(acc, 0.9) : rgba(P.sub, 0.25); rr(c, x - W * 0.19, H * 0.26, W * 0.38, H * 0.5, 28 * u); c.fill();
        drawText(c, i ? 'AFTER' : 'BEFORE', x, H * 0.33, { font: F.body, size: 30 * u, color: i ? P.bg : P.sub, weight: 700, k: 1 });
        drawText(c, items[i] || '', x, H * 0.52, { font: F.head, size: 66 * u, color: i ? P.bg : fg, k: 1, maxW: W * 0.32 });
        c.restore();
      }
      if (card.layout === 'compare' && card.heading && card.bullets?.length) T(head, cx, H * 0.15, 64); break;
    }
    case 'chart': {
      const vals = card.values?.length ? card.values : [3, 5, 8]; const labels = card.labels || vals.map((_, i) => String(i + 1));
      const max = Math.max(...vals, 1); const n = vals.length; const x0 = W * 0.12, x1 = W * 0.88, base = H * 0.82, top = H * 0.3;
      if (head) T(head, cx, H * 0.14, 64);
      const bw = ((x1 - x0) / n) * 0.62;
      vals.forEach((v, i) => {
        const kk = eo(clamp((local - 0.3 - i * 0.12) / 0.9)); const h = ((base - top) * v * kk) / max; const x = x0 + ((x1 - x0) / n) * (i + 0.5);
        c.fillStyle = i === n - 1 ? acc : rgba(P.accent2 || acc, 0.75); rr(c, x - bw / 2, base - h, bw, Math.max(1, h), 8 * u); c.fill();
        drawText(c, String(Math.round(v * kk * 10) / 10), x, base - h - 34 * u, { font: F.body, size: 34 * u, color: fg, weight: 700, k: 1 });
        drawText(c, labels[i], x, base + 40 * u, { font: F.body, size: 30 * u, color: P.sub, weight: 500, k: 1 });
      });
      c.strokeStyle = rgba(P.sub, 0.5); c.lineWidth = 2; c.beginPath(); c.moveTo(x0, base); c.lineTo(x1, base); c.stroke(); break;
    }
    case 'image': {
      if (img) { const kk = eo(tIn); const iw = W * (portrait ? 0.86 : 0.62), ih = iw * (img.height / img.width); const h2 = Math.min(ih, H * 0.6); const w2 = h2 * (img.width / img.height);
        c.save(); c.globalAlpha = kk; c.translate(cx, H * 0.45); c.scale(0.94 + 0.06 * kk + 0.02 * k, 0.94 + 0.06 * kk + 0.02 * k); c.shadowColor = 'rgba(0,0,0,0.3)'; c.shadowBlur = 40 * u; rr(c, -w2 / 2, -h2 / 2, w2, h2, 18 * u); c.clip(); c.drawImage(img, -w2 / 2, -h2 / 2, w2, h2); c.restore(); }
      T(head, cx, H * 0.86, 60); break;
    }
    case 'lower': {
      const kk = eo(tIn); c.fillStyle = acc; c.fillRect(W * 0.06, H * 0.72, W * 0.5 * kk, 110 * u); c.fillStyle = P.bg; c.fillRect(W * 0.06, H * 0.72 + 110 * u, W * 0.36 * kk, 64 * u);
      drawText(c, head, W * 0.08, H * 0.72 + 55 * u, { font: F.head, size: 60 * u, color: P.bg, align: 'left', k: 1, motion: 'fade' });
      if (card.body) drawText(c, card.body, W * 0.08, H * 0.72 + 142 * u, { font: F.body, size: 34 * u, color: fg, align: 'left', weight: 500, k: 1 }); break;
    }
    case 'end': {
      if (img) { const s = 220 * u; c.globalAlpha = eo(tIn); c.drawImage(img, cx - (s * img.width) / img.height / 2, cy - 230 * u, (s * img.width) / img.height, s); c.globalAlpha = 1; }
      T(head, cx, cy + (img ? 60 : 0) * u, 140); if (card.body) B(card.body, cx, cy + (img ? 190 : 140) * u, 48);
      c.fillStyle = acc; c.globalAlpha = clamp((local - 0.8) / 0.5); c.fillRect(cx - 40 * u, cy + (img ? 260 : 210) * u, 80 * u, 6 * u); c.globalAlpha = 1; break;
    }
    default: { T(head, cx, cy, 104); if (card.body) B(card.body, cx, cy + 140 * u, 46); }
  }
}

/** 字幕 */
export function drawSubtitle(c, { W, H, text, style = 'clean', tpl, size = 1, k = 1 }) {
  const u = Math.min(W / 1920, H / 1080) * size; const portrait = H > W;
  const fs = (portrait ? 54 : 48) * u; const y = H * (portrait ? 0.78 : 0.885);
  c.save(); c.font = `700 ${fs}px ${tpl.font.body}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  const lines = wrap(c, text, W * 0.8); const lh = fs * 1.3; const w = Math.max(...lines.map((l) => c.measureText(l).width));
  c.globalAlpha = Math.min(1, k * 4);
  lines.forEach((ln, i) => {
    const yy = y + (i - (lines.length - 1)) * lh;
    if (style === 'box') { c.fillStyle = 'rgba(0,0,0,0.62)'; rr(c, W / 2 - w / 2 - fs * 0.5, yy - lh / 2, w + fs, lh, fs * 0.25); c.fill(); c.fillStyle = '#fff'; c.fillText(ln, W / 2, yy); }
    else if (style === 'variety') { c.lineWidth = fs * 0.2; c.strokeStyle = '#111'; c.lineJoin = 'round'; c.strokeText(ln, W / 2, yy); c.fillStyle = '#ffe14d'; c.fillText(ln, W / 2, yy); }
    else { c.lineWidth = fs * 0.16; c.strokeStyle = 'rgba(0,0,0,0.75)'; c.lineJoin = 'round'; c.strokeText(ln, W / 2, yy); c.fillStyle = '#ffffff'; c.fillText(ln, W / 2, yy); }
  });
  c.restore();
}

/** 花字 / 角标 / 标题条 */
export function drawTextClip(c, { W, H, t, local, tpl }) {
  const u = Math.min(W / 1920, H / 1080); const P = tpl.palette; const k = clamp(local / 0.35), out = clamp((t.dur - local) / 0.25);
  const x = (t.x ?? 0.5) * W, y = (t.y ?? 0.2) * H; const a = Math.min(k, out);
  c.save(); c.globalAlpha = a; c.translate(x, y); const s = t.style === 'burst' ? back(k, 2.2) : 0.9 + 0.1 * eo(k); c.scale(s, s);
  c.font = `900 ${(t.style === 'title' ? 84 : t.style === 'burst' ? 76 : 48) * u}px ${tpl.font.head}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  const w = c.measureText(t.text).width;
  if (t.style === 'tag') { c.rotate(-0.04); c.fillStyle = P.accent; rr(c, -w / 2 - 22 * u, -40 * u, w + 44 * u, 80 * u, 14 * u); c.fill(); c.fillStyle = lum(P.accent) > 0.45 ? '#111' : '#fff'; c.fillText(t.text, 0, 2 * u); }
  else if (t.style === 'lower') { c.fillStyle = P.accent; c.fillRect(-w / 2 - 30 * u, -36 * u, w + 60 * u, 72 * u); c.fillStyle = '#fff'; c.fillText(t.text, 0, 0); }
  else if (t.style === 'note') { c.rotate(0.05); c.fillStyle = '#fff6b0'; c.shadowColor = 'rgba(0,0,0,0.2)'; c.shadowBlur = 16 * u; c.fillRect(-w / 2 - 26 * u, -46 * u, w + 52 * u, 92 * u); c.shadowBlur = 0; c.fillStyle = '#3b2f2f'; c.fillText(t.text, 0, 0); }
  else if (t.style === 'burst') { star(c, 0, 0, w * 0.75 + 60 * u, P.accent2 || '#ffcf33'); c.lineWidth = 12 * u; c.strokeStyle = '#111'; c.lineJoin = 'round'; c.strokeText(t.text, 0, 0); c.fillStyle = '#fff'; c.fillText(t.text, 0, 0); }
  else { c.lineWidth = 10 * u; c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineJoin = 'round'; c.strokeText(t.text, 0, 0); c.fillStyle = '#fff'; c.fillText(t.text, 0, 0); }
  c.restore();
}
