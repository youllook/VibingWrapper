// 麥塊世界・末地（mc3）— 場景組裝。階段 3：灰模擺放；階段 4：貼圖、材質、環境光（?flat=1 看回灰模）。
// 對位工具：?ref=ref-mc3.png&a=0.5 疊目標圖；?layers=1 依景上色（對 01-分層標註.png）；?top=1 俯視結構圖；
// ?cam=x,y,z,tx,ty,tz,fov 臨時改鏡頭。
import * as THREE from './vendor/three.module.min.js';
import { countTris, mergeBySlot } from './lib/voxel.js';
import { applyMaterials, makeMaterials } from './lib/materials.js';
import { loadPP } from './lib/textures.js';
import { ATM, makeUniforms, patchMaterial, makeSky, makeHalos, makeMotes, syncUniforms } from './lib/atmosphere.js';
import { makeCreeper, setCreeperSkin } from './assets/creeper.js';
import { makeIsland, makeBridge, makeForeCliff } from './assets/terrain.js';
import { makeChorus, makePillar, scatter } from './assets/flora.js';
import { makeFarField, makeVoid } from './assets/far.js';
import { createStates } from './states.js';

const q = new URLSearchParams(location.search);
// ?tex=pp：方塊與苦力怕改用 Pixel Perfection CE 的圖案（CC BY-SA 4.0，textures/pp/），乘上本主題色票
const PP = q.get('tex') === 'pp' ? await loadPP() : null;
if (PP) setCreeperSkin(PP.creeper);

// ── 版面：照目標圖（1672×941）的畫面座標擺，反投影到各自的高度平面 ──────────────
// 目標圖是強迫透視（主角特大、橋上隊伍幾乎不縮），所以每件東西依目標像素大小各自縮放，不守單一比例。
const REF = [1672, 941];
const CAM = { h: 20, pitch: 10, fov: 45, shift: 0.85 };   // 機位高、俯角（度）、垂直視角、鏡頭下移（移軸：垂直線保持平行，像目標圖）
const LAYOUT = {
  hero: { px: [318, 838], top: 470, yaw: 0, headYaw: 0, headPitch: -15 },             // 腳底像素、頭頂像素 y
  cliffBlockPx: 110, heroLocal: [18.5, 19.5], cliffYaw: Math.PI / 2,  // 近景一格約 110 像素；平台轉 90° 讓兩面斷崖朝右、朝後；主角離右崖 2 格、後崖 3 格
  cliffY: 0,
  // 平台是斜的（目標圖格線約轉 45°）：照目標圖定「後右轉角」像素與「後緣往哪個像素延伸」，角度和位置由這兩點算
  cliffCorner: { px: [655, 665], toward: [0, 375], dy: 0 },
  // 平台頂面修形（局部格座標；局部 +x＝畫面深處、+z＝畫面右）：主角右側崖邊缺口、左後抬高一階、左前凹洞
  cliffEdits: [],
  nearChorus: [{ px: [150, 560], top: 300, h: 11, step: 0, seed: 5 }, { px: [95, 945], top: 800, h: 5, step: 0, seed: 9 }],
  // 橋：橋面高度（比平台低）、中線上下微調像素、寬（格）、底下垂墜強度、橋身加厚（格）；數值是對 Codex 扣圖掃 IoU 得來
  bridgeY: -3, bridgeDy: 0, bridgeW: 3, bridgeHang: 0, bridgeDepth: 1,
  bridge: [[420, 625], [470, 600], [560, 545], [660, 480], [760, 430], [830, 395], [880, 340], [960, 300], [1050, 290]],
  walkers: [[525, 585, 500], [603, 512, 435], [722, 455, 392], [826, 418, 358], [886, 338, 287], [977, 305, 255]],
  islandSmall: { px: [1150, 318], y: -3, halfW: 80 },
  islandBig: { px: [400, 260], y: -40, halfW: 330, pillars: 4 },
  islandsMid: [{ px: [820, 185], y: -90, halfW: 160, pillars: 3 }, { px: [90, 150], y: -90, halfW: 170, pillars: 2 }],   // 上方中央那座（Codex 判中景）
  islandsLower: [   // 中景下層：下方中央大塊、往右下變小變深（右下角 Codex 判遠景）
    { px: [860, 740], y: -110, halfW: 150 }, { px: [1090, 790], y: -110, halfW: 150 }, { px: [1200, 700], y: -120, halfW: 60 },
    { px: [960, 620], y: -130, halfW: 55 }, { px: [740, 900], y: -100, halfW: 80 }, { px: [1300, 870], y: -120, halfW: 60 },
    { px: [1450, 600], y: -170, halfW: 35 }, { px: [700, 690], y: -110, halfW: 70 }, { px: [1100, 600], y: -140, halfW: 60 },
    { px: [1560, 820], y: -220, halfW: 70, far: true }, { px: [1620, 700], y: -240, halfW: 45, far: true },
  ],
  far: { pos: [-220, -120, -950], area: 320, k: 2 },          // 遠景直接給世界座標：要整片落在大島後面
};
// ?tune={"bridgeDy":-20} 臨時覆寫 LAYOUT 頂層欄位（掃參數用）
if (q.get('tune')) Object.assign(LAYOUT, JSON.parse(q.get('tune')));
const LAYER_COLORS = { near: '#ff4646', midnear: '#ff8c28', mid: '#ffd73c', far: '#5aa0ff' };

