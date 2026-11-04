// 分析：节拍、镜头切点、颜色统计
import { decodePCM, run } from './ffmpeg.js';

/** 节拍：能量起音包络 + 自相关求 BPM，再按相位对齐出每拍时间 */
export async function detectBeats(file, { minBpm = 70, maxBpm = 180 } = {}) {
  const rate = 11025, hop = 256; const pcm = await decodePCM(file, { rate });
  const n = Math.floor(pcm.length / hop); const env = new Float32Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) { let e = 0; for (let j = 0; j < hop; j++) { const v = pcm[i * hop + j]; e += v * v; } e = Math.log1p(e * 100); env[i] = Math.max(0, e - prev); prev = e; }
  const fps = rate / hop; let best = 0, bestLag = 0;
  for (let bpm = minBpm; bpm <= maxBpm; bpm += 0.5) {
    const lag = (60 / bpm) * fps; let s = 0;
    for (let i = Math.ceil(lag); i < n; i++) s += env[i] * (env[Math.round(i - lag)] || 0);
    s /= n - lag; if (s > best) { best = s; bestLag = lag; }
  }
  const bpm = Math.round((60 * fps / bestLag) * 10) / 10;
  let bestPh = 0, bestScore = -1;
  for (let ph = 0; ph < bestLag; ph += 1) { let s = 0; for (let k = ph; k < n; k += bestLag) s += env[Math.round(k)] || 0; if (s > bestScore) { bestScore = s; bestPh = ph; } }
  const beats = []; for (let k = bestPh; k < n; k += bestLag) beats.push(Math.round((k / fps) * 1000) / 1000);
  // 重拍：每 4 拍里能量最大的相位
  const acc = [0, 0, 0, 0]; beats.forEach((t, i) => (acc[i % 4] += env[Math.round(t * fps)] || 0));
  const down = acc.indexOf(Math.max(...acc));
  return { bpm, beats, downbeats: beats.filter((_, i) => i % 4 === down), dur: pcm.length / rate };
}

/** 镜头切点（FFmpeg scdet） */
export async function sceneCuts(file, { threshold = 10 } = {}) {
  const { stderr } = await run(['-i', file, '-vf', `scale=320:-2,scdet=threshold=${threshold}`, '-an', '-f', 'null', '-']);
  const cuts = []; for (const m of stderr.matchAll(/lavfi\.scd\.time:\s*([\d.]+)/g)) cuts.push(+m[1]);
  return cuts;
}

/** BGRA 位图的颜色统计：各通道均值、亮度均值和标准差 */
export function colorStats(bmp) {
  let r = 0, g = 0, b = 0, y = 0, y2 = 0, n = 0;
  for (let i = 0; i < bmp.length; i += 16) { const B = bmp[i] / 255, G = bmp[i + 1] / 255, R = bmp[i + 2] / 255; const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B; r += R; g += G; b += B; y += Y; y2 += Y * Y; n++; }
  r /= n; g /= n; b /= n; y /= n;
  return { r, g, b, y, sd: Math.sqrt(Math.max(0, y2 / n - y * y)) };
}

/** 让 src 的统计向 ref 靠拢：返回 grade 增量（gain 调色偏，exposure 调亮度，contrast 调反差） */
export function matchGrade(src, ref) {
  const clamp = (v, a = -0.5, b = 0.5) => Math.max(a, Math.min(b, v));
  const exposure = clamp(Math.log2((ref.y + 0.02) / (src.y + 0.02)), -1, 1);
  const contrast = clamp((ref.sd - src.sd) / Math.max(0.05, src.sd), -0.6, 0.6);
  const k = (c) => clamp(((ref[c] / (ref.y + 1e-3)) - (src[c] / (src.y + 1e-3))) * 0.5, -0.3, 0.3);
  return { exposure: +exposure.toFixed(3), contrast: +contrast.toFixed(3), gain: [k('r'), k('g'), k('b')].map((v) => +v.toFixed(3)) };
}
