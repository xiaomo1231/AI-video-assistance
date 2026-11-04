// 程序化配乐和音效：离线可用，开箱即有声音。音色简单，正式片可以换成自己的音乐。
import { encodeWav } from './wav.js';

const RATE = 44100;
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// 情绪 → 调式、和弦进行（级数）、配器
const MOODS = {
  calm: { root: 57, scale: 'maj', prog: [1, 5, 6, 4], drums: 'soft', lead: 'pluck' },
  warm: { root: 60, scale: 'maj', prog: [1, 6, 4, 5], drums: 'soft', lead: 'pluck' },
  tech: { root: 57, scale: 'min', prog: [1, 6, 3, 7], drums: 'four', lead: 'arp' },
  'light-tech': { root: 60, scale: 'maj', prog: [1, 5, 6, 4], drums: 'four', lead: 'arp' },
  upbeat: { root: 62, scale: 'maj', prog: [1, 5, 6, 4], drums: 'four', lead: 'arp' },
  funk: { root: 55, scale: 'dor', prog: [1, 4, 1, 4], drums: 'funk', lead: 'pluck' },
  news: { root: 57, scale: 'min', prog: [1, 6, 7, 5], drums: 'four', lead: 'stab' },
  serious: { root: 52, scale: 'min', prog: [1, 6, 4, 5], drums: 'none', lead: 'pad' },
  emotional: { root: 60, scale: 'maj', prog: [6, 4, 1, 5], drums: 'soft', lead: 'pluck' },
  lullaby: { root: 65, scale: 'maj', prog: [1, 4, 1, 5], drums: 'none', lead: 'bell' },
  guqin: { root: 62, scale: 'pent', prog: [1, 5, 6, 5], drums: 'none', lead: 'pluck' },
  koto: { root: 64, scale: 'pent', prog: [1, 6, 5, 6], drums: 'none', lead: 'pluck' },
  festive: { root: 62, scale: 'pent', prog: [1, 5, 1, 5], drums: 'four', lead: 'bell' },
  chiptune: { root: 60, scale: 'maj', prog: [1, 6, 4, 5], drums: 'chip', lead: 'square' },
  action: { root: 52, scale: 'min', prog: [1, 6, 7, 1], drums: 'four', lead: 'stab' },
  lofi: { root: 57, scale: 'maj', prog: [2, 5, 1, 6], drums: 'lofi', lead: 'pluck' },
};
const SCALES = { maj: [0, 2, 4, 5, 7, 9, 11], min: [0, 2, 3, 5, 7, 8, 10], dor: [0, 2, 3, 5, 7, 9, 10], pent: [0, 2, 4, 7, 9, 12, 14] };
const deg = (m, d, oct = 0) => { const s = SCALES[m.scale]; const i = (d - 1) % s.length; return m.root + s[i] + 12 * (oct + Math.floor((d - 1) / s.length)); };
export const MOOD_NAMES = Object.keys(MOODS);

function lowpass(x, cut) { const rc = 1 / (2 * Math.PI * cut), dt = 1 / RATE, a = dt / (rc + dt); let y = 0; for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); x[i] = y; } return x; }

