// 底圖合成：三張 Codex 底圖（白天／陰天／夜晚）依日夜與雲量混合，疊上鏡中倒影（模糊過的 3D 小畫面）、裁判燈、燈泡、白板字
// 遮罩 textures/mask-a.png（RGB：R 窗 G 鏡面 B 地上光斑）、mask-b.png（R 燈泡 G 整個地板）；座標來自 docs/健力健身房2/01-拆景/*.json
import * as THREE from '../vendor/three.module.min.js';

export const W0 = 1672, H0 = 941;
export const LAMPS = [[123, 338, 19], [177, 347, 18], [231, 355, 18]];          // 紅、黃、白（圓心 x, y, 半徑）
// 燈泡圓心、半徑（01-拆景/bulbs.json）、夜晚底圖裡有沒有亮（量過：有三顆在夜晚版是暗的，不給光暈）
const BULBS = [[49, 140, 12, 1], [474, 379, 8, 0], [595, 366, 10, 1], [1061, 347, 6, 1], [1194, 343, 11, 0], [1238, 343, 7, 1], [1258, 369, 9, 1], [1371, 341, 11, 1], [1470, 309, 12, 1], [865, 466, 5, 1], [909, 475, 6, 0], [1003, 508, 6, 1], [1250, 517, 7, 1]];
const BOARD = [[1521, 166], [1671, 142], [1671, 455], [1537, 465]];             // 白板可寫字範圍四角（左上、右上、右下、左下；右緣被畫面切掉）

/** 四角透視：回傳把底圖像素 (x, y, 1) 映到白板 uv 的 Matrix3 */
function boardHomography(q) {
  // 先解 uv(0..1) → 像素 的 H，再取反矩陣
  const src = [[0, 0], [1, 0], [1, 1], [0, 1]], A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = src[i], [x, y] = q[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
  }
  for (let c = 0; c < 8; c++) {           // 高斯消去
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < 8; r++) if (r !== c) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const h = b.map((v, i) => v / A[i][i]);
  return new THREE.Matrix3().set(h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1).invert();
}

