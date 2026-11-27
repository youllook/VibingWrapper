// 共用：里程驅動的地形函式（JS 與 GLSL 同一組公式）、共用 uniform、可無縫拼接的雜訊貼圖。
// 座標：騎士固定在原點、面向 -Z；世界往 +Z 流過去。station s = 里程 − z。
// 所有跟 s 有關的項都是 P＝960 的整數倍頻，GPU 只拿「里程 mod P」，跑一整天也不掉精度。
import * as THREE from './vendor/three.module.min.js';

export const P = 960;
const K = 2 * Math.PI / P;
export const roadC = s => 4.2 * Math.sin(K * 3 * s) + 2.0 * Math.sin(K * 7 * s + 1.3);            // 路中線左右偏移
export const roadC1 = s => 4.2 * K * 3 * Math.cos(K * 3 * s) + 2.0 * K * 7 * Math.cos(K * 7 * s + 1.3);
export const roadC2 = s => -4.2 * K * K * 9 * Math.sin(K * 3 * s) - 2.0 * K * K * 49 * Math.sin(K * 7 * s + 1.3);
export const roadE = s => 1.6 * Math.sin(K * 4 * s + 0.5) + 0.6 * Math.sin(K * 9 * s + 2.1);       // 路面高度
export const roadE1 = s => 1.6 * K * 4 * Math.cos(K * 4 * s + 0.5) + 0.6 * K * 9 * Math.cos(K * 9 * s + 2.1);
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hills = (X, s) => 3.0 * Math.sin(X * 0.045 + K * 5 * s) * Math.sin(K * 3 * s + X * 0.02 + 1.0)
  + 1.4 * Math.sin(X * 0.11 + 2.0 + K * 11 * s) + 0.5 * Math.sin(X * 0.23 - K * 23 * s);
const side = lat => { const r = Math.max(lat - 14, 0), l = Math.max(-lat - 46, 0); return 0.003 * r * r / (1 + r / 90) - 0.004 * l * l / (1 + l / 200); };
// 騎士座標 (x, z) 的地面高度；d＝里程
export function groundY(x, z, d) {
  const s = d - z, X = x + roadC(d), lat = X - roadC(s), f = Math.max(-z - 260, 0);
  return roadE(s) - roadE(d) + smooth(2.2, 16, Math.abs(lat)) * hills(X, s) + side(lat) - 0.0007 * f * f;
}

export const TERRAIN_GLSL = /* glsl */`
uniform float uD, uCd, uEd;
const float KP = 0.006544984694978736;
float roadC(float s){ return 4.2*sin(KP*3.*s) + 2.0*sin(KP*7.*s+1.3); }
float roadE(float s){ return 1.6*sin(KP*4.*s+0.5) + 0.6*sin(KP*9.*s+2.1); }
float hillsF(float X, float s){
  return 3.0*sin(X*0.045 + KP*5.*s)*sin(KP*3.*s + X*0.02 + 1.0) + 1.4*sin(X*0.11 + 2.0 + KP*11.*s) + 0.5*sin(X*0.23 - KP*23.*s);
}
float sideF(float lat){ float r=max(lat-14.,0.), l=max(-lat-46.,0.); return 0.003*r*r/(1.+r/90.) - 0.004*l*l/(1.+l/200.); }
float groundYL(vec2 xz, out float lat){
  float s=uD-xz.y, X=xz.x+uCd; lat=X-roadC(s);
  float f=max(-xz.y-260.,0.);
  return roadE(s)-uEd + smoothstep(2.2,16.,abs(lat))*hillsF(X,s) + sideF(lat) - 0.0007*f*f;
}
float groundY(vec2 xz){ float l; return groundYL(xz, l); }
`;

