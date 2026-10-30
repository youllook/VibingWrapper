// 夜晚：月亮、星星（吊線紙卡）、燈室與窗戶亮燈。
// 這些都放在「發光層」glowScene：後製（壓暗偏藍）之後才疊上去，所以不會被夜色壓暗。
//
//   const night = await createNight({ loadImg, peng })
//   post.render(scene, camera, night.scene)
//   night.update(t, { night, lamp })   night：夜晚程度 0–1；lamp：燈塔亮燈程度（夜晚或暴風雨）
//
// 素材都是 1872×1053 補完畫布座標（原圖在 (100,56)），跟分層一樣投影回原位。
import * as THREE from '../vendor/three.module.min.js';
import { IMG_W, IMG_H, frameSize, stepTime, boil } from './paper.js';

const MID_D = 30, SKY_D = 58;
// 月亮、星星吊在天空空白處（避開燈塔、海鷗、右上 HUD）：[檔名, 畫布 x, y, 縮放]
const SKY = [
  ['moon', 560, 170, 0.55], ['star0', 250, 95, 0.8], ['star1', 400, 250, 0.6], ['star2', 770, 80, 0.7],
  ['star3', 860, 260, 0.5], ['star4', 1250, 95, 0.55],
];

const toWorld = (x, y, d) => {
  const { w, h } = frameSize(d);
  return new THREE.Vector3(((x - 100) / IMG_W - 0.5) * w, -((y - 56) / IMG_H - 0.5) * h, -d);
};
const texOf = img => { const t = new THREE.Texture(img); t.needsUpdate = true; t.colorSpace = THREE.NoColorSpace; return t; };

// 畫布上的一張貼圖（只取不透明範圍），放在深度 d
function canvasPlane(img, d, blending) {
  const W = img.width, H = img.height, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const a = g.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (a[(y * W + x) * 4 + 3] > 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, crop = document.createElement('canvas'); crop.width = cw; crop.height = ch;
  crop.getContext('2d').drawImage(c, x0, y0, cw, ch, 0, 0, cw, ch);
  const { w, h } = frameSize(d), px = w / IMG_W;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(cw * px, ch * px),
    new THREE.MeshBasicMaterial({ map: texOf(crop), transparent: true, depthTest: false, depthWrite: false, blending }));
  m.position.copy(toWorld(x0 + cw / 2, y0 + ch / 2, d));
  return m;
}

// 獨立紙卡（不在畫布座標）：中心放在畫布 (x,y)、深度 d，scale＝相對原尺寸
function card(img, x, y, d, scale = 1, blending = THREE.NormalBlending) {
  const px = frameSize(d).w / IMG_W * scale;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(img.width * px, img.height * px),
    new THREE.MeshBasicMaterial({ map: texOf(img), transparent: true, depthTest: false, depthWrite: false, blending }));
  m.position.copy(toWorld(x, y, d));
  return m;
}

function string(from, to) {
  const g = new THREE.BufferGeometry().setFromPoints([from, to]);
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xd8d0c0, transparent: true, depthTest: false }));
}

