// 霓虹隧道 · 世界：隧道、路面、燈、護欄、出口外的城市與天空。全部程式生成。
// 座標：鏡頭在原點附近往 −Z 看；s＝沿路走過的距離，某點的 s = uOff − z。
// 世界本身不動，所有重複的東西（燈、拱肋、虛線、路燈）都用 s 的週期在 shader 裡捲動。
// 隧道只存在於 s ∈ [uSIn, uSOut]；出了這段就是露天（路燈、城市、天空）。
// 所有材質輸出線性 HDR，最後由 glass.js 做色調映射。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ── 斷面（公尺）：左車道中心在 x＝0（鏡頭），中間虛線 x＝1.8，右車道到 5.4 ──
export const T = {
  xc: 1.8, yc: 2.4, r: 5.0,            // 拱圈圓心與半徑 → 牆在 x＝−3.2 與 6.8
  wl: -3.2, wr: 6.8, walk: 0.3,        // 兩側檢修步道高 0.3
  curbL: -2.15, curbR: 5.55,           // 步道邊緣
  eye: 1.22,
};
// 頂燈：拱圈左上、右上各一排，左右對稱、同一個間距；燈具用支架吊在拱圈下方 LAMP_DROP 公尺
export const LAMP_ANG = 2.62, LAMP_DROP = 0.3;
const lampAt = (ang) => ({ x: T.xc + (T.r - LAMP_DROP) * Math.cos(ang), y: T.yc + (T.r - LAMP_DROP) * Math.sin(ang) });
export const LAMP_A = { ...lampAt(LAMP_ANG), P: 12, ph: 0 };              // 左上
export const LAMP_B = { ...lampAt(Math.PI - LAMP_ANG), P: 12, ph: 0 };    // 右上（鏡像）
export const POLE = { xl: -4.6, xr: 8.6, y: 8.5, P: 32, ph: 0 };                                          // 露天路段的路燈

export function makeUniforms() {
  return {
    uOff: { value: 0 }, uSIn: { value: -1e5 }, uSOut: { value: 140 },
    uBend: { value: 0 }, uHill: { value: 0 }, uTime: { value: 0 },
    uLampK: { value: 1 }, uSparse: { value: 0 },
    uDay: { value: 0 },                                      // 出口外：0 夜、1 白天
    uRainK: { value: 1 },
    uLampCol: { value: new THREE.Color(0.8, 0.96, 1.0) },          // 冷白偏青（LED／螢光燈管）
    uHaze: { value: new THREE.Color(0.012, 0.016, 0.018) },
    uOutHaze: { value: new THREE.Color(0.05, 0.07, 0.12) },
    uExitCol: { value: new THREE.Color(0.9, 1.0, 1.25) },
    uHazard: { value: 0 },
    uHead: { value: 1 },   // 自己車頭燈（熄火＝0）
    uReflK: { value: new URLSearchParams(location.search).has('refl') ? parseFloat(new URLSearchParams(location.search).get('refl')) : 0.4 },   // 濕路面倒影整體強度（?refl= 可試）
  };
}