/** 生成一段配乐 WAV。mood 见 MOODS；返回 Buffer */
export function makeMusic({ mood = 'calm', bpm = 100, dur = 30, seed = 1 } = {}) {
  const m = MOODS[mood] || MOODS.calm; const r = rng(seed);
  const n = Math.ceil((dur + 1) * RATE); const L = new Float32Array(n), R = new Float32Array(n);
  const beat = 60 / bpm, bar = beat * 4;
  const addTone = (t0, len, f, amp, type = 'sine', pan = 0, env = [0.01, 0.2]) => {
    const i0 = Math.floor(t0 * RATE), i1 = Math.min(n, i0 + Math.floor(len * RATE));
    const gl = amp * (1 - Math.max(0, pan)), gr = amp * (1 + Math.min(0, pan));
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / RATE, ph = 2 * Math.PI * f * t;
      let v = type === 'sine' ? Math.sin(ph) : type === 'tri' ? (2 / Math.PI) * Math.asin(Math.sin(ph)) : type === 'square' ? (Math.sin(ph) > 0 ? 0.6 : -0.6) : type === 'saw' ? 2 * ((f * t) % 1) - 1 : Math.sin(ph) + 0.3 * Math.sin(2 * ph);
      const a = Math.min(1, t / env[0]) * Math.exp(-t / env[1]) * Math.min(1, (len - t) / 0.03);
      v *= a; L[i] += v * gl; R[i] += v * gr;
    }
  };
  const noise = (t0, len, amp, decay, hp = false) => { const i0 = Math.floor(t0 * RATE), i1 = Math.min(n, i0 + Math.floor(len * RATE)); let prev = 0; for (let i = i0; i < i1; i++) { const t = (i - i0) / RATE; let v = r() * 2 - 1; if (hp) { const o = v - prev; prev = v; v = o; } v *= amp * Math.exp(-t / decay); L[i] += v; R[i] += v; } };
  const kick = (t) => { const i0 = Math.floor(t * RATE); for (let i = 0; i < 0.35 * RATE && i0 + i < n; i++) { const tt = i / RATE; const f = 50 + 90 * Math.exp(-tt * 30); const v = Math.sin(2 * Math.PI * f * tt) * Math.exp(-tt * 9) * 0.8; L[i0 + i] += v; R[i0 + i] += v; } };
  const bars = Math.ceil(dur / bar) + 1;
  for (let b = 0; b < bars; b++) {
    const t = b * bar; const d = m.prog[b % m.prog.length];
    const chord = [deg(m, d), deg(m, d + 2), deg(m, d + 4)];
    // 垫音
    for (const [k, note] of chord.entries()) addTone(t, bar + 0.1, midi(note), 0.05, 'tri', (k - 1) * 0.4, [0.4, 3]);
    // 低音
    addTone(t, beat * 1.8, midi(deg(m, d) - 12), 0.16, 'sine', 0, [0.01, 0.6]);
    addTone(t + beat * 2, beat * 1.8, midi(deg(m, d) - 12), 0.13, 'sine', 0, [0.01, 0.6]);
    // 旋律层
    const steps = m.lead === 'arp' ? 8 : m.lead === 'pad' ? 0 : 4;
    for (let s = 0; s < steps; s++) {
      if (m.lead !== 'arp' && r() < 0.35) continue;
      const note = chord[(s + (r() < 0.3 ? 1 : 0)) % 3] + 12;
      const type = m.lead === 'square' ? 'square' : m.lead === 'bell' ? 'sine' : m.lead === 'stab' ? 'saw' : 'tri';
      addTone(t + s * (bar / steps), bar / steps * 0.9, midi(note), m.lead === 'stab' ? 0.04 : 0.07, type, (r() - 0.5) * 0.6, [0.005, m.lead === 'bell' ? 0.8 : 0.25]);
    }
    // 鼓
    for (let q = 0; q < 4; q++) {
      const tq = t + q * beat;
      if (m.drums === 'four' || m.drums === 'chip') { kick(tq); noise(tq + beat / 2, 0.05, 0.08, 0.02, true); if (q % 2) noise(tq, 0.2, 0.18, 0.06); }
      else if (m.drums === 'funk') { if (q === 0 || q === 2 || r() < 0.3) kick(tq + (q === 2 ? beat * 0.25 : 0)); noise(tq, 0.04, 0.07, 0.015, true); noise(tq + beat / 2, 0.04, 0.05, 0.015, true); if (q % 2) noise(tq, 0.18, 0.2, 0.05); }
      else if (m.drums === 'soft') { if (q === 0) kick(tq); if (q === 2) noise(tq, 0.15, 0.06, 0.05); noise(tq + beat / 2, 0.03, 0.03, 0.01, true); }
      else if (m.drums === 'lofi') { if (q === 0 || (q === 2 && r() < 0.6)) kick(tq + 0.03); if (q % 2) noise(tq + 0.02, 0.2, 0.1, 0.07); noise(tq + beat * 0.55, 0.03, 0.04, 0.01, true); }
    }
  }
  lowpass(L, 9000); lowpass(R, 9000);
  // 淡入淡出 + 归一
  let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
  const g = pk > 0 ? 0.8 / pk : 1, fi = RATE * 0.5, fo = RATE * 2;
  for (let i = 0; i < n; i++) { const e = Math.min(1, i / fi, (n - i) / fo); L[i] *= g * e; R[i] *= g * e; }
  return encodeWav([L.subarray(0, Math.floor(dur * RATE)), R.subarray(0, Math.floor(dur * RATE))], RATE);
}