// ── 渲染器 ────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
// 環境光（階段 4）：紫色天光當補光、暖金主光從右前上方打（目標圖朝右、朝鏡頭的面都是亮金色），紫色天光補側面
const ENV = { sky: '#e2c6f2', ground: '#7a5a98', amb: 1.4, sun: '#ffe2b0', sunI: 3.0, sunDir: [5, 4.5, 4], exposure: 1.25 };   // ?env={…} 臨時覆寫
if (q.get('env')) Object.assign(ENV, JSON.parse(q.get('env')));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = ENV.exposure;
const hemi = new THREE.HemisphereLight(ENV.sky, ENV.ground, ENV.amb);
scene.add(hemi);
const sun = new THREE.DirectionalLight(ENV.sun, ENV.sunI);
sun.position.set(...ENV.sunDir);
scene.add(sun);

const cam = new THREE.PerspectiveCamera(CAM.fov, innerWidth / innerHeight, 0.1, 5000);
function setCam(c, camera = cam) {
  camera.fov = c.fov; camera.position.set(0, c.h, 0); camera.rotation.set(-THREE.MathUtils.degToRad(c.pitch), 0, 0);
  camera.updateProjectionMatrix();
  camera.projectionMatrix.elements[9] = -c.shift;   // 畫面往下位移（NDC），不轉鏡頭
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  camera.updateMatrixWorld();
}
if (q.get('cam')) { const v = q.get('cam').split(',').map(Number); [CAM.h, CAM.pitch, CAM.fov, CAM.shift] = v; }
setCam(CAM);
// 擺位用的參考鏡頭（固定目標圖比例，視窗比例不同也不影響擺位）
const refCam = new THREE.PerspectiveCamera(CAM.fov, REF[0] / REF[1], 0.1, 5000);
setCam(CAM, refCam);
// 目標圖像素 (px, py) 的視線與 y=Y 平面的交點
function onPlane(px, py, Y) {
  const v = new THREE.Vector3(px / REF[0] * 2 - 1, 1 - py / REF[1] * 2, 0.5).unproject(refCam).sub(refCam.position).normalize();
  return refCam.position.clone().addScaledVector(v, (Y - refCam.position.y) / v.y);
}
// 在 p 處，一單位世界長度約等於多少目標圖像素
function pxPerUnit(p) {
  const d = p.clone().sub(refCam.position).dot(refCam.getWorldDirection(new THREE.Vector3()));
  return REF[1] / 2 / (d * Math.tan(THREE.MathUtils.degToRad(CAM.fov) / 2));
}