// 針孔星星（燈箱：天空背板戳小洞、背後透光）。放在主場景、天空底紙前面一點，用自訂混合把 render target 的 alpha 打成 0，
// 後製（paper.js uEmis）看到 alpha < 1 就跳過夜色；前面的雲、燈塔、海鷗畫上去會把 alpha 補回來，所以遮擋正確。
// 只戳在「藍色天空」上：抽樣 skyImg（有拆雲就是 sky.png，不然是 far.png）的藍色像素，再避開中景（燈塔、樹）的 alpha。
const PIN_VS = /* glsl */`
  attribute float aSize, aSeed;
  uniform float uScale, uTime;
  varying float vA;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    vA = 0.7 + 0.3 * hash(aSeed + floor(uTime * 6.0));   // 停格閃爍（每秒 6 格）
    gl_PointSize = aSize * uScale;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const PIN_FS = /* glsl */`
  uniform float uOn;
  varying float vA;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.25, r) * vA * uOn;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vec3(1.0, 0.97, 0.88) * a, a);   // 預乘：顏色 src + dst·(1−a)，alpha 0·src + dst·(1−a) → 打洞
  }`;
async function createPinholes(mainScene, { loadImg, paperLayers, n, seed = 3 }) {
  const sky = await loadImg('assets/clouds/sky.png').catch(() => loadImg('assets/layers-full/far.png')).catch(() => null);
  if (!sky) return null;
  const mid = await loadImg('assets/penguin/mid_fill.png').catch(() => loadImg('assets/layers-full/mid.png')).catch(() => null);
  const W = sky.width, H = sky.height;
  const px = img => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0); return g.getImageData(0, 0, W, H).data; };
  const S = px(sky), M = mid ? px(mid) : null;
  let s = seed * 7919;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const pts = [], sizes = [], seeds = [], pos = [];
  const horizon = 56 + 400;   // 畫布 y，水平線以上才戳
  for (let tries = 0; tries < n * 40 && pts.length < n; tries++) {
    const x = Math.floor(100 + rnd() * IMG_W), y = Math.floor(56 + rnd() * (horizon - 56));
    const i = (y * W + x) * 4;
    const r = S[i], g = S[i + 1], b = S[i + 2];
    if (!(b > 140 && b - r > 70 && r < 150 && g < 190)) continue;   // 藍色天空
    if (M && M[i + 3] > 8) continue;                                   // 中景（燈塔、樹）
    if (pts.some(p => Math.abs(p[0] - x) < 22 && Math.abs(p[1] - y) < 22)) continue;
    pts.push([x, y]);
  }
  const d = SKY_D + 1.6;   // 天空底紙 d60 前面一點（雲 d57 之後）
  for (const [x, y] of pts) { const v = toWorld(x, y, d); pos.push(v.x, v.y, v.z); sizes.push(2.2 + rnd() * 2.6); seeds.push(rnd() * 100); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 1 }, uTime: { value: 0 }, uOn: { value: 0 } },
    vertexShader: PIN_VS, fragmentShader: PIN_FS, transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const far = paperLayers.find(m => m.userData.d >= 60);
  points.renderOrder = (far ? far.renderOrder : -1) + 0.05;   // 天空底紙之後、其他所有紙片之前
  mainScene.add(points);
  return points;
}

// 打光池位置（目標圖 px）：燈室、小屋窗戶、月亮、地平線層縫
const LAMP_AT = [1260, 135, 230, 200], WINDOWS_AT = [1385, 372, 90, 60], MOON_AT = [460, 114, 190, 170], HORIZON_AT = [836, 432, 1500, 120];

export async function createNight({ loadImg, peng, post, mainScene, paperLayers, dir = 'assets/night', lights = 1, pinhole = 1 }) {
  const scene = new THREE.Scene();
  const load = f => loadImg(`${dir}/${f}`).catch(() => null);
  const fade = [];   // [mesh, 基礎不透明度, 跟誰（'night' | 'lamp'）]
  const pins = pinhole > 0 && mainScene ? await createPinholes(mainScene, { loadImg, paperLayers, n: Math.round(140 * pinhole) }) : null;

  // 天空：月亮、星星吊在線上，停格輕晃
  const sky = [];
  for (const [f, x, y, s] of SKY) {
    const img = await load(`${f}.png`);
    if (!img) continue;
    const m = card(img, x, y, SKY_D, s);
    const top = toWorld(x, 0, SKY_D), hang = toWorld(x, y - img.height * s / 2, SKY_D);
    const line = string(top, hang);
    const pivot = new THREE.Group(); pivot.position.copy(top);
    m.position.sub(top); line.position.sub(top);
    pivot.add(line, m); scene.add(pivot);
    sky.push({ pivot, seed: sky.length * 3.1, amp: 0.02 + 0.015 * (sky.length % 2) });
    fade.push([m, 1, 'night'], [line, 0.35, 'night']);
  }

  // 燈室、窗戶亮燈（相加）、燈室光暈
  const lit = {};
  for (const f of ['glow_lamp', 'lamp_lit', 'windows_lit']) {
    const img = await load(`${f}.png`);
    if (!img) continue;
    lit[f] = canvasPlane(img, MID_D, THREE.AdditiveBlending);
    scene.add(lit[f]);
    fade.push([lit[f], 1, f === 'windows_lit' ? 'night' : 'lamp']);
  }

  // 企鵝不戴頭燈（用戶 2026-10-30：夜裡一顆頭燈加光錐太突兀）
  for (const [m] of fade) m.renderOrder = Object.values(lit).includes(m) ? 1 : 0;

  const setLight = (i, at, color, strength) => post?.setLight(i, { x: at[0], y: at[1], rx: at[2], ry: at[3], color, strength: strength * lights });

  return {
    scene, pins,
    update(t, { night = 0, lamp: lampOn = night } = {}) {
      const ts = stepTime(t, 12);
      scene.visible = night > 0.01 || lampOn > 0.01;
      if (pins) { pins.material.uniforms.uOn.value = night; pins.material.uniforms.uTime.value = t; pins.material.uniforms.uScale.value = (post?.uniforms.uRes.value.y || IMG_H) / IMG_H; }
      // 燈室：停格的微微閃（燭火感），不轉
      const flick = 0.9 + 0.1 * boil(5, t, 6);
      // 打光池：燈室（夜晚或暴風雨）、窗戶、月亮、地平線層縫透光（夜晚）
      setLight(0, LAMP_AT, [1, 0.82, 0.5], 0.9 * lampOn * flick);
      setLight(1, WINDOWS_AT, [1, 0.8, 0.5], 0.5 * night);
      setLight(2, MOON_AT, [0.7, 0.85, 1], 0.45 * night);
      setLight(3, HORIZON_AT, [0.55, 0.8, 1], 0.4 * night);
      setLight(4, [0, 0, 1, 1], [1, 1, 1], 0);
      if (!scene.visible) return;
      for (const s of sky) s.pivot.rotation.z = s.amp * Math.sin(ts * 0.9 + s.seed);
      for (const [m, base, by] of fade) m.material.opacity = base * (by === 'lamp' ? lampOn * flick : night);
    },
  };
}
