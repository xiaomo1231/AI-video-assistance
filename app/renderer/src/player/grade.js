// 调色：一级调色（Lift / Gamma / Gain、曝光、对比、饱和、色温、色调）编译成 SVG 滤镜。
// 预览和导出走同一个滤镜，所以所见即所得。

export const LOOKS = {
  none: { name: '无', g: {} },
  warm: { name: '暖调胶片', g: { temp: 0.35, gain: [0.04, 0.01, -0.04], lift: [0.03, 0.015, 0], contrast: 0.08, saturation: -0.05 } },
  tealorange: { name: '青橙', g: { lift: [-0.02, 0.02, 0.05], gain: [0.08, 0.02, -0.06], saturation: 0.12, contrast: 0.1 } },
  cool: { name: '冷调', g: { temp: -0.35, tint: 0.05, contrast: 0.05 } },
  mono: { name: '黑白', g: { saturation: -1, contrast: 0.18 } },
  fade: { name: '褪色', g: { lift: [0.08, 0.08, 0.09], contrast: -0.15, saturation: -0.2 } },
  punch: { name: '高对比', g: { contrast: 0.3, saturation: 0.2, gamma: [-0.05, -0.05, -0.05] } },
  night: { name: '夜景蓝', g: { exposure: -0.35, temp: -0.5, lift: [0, 0.01, 0.05], saturation: -0.1 } },
};

export const isNeutral = (g) => !g || ((!g.exposure && !g.contrast && !g.saturation && !g.temp && !g.tint && !(g.look && g.look !== 'none')) && [g.lift, g.gamma, g.gain].every((a) => !a || a.every((v) => !v)));

/** 合并 look 和手动参数 */
export function effective(g = {}) {
  const L = (g.look && LOOKS[g.look]?.g) || {};
  const add3 = (a = [0, 0, 0], b = [0, 0, 0]) => a.map((v, i) => v + (b[i] || 0));
  return { exposure: (g.exposure || 0) + (L.exposure || 0), contrast: (g.contrast || 0) + (L.contrast || 0), saturation: (g.saturation || 0) + (L.saturation || 0), temp: (g.temp || 0) + (L.temp || 0), tint: (g.tint || 0) + (L.tint || 0), lift: add3(g.lift, L.lift), gamma: add3(g.gamma, L.gamma), gain: add3(g.gain, L.gain) };
}

/** 生成一个 <filter> 的内部 XML */
export function filterXML(id, g) {
  const e = effective(g);
  const exp = Math.pow(2, e.exposure);
  const tR = 1 + 0.12 * e.temp - 0.04 * e.tint, tG = 1 + 0.08 * e.tint, tB = 1 - 0.14 * e.temp - 0.04 * e.tint;
  const ch = (i, t) => {
    const lift = e.lift[i], gain = e.gain[i];
    const slope = exp * t * (1 + gain) * (1 - lift), icpt = lift * (1 + gain);
    return { slope: slope.toFixed(4), icpt: icpt.toFixed(4), gexp: (1 / Math.max(0.2, 1 + e.gamma[i] * 2)).toFixed(4) };
  };
  const r = ch(0, tR), gg = ch(1, tG), b = ch(2, tB);
  const c = 1 + e.contrast, ci = (0.5 * (1 - c)).toFixed(4);
  return `<filter id="${id}" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%">
<feComponentTransfer><feFuncR type="linear" slope="${r.slope}" intercept="${r.icpt}"/><feFuncG type="linear" slope="${gg.slope}" intercept="${gg.icpt}"/><feFuncB type="linear" slope="${b.slope}" intercept="${b.icpt}"/></feComponentTransfer>
<feComponentTransfer><feFuncR type="gamma" amplitude="1" exponent="${r.gexp}" offset="0"/><feFuncG type="gamma" amplitude="1" exponent="${gg.gexp}" offset="0"/><feFuncB type="gamma" amplitude="1" exponent="${b.gexp}" offset="0"/></feComponentTransfer>
<feComponentTransfer><feFuncR type="linear" slope="${c.toFixed(4)}" intercept="${ci}"/><feFuncG type="linear" slope="${c.toFixed(4)}" intercept="${ci}"/><feFuncB type="linear" slope="${c.toFixed(4)}" intercept="${ci}"/></feComponentTransfer>
<feColorMatrix type="saturate" values="${Math.max(0, 1 + e.saturation).toFixed(4)}"/>
</filter>`;
}

/** 同样的计算用在像素上（示波器、颜色匹配预览） */
export function gradePixel(rgb, g) {
  const e = effective(g); const exp = Math.pow(2, e.exposure);
  const t = [1 + 0.12 * e.temp - 0.04 * e.tint, 1 + 0.08 * e.tint, 1 - 0.14 * e.temp - 0.04 * e.tint];
  const out = rgb.map((x, i) => {
    let y = x * exp * t[i] * (1 + e.gain[i]) * (1 - e.lift[i]) + e.lift[i] * (1 + e.gain[i]);
    y = Math.pow(Math.max(0, Math.min(1, y)), 1 / Math.max(0.2, 1 + e.gamma[i] * 2));
    return (y - 0.5) * (1 + e.contrast) + 0.5;
  });
  const s = Math.max(0, 1 + e.saturation); const L = 0.213 * out[0] + 0.715 * out[1] + 0.072 * out[2];
  return out.map((v) => Math.max(0, Math.min(1, L + (v - L) * s)));
}
