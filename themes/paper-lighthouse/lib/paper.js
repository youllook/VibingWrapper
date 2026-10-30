// 紙片工具：把一張 RGBA 圖變成「有厚度的紙片」放進 three.js 場景，外加停格時鐘與後製（紙紋、日夜色調）。
//
//   createPaperLayer(img, { d, thick, side, blur })  一張圖 → 一片紙（擠出厚度由 shader 算，不建幾何）
//   createShadow(img, { d, ... })                    紙片落在後面那層的柔和陰影
//   stepTime(t, fps)  停格時間；boil(seed, t)        手作抖動（每格換一個小偏移）
//   createPost(renderer, { res })                    半解析度渲染 → 紙紋＋顆粒＋日夜色調 → 螢幕
//
// 座標約定：鏡頭在原點附近看 -z；一層放在離鏡頭 d 的平面，平面大小剛好讓「目標圖的範圍」填滿畫面
// （圖有出血就跟著放大），所以鏡頭不動時每層都投影回原位。
import * as THREE from '../vendor/three.module.min.js';

export const IMG_W = 1672, IMG_H = 941, ASPECT = IMG_W / IMG_H, FOV = 30;

// 離鏡頭 d 的平面上，目標圖範圍的世界寬高
export function frameSize(d) {
  const h = 2 * d * Math.tan(FOV * Math.PI / 360);
  return { w: h * ASPECT, h };
}