// ── 組場景 ────────────────────────────────────────────────────────────
const layers = { near: new THREE.Group(), midnear: new THREE.Group(), mid: new THREE.Group(), far: new THREE.Group() };
for (const g of Object.values(layers)) scene.add(g);
const at = (obj, p, yaw = 0, k = 1) => { obj.position.copy(p); obj.rotation.y = yaw; obj.scale.setScalar(k); return obj; };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function plant(island, seed, density) {
  const g = new THREE.Group();
  for (const s of scatter(island.userData.surface, { seed, density, minGap: 3 })) {
    const o = s.kind === 'pillar' ? makePillar({ seed: seed + s.x * 7 + s.z, height: s.height, width: 2 + (s.x & 1) }) : makeChorus({ seed: seed + s.x * 13 + s.z, height: Math.max(3, Math.round(s.height * 0.6)) });
    g.add(at(o, V(s.x, s.y, s.z)));
  }
  island.add(g);
  return island;
}
// 一座島：頂面中心落在目標像素、寬度照目標半寬（像素）縮放
function islandAt(spec, seed, opts, density) {
  const isl = makeIsland({ seed, ...opts });
  // 指定數量的黑曜石柱（目標圖的垂直節奏），挑離島緣較遠的頂面格
  const sf = isl.userData.surface.filter(([x, , z]) => Math.hypot(x, z) < isl.userData.radius * 0.6);
  for (let i = 0; i < (spec.pillars || 0); i++) {
    const [x, y, z] = sf[Math.floor((i + 0.5) / spec.pillars * sf.length * 0.97 + seed) % sf.length];
    isl.add(at(makePillar({ seed: seed + i, height: 14 + (seed * 7 + i * 13) % 10, width: 2 }), V(x, y, z)));
  }
  const p = onPlane(...spec.px, spec.y), k = spec.halfW / pxPerUnit(p) / isl.userData.radius;
  if (density) plant(isl, seed * 3, density);
  const merged = mergeBySlot(isl);   // 島＋柱＋植物合成每個材質一個 mesh（draw call 從幾十降到 4–5）
  merged.userData = isl.userData;
  return at(merged, p, seed, k);
}

// 近景：平台＋主角＋大株紫頌（平台和主角同一個縮放，方塊格對得上）
const H = LAYOUT.hero, heroP = onPlane(...H.px, LAYOUT.cliffY);
const heroK = (H.px[1] - H.top) / pxPerUnit(heroP) / 1.625;
const hero = at(makeCreeper({ seed: 1, pose: 'lookBack', headYaw: H.headYaw, headPitch: H.headPitch }), heroP, H.yaw, heroK);
layers.near.add(hero);
const cliff = makeForeCliff({ seed: 5, edits: LAYOUT.cliffEdits }), hs = [LAYOUT.heroLocal[0], 0, LAYOUT.heroLocal[1]];
const cliffK = LAYOUT.cliffBlockPx / pxPerUnit(heroP);

cliff.scale.setScalar(cliffK);
if (LAYOUT.cliffCorner) {
  // 後緣＝局部 x=22 那條邊，往局部 -z 延伸；局部 (0,0,-1) 轉 θ 後是 (-sinθ, 0, -cosθ)
  const C = LAYOUT.cliffCorner, cy = heroP.y + (C.dy || 0) * cliffK;
  const pc = onPlane(...C.px, cy), d = onPlane(...C.toward, cy).sub(pc).normalize();
  cliff.rotation.y = Math.atan2(-d.x, -d.z);
  cliff.position.copy(pc).sub(V(22, 0, 22).multiplyScalar(cliffK).applyAxisAngle(V(0, 1, 0), cliff.rotation.y));
} else {
  cliff.rotation.y = LAYOUT.cliffYaw;
  cliff.position.copy(heroP).sub(V(...hs).multiplyScalar(cliffK).applyAxisAngle(V(0, 1, 0), LAYOUT.cliffYaw));
}
layers.near.add(cliff);
// 近景紫頌：照目標圖的根部／頂端像素各自縮放（比平台方塊細）
for (const c of LAYOUT.nearChorus) {
  const p = onPlane(c.px[0], c.px[1], heroP.y + c.step * cliffK);
  layers.near.add(at(makeChorus({ seed: c.seed, height: c.h }), p, c.seed, (c.px[1] - c.top) / pxPerUnit(p) / (c.h + 1)));
}