// 所有世界材質共用的 GLSL：彎道、雜湊、燈列照明與倒影
const COMMON = /* glsl */`
uniform float uOff, uSIn, uSOut, uBend, uHill, uTime, uLampK, uSparse, uDay, uRainK, uHazard, uReflK, uHead;
uniform vec3 uLampCol, uHaze, uOutHaze, uExitCol;
const vec3 C_ARCH = vec3(${T.xc.toFixed(3)}, ${T.yc.toFixed(3)}, ${T.r.toFixed(3)});
const vec4 LA = vec4(${LAMP_A.x.toFixed(3)}, ${LAMP_A.y.toFixed(3)}, ${LAMP_A.P.toFixed(1)}, ${LAMP_A.ph.toFixed(1)});
const vec4 LB = vec4(${LAMP_B.x.toFixed(3)}, ${LAMP_B.y.toFixed(3)}, ${LAMP_B.P.toFixed(1)}, ${LAMP_B.ph.toFixed(1)});
const vec4 PL = vec4(${POLE.xl.toFixed(2)}, ${POLE.xr.toFixed(2)}, ${POLE.y.toFixed(2)}, ${POLE.P.toFixed(1)});
float h11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ return 0.55 * vn(p) + 0.28 * vn(p * 2.13 + 3.1) + 0.17 * vn(p * 4.7 - 1.7); }
bool inTun(float s){ return s >= uSIn && s <= uSOut; }
// 每盞燈的狀態：少數壞掉、少數閃爍；不在時只留三分之一
float lampOn(float si){
  float h = h11(si * 0.0137 + 7.1);
  float on = h < 0.022 ? 0. : h < 0.05 ? step(0.35, vn(vec2(uTime * 9. + si, si))) : 1.;
  float keep = mod(floor(si / LA.z + 0.5), 3.) == 0. ? 1. : 1. - uSparse;
  return on * keep * uLampK;
}
vec3 bendP(vec3 p){ float z = min(p.z, 0.); return vec3(p.x + uBend * z * z, p.y + uHill * z * z, p.z); }
// 一列點光源（週期 P、相位 ph）照到 p 點：取附近 6 盞，加距離視窗免得換盞時跳
vec3 rowLight(vec3 p, vec3 n, vec2 L, float P, float ph, float k, bool tunnel){
  float s = uOff - p.z, i0 = floor((s - ph) / P);
  vec3 acc = vec3(0.);
  for (int j = -2; j <= 3; j++) {
    float si = (i0 + float(j)) * P + ph;
    if (inTun(si) != tunnel) continue;
    vec3 d = vec3(L.x, L.y, uOff - si) - p;
    float d2 = dot(d, d), w = 1. - smoothstep(6., 12., abs(si - s));
    acc += vec3(max(dot(n, d * inversesqrt(d2)), 0.) * w / (1. + d2 * k)) * (tunnel ? lampOn(si) : 1.);
  }
  return acc;
}
// 同上，但燈有朝向（隧道燈罩只往下、往路面照，拱頂照不到）：emit＝燈照的方向
vec3 rowSpot(vec3 p, vec3 n, vec2 L, float P, float ph, float k, vec3 emit){
  float s = uOff - p.z, i0 = floor((s - ph) / P);
  vec3 acc = vec3(0.);
  for (int j = -2; j <= 3; j++) {
    float si = (i0 + float(j)) * P + ph;
    if (!inTun(si)) continue;
    vec3 d = vec3(L.x, L.y, uOff - si) - p;
    float d2 = dot(d, d), w = 1. - smoothstep(P, P * 2., abs(si - s));
    vec3 l = d * inversesqrt(d2);
    float cone = smoothstep(0.1, 0.75, dot(-l, emit));
    acc += vec3(max(dot(n, l), 0.) * cone * w / (1. + d2 * k)) * lampOn(si);
  }
  return acc;
}
// 一列燈在濕路面上的倒影：反射光線打到燈所在的縱向平面 x＝L.x，看擊中點離燈多近
float reflRow(vec3 p, vec3 r, vec2 L, float P, float ph, float halfLen, float rough, bool tunnel){
  if (abs(r.x) < 1e-4) return 0.;
  float t = (L.x - p.x) / r.x; if (t <= 0.) return 0.;
  vec3 h = p + r * t;
  float dy = h.y - L.y, sy = 0.18 + rough * t * 0.5;
  float s = uOff - h.z, k = floor((s - ph) / P + 0.5), si = k * P + ph;
  float dz = abs(s - si), sz = halfLen + rough * t * 0.06;
  float on = inTun(si) == tunnel ? (tunnel ? lampOn(si) : 1.) : 0.;
  return exp(-dy * dy / (2. * sy * sy)) * (1. - smoothstep(sz * 0.6, sz * 1.4, dz)) * on;
}
`;

const BEND_VS = /* glsl */`
varying vec3 vP; varying vec3 vN; varying float vPart;
attribute float aPart;
void main(){
  vP = position; vN = normal; vPart = aPart;
  gl_Position = projectionMatrix * viewMatrix * vec4(bendP(position), 1.);
}`;

