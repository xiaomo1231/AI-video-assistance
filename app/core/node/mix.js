// 混音：配音 + 配乐（自动闪避）+ 音效 + 素材原声，两遍 loudnorm 到目标响度
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { run } from './ffmpeg.js';
import { lineT, absT } from '../timing.js';
import { abs } from './store.js';
import { makeSfx } from './synth.js';

const db = (g) => Math.pow(10, (g || 0) / 20);

/** 收集所有声音片段：[{file, at, in, dur, gain, kind}] */
export async function collectClips(dir, p) {
  const clips = [];
  for (const l of p.lines) if (l.audio && existsSync(abs(dir, l.audio))) clips.push({ file: abs(dir, l.audio), at: lineT(p, l), in: 0, dur: l.audioDur || l.dur, gain: l.gain || 0, kind: 'voice' });
  for (const m of p.music) { const a = p.assets.find((x) => x.id === m.asset); const f = a ? abs(dir, a.path) : m.file && abs(dir, m.file); if (f && existsSync(f) && !m.mute) clips.push({ file: f, at: absT(p, m), in: m.in || 0, dur: m.dur, gain: m.gain ?? -12, kind: 'music', fadeIn: m.fadeIn, fadeOut: m.fadeOut, duck: m.duck !== false }); }
  for (const x of p.sfx) {
    let f = null;
    if (x.asset) { const a = p.assets.find((q) => q.id === x.asset); f = a && abs(dir, a.path); }
    else if (x.synth) { f = path.join(dir, 'audio/sfx', `${x.synth}.wav`); if (!existsSync(f)) { await fs.mkdir(path.dirname(f), { recursive: true }); await fs.writeFile(f, makeSfx(x.synth)); } }
    if (f && existsSync(f) && !x.mute) clips.push({ file: f, at: absT(p, x), in: 0, dur: null, gain: x.gain ?? -6, kind: 'sfx' });
  }
  for (const s of p.shots) {
    if (s.src.kind !== 'media' || s.muted) continue;
    const a = p.assets.find((x) => x.id === s.src.asset);
    if (a?.hasAudio && a.kind === 'video') clips.push({ file: abs(dir, a.path), at: s.t0, in: s.src.in || 0, dur: Math.max(0, s.dur - (s.hold || 0)) * (s.speed || 1), gain: s.volume ?? 0, kind: 'orig', speed: s.speed || 1 });
  }
  return clips.filter((c) => c.at < p.duration);
}

/** 生成混音 WAV，返回测得的响度 */
export async function mixAudio(dir, p, out, { loudness = -14, onProgress, signal } = {}) {
  const clips = await collectClips(dir, p);
  const D = Math.max(0.1, p.duration);
  if (!clips.length) { await run(['-y', '-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo`, '-t', String(D), out], { signal }); return { silent: true }; }
  const inputs = [], parts = [], voice = [], music = [], other = [];
  clips.forEach((c, i) => {
    inputs.push('-i', c.file);
    let f = `[${i}:a]aresample=48000,aformat=channel_layouts=stereo`;
    if (c.in || c.dur) f += `,atrim=start=${c.in || 0}${c.dur ? `:duration=${c.dur}` : ''},asetpts=PTS-STARTPTS`;
    if (c.speed && c.speed !== 1) f += `,atempo=${Math.min(2, Math.max(0.5, c.speed))}`;
    if (c.fadeIn) f += `,afade=t=in:d=${c.fadeIn}`;
    if (c.fadeOut && c.dur) f += `,afade=t=out:st=${Math.max(0, c.dur - c.fadeOut)}:d=${c.fadeOut}`;
    f += `,volume=${db(c.gain).toFixed(4)},adelay=${Math.round(c.at * 1000)}|${Math.round(c.at * 1000)}[c${i}]`;
    parts.push(f);
    (c.kind === 'voice' ? voice : c.kind === 'music' ? music : other).push(`[c${i}]`);
  });
  const mixOf = (arr, name) => (arr.length === 1 ? `${arr[0]}anull[${name}]` : `${arr.join('')}amix=inputs=${arr.length}:normalize=0:dropout_transition=0[${name}]`);
  if (voice.length) parts.push(mixOf(voice, 'vo'));
  if (music.length) parts.push(mixOf(music, 'mu'));
  if (other.length) parts.push(mixOf(other, 'ot'));
  let fin = [];
  if (voice.length && music.length && clips.some((c) => c.kind === 'music' && c.duck)) {
    parts.push('[vo]asplit=2[vo1][vo2]');
    parts.push('[mu][vo2]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400:makeup=1[mud]');
    fin = ['[vo1]', '[mud]'];
  } else { if (voice.length) fin.push('[vo]'); if (music.length) fin.push('[mu]'); }
  if (other.length) fin.push('[ot]');
  parts.push(`${fin.join('')}amix=inputs=${fin.length}:normalize=0:dropout_transition=0,apad=whole_dur=${D},atrim=duration=${D}[pre]`);
  const graph = parts.join(';');
  const tmp = out + '.pre.wav';
  await run(['-y', ...inputs, '-filter_complex', graph, '-map', '[pre]', '-ar', '48000', '-c:a', 'pcm_s16le', tmp], { onProgress, signal });
  // 两遍响度：先测
  const { stderr } = await run(['-y', '-i', tmp, '-af', `loudnorm=I=${loudness}:TP=-1.2:LRA=11:print_format=json`, '-f', 'null', '-'], { signal });
  const j = stderr.slice(stderr.lastIndexOf('{'), stderr.lastIndexOf('}') + 1);
  let m = null; try { m = JSON.parse(j); } catch {}
  if (m && isFinite(+m.input_i) && +m.input_i > -70) {
    await run(['-y', '-i', tmp, '-af', `loudnorm=I=${loudness}:TP=-1.2:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=48000`, '-c:a', 'pcm_s16le', out], { signal });
  } else await fs.copyFile(tmp, out);
  await fs.rm(tmp, { force: true });
  return { measured: m ? +m.input_i : null, target: loudness, clips: clips.length };
}