function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function texOf(src) {
  const t = new THREE.CanvasTexture(src);
  t.colorSpace = THREE.NoColorSpace;   // 全程用 sRGB 原值，不做色彩空間轉換（畫面要和目標圖逐像素一致）
  t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// 景深：每層只有一個深度，所以模糊直接烘在貼圖上（建圖時一次，之後零成本）
function blurred(img, px) {
  if (!px) return img;
  const c = canvasOf(img.width, img.height), g = c.getContext('2d');
  g.filter = `blur(${px}px)`; g.drawImage(img, 0, 0);
  return c;
}

function silhouette(img, color, blur = 0) {
  const c = canvasOf(img.width, img.height), g = c.getContext('2d');
  if (blur) g.filter = `blur(${blur}px)`;
  g.drawImage(img, 0, 0); g.filter = 'none';
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return c;
}

function planeFor(src, d) {
  const { w, h } = frameSize(d);
  return { w: w * src.width / IMG_W, h: h * src.height / IMG_H };
}

// 裁到不透明內容（四邊多留 pad），回傳裁好的 canvas 與「內容中心相對原圖中心」的世界位移。
// 分層圖多半是大片透明，不裁的話每層都是全螢幕平面，內顯光填色就吃掉一大半時間。
function trim(src, d, pad) {
  const W = src.width, H = src.height;
  const c0 = canvasOf(W, H), g0 = c0.getContext('2d', { willReadFrequently: true }); g0.drawImage(src, 0, 0);
  const a = g0.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (a[(y * W + x) * 4 + 3]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, c = canvasOf(cw, ch);
  c.getContext('2d').drawImage(c0, x0, y0, cw, ch, 0, 0, cw, ch);
  const full = planeFor(src, d);
  return { canvas: c, w: full.w * cw / W, h: full.h * ch / H,
    dx: ((x0 + cw / 2) / W - 0.5) * full.w, dy: -((y0 + ch / 2) / H - 0.5) * full.h };
}

// 紙片厚度：正面像素不透明的地方畫原圖；透明的地方往「遠離鏡頭軸」方向找背面，
// 找到就畫紙芯側面（越深越暗）。背面點 x_b = x + (x − cam)·t/d，t 從 0 到厚度。
const PAPER_VS = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const PAPER_FS = /* glsl */`
  uniform sampler2D map;
  uniform vec2 uSize;      // 平面世界寬高
  uniform vec2 uCam;       // 鏡頭在這層平面座標的位置
  uniform float uThick;    // 厚度 / 距離
  uniform vec3 uSide;      // 紙芯顏色
  uniform vec3 uTint;      // 日夜色調（乘）
  uniform float uBoil;     // 停格抖動：偏移 uv
  uniform vec2 uBoilDir;
  uniform float uSideLight; // 紙芯受光方向對比（0 關）
  varying vec2 vUv;
  const int N = 6;
  void main() {
    vec2 uv = vUv + uBoilDir * uBoil;
    vec4 c = texture2D(map, uv);
    vec2 p = (uv - 0.5) * uSize, rel = p - uCam;
    float sideA = 0.0, shade = 1.0;
    if (c.a < 0.99 && uThick > 0.0) {   // 沒厚度的層（天空、遠山遮擋）不用找紙芯
      for (int i = 1; i <= N; i++) {
        float k = uThick * float(i) / float(N);
        vec2 ub = (p + rel * k) / uSize + 0.5;
        float a = texture2D(map, ub).a;
        if (a > 0.5) { sideA = 1.0; shade = mix(0.97, 0.78, float(i) / float(N)); break; }
      }
      if (sideA > 0.0) {
        // 紙芯：面向光（左上，跟陰影方向一致）的側面亮一點、背光暗一點；再加一點纖維顆粒，不要像塑膠
        float facing = dot(normalize(rel + vec2(1e-4)), vec2(-0.6, 0.8));
        float fib = fract(sin(dot(floor(uv * uSize * 90.0), vec2(127.1, 311.7))) * 43758.5453);
        shade *= (1.0 + uSideLight * facing) * (0.95 + 0.1 * fib);
      }
    }
    vec3 rgb = mix(uSide * shade, c.rgb, c.a);
    float a = max(c.a, sideA);
    if (a < 0.003) discard;
    gl_FragColor = vec4(rgb * uTint, a);
  }`;

let order = 0;
export const PAPER_DEFAULTS = { sideLight: 0.12 };   // 紙芯受光對比（擺景頁 sidelight= 調）

export function createPaperLayer(img, { d, thick = 0.004, side = '#efe4cc', blur = 0 } = {}) {
  const t = trim(blurred(img, blur), d, 12), size = t;
  const map = texOf(t.canvas);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map },
      uSize: { value: new THREE.Vector2(size.w, size.h) },
      uCam: { value: new THREE.Vector2() },
      uThick: { value: thick },
      uSide: { value: new THREE.Color().setStyle(side, THREE.LinearSRGBColorSpace) },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uBoil: { value: 0 },
      uBoilDir: { value: new THREE.Vector2() },
      uSideLight: { value: PAPER_DEFAULTS.sideLight },
    },
    vertexShader: PAPER_VS, fragmentShader: PAPER_FS,
    transparent: true, depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size.w, size.h), mat);
  mesh.position.set(t.dx, t.dy, -d);
  mesh.renderOrder = order++;
  mesh.userData.d = d;
  return mesh;
}

// 陰影：剪影模糊、往光的反方向偏，放在紙片後面一點。SHADOW_DEFAULTS 讓擺景頁一次調所有層（含企鵝、海鷗模組）
export const SHADOW_DEFAULTS = { strength: 1, blur: 6, dir: [0.012, -0.016] };
export function createShadow(img, { d, gap = 0.6, strength = SHADOW_DEFAULTS.strength, blur = SHADOW_DEFAULTS.blur, dir = SHADOW_DEFAULTS.dir, color = '#1d2a3a' } = {}) {
  const t = trim(silhouette(img, color, blur), d + gap, 2 * blur);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(t.w, t.h),
    new THREE.MeshBasicMaterial({ map: texOf(t.canvas), transparent: true, opacity: 0.28 * strength, depthWrite: false }));
  mesh.position.set(t.dx + dir[0] * d, t.dy + dir[1] * d, -(d + gap));
  mesh.renderOrder = order++;
  return mesh;
}