// 中近景：橋（沿目標圖橋中線）＋6 隻（依目標像素高度縮放）＋小圓島
const walkK = LAYOUT.walkers.map(([x, y, top]) => { const p = onPlane(x, y, LAYOUT.bridgeY); return [p, (y - top) / pxPerUnit(p) / 1.625]; });
const bridgeK = walkK.reduce((s, w) => s + w[1], 0) / walkK.length;
const bp = LAYOUT.bridge.map(([x, y]) => onPlane(x, y + LAYOUT.bridgeDy, LAYOUT.bridgeY)), b0 = bp[0];
const bridge = makeBridge({ seed: 3, width: LAYOUT.bridgeW, gap: 1, hang: LAYOUT.bridgeHang, depth: LAYOUT.bridgeDepth, points: bp.map(p => [(p.x - b0.x) / bridgeK, (p.z - b0.z) / bridgeK]) });
layers.midnear.add(at(bridge, b0, 0, bridgeK));
const walkers = [];
walkK.forEach(([p, k], i) => {
  const n = bp[Math.min(bp.length - 1, i + 2)];
  const w = at(makeCreeper({ seed: 20 + i, pose: 'walk' }), p, Math.atan2(n.x - p.x, n.z - p.z), k);
  walkers.push(w); layers.midnear.add(w);
});
layers.mid.add(islandAt(LAYOUT.islandSmall, 4, { radius: 5, terraces: 2, depth: 14 }));

// 中景：大島＋下層島群（含植物）
layers.mid.add(islandAt(LAYOUT.islandBig, 6, { radius: 28, terraces: 3, depth: 16 }, 0.025));
LAYOUT.islandsLower.forEach((s, i) => layers[s.far ? 'far' : 'mid'].add(islandAt({ pillars: i % 3 ? 0 : 1, ...s }, 30 + i, { radius: 12, terraces: 2, depth: 16 }, 0.03)));

LAYOUT.islandsMid.forEach((s, i) => layers.mid.add(islandAt(s, 50 + i, { radius: 14, terraces: 2, depth: 10 }, 0.03)));

// 遠景
layers.far.add(at(makeFarField({ seed: 8, count: 50, area: LAYOUT.far.area }), V(...LAYOUT.far.pos), 0, LAYOUT.far.k));
const voidBg = makeVoid();
scene.add(voidBg);

// ── 材質（階段 4）：?flat=1 回到灰模固有色
const LOOK = !q.get('flat') && !q.get('layers') && !q.get('top');
let U = null, halos = null, motes = null;
if (LOOK) {
  const mats = makeMaterials({ pp: PP });
  window.__mats = applyMaterials(scene, mats);
  // ── 氛圍（階段 5）：?atm={…} 臨時覆寫 ATM；?noatm=1 關掉看階段 4 ──
  if (!q.get('noatm')) {
    if (q.get('atm')) Object.assign(ATM, JSON.parse(q.get('atm')));
    U = makeUniforms(ATM);
    for (const [slot, m] of Object.entries(mats)) patchMaterial(m, U, { under: slot === 'endstone' });
    voidBg.visible = false;
    scene.add(makeSky(U));
    // 背光：太陽在畫面右上後方，給朝右、朝後的面一道金邊（目標圖橋與台地上緣的金光）
    const rim = new THREE.DirectionalLight(ATM.sunCol, ENV.rimI ?? 1.6);
    rim.position.set(ATM.sunDir[0] * 10, ATM.sunDir[1] * 10 + 2, ATM.sunDir[2] * 10);
    scene.add(rim);
    halos = makeHalos(scene); scene.add(halos);
    motes = makeMotes(cam); scene.add(motes);
  }
}