const FRAG = /* glsl */`
uniform sampler2D tDay, tShade, tNight, tMask, tMaskB, tInk, tMirror, tBeam;
uniform mat3 uWB;
uniform vec2 uCover;
uniform float uDay, uSun, uHouse, uBulb, uMirror, uMirrorExp, uMirrorHaze, uTime, uBeam;
uniform vec2 uFloorShift;   // 地上光斑隨太陽挪動（底圖像素，畫面下緣的位移；越遠越小）
uniform vec3 uJudge;
varying vec2 vUv;
const vec2 S = vec2(${W0}.0, ${H0}.0);
const vec3 LAMP = vec3(1.0, 0.93, 0.80);
const vec4 BULB[${BULBS.length}] = vec4[](${BULBS.map(([x, y, r, on]) => `vec4(${x}.0, ${y}.0, ${r}.0, ${on}.0)`).join(', ')});
void main() {
  vec2 uv = 0.5 + (vUv - 0.5) * uCover;
  vec2 px = vec2(uv.x, 1.0 - uv.y) * S;
  vec3 m = texture2D(tMask, uv).rgb;
  vec2 mb = texture2D(tMaskB, uv).rg;
  float bulb = mb.x, floorM = mb.y;   // floorM：整個地板
  vec3 shade = texture2D(tShade, uv).rgb;
  vec3 day = mix(shade, texture2D(tDay, uv).rgb, uSun);
  // 地板：陽光（白天減陰天的差）整片沿地面挪動，光斑跟著太陽走；挪到地板外（長凳、器材）的光不要
  if (floorM > 0.0) {
    float persp = clamp((px.y - 650.0) / 291.0, 0.0, 1.0);
    vec2 su = uv - vec2(uFloorShift.x, -uFloorShift.y) * persp / S;
    float inFloor = floorM * texture2D(tMaskB, su).g;
    vec3 sunlit = max(texture2D(tDay, su).rgb - texture2D(tShade, su).rgb, 0.0);
    day = mix(day, shade + sunlit * uSun, inFloor);
  }
  vec3 c = mix(texture2D(tNight, uv).rgb, day, uDay);

  // 鏡中倒影：小畫面是預乘 alpha、線性 HDR，壓一下高光再疊上（人是實的，不透出後面的窗）
  if (m.g > 0.0) {
    vec4 r = texture2D(tMirror, uv);
    vec3 rc = (1.0 - exp(-r.rgb / max(r.a, 1e-3) * uMirrorExp)) * r.a;
    // 倒影在房間深處：蒙一層鏡中背景的暖霧（取底圖鏡面的模糊色），人跟背景融在一起
    vec3 haze = texture2D(tDay, uv, 7.0).rgb * mix(0.35, 1.0, uDay) * 0.7;   // 很糊的平均色，不要映出窗格
    rc = mix(rc, haze * r.a, uMirrorHaze);
    float k = m.g * uMirror;
    c = c * (1.0 - r.a * k) + rc * k;   // 預乘：rc 已含 alpha
  }

  // 室內燈：不在時關一半（窗、燈泡自己亮的不受影響）
  float self = max(m.r * uDay, bulb);
  vec3 col = c * mix(uHouse, 1.0, self);
  col += c * bulb * (uBulb - 1.0);
  // 燈泡光暈（晚上明顯）：糊開的燈泡遮罩，像空氣裡有灰把光散開
  float glow = 0.0;
  for (int i = 0; i < ${BULBS.length}; i++) { vec4 b = BULB[i]; vec2 dd = (px - b.xy) / (b.z * 2.6); glow += exp(-dot(dd, dd)) * b.z / 10.0 * mix(b.w, 1.0, uDay); }
  col += vec3(1.0, 0.5, 0.15) * glow * (0.06 + 0.3 * (1.0 - uDay)) * uHouse;

  // 裁判燈：底圖畫的是紅黃白全亮 → 熄燈時退成暗灰玻璃；判決時白光
  for (int i = 0; i < 3; i++) {
    vec3 o = ${LAMPS.map(([x, y, r], i) => `i == ${i} ? vec3(${x}.0, ${y}.0, ${r}.0) :`).join(' ')} vec3(0.0);
    float s = clamp(uJudge[i], 0.0, 1.0);
    float d = length(px - o.xy);
    if (d > 60.0) continue;   // 只算燈附近（光暈約 40 px）
    float lens = smoothstep(o.z, o.z - 3.0, d), glass = smoothstep(o.z + 6.0, o.z - 2.0, d);
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    float l0 = dot(texture2D(tDay, vec2(o.x, ${H0}.0 - o.y) / S, 5.0).rgb, vec3(0.299, 0.587, 0.114));
    float lit = l / max(l0, 0.05);
    col = mix(col, vec3(l * 0.22) * vec3(1.0, 0.96, 0.92) * mix(1.0, uHouse, 0.5), glass);
    col = mix(col, LAMP * (0.5 + 0.9 * clamp(lit, 0.0, 1.6)) * 1.3, lens * s);
    col += LAMP * exp(-d * d / 900.0) * 0.22 * s;
  }
  // 光束：加在最上層（空氣裡的光，擋在牆、鏡子、器材前面）；陽光被雲遮就淡掉
  float beam = 0.0;   // 橫向糊開（9 點），光柱的邊是軟的
  for (int i = -3; i <= 3; i++) beam += texture2D(tBeam, uv + vec2(float(i) * 16.0 / S.x, 0.0)).r * (4.0 - abs(float(i)));
  beam /= 16.0;   // 橫向 ±48 px：光柱的邊要軟
  col += vec3(1.0, 0.45, 0.13) * beam * uBeam * uSun * uDay * (1.0 - 0.4 * min(col, vec3(1.0)));
  // 白板字（墨水乘上底色）
  vec3 wb = uWB * vec3(px, 1.0);
  vec2 buv = wb.xy / wb.z;
  if (buv.x > 0.0 && buv.x < 1.0 && buv.y > 0.0 && buv.y < 1.0) {
    vec4 ink = texture2D(tInk, vec2(buv.x, 1.0 - buv.y));
    col *= mix(vec3(1.0), ink.rgb * 0.9, ink.a);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

/**
 * 全螢幕底圖。先畫它，再疊 3D（吊扇）。
 * @returns {{ scene, cam, u, setAspect(a) }}
 */
export function makePlate({ day, shade, night, mask, maskB, ink, mirror }) {
  for (const t of [day, shade, night]) t.colorSpace = THREE.SRGBColorSpace;
  for (const t of [mask, maskB]) t.colorSpace = THREE.NoColorSpace;
  const u = {
    tDay: { value: day }, tShade: { value: shade }, tNight: { value: night }, tMask: { value: mask }, tMaskB: { value: maskB },
    tInk: { value: ink }, tMirror: { value: mirror }, tBeam: { value: null }, uBeam: { value: 1.4 }, uFloorShift: { value: new THREE.Vector2() },
    uWB: { value: boardHomography(BOARD) }, uCover: { value: new THREE.Vector2(1, 1) },
    uDay: { value: 1 }, uSun: { value: 1 }, uHouse: { value: 1 }, uBulb: { value: 1 }, uMirror: { value: 1 }, uMirrorExp: { value: 2 }, uMirrorHaze: { value: 0.18 }, uTime: { value: 0 },
    uJudge: { value: new THREE.Vector3() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: FRAG,
  });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  const setAspect = a => { const a0 = W0 / H0; u.uCover.value.set(a < a0 ? a / a0 : 1, a > a0 ? a0 / a : 1); };
  return { scene, cam: new THREE.Camera(), u, setAspect };
}

/** 把底圖像素 (x, y) 沿相機射線推到距離 depth（沿視線方向）的世界點 */
export function unproject(cam, x, y, depth) {
  const v = new THREE.Vector3(x / W0 * 2 - 1, 1 - y / H0 * 2, 0.5).unproject(cam).sub(cam.position).normalize();
  const fwd = cam.getWorldDirection(new THREE.Vector3());
  return cam.position.clone().addScaledVector(v, depth / v.dot(fwd));
}