// 光與霧：雲、粒子、草、地形、遠山全部吃同一組（食譜 2 第 5 步）
export const LIGHT_GLSL = /* glsl */`
uniform vec3 uSun, uSunCol, uAmbCol, uFogCol, uFogSun;
uniform float uFogDen, uMist, uTime, uWind;
uniform sampler2D uNoise;
vec3 applyFog(vec3 c, vec3 wp){
  vec3 v = wp - cameraPosition; float d = length(v); vec3 dir = v/d;
  float hm = exp(-max(wp.y+20.,0.)*0.012);
  float f = 1. - exp(-d*(uFogDen + uMist*0.0011*hm));
  float sa = pow(max(dot(dir,uSun),0.),6.);
  return mix(c, mix(uFogCol,uFogSun,sa), f);
}
// 草色：地形與草葉共用，才接得起來。gp＝(絕對橫向 X, station s)
vec3 grassColor(vec2 gp, out float gust){
  float n1 = texture2D(uNoise, gp/32.).r, n2 = texture2D(uNoise, gp/160. + .37).g;
  gust = texture2D(uNoise, vec2(gp.x*0.011 - uTime*uWind*0.06, gp.y/120. + uTime*0.013)).a;
  vec3 c = mix(vec3(0.030,0.085,0.018), vec3(0.115,0.20,0.040), n1);
  c = mix(c, vec3(0.30,0.27,0.075), smoothstep(.55,.8,n2)*0.35);
  return c * (1. + (gust-.5)*0.7*min(uWind,1.5));
}
`;

const V3 = () => ({ value: new THREE.Vector3() }), F = v => ({ value: v });
export const U = {
  uD: F(0), uCd: F(0), uEd: F(0), uTime: F(0), uWind: F(0.5),
  uSun: V3(), uSunCol: V3(), uAmbCol: V3(), uFogCol: V3(), uFogSun: V3(),
  uFogDen: F(0.0007), uMist: F(0.3), uNoise: { value: null },
};

// ── 可拼接雜訊 ──
function rng(seed) { let x = seed >>> 0 || 1; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296); }
const fade = t => t * t * (3 - 2 * t);
function normalize(a) {
  let lo = Infinity, hi = -Infinity; for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v; }
  for (let i = 0; i < a.length; i++) a[i] = (a[i] - lo) / (hi - lo); return a;
}
function fbm2(size, baseF, octs, seed) {
  const out = new Float32Array(size * size), r = rng(seed);
  let amp = 1;
  for (let o = 0; o < octs; o++) {
    const f = baseF << o, lat = new Float32Array(f * f); for (let i = 0; i < lat.length; i++) lat[i] = r();
    for (let y = 0; y < size; y++) {
      const v = y / size * f, y0 = Math.floor(v), ty = fade(v - y0), ya = (y0 % f) * f, yb = ((y0 + 1) % f) * f;
      for (let x = 0; x < size; x++) {
        const u = x / size * f, x0 = Math.floor(u), tx = fade(u - x0), xa = x0 % f, xb = (x0 + 1) % f;
        const a = lat[ya + xa] + (lat[ya + xb] - lat[ya + xa]) * tx, b = lat[yb + xa] + (lat[yb + xb] - lat[yb + xa]) * tx;
        out[y * size + x] += (a + (b - a) * ty) * amp;
      }
    }
    amp *= 0.5;
  }
  return normalize(out);
}
function fbm3(size, baseF, octs, seed) {
  const out = new Float32Array(size ** 3), r = rng(seed); let amp = 1;
  for (let o = 0; o < octs; o++) {
    const f = baseF << o, lat = new Float32Array(f ** 3); for (let i = 0; i < lat.length; i++) lat[i] = r();
    const ix = new Int32Array(size * 2), tx = new Float32Array(size);
    for (let x = 0; x < size; x++) { const u = x / size * f, x0 = Math.floor(u); ix[x * 2] = x0 % f; ix[x * 2 + 1] = (x0 + 1) % f; tx[x] = fade(u - x0); }
    for (let z = 0, i = 0; z < size; z++) {
      const za = ix[z * 2] * f * f, zb = ix[z * 2 + 1] * f * f, tz = tx[z];
      for (let y = 0; y < size; y++) {
        const ya = ix[y * 2] * f, yb = ix[y * 2 + 1] * f, ty = tx[y];
        for (let x = 0; x < size; x++, i++) {
          const xa = ix[x * 2], xb = ix[x * 2 + 1], t = tx[x];
          const c00 = lat[za + ya + xa] + (lat[za + ya + xb] - lat[za + ya + xa]) * t, c10 = lat[za + yb + xa] + (lat[za + yb + xb] - lat[za + yb + xa]) * t;
          const c01 = lat[zb + ya + xa] + (lat[zb + ya + xb] - lat[zb + ya + xa]) * t, c11 = lat[zb + yb + xa] + (lat[zb + yb + xb] - lat[zb + yb + xa]) * t;
          const a = c00 + (c10 - c00) * ty, b = c01 + (c11 - c01) * ty;
          out[i] += (a + (b - a) * tz) * amp;
        }
      }
    }
    amp *= 0.5;
  }
  return normalize(out);
}
function worley3(size, f, seed) {
  const out = new Float32Array(size ** 3), r = rng(seed), pts = new Float32Array(f ** 3 * 3);
  for (let i = 0; i < pts.length; i++) pts[i] = r();
  const w = v => ((v % f) + f) % f;
  for (let z = 0, i = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++, i++) {
    const px = x / size * f, py = y / size * f, pz = z / size * f, cx = Math.floor(px), cy = Math.floor(py), cz = Math.floor(pz);
    let best = 9;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const gx = cx + dx, gy = cy + dy, gz = cz + dz, k = (w(gz) * f * f + w(gy) * f + w(gx)) * 3;
      const ex = gx + pts[k] - px, ey = gy + pts[k + 1] - py, ez = gz + pts[k + 2] - pz, d2 = ex * ex + ey * ey + ez * ez;
      if (d2 < best) best = d2;
    }
    out[i] = 1 - Math.min(1, Math.sqrt(best));
  }
  return normalize(out);
}