export const SFX = { whoosh: '呼啸', pop: '弹出', click: '点击', ding: '叮', thump: '重击', stamp: '盖章', swish: '划过', rise: '上扬', glitch: '故障', type: '打字', chime: '提示音', boom: '低频冲击' };

/** 生成一个音效 WAV */
export function makeSfx(name = 'pop', seed = 3) {
  const r = rng(seed); const len = { whoosh: 0.7, rise: 1.2, boom: 1.4, type: 0.5, chime: 1.0, ding: 1.0 }[name] || 0.4;
  const n = Math.floor(len * RATE); const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE; let v = 0;
    switch (name) {
      case 'whoosh': case 'swish': { const env = Math.sin(Math.PI * Math.min(1, t / len)); v = (r() * 2 - 1) * env * 0.6; break; }
      case 'pop': v = Math.sin(2 * Math.PI * (300 + 900 * Math.exp(-t * 40)) * t) * Math.exp(-t * 18); break;
      case 'click': v = (r() * 2 - 1) * Math.exp(-t * 300) + Math.sin(2 * Math.PI * 2000 * t) * Math.exp(-t * 200) * 0.5; break;
      case 'ding': case 'chime': v = (Math.sin(2 * Math.PI * 1320 * t) + 0.5 * Math.sin(2 * Math.PI * 1980 * t) + (name === 'chime' ? 0.6 * Math.sin(2 * Math.PI * 1760 * t) : 0)) * Math.exp(-t * 4) * 0.5; break;
      case 'thump': case 'stamp': v = Math.sin(2 * Math.PI * (60 + 120 * Math.exp(-t * 25)) * t) * Math.exp(-t * 12) + (name === 'stamp' ? (r() * 2 - 1) * Math.exp(-t * 60) * 0.5 : 0); break;
      case 'rise': v = Math.sin(2 * Math.PI * (200 + 800 * (t / len) ** 2) * t) * (t / len) * 0.5 + (r() * 2 - 1) * (t / len) * 0.15; break;
      case 'glitch': v = (Math.floor(t * 80) % 2 ? 1 : -1) * (r() < 0.5 ? 0.5 : 0) * Math.exp(-t * 6); break;
      case 'type': { const k = Math.floor(t / 0.08); const tt = t - k * 0.08; v = (r() * 2 - 1) * Math.exp(-tt * 400) * 0.7; break; }
      case 'boom': v = Math.sin(2 * Math.PI * (40 + 40 * Math.exp(-t * 4)) * t) * Math.exp(-t * 2.5) + (r() * 2 - 1) * Math.exp(-t * 20) * 0.2; break;
      default: v = Math.sin(2 * Math.PI * 600 * t) * Math.exp(-t * 20);
    }
    x[i] = v * 0.8 * Math.min(1, (n - i) / 200);
  }
  if (name === 'whoosh' || name === 'swish') lowpass(x, 3000);
  return encodeWav(x, RATE);
}