// ── 隧道殼：沿 Z 拉長的斷面（步道、牆、拱圈），法線朝內 ──
function zRows(z0, z1) {   // 近處 1 m 一格，越遠越疏（彎道要夠細）
  const zs = []; let z = z0;
  while (z > z1) { zs.push(z); z -= 1 + Math.abs(z) * 0.02; }
  zs.push(z1); return zs;
}
function extrude(segs, zs) {
  const pos = [], nor = [], part = [], idx = [];
  for (const seg of segs) {
    const n0 = pos.length / 3, m = seg.pts.length;
    for (const z of zs) for (let i = 0; i < m; i++) {
      const [x, y] = seg.pts[i], [nx, ny] = seg.nrm(i);
      pos.push(x, y, z); nor.push(nx, ny, 0); part.push(seg.part);
    }
    for (let r = 0; r < zs.length - 1; r++) for (let i = 0; i < m - 1; i++) {
      const a = n0 + r * m + i, b = a + 1, c = a + m, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  g.setIndex(idx); return g;
}
const seg = (pts, nrm, part) => ({ pts, nrm: typeof nrm === 'function' ? nrm : () => nrm, part });
function tunnelGeometry() {
  const arch = [], AN = 56;
  for (let i = 0; i <= AN; i++) { const a = Math.PI * (1 - i / AN); arch.push([T.xc + T.r * Math.cos(a), T.yc + T.r * Math.sin(a)]); }
  const segs = [
    seg([[T.wr, T.walk], [T.curbR, T.walk]], [0, 1], 0),
    seg([[T.curbR, T.walk], [T.curbR, 0]], [-1, 0], 0),
    seg([[T.curbL, 0], [T.curbL, T.walk]], [1, 0], 0),
    seg([[T.curbL, T.walk], [T.wl, T.walk]], [0, 1], 0),
    seg([[T.wl, T.walk], [T.wl, 0.9], [T.wl, T.yc]], [1, 0], 1),
    seg(arch, (i) => { const a = Math.PI * (1 - i / AN); return [-Math.cos(a), -Math.sin(a)]; }, 2),
    seg([[T.wr, T.yc], [T.wr, 0.9], [T.wr, T.walk]], [-1, 0], 1),
  ];
  return extrude(segs, zRows(8, -900));
}
// 護欄（隧道內外都有）：左右各一條 W 型鋼板，外加隧道內左側低矮護欄
function railGeometry() {
  const segs = [];
  for (const [x, dir] of [[T.curbL - 0.02, 1], [T.curbR + 0.02, -1]]) {
    segs.push(seg([[x, 0.42], [x + 0.06 * dir, 0.52], [x, 0.62], [x + 0.06 * dir, 0.72], [x, 0.8]], [dir, 0.1], 3));
  }
  return extrude(segs, zRows(8, -900));
}
function roadGeometry() {
  const xs = [-14, T.curbL, -1.8, 0, 1.8, 3.6, T.curbR, 20];
  return extrude([seg(xs.map((x) => [x, 0]), [0, 1], 0)].map((s) => ({ ...s, pts: s.pts.slice().reverse() })), zRows(8, -1400));
}

const SHELL_FS = /* glsl */`
varying vec3 vP; varying vec3 vN; varying float vPart;
void main(){
  vec3 p = vP; float s = uOff - p.z;
  bool tunnelPart = vPart < 2.5;
  if (tunnelPart && !inTun(s)) discard;
  bool inside = inTun(s);
  vec3 n = normalize(vN);
  // 斷面上的位置：拱圈角度（給拱肋、污漬用）
  float u = p.y + abs(p.x - C_ARCH.x) * 0.6;
  // 拱肋：每 4 m 一圈，接縫凹進去、邊緣朝前後
  float rib = fract(s / 4.), e = min(rib, 1. - rib);
  float groove = smoothstep(0.035, 0.0, e);
  float lip = smoothstep(0.16, 0.05, e) * (1. - groove);
  if (vPart > 1.5 && vPart < 2.5) n = normalize(n + vec3(0., 0., (rib < 0.5 ? -1. : 1.) * lip * 0.9));
  // 底色：拱頂暗灰混凝土、牆下段淺一點的面板、步道深色
  float dirt = fbm(vec2(s * 0.35, u * 1.3)), streak = fbm(vec2(s * 2.1, u * 0.18));
  vec3 alb = vec3(0.2, 0.21, 0.205) * (0.65 + 0.55 * dirt) * (0.85 + 0.3 * streak);
  if (vPart > 0.5 && vPart < 1.5) { float panel = step(0.02, fract(s / 2.4)) * step(0.03, fract(p.y / 0.75));
    alb = vec3(0.22, 0.23, 0.225) * (0.75 + 0.35 * dirt) * mix(0.55, 1., panel); }
  if (vPart < 0.5) alb = vec3(0.1, 0.105, 0.105) * (0.7 + 0.5 * dirt);
  if (vPart > 2.5) alb = vec3(0.42, 0.42, 0.40) * (0.8 + 0.3 * dirt);   // 護欄鋼板
  alb *= 1. - 0.75 * groove;
  vec3 col = vec3(0.);
  if (inside) {
    col += alb * uLampCol * 3.2 * rowSpot(p, n, LA.xy, LA.z, LA.w, 0.32, normalize(vec3(0.35, -0.94, 0.)));
    col += alb * uLampCol * 3.2 * rowSpot(p, n, LB.xy, LB.z, LB.w, 0.32, normalize(vec3(-0.35, -0.94, 0.)));
    col += alb * uLampCol * 0.008 * uLampK;                                   // 遠處燈的總和（很弱：真的隧道拱頂是暗的）
    float toExit = uSOut - s;                                                   // 出口透進來的冷光
    col += alb * uExitCol * 0.5 * exp(-toExit / 18.) * max(0.2, n.z + 0.5);
  } else {
    col += alb * vec3(0.75, 0.85, 1.0) * 3.0 * (rowLight(p, n, vec2(PL.x, PL.z), PL.w, 0., 0.02, false) + rowLight(p, n, vec2(PL.y, PL.z), PL.w, 16., 0.02, false));
    col += alb * mix(vec3(0.02, 0.025, 0.04), vec3(0.35, 0.38, 0.42), uDay);
  }
  // 霧：隧道內是暖色煙霧（燈越亮越濃），露天是城市夜霧
  float dist = length(p - cameraPosition);
  vec3 haze = inside ? uHaze * (0.25 + 0.75 * uLampK) : mix(uOutHaze, vec3(0.42, 0.45, 0.5), uDay);
  col = mix(col, haze, 1. - exp(-dist * (inside ? 0.009 : 0.006)));
  gl_FragColor = vec4(col, 1.);
}`;

const ROAD_FS = /* glsl */`
varying vec3 vP; varying vec3 vN; varying float vPart;
void main(){
  vec3 p = vP; float s = uOff - p.z;
  bool inside = inTun(s);
  if (inside && (p.x < ${T.curbL.toFixed(2)} || p.x > ${T.curbR.toFixed(2)})) discard;
  if (!inside && (p.x < -3.0 || p.x > 6.6)) discard;            // 露天是高架橋面，兩側外面是夜裡的城市
  // 柏油＋標線：中間虛線 4 m 實、8 m 空；兩側實線
  float grain = fbm(vec2(p.x * 1.7, s * 1.7)), pat = fbm(vec2(p.x * 0.21, s * 0.07));
  vec2 q = vec2(p.x, s);
  float dist = length(p - cameraPosition);
  // ── 柏油：骨材石子（近處才有，遠了會閃）、斑駁、補丁、裂縫、接縫、輪跡 ──
  // 顆粒：每層依「一個像素蓋住多少路面」淡出（近處看得到細粒、遠處不閃），沿路方向的透視壓縮自動處理
  vec2 fw = fwidth(q);
  #define FADE(fx, fy) (1. - smoothstep(0.8, 1.8, max(fw.x * (fx), fw.y * (fy))))
  float f1 = FADE(40., 18.), f2 = FADE(110., 40.), f3 = FADE(16., 8.), f4 = FADE(26., 6.);
  float agg = vn(q * vec2(40., 18.)), agg2 = vn(q * vec2(110., 40.) + 7.3), fine = vn(q * vec2(16., 8.) + 1.7), grit = vn(q * vec2(26., 6.) + 4.1);   // 橫向密、沿路疏：透視壓扁後看起來是圓的顆粒
  float aggF = f1, midF = f4;
  float stone = smoothstep(0.72, 0.88, agg) * f1;                            // 露出的淺色石子
  float pit = smoothstep(0.3, 0.1, agg2) * f2;                               // 孔隙
  float mott = fbm(q * vec2(2.2, 1.4));                                      // 深淺斑：縮小、對比降低
  float cell = floor(s / 23.), sl = s - cell * 23.;                          // 修補過的方塊（新柏油，比較黑）
  float hc = h11(cell * 3.17 + 0.7);
  float pcx = mix(-1.2, 4.6, h11(cell * 5.3 + 2.1)), pw = 1.0 + 1.8 * h11(cell * 1.9), pl = 2.5 + 6. * hc;
  float patchM = step(0.5, hc) * (1. - smoothstep(pw * 0.5 - 0.03, pw * 0.5, abs(p.x - pcx))) * (1. - smoothstep(pl * 0.5 - 0.03, pl * 0.5, abs(sl - 11.5)));
  float cv = fbm(q * vec2(0.9, 0.3) + 11.);                                  // 蜿蜒的細裂縫，只出現在部分路段
  float crack = (1. - smoothstep(0.004, 0.014, abs(cv - 0.5))) * smoothstep(0.55, 0.7, vn(q * vec2(0.4, 0.06) + 3.)) * (1. - patchM);
  float seam = 1. - smoothstep(0.05, 0.09, abs(p.x - 2.02));               // 中線旁的施工接縫（灌了瀝青膠）
  float lc = p.x < 1.8 ? 0.0 : 3.59;                                         // 兩條車道中心；每道兩條輪跡
  float track = exp(-pow((abs(p.x - lc) - 0.82) / 0.32, 2.));
  vec3 alb = vec3(0.03, 0.032, 0.035) * (0.78 + 0.4 * mott) * (0.88 + 0.24 * grain);   // 舊柏油：偏冷的深灰
  alb *= (1. + (agg2 - 0.5) * 0.9 * f2) * (1. + (agg - 0.5) * 0.8 * f1) * (1. + (fine - 0.5) * 0.7 * f3) * (1. + (grit - 0.5) * 0.6 * f4);
  alb *= 1. - 0.45 * pit;
  alb += vec3(0.018, 0.019, 0.02) * stone;
  alb *= mix(1., 0.86, patchM);
  alb *= 1. - 0.25 * max(crack, seam * 0.8);
  alb *= 1. - 0.18 * track;
  alb = min(alb, vec3(0.03, 0.032, 0.035) * 1.55);                           // 最亮的顆粒也只到淺灰，不能發白                                                  // 輪跡被磨得比較黑、比較平
  float lineW = 0.075;
  float dash = step(abs(p.x - 1.8), lineW) * step(fract(s / 12.), 0.34);
  float edge = step(abs(p.x + 1.8), lineW) + step(abs(p.x - 5.38), lineW);
  float mark = clamp(dash + edge, 0., 1.);
  alb = mix(alb, vec3(0.3, 0.29, 0.27) * (0.75 + 0.25 * agg) * (1. - 0.3 * pit), mark * 0.85 * (1. - 0.35 * smoothstep(0.55, 0.8, mott)));   // 標線也磨損
  // 濕：大部分只是濕柏油（倒影糊成一條條），零星小水窪才比較像鏡面
  float puddle = max(smoothstep(0.64, 0.76, pat), track * smoothstep(0.45, 0.62, pat) * 0.8);   // 水積在輪跡裡
  puddle *= 1. - 0.6 * stone;
  // 隧道裡有頂，路面是乾的：只有靠近洞口那幾十公尺被雨飄進來、被車輪帶進來，還是濕的（輪跡最晚乾）
  float portalD = inside ? min(s - uSIn, uSOut - s) : 0.;
  float wetIn = inside ? exp(-portalD / 35.) : 1.;
  float tyre = inside ? track * exp(-portalD / 90.) * 0.5 : 0.;
  puddle *= wetIn * wetIn;
  float rough = mix(0.5, 0.2, puddle) * (1. - 0.3 * mark) + 0.25 * (patchM + crack) + 0.35 * (1. - wetIn);
  vec3 v = normalize(p - cameraPosition);
  // 雨打在水面上的細碎漣漪：法線抖一點
  vec2 rip = vec2(vn(vec2(p.x * 3., s * 2.) + uTime * 2.), vn(vec2(s * 2., p.x * 3.) - uTime * 2.)) - 0.5;
  vec2 bump = ((vec2(agg, agg2) - 0.5) * 0.15 * f1 + (vec2(grit, fine) - 0.5) * 0.08 * f4) * (1. - puddle);        // 石子把水膜頂得凹凸，倒影碎掉
  vec3 n = normalize(vec3(rip.x * 0.01 * uRainK + bump.x, 1., rip.y * 0.01 * uRainK + bump.y));
  vec3 r = reflect(v, n);
  float fres = 0.04 + 0.96 * pow(1. - max(-v.y, 0.), 5.);
  // 中距離也看得到的粗糙：柏油表面高低不平，水膜時有時無，倒影碎成一點一點的條紋（沿路方向拉長，透視壓扁後才像顆粒）
  float farK = 1. - smoothstep(18., 70., dist);
  float br = vn(q * vec2(5.5, 1.6)) * 0.55 + vn(q * vec2(17., 4.2) + 2.3) * 0.45 * farK + (0.5 - 0.5 * farK) * 0.45;
  float breakK = smoothstep(0.3, 0.72, br);
  float wet = mix(0.3, 0.75, puddle) * (1. - 0.5 * stone) * (1. - 0.3 * crack);
  wet *= mix(mix(0.15, 1.2, breakK), 1., puddle);
  wet *= max(max(wetIn, tyre), 0.1);                                         // 乾柏油只剩斜看時一點點反光
  vec3 col = vec3(0.), refl = vec3(0.);
  if (inside) {
    col += alb * uLampCol * 9. * rowSpot(p, n, LA.xy, LA.z, LA.w, 0.12, normalize(vec3(0.5, -0.87, 0.)));   // 燈罩朝路面打：路面受光比牆強
    col += alb * uLampCol * 9. * rowSpot(p, n, LB.xy, LB.z, LB.w, 0.12, normalize(vec3(-0.5, -0.87, 0.)));
    col += alb * uLampCol * 0.008 * uLampK;
    refl += uLampCol * 2.6 * reflRow(p, r, LA.xy, LA.z, LA.w, 0.8, rough, true);
    refl += uLampCol * 2.6 * reflRow(p, r, LB.xy, LB.z, LB.w, 0.8, rough, true);
    // 隧道內左右護欄上的反光片（隧道燈照亮）
    refl += uLampCol * 1.2 * reflRow(p, r, vec2(${(T.curbR + 0.05).toFixed(2)}, 0.6), 4., 2., 0.06, rough, true);
    // 出口的白光倒影
    float zE = uOff - uSOut;
    if (r.z < -1e-3) { float t = (zE - p.z) / r.z; vec3 h = p + r * t;
      float d = length((h.xy - C_ARCH.xy) / vec2(1., 1.)) / C_ARCH.z;
      float inPortal = (1. - smoothstep(0.75, 1.05 + rough * 0.8, d)) * step(0., h.y + rough * t * 0.4);
      refl += uExitCol * 0.45 * inPortal * exp(-(uSOut - s) / 260.); }
    refl += uHaze * 0.35;
  } else {
    vec3 c2 = vec3(0.75, 0.85, 1.0);
    col += alb * c2 * 3.0 * (rowLight(p, n, vec2(PL.x, PL.z), PL.w, 0., 0.02, false) + rowLight(p, n, vec2(PL.y, PL.z), PL.w, 16., 0.02, false));
    refl += c2 * 2.5 * (reflRow(p, r, vec2(PL.x, PL.z), PL.w, 0., 0.35, rough, false) + reflRow(p, r, vec2(PL.y, PL.z), PL.w, 16., 0.35, rough, false));
    col += alb * mix(vec3(0.02, 0.025, 0.04), vec3(0.35, 0.38, 0.42), uDay);
    refl += mix(vec3(0.05, 0.07, 0.12), vec3(0.5, 0.53, 0.58), uDay) * smoothstep(-0.05, 0.2, r.y);   // 天空
  }
  // 自己的車頭燈：車前路面一片柔和的亮區（近處窄、越遠越寬越淡，沒有清楚的邊）
  float dz = -p.z;
  float hw = 0.9 + 0.075 * dz;
  float head = exp(-pow(p.x / hw, 2.) * 1.6) * smoothstep(2.5, 10., dz) * exp(-dz / 16.) * (1. - smoothstep(35., 55., dz)) * uHead;
  vec3 headCol = vec3(1.0, 0.97, 0.9);
  col += alb * headCol * 9. * head;
  refl += headCol * 0.5 * head;
  col += refl * fres * wet * (1. - 0.6 * mark) * uReflK;
  vec3 haze = inside ? uHaze * (0.25 + 0.75 * uLampK) : mix(uOutHaze, vec3(0.42, 0.45, 0.5), uDay);
  col = mix(col, haze, 1. - exp(-dist * (inside ? 0.009 : 0.006)));
  gl_FragColor = vec4(col, 1.);
}`;

// ── 週期擺放的發光物：用 InstancedBufferGeometry，第 k 個實例在 s = (floor((uOff−ph)/P) − 2 + k)·P + ph ──
const LAMP_VS = /* glsl */`
attribute float aK; uniform vec4 uRow; uniform float uTunnel; // uRow = (P, ph, 實例偏移, 0)
varying float vOn; varying vec3 vP; varying vec3 vN;
void main(){
  float si = (floor((uOff - uRow.y) / uRow.x) - uRow.z + aK) * uRow.x + uRow.y;
  bool ok = inTun(si) == (uTunnel > 0.5);
  vOn = ok ? (uTunnel > 0.5 ? lampOn(si) : 1.) : 0.;
  vec3 p = position; p.z += uOff - si;
  vP = p; vN = normal;
  gl_Position = ok ? projectionMatrix * viewMatrix * vec4(bendP(p), 1.) : vec4(0., 0., -2., 1.);
}`;
const LAMP_FS = /* glsl */`
uniform vec3 uEmit; uniform vec3 uBody; varying float vOn; varying vec3 vP; varying vec3 vN;
void main(){
  if (vOn <= 0.001 && uBody == vec3(0.)) discard;
  // 燈罩：正面發光、側面是暗色外殼
  float face = smoothstep(0.3, 0.8, abs(dot(normalize(vN), normalize(cameraPosition - vP))));
  vec3 col = mix(uBody, uEmit * vOn, uBody == vec3(0.) ? 1. : step(0.5, face));
  float dist = length(vP - cameraPosition);
  gl_FragColor = vec4(col * exp(-dist * 0.004), 1.);
}`;

function periodic(geo, count) {
  const g = new THREE.InstancedBufferGeometry().copy(geo);
  g.instanceCount = count;
  g.setAttribute('aK', new THREE.InstancedBufferAttribute(new Float32Array(Array.from({ length: count }, (_, i) => i)), 1));
  return g;
}

export function buildWorld(scene, U) {
  const mk = (fs, vs = BEND_VS, extra = {}) => new THREE.ShaderMaterial({ uniforms: { ...U, ...extra }, vertexShader: COMMON + vs, fragmentShader: COMMON + fs, side: THREE.DoubleSide });
  const add = (geo, mat, order = 0) => { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = order; scene.add(m); return m; };

  add(tunnelGeometry(), mk(SHELL_FS));
  add(railGeometry(), mk(SHELL_FS));
  add(roadGeometry(), mk(ROAD_FS));

  const lampRow = (geo, row, count, emit, body, tunnel) => add(periodic(geo, count), mk(LAMP_FS, LAMP_VS, {
    uRow: { value: new THREE.Vector4(row.P, row.ph, 2, 0) }, uTunnel: { value: tunnel ? 1 : 0 },
    uEmit: { value: emit }, uBody: { value: body },
  }));
  // 頂燈：左右對稱兩排。每盞＝發光面板＋暗色燈殼＋前後兩支吊架（從拱圈往下吊 LAMP_DROP）
  const emitL = new THREE.Color(0.85, 1.0, 1.0).multiplyScalar(4.);
  const bodyC = new THREE.Color(0.018, 0.015, 0.012);
  for (const [ang, row] of [[LAMP_ANG, LAMP_A], [Math.PI - LAMP_ANG, LAMP_B]]) {
    const tilt = ang - Math.PI / 2, ux = -Math.cos(ang), uy = -Math.sin(ang);      // (ux, uy)：從拱圈往隧道中心的方向
    const face = new THREE.BoxGeometry(0.42, 0.04, 1.7); face.rotateZ(tilt); face.translate(row.x + ux * 0.04, row.y + uy * 0.04, 0);
    lampRow(face, row, 150, emitL, new THREE.Color(0, 0, 0), true);
    const shell = new THREE.BoxGeometry(0.52, 0.12, 1.9); shell.rotateZ(tilt); shell.translate(row.x - ux * 0.04, row.y - uy * 0.04, 0);
    const arms = [-0.7, 0.7].map((z) => {
      const g = new THREE.BoxGeometry(0.05, LAMP_DROP, 0.05); g.rotateZ(tilt); g.translate(row.x - ux * LAMP_DROP * 0.5, row.y - uy * LAMP_DROP * 0.5, z); return g;
    });
    lampRow(mergeGeometries([shell, ...arms]), row, 150, bodyC, bodyC, true);
  }
  // 反光片（右側護欄）
  const gr = new THREE.BoxGeometry(0.03, 0.07, 0.14); gr.translate(T.curbR + 0.05, 0.6, 0);
  lampRow(gr, { P: 4, ph: 2 }, 220, new THREE.Color(1.0, 0.5, 0.15).multiplyScalar(2.2), new THREE.Color(0, 0, 0), true);
  const gl = new THREE.BoxGeometry(0.03, 0.07, 0.14); gl.translate(T.curbL - 0.05, 0.6, 0);
  lampRow(gl, { P: 4, ph: 0 }, 220, new THREE.Color(1.0, 0.5, 0.15).multiplyScalar(1.6), new THREE.Color(0, 0, 0), true);
  // 露天路燈：桿子＋燈頭
  for (const [x, ph, dir] of [[POLE.xl, 0, 1], [POLE.xr, 16, -1]]) {
    const head = new THREE.BoxGeometry(0.7, 0.12, 0.3); head.translate(x + dir * 1.1, POLE.y, 0);
    lampRow(head, { P: POLE.P, ph }, 50, new THREE.Color(0.75, 0.85, 1.0).multiplyScalar(10), new THREE.Color(0, 0, 0), false);
    const pole = new THREE.CylinderGeometry(0.09, 0.12, POLE.y, 6); pole.translate(x, POLE.y / 2, 0);
    const arm = new THREE.BoxGeometry(1.4, 0.08, 0.08); arm.translate(x + dir * 0.6, POLE.y + 0.02, 0);
    const merged = mergeTwo(pole, arm);
    lampRow(merged, { P: POLE.P, ph }, 50, new THREE.Color(0, 0, 0), new THREE.Color(0.012, 0.014, 0.02), false);
  }
  buildPortal(scene, U, mk);
  buildCity(scene, U);
  buildSky(scene, U);
}

function mergeTwo(a, b) {
  const g = new THREE.BufferGeometry(), A = a.toNonIndexed(), B = b.toNonIndexed();
  for (const k of ['position', 'normal']) {
    const x = A.getAttribute(k).array, y = B.getAttribute(k).array, out = new Float32Array(x.length + y.length);
    out.set(x); out.set(y, x.length); g.setAttribute(k, new THREE.BufferAttribute(out, 3));
  }
  return g;
}

// ── 下一條隧道的洞口：一面山壁＋混凝土門框，中間挖出斷面的洞 ──
function buildPortal(scene, U, mk) {
  const sh = new THREE.Shape();
  // 山的稜線：中間（洞口上方）高、往兩邊緩緩降下，加幾個起伏
  sh.moveTo(-90, -12); sh.lineTo(94, -12);
  for (let i = 0; i <= 60; i++) {
    const x = 94 - i * 184 / 60, k = Math.abs(x - T.xc) / 92;
    sh.lineTo(x, 9 + 22 * (1 - k * k) + 3.5 * Math.sin(x * 0.11) + 2 * Math.sin(x * 0.29 + 1.3));
  }
  sh.closePath();
  const hole = new THREE.Path();
  hole.moveTo(T.wl, -0.5); hole.lineTo(T.wr, -0.5);
  for (let i = 0; i <= 40; i++) { const a = Math.PI * i / 40; hole.lineTo(T.xc + T.r * Math.cos(a), T.yc + T.r * Math.sin(a)); }
  hole.closePath(); sh.holes.push(hole);
  const g = new THREE.ShapeGeometry(sh, 24);
  const vs = /* glsl */`
    varying vec3 vP;
    void main(){ vec3 p = position; p.z = uOff - uSIn; vP = p;
      gl_Position = projectionMatrix * viewMatrix * vec4(bendP(p), 1.); }`;
  const fs = /* glsl */`
    varying vec3 vP;
    void main(){
      vec2 d = vP.xy - C_ARCH.xy; float ring = length(vec2(d.x * 0.82, max(d.y, 0.))) - C_ARCH.z;
      float frame = 1. - smoothstep(1.2, 1.5, ring);
      float hill = fbm(vP.xy * 0.08) * 0.8 + 0.4;
      vec3 alb = mix(vec3(0.03, 0.04, 0.03) * hill, vec3(0.3, 0.29, 0.27), frame);
      vec3 col = alb * mix(vec3(0.05, 0.06, 0.09), vec3(0.4, 0.42, 0.45), uDay);
      col += alb * vec3(0.75, 0.85, 1.) * 1.2 * frame;                     // 路燈打在門框上
      float dist = length(vP - cameraPosition);
      col = mix(col, mix(uOutHaze, vec3(0.42, 0.45, 0.5), uDay), 1. - exp(-dist * 0.006));
      gl_FragColor = vec4(col, 1.);
    }`;
  const m = new THREE.Mesh(g, mk(fs, vs)); m.frustumCulled = false; scene.add(m);
}

// ── 城市：遠處一排排大樓（窗戶亮燈），用 s 的大週期循環 ──
function buildCity(scene, U) {
  const N = 900, W = 3000, rnd = mulberry(7);
  const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
  const g = new THREE.InstancedBufferGeometry().copy(box); g.instanceCount = N;
  const a = new Float32Array(N * 4), b = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    const side = rnd() < 0.5 ? -1 : 1, far = 60 + Math.pow(rnd(), 0.7) * 900;
    const h = 12 + Math.pow(rnd(), 2.2) * (far > 300 ? 180 : 70);
    a.set([rnd() * W, side * far + 1.8, 14 + rnd() * 30, h], i * 4);
    b.set([14 + rnd() * 30, rnd(), rnd() < 0.15 ? 1 : 0, 0], i * 4);
  }
  g.setAttribute('aA', new THREE.InstancedBufferAttribute(a, 4));
  g.setAttribute('aB', new THREE.InstancedBufferAttribute(b, 4));
  const vs = /* glsl */`
    attribute vec4 aA, aB; varying vec3 vP; varying vec3 vL; varying vec3 vN; varying vec2 vSeed;
    void main(){
      vec3 sz = vec3(aA.z, aA.w + 15., aB.x);
      vec3 p = position * sz;
      vL = p; vN = normal; vSeed = vec2(aB.y, aB.z);
      float z = -(mod(aA.x - uOff * 0.98 + 400., ${W}.) - 400.);
      p += vec3(aA.y, -15., z);
      vP = p;
      gl_Position = projectionMatrix * viewMatrix * vec4(bendP(p), 1.);
    }`;
  const fs = /* glsl */`
    varying vec3 vP; varying vec3 vL; varying vec3 vN; varying vec2 vSeed;
    void main(){
      // 窗格：3.2 m 一層、2.4 m 一格；亮燈的比例隨機，夜裡亮、白天暗
      vec2 w = abs(vN.x) > 0.5 ? vec2(vL.z, vL.y) : vec2(vL.x, vL.y);
      vec2 cell = floor(w / vec2(2.4, 3.2)), f = fract(w / vec2(2.4, 3.2));
      float win = step(0.18, f.x) * step(f.x, 0.82) * step(0.25, f.y) * step(f.y, 0.75);
      float lit = step(0.62 - 0.2 * vSeed.y, h21(cell + vSeed.x * 91.7));
      vec3 wc = mix(vec3(1.0, 0.72, 0.42), vec3(0.65, 0.8, 1.0), step(0.5, h21(cell * 1.7 + 3.)));
      vec3 col = vec3(0.012, 0.014, 0.022) + wc * win * lit * 2.2 * (1. - uDay);
      col = mix(col, vec3(0.2, 0.21, 0.23) * (0.8 + 0.3 * win), uDay);
      if (vN.y > 0.5) col = vec3(0.01, 0.012, 0.02) + vec3(1., 0.2, 0.1) * 3. * step(0.92, h21(vSeed * 13.)) * (1. - uDay) * step(length(fract(vL.xz / 6.) - 0.5), 0.1);
      float dist = length(vP - cameraPosition);
      col = mix(col, mix(uOutHaze * 1.6, vec3(0.5, 0.52, 0.56), uDay), 1. - exp(-dist * 0.0022));
      gl_FragColor = vec4(col, 1.);
    }`;
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: U, vertexShader: COMMON + vs, fragmentShader: COMMON + fs }));
  m.frustumCulled = false; scene.add(m);
}

