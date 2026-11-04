// 简单的 WAV 读写（16-bit PCM）
export function encodeWav(channels, rate = 44100) {
  const ch = Array.isArray(channels) ? channels : [channels];
  const n = ch[0].length, nc = ch.length, buf = Buffer.alloc(44 + n * nc * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * nc * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(nc, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * nc * 2, 28); buf.writeUInt16LE(nc * 2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * nc * 2, 40);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) { const v = Math.max(-1, Math.min(1, ch[c][i])); buf.writeInt16LE(Math.round(v * 32767), o); o += 2; }
  return buf;
}

export function decodeWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF') throw new Error('不是 WAV 文件');
  let o = 12, fmt = null, data = null;
  while (o + 8 <= buf.length) {
    const id = buf.toString('ascii', o, o + 4), size = buf.readUInt32LE(o + 4);
    if (id === 'fmt ') fmt = { nc: buf.readUInt16LE(o + 10), rate: buf.readUInt32LE(o + 12), bits: buf.readUInt16LE(o + 22) };
    if (id === 'data') data = buf.subarray(o + 8, o + 8 + size);
    o += 8 + size + (size % 2);
  }
  if (!fmt || !data || fmt.bits !== 16) throw new Error('只支持 16-bit PCM WAV');
  const n = Math.floor(data.length / 2 / fmt.nc), ch = Array.from({ length: fmt.nc }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < fmt.nc; c++) ch[c][i] = data.readInt16LE((i * fmt.nc + c) * 2) / 32768;
  return { rate: fmt.rate, channels: ch, dur: n / fmt.rate };
}