// 每格更新：鏡頭位置換算到各層、日夜色調
export function updateLayers(layers, camera, tint) {
  for (const m of layers) {
    const u = m.material.uniforms;
    if (!u) continue;
    u.uCam.value.set(camera.position.x - m.position.x, camera.position.y - m.position.y);
    if (tint) u.uTint.value.copy(tint);
  }
}

// 停格：時間量化到每秒 fps 格
export const stepTime = (t, fps = 12) => Math.floor(t * fps) / fps;

// 手作抖動：同一格內固定，換格換一個 [-1,1] 的值
export function boil(seed, t, fps = 12) {
  const n = Math.floor(t * fps) * 127.1 + seed * 311.7;
  const s = Math.sin(n) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

// 後製：場景先畫到（較小的）render target，再全畫面一次加紙纖維、印刷顆粒、日夜色調
//
// 2026-10-30 紙卡感優化（04-紙卡感優化.md）：
//   打光池 uLightPos/uLightCol：模型攝影的「局部打光」——燈室、窗戶、頭燈、月亮、層縫透光各一盞，
//     在池子裡把夜色／陰天局部掀開、微微染暖；實體紙模型實拍的光是「塑形的地圖」，不是整片均勻壓暗。
//   vignette uVig：四角壓一點、中心偏向主角（企鵝、燈塔），建立亮暗層級。
//   發光遮罩：場景 render target 的 alpha 通道當「自發光」——針孔星星用自訂混合把 alpha 打成 0，
//     後製看到 alpha < 1 的地方就跳過夜色（燈箱：天空背板戳洞透光）。前面的紙卡畫上去會把 alpha 補回 1，遮擋自然正確。
const NL = 6;   // 打光池數量
const POST_FS = /* glsl */`
  uniform sampler2D tScene;
  uniform vec2 uRes;
  uniform float uFiber, uGrain, uNight, uGloom, uTime;
  uniform vec4 uLightPos[${NL}];   // 目標圖 px：x, y, 半徑 x, 半徑 y
  uniform vec4 uLightCol[${NL}];   // rgb 染色, 強度
  uniform vec3 uImg;               // 螢幕 px → 目標圖 px：scale, 偏移 x, y
  uniform float uVig, uEmis, uNightFiber;
  uniform vec2 uVigC;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + 1.0), f.x), f.y);
  }
  void main() {
    vec4 c = texture2D(tScene, vUv);
    vec2 px = vUv * uRes;
    // 打光池：每盞是橢圓，中心最亮、邊緣平滑歸零
    vec2 ipx = (vec2(px.x, uRes.y - px.y) - uImg.yz) * uImg.x;   // uv 原點在左下，目標圖 y 從上數
    float lit = 0.0; vec3 litCol = vec3(0.0);
    for (int i = 0; i < ${NL}; i++) {
      vec2 q = (ipx - uLightPos[i].xy) / uLightPos[i].zw;
      float f = max(0.0, 1.0 - dot(q, q)); f *= f;
      lit += uLightCol[i].a * f; litCol += uLightCol[i].rgb * uLightCol[i].a * f;
    }
    lit = min(lit, 1.0);
    // 纖維：拉長的低頻雜訊（兩個方向疊），固定不動
    float fib = noise(px * vec2(0.02, 0.18)) * 0.5 + noise(px * vec2(0.15, 0.025) + 17.0) * 0.5;
    // 顆粒：每 1/12 秒換一次，停格感
    float gr = hash(px + floor(uTime * 12.0) * 13.1) - 0.5;
    float fiber = uFiber * (1.0 + uNightFiber * uNight);   // 夜晚（燈箱背光）紙纖維更明顯
    vec3 rgb = c.rgb * (1.0 - fiber * 0.5 + fiber * fib) + gr * uGrain;
    vec3 day = rgb;
    // 陰天（思考、執行）：灰一點、暗一點、偏冷；燈光池裡掀開一部分
    float gloom = uGloom * (1.0 - 0.6 * lit);
    float lg = dot(rgb, vec3(0.299, 0.587, 0.114));
    rgb = mix(rgb, mix(vec3(lg), rgb, 0.45) * vec3(0.90, 0.95, 1.02), gloom * 0.8) * (1.0 - 0.28 * gloom);
    // 夜晚：壓暗、偏藍、降飽和；燈光池裡掀開，並往燈的顏色染
    float l = dot(rgb, vec3(0.299, 0.587, 0.114));
    vec3 night = mix(vec3(l), rgb, 0.55) * vec3(0.32, 0.40, 0.70);
    rgb = mix(rgb, night, uNight * (1.0 - 0.8 * lit));
    rgb += day * litCol * 0.22 * max(uNight, uGloom);
    // 自發光（alpha 被打掉的地方）：跳過夜色、陰天
    rgb = mix(rgb, day, (1.0 - c.a) * uEmis);
    // vignette：四角壓一點，中心偏向主角
    vec2 v = (vUv - uVigC) * vec2(1.0, 1.25);
    rgb *= 1.0 - uVig * smoothstep(0.35, 0.95, length(v));
    gl_FragColor = vec4(rgb, 1.0);
  }`;

export function createPost(renderer, { res = 1 } = {}) {   // 內顯 1920×1080：res 1 約 13 ms、0.75 約 12 ms
  const rt = new THREE.WebGLRenderTarget(1, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: { tScene: { value: rt.texture }, uRes: { value: new THREE.Vector2() },
      uFiber: { value: 0.06 }, uGrain: { value: 0.025 }, uNight: { value: 0 }, uGloom: { value: 0 }, uTime: { value: 0 },
      uLightPos: { value: Array.from({ length: NL }, () => new THREE.Vector4(0, 0, 1, 1)) },
      uLightCol: { value: Array.from({ length: NL }, () => new THREE.Vector4(1, 1, 1, 0)) },
      uImg: { value: new THREE.Vector3(1, 0, 0) },
      uVig: { value: 0 }, uNightFiber: { value: 0.8 }, uVigC: { value: new THREE.Vector2(0.6, 0.5) }, uEmis: { value: 1 } },
    vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: POST_FS, depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat), qScene = new THREE.Scene(), qCam = new THREE.Camera();
  qScene.add(quad);
  return {
    uniforms: mat.uniforms,
    setSize(w, h) {
      rt.setSize(Math.max(1, Math.round(w * res)), Math.max(1, Math.round(h * res))); mat.uniforms.uRes.value.set(w, h);
      // 畫面「蓋滿」目標圖範圍（跟 index.html 的 resize 一致）：算螢幕 px → 目標圖 px
      const cover = w / h >= ASPECT;
      const s = cover ? IMG_W / w : IMG_H / h;
      mat.uniforms.uImg.value.set(s, cover ? 0 : (w - IMG_W / s) / 2, cover ? (h - IMG_H / s) / 2 : 0);
    },
    // 打光池 i：中心 (x, y) 目標圖 px、半徑 rx／ry px、顏色（染色用）、強度 0–1（0＝關）
    setLight(i, { x, y, rx, ry = rx, color = [1, 0.9, 0.7], strength = 0 }) {
      mat.uniforms.uLightPos.value[i].set(x, y, rx, ry);
      mat.uniforms.uLightCol.value[i].set(color[0], color[1], color[2], strength);
    },
    // glow：後製之後才疊上去的發光層（夜晚燈光，不被夜色壓暗）
    render(scene, camera, glow) {
      renderer.setRenderTarget(rt); renderer.render(scene, camera);
      renderer.setRenderTarget(null); renderer.render(qScene, qCam);
      if (glow?.visible) { const ac = renderer.autoClear; renderer.autoClear = false; renderer.render(glow, camera); renderer.autoClear = ac; }
    },
  };
}