function buildSky(scene, U) {
  const g = new THREE.SphereGeometry(4000, 32, 16);
  const vs = /* glsl */`varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.); }`;
  const fs = /* glsl */`
    varying vec3 vD;
    void main(){
      vec3 d = normalize(vD); float y = d.y;
      // 夜：藍黑天空＋地平線的城市光害；白天：雨天的灰藍
      vec3 night = mix(vec3(0.09, 0.12, 0.22), vec3(0.008, 0.012, 0.03), smoothstep(0.0, 0.35, y));
      night += vec3(0.25, 0.2, 0.22) * exp(-max(y, 0.) * 18.);
      float cl = fbm(d.xz / max(y, 0.05) * 1.5 + uTime * 0.01);
      night += vec3(0.05, 0.05, 0.08) * cl * smoothstep(0.0, 0.3, y);
      vec3 day = mix(vec3(0.62, 0.65, 0.7), vec3(0.38, 0.42, 0.5), smoothstep(0., 0.5, y)) * (0.85 + 0.2 * cl);
      // 地平線以下：高架橋底下的城市地面（暗），靠近地平線帶一點光害
      float below = smoothstep(0.005, -0.03, y);
      vec3 gN = vec3(0.006, 0.008, 0.016) + vec3(0.12, 0.1, 0.12) * exp(-max(-y, 0.) * 40.);
      vec3 gD = vec3(0.22, 0.23, 0.25);
      gl_FragColor = vec4(mix(mix(night, day, uDay), mix(gN, gD, uDay), below), 1.);
    }`;
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: U, vertexShader: COMMON + vs, fragmentShader: COMMON + fs, side: THREE.BackSide, depthWrite: false }));
  m.frustumCulled = false; m.renderOrder = -10; scene.add(m);
}

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