// ── 對位工具 ──────────────────────────────────────────────────────────
if (q.get('layers')) {
  for (const [k, g] of Object.entries(layers)) {
    const m = new THREE.MeshBasicMaterial({ color: LAYER_COLORS[k] });   // 不吃光：色調映射與光向不會把顏色偏掉，IoU 才準
    g.traverse(o => { if (o.isMesh) o.material = m; });
  }
  voidBg.visible = false;
  scene.background = new THREE.Color('#202028');
}
if (q.get('ref')) {
  const img = document.getElementById('ref');
  img.src = q.get('ref'); img.style.display = 'block'; img.style.opacity = q.get('a') ?? 0.5;
}
let view = cam;
if (q.get('top')) {   // 俯視結構圖：正交相機從上往下，畫出鏡頭位置與視線
  voidBg.visible = false;
  scene.background = new THREE.Color('#202028');
  const bb = new THREE.Box3(); for (const k of ['near', 'midnear', 'mid']) bb.expandByObject(layers[k]);
  bb.expandByPoint(cam.position);
  const c = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3()), asp = innerWidth / innerHeight;
  const s = Math.max(sz.z / 2, sz.x / 2 / asp) * 1.1;
  view = new THREE.OrthographicCamera(-s * asp, s * asp, s, -s, 0.1, 2000);
  view.position.set(c.x, 900, c.z); view.up.set(0, 0, -1); view.lookAt(c.x, 0, c.z); view.far = 3000; view.updateProjectionMatrix();
  const helper = new THREE.CameraHelper(refCam);
  scene.add(helper);
  scene.add(new THREE.GridHelper(400, 40, '#888', '#444'));
}

let tris = 0;
scene.traverse(o => { if (o.userData && o.userData.tris) tris += o.userData.tris; });
window.theme = { scene, cam, layers, LAYOUT, CAM, ENV, hemi, sun, setCam, tris, renderer, render: () => renderer.render(scene, view) };

addEventListener('resize', () => { renderer.setPixelRatio(RES); renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; setCam(CAM); });
// ── 渲染迴圈：30 fps 上限、半解析度（?full=1 全解析，截圖對照用）、wpPause／分頁隱藏時停 ──
const RES = q.get('full') || q.get('ref') || q.get('layers') || q.get('top') ? 1 : 0.5;
renderer.setPixelRatio(RES); renderer.setSize(innerWidth, innerHeight);
const clock = { t: 0, last: performance.now(), acc: 0, frames: 0 };
let paused = false;
window.wpPause = on => { paused = !!on; };
const tickers = [];   // (dt, t) => void；動畫、特效掛這裡
window.theme.tickers = tickers;
// 狀態機（states.js）：讀 state.json、驅動苦力怕動作；?state=<名稱> 固定某個狀態
const states = createStates({ hero, walkers, scene, q });
window.theme.states = states; window.theme.actors = { hero, walkers };
tickers.push((dt, t) => states.update(dt, t));
// 光暈與粒子：時間、點大小換算（gl_PointSize = 世界大小 × uScale ÷ 深度）
tickers.push((dt, t) => {
  const sc = renderer.getDrawingBufferSize(new THREE.Vector2()).y / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
  for (const o of [halos, motes]) if (o) { o.material.uniforms.uT.value = t; o.material.uniforms.uScale.value = sc; }
});
window.theme.ATM = ATM; window.theme.syncAtm = () => U && syncUniforms(U, ATM);
renderer.setAnimationLoop(now => {
  if (paused || document.hidden) { clock.last = now; return; }
  const dt = Math.min(0.1, (now - clock.last) / 1000); clock.last = now;
  clock.acc += dt; if (clock.acc < 1 / 30 - 0.002) return;
  const step = clock.acc; clock.acc = 0; clock.t += step;
  for (const f of tickers) f(step, clock.t);
  renderer.render(scene, view);
  if (!window.__ready && ++clock.frames > 1) { window.theme.calls = renderer.info.render.calls; window.__ready = true; }
});
console.log('tris', tris, 'calls', renderer.info.render.calls, 'countTris', countTris(scene));