export function makeNoise() {
  const S = 256, ch = [fbm2(S, 4, 6, 11), fbm2(S, 4, 6, 29), fbm2(S, 32, 3, 47), fbm2(S, 8, 5, 71)];
  const d2 = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) for (let c = 0; c < 4; c++) d2[i * 4 + c] = ch[c][i] * 255;
  const tex2 = new THREE.DataTexture(d2, S, S, THREE.RGBAFormat);
  tex2.wrapS = tex2.wrapT = THREE.RepeatWrapping; tex2.magFilter = THREE.LinearFilter; tex2.minFilter = THREE.LinearMipmapLinearFilter; tex2.generateMipmaps = true; tex2.needsUpdate = true;
  const N = 64, base = fbm3(N, 4, 4, 5), w4 = worley3(N, 4, 7), w8 = worley3(N, 8, 13), w16 = worley3(N, 16, 17);
  const d3 = new Uint8Array(N ** 3 * 4);
  for (let i = 0; i < N ** 3; i++) {
    d3[i * 4] = Math.min(1, Math.max(0, base[i] * 0.62 + w4[i] * 0.48 - 0.05)) * 255;   // 大形：fbm＋胞狀（積雲的團塊感）
    d3[i * 4 + 1] = (w8[i] * 0.6 + w16[i] * 0.4) * 255;                                // 邊緣侵蝕用的細節
    d3[i * 4 + 2] = base[i] * 255; d3[i * 4 + 3] = 255;
  }
  const tex3 = new THREE.Data3DTexture(d3, N, N, N);
  tex3.format = THREE.RGBAFormat; tex3.wrapS = tex3.wrapT = tex3.wrapR = THREE.RepeatWrapping; tex3.magFilter = tex3.minFilter = THREE.LinearFilter; tex3.unpackAlignment = 1; tex3.needsUpdate = true;
  const sample = (c, u, v) => {   // CPU 端取樣（遠山用）
    const a = ch[c], x = ((u % 1) + 1) % 1 * S, y = ((v % 1) + 1) % 1 * S, x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
    const g = (i, j) => a[(j % S) * S + (i % S)];
    return (g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx) * (1 - ty) + (g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx) * ty;
  };
  return { tex2, tex3, sample };
}
