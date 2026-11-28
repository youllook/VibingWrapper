// 紙飛機穿城 · 主程式（步驟 4 紙質、步驟 5 光影霧與狀態）
// 網址參數：?t=秒（固定時間）&freeze=1  ?ref=0.5（疊目標圖）  ?state=idle|thinking|working|finishing|waiting|absent
//          ?day=1／?night=1  ?yaw ?pitch ?roll ?fov ?cx ?cy（鏡頭）  ?mb=0（關動態模糊）  ?shadow=0  ?pr=0.6
import * as THREE from 'three';
import { SEG, FAR_SEG, STREET, Strip, buildSegment, buildFarSegment } from './city.js';
import { makePaperPlane } from './plane.js';
import { makeCityMaterial, makeGroundMaterial, makePlaneMaterial, NIGHT, TRAVEL, CANYON } from './paper.js';
import { makeMotionBlur } from './post.js';

const Q = new URLSearchParams(location.search);
const num = (k, d) => (Q.has(k) ? parseFloat(Q.get(k)) : d);

const CAM = {
  yaw: num('yaw', -20), pitch: num('pitch', -12), roll: num('roll', 0), fov: num('fov', 60),
  x: num('cx', 2), y: num('cy', 92),                 // 2026-11-28 拉高 18 m：俯衝空間更大、不擦到樓頂
};

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: Q.has('shot') });
renderer.setPixelRatio(num('pr', 0.75));                      // 0.6 太糊、板縫會糊掉；0.75 仍省一半像素
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = num('shadow', 1) > 0;
renderer.shadowMap.type = THREE.PCFShadowMap;            // PCF 才吃 radius（軟邊）
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const planeScene = new THREE.Scene();                         // 紙飛機另外畫在動態模糊之後

// 天空：上淡灰藍、地平線偏暖白（畫布漸層當背景）
const skyCanvas = document.createElement('canvas'); skyCanvas.width = 4; skyCanvas.height = 256;
const skyTex = new THREE.CanvasTexture(skyCanvas); skyTex.colorSpace = THREE.SRGBColorSpace;
function paintSky(top, horizon) {
  const g = skyCanvas.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#' + top.getHexString()); gr.addColorStop(0.62, '#' + horizon.getHexString()); gr.addColorStop(1, '#' + horizon.getHexString());
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256); skyTex.needsUpdate = true;
}
scene.background = skyTex;
scene.fog = new THREE.FogExp2('#f4f3f2', 0.0016);

const camera = new THREE.PerspectiveCamera(CAM.fov, 16 / 9, 0.5, 4000);
camera.rotation.order = 'YXZ';
camera.position.set(CAM.x, CAM.y, 0);
camera.rotation.set(THREE.MathUtils.degToRad(CAM.pitch), THREE.MathUtils.degToRad(-CAM.yaw), THREE.MathUtils.degToRad(CAM.roll));
scene.add(camera);

// 光：午後側光從右上後方來（街上投出長影）＋天光
const hemi = new THREE.HemisphereLight('#f9f8f6', '#e2e0dc', num('hemi', 0.9));   // 偏暖：紙不是石膏
const sun = new THREE.DirectionalLight('#fff3e4', 2.0);
CANYON.value = num('canyon', CANYON.value);
const SUN_DIR = new THREE.Vector3(num('sx', 0.45), num('sy', 0.62), num('sz', 0.65)).normalize();
sun.target.position.set(0, 0, -160);
sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 700);
sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -230, right: 230, top: 230, bottom: -230, near: 100, far: 1500 });
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6; sun.shadow.radius = 5; sun.shadow.blurSamples = 12;
sun.shadow.intensity = num('shi', 0.68);                      // 目標圖的影子是淺灰、軟的
scene.add(hemi, sun, sun.target);
const planeHemi = hemi.clone(), planeSun = new THREE.DirectionalLight('#fff3e4', 2.0);
planeSun.position.copy(SUN_DIR).multiplyScalar(100);
planeScene.add(planeHemi, planeSun);

// 城市
const cityMat = makeCityMaterial();
const near = new Strip(scene, cityMat, { cap: 1600, build: buildSegment, len: SEG, behind: 70, ahead: 1300 });
const far = new Strip(scene, cityMat, { cap: 200, build: buildFarSegment, len: FAR_SEG, behind: 300, ahead: 2400 });
far.slots.forEach((sl) => { sl.mesh.castShadow = false; });
// g：本體＝(樣式+0.5)/4（小數 .5）；配件＝0.55（樣式 2 素面、小數 .2，shader 靠小數分辨）；遠景＝細溝本體
// unit＝1.2/4（百葉機房）、beam＝3.2/4（單軌梁接縫）
const STYLE = { roof: 0.55, trim: 0.55, hip: 0.55, rail: 0.55, unit: 0.3, beam: 0.8, far: 0.875 };
const colorOf = (b, c) => {
  // r＝紙色深淺、g＝立面樣式（0 溝槽／1 窗帶／2 格子／3 素面）、b＝種子；同一棟樓同一組參數
  const h = Math.abs(Math.sin(b.x * 12.9898 + b.z * 78.233) * 43758.5453) % 1;
  const st = b.kind === 'body' ? (b.style + 0.5) / 4 : STYLE[b.kind];
  return c.setRGB(0.5 + 0.5 * ((h * 7.3) % 1), st, b.seed ?? (h * 13.1) % 1);
};
near.colorOf = colorOf; far.colorOf = colorOf;
const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 6000).rotateX(-Math.PI / 2), makeGroundMaterial(STREET));
ground.position.z = -2500; ground.receiveShadow = true; scene.add(ground);

// 紙飛機：位置用畫面座標（0–1）＋離鏡頭距離
const plane = makePaperPlane(makePlaneMaterial());
const PLANE = { u: num('pu', 0.40), v: num('pv', 0.60), d: num('pd', 15), s: num('ps', 3.9), yaw: num('pyaw', 35), bank: num('pbank', 10), pitch: num('ppitch', 18) };
plane.scale.setScalar(PLANE.s);
plane.rotation.order = 'YXZ';
planeScene.add(plane);
camera.updateMatrixWorld(true);
const planeAt = (u, v, d) => new THREE.Vector3(u * 2 - 1, 1 - v * 2, 0.5).unproject(camera).sub(camera.position).normalize().multiplyScalar(d).add(camera.position);
const PLANE_POS = planeAt(PLANE.u, PLANE.v, PLANE.d);
const CAM0 = camera.position.clone(), PDIR = PLANE_POS.clone().sub(CAM0).normalize();   // 飛機沿這條視線前後漂
// 影子替身：同一個形狀放進城市場景，只投影、不畫顏色也不寫深度
const planeShadow = new THREE.Mesh(plane.geometry, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide }));
planeShadow.castShadow = true; planeShadow.scale.setScalar(PLANE.s * 1.25);   // 軟影會吃掉邊，放大一點才讀得到 planeShadow.rotation.order = 'YXZ';
scene.add(planeShadow);

const mb = num('mb', 1) > 0 ? makeMotionBlur(renderer, camera) : null;

if (Q.has('ref')) {
  const img = document.createElement('img');
  img.src = '../../docs/paper-plane/target.png';
  Object.assign(img.style, { position: 'fixed', inset: 0, width: '100vw', height: '100vh', opacity: num('ref', 0.5), pointerEvents: 'none' });
  document.body.appendChild(img);
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  if (mb) mb.resize();
}
addEventListener('resize', resize); resize();

// ── 狀態 → 目標值 ──
// speed m/s、fog 霧密度、sun 日光、sunC 日光色、hazeC 霧／地平線色、topC 天頂色、mb 快門（秒）
// 飛行：amp 左右穿梭幅度 m、alt 升降幅度 m、ag 靈活度（節奏快慢）、dip 高度偏移 m、circle 盤旋（等你）
const STATES = {
  idle:      { speed: 14, fog: 0.0016, sun: 2.8, sunC: '#fffaf3', hazeC: '#f4f3f2', topC: '#e8e8ee', mb: 0.02, amp: 5, alt: 3,   ag: 1.0, dip: 0,    circle: 0 },
  thinking:  { speed: 7,  fog: 0.0042, sun: 2.1, sunC: '#ffebd2', hazeC: '#f2ece3', topC: '#ece8e2', mb: 0.02, amp: 3, alt: 2,   ag: 0.6, dip: 1,    circle: 0 },
  working:   { speed: 38, fog: 0.0013, sun: 2.9, sunC: '#fff6ea', hazeC: '#eff0f0', topC: '#e2e7ee', mb: 0.05, amp: 8, alt: 4.5, ag: 1.8, dip: -3,   circle: 0 },
  finishing: { speed: 10, fog: 0.0011, sun: 2.8, sunC: '#ffe6c8', hazeC: '#f4ece2', topC: '#e9e6e6', mb: 0.025, amp: 4, alt: 3,   ag: 0.9, dip: 4,    circle: 0 },
  waiting:   { speed: 2,  fog: 0.0016, sun: 2.8, sunC: '#fffaf3', hazeC: '#f4f3f2', topC: '#e8e8ee', mb: 0.0, amp: 0, alt: 1,   ag: 0.5, dip: 0,    circle: 1 },
  absent:    { speed: 5,  fog: 0.0020, sun: 0.5, sunC: '#9fb3d8', hazeC: '#2a3142', topC: '#1c2231', mb: 0.05, amp: 3, alt: 2,   ag: 0.6, dip: 0,    circle: 0 },
};
const SKY2STATE = { clear: 'idle', overcast: 'thinking', storm: 'working', clearing: 'finishing', waiting: 'waiting' };
const CONFIG = { polling: !Q.has('state'), clockHours: Q.has('day') ? 10.5 : Q.has('night') ? 22 : null };
const clockHours = () => CONFIG.clockHours != null ? CONFIG.clockHours : new Date().getHours() + new Date().getMinutes() / 60;
let stateName = Q.get('state') || 'idle', sessions = [null];
function applyState(sky, sess) {
  if (sess !== undefined) sessions = sess || [];
  const any = (sessions || []).some((x) => x);
  stateName = !any || sky === 'none' ? 'absent' : SKY2STATE[sky] || 'idle';
}
async function poll() {
  if (!CONFIG.polling) return;
  try { const j = await (await fetch('state.json', { cache: 'no-store' })).json(); applyState(j.state, j.sessions); } catch { /* 開發時沒有 bridge */ }
}
setInterval(poll, 1000); poll();

// 夜：月光藍、霧深藍、窗燈亮
const NIGHT_ST = { sun: 0.45, sunC: '#9fb3d8', hazeC: '#2a3142', topC: '#161b28' };
const COLS = ['sunC', 'hazeC', 'topC'];
const cur = { ...STATES.idle }; COLS.forEach((k) => { cur[k] = new THREE.Color(STATES.idle[k]); });
const _c = new THREE.Color(), _hd = new THREE.Color('#f9f8f6'), _hn = new THREE.Color('#46536f'), _gd = new THREE.Color('#e2e0dc'), _gn = new THREE.Color('#2b2e36');
let night = 0, circleT = 0, circleW = 0, ph = 0;
const camLag = { x: 0, y: 0, roll: 0, yaw: 0, pitch: 0 };
// 上下穿梭的間隔（秒）：[最短, 最長]；等你不俯衝
const DIVE_EVERY = { idle: [12, 20], thinking: [26, 40], working: [6, 10], finishing: [14, 20], waiting: [1e9, 1e9], absent: [18, 30] };
const VIEW_SEQ = ['normal', 'top', 'normal', 'fpv'], VIEW_SEC = num('viewsec', 40);
const VIEW_LOCK = ['normal', 'top', 'fpv'].includes(Q.get('view')) ? Q.get('view') : null;   // ?view=normal|top|fpv 鎖定
const viewW = { normal: VIEW_LOCK && VIEW_LOCK !== 'normal' ? 0 : 1, top: VIEW_LOCK === 'top' ? 1 : 0, fpv: VIEW_LOCK === 'fpv' ? 1 : 0 };
const topLag = { x: 0, y: 0 }, fpvLag = { pitch: 0, yaw: 0, roll: 0 };
const _pN = new THREE.Vector3(), _pT = new THREE.Vector3(), _pF = new THREE.Vector3(), _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _zAx = new THREE.Vector3(0, 0, 1);
const _qN = new THREE.Quaternion(), _qT = new THREE.Quaternion(), _qF = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _eu = new THREE.Euler(), _tmpM = new THREE.Matrix4();
let clk = 0, dive = null, nextDive = 5, rollT = -1, rollNext = 22, lastState = null, lastY = null, vyS = 0;
function applyAtmos(dt) {
  const tgt = STATES[stateName] || STATES.idle;
  const h = clockHours(), clockNight = (h >= 19 || h < 6) ? 1 : h >= 18 ? h - 18 : h < 7 ? 7 - h : 0;
  const nt = stateName === 'absent' ? 1 : clockNight;
  const k = 1 - Math.exp(-dt / 2.2);                  // 約 2 秒過渡
  for (const key of ['speed', 'fog', 'sun', 'mb', 'amp', 'alt', 'ag', 'dip']) cur[key] += (tgt[key] - cur[key]) * k;
  for (const key of COLS) cur[key].lerp(_c.set(tgt[key]).lerp(_c.clone().set(NIGHT_ST[key]), nt), k);
  night += (nt - night) * k;
  circleW += (tgt.circle - circleW) * k;
  NIGHT.value = night;
  sun.intensity = planeSun.intensity = THREE.MathUtils.lerp(cur.sun * num('sunk', 1), NIGHT_ST.sun, night);
  sun.color.copy(cur.sunC); planeSun.color.copy(cur.sunC);
  hemi.color.copy(_hd).lerp(_hn, night); hemi.groundColor.copy(_gd).lerp(_gn, night);
  hemi.intensity = THREE.MathUtils.lerp(num('hemi', 0.9), 0.55, night);
  planeHemi.color.copy(hemi.color); planeHemi.groundColor.copy(hemi.groundColor); planeHemi.intensity = hemi.intensity;
  scene.fog.color.copy(cur.hazeC); scene.fog.density = cur.fog;
  paintSky(cur.topC, cur.hazeC);
}

let paused = false;
window.wpPause = (on) => { paused = !!on; };
const t0 = performance.now();
let s = num('t', 0) * STATES.idle.speed, last = performance.now(), acc = 0, firstFrame = true;
function frame(now) {
  requestAnimationFrame(frame);
  if (paused || document.hidden) { last = now; return; }
  acc += now - last; last = now;
  if (acc < 1000 / 30 - 2) return;          // 30 fps 上限
  const dt = Math.min(acc / 1000, 0.1); acc = 0;
  step(now, dt);
}
function step(now, dt) {
  const frozen = Q.has('freeze');
  if (firstFrame) {                          // 第一格直接跳到目標狀態，不從 idle 慢慢過渡
    firstFrame = false;
    for (let i = 0; i < 40; i++) applyAtmos(1);
  } else applyAtmos(frozen ? 1 : dt);
  const t = Q.has('t') ? num('t', 0) + (frozen ? 0 : (now - t0) / 1000) : (now - t0) / 1000;
  if (!frozen) s += cur.speed * dt;
  TRAVEL.value = s;
  near.update(s); far.update(s);
  // ── 飛行：S 形穿梭＋上下穿梭＋在畫面裡前後漂、轉身、偶爾翻滾；鏡頭延遲跟拍 ──
  ph += dt * cur.ag;
  if (Q.has('t') && frozen) ph = t * cur.ag;
  clk += dt;
  const FLY = num('fly', 1), A = cur.amp * FLY, B = cur.alt * FLY, ag = cur.ag;   // ?fly=0：靜止構圖（比對目標圖用）
  const px = A * (0.62 * Math.sin(0.23 * ph) + 0.38 * Math.sin(0.51 * ph + 1.1));
  const vx = A * ag * (0.62 * 0.23 * Math.cos(0.23 * ph) + 0.38 * 0.51 * Math.cos(0.51 * ph + 1.1));
  const ax = -A * ag * ag * (0.62 * 0.0529 * Math.sin(0.23 * ph) + 0.38 * 0.2601 * Math.sin(0.51 * ph + 1.1));
  const py = B * (0.6 * Math.sin(0.19 * ph + 2.0) + 0.4 * Math.sin(0.43 * ph)) + cur.dip;
  const fwd = Math.max(cur.speed, 5);
  if (stateName !== lastState) { if (stateName === 'finishing') rollNext = clk + 1.2; nextDive = Math.min(nextDive, clk + 3); lastState = stateName; }
  // 上下穿梭：時候到了就俯衝進街谷，在谷底停一下再拉回巡航高度（空橋已移除，深度隨機；單軌頂 26 m，最低 34）
  const DW = 3.2, DH = 0.6, DD = 7;                           // 下降秒數、谷底停留、俯衝時往前拉開的距離
  if (!dive && FLY > 0 && clk > nextDive) dive = { tp: clk + DW + DH, yd: 34 + Math.random() * 14 };
  let env = 0;
  if (dive) {
    const u = clk - dive.tp, sm = (x) => { x = Math.min(Math.max(x, 0), 1); return x * x * (3 - 2 * x); };
    env = u < -DH ? sm((u + DH + DW) / DW) : u <= DH ? 1 : 1 - sm((u - DH) / (DW * 1.3));
    if (u > DH + DW * 1.3) { dive = null; const e = DIVE_EVERY[stateName] || DIVE_EVERY.idle; nextDive = clk + e[0] + Math.random() * (e[1] - e[0]); }
  }
  // 在畫面裡前後漂：慢慢往前拉開、被鏡頭追上；俯衝時拉得更遠
  const d = PLANE.d + 3.5 * Math.sin(0.13 * ph + 0.4) * FLY + DD * env;
  // 等你：原地繞小圈（世界座標）
  circleT += dt * 0.9 * circleW;
  const ox = Math.cos(circleT) * 5 * circleW, oy = Math.sin(circleT) * 2.2 * circleW;
  const bob = 0.25 * Math.sin(t * 1.3);
  const bx = CAM0.x + PDIR.x * d, by = CAM0.y + PDIR.y * d, bz = CAM0.z + PDIR.z * d;
  const cruiseY = by + py + oy + bob;
  const x = THREE.MathUtils.lerp(bx + px + ox, -4 + px * 0.3, env * 0.7), y = THREE.MathUtils.lerp(cruiseY, dive ? dive.yd : cruiseY, env);
  vyS += ((dt > 0 && lastY !== null ? (y - lastY) / dt : 0) - vyS) * (dt > 0 ? 1 - Math.exp(-dt / 0.25) : 1); lastY = y;
  plane.position.set(x, y, bz);
  // 翻滾：待命時偶爾一次、收尾時一定來一次
  if (rollT < 0 && clk > rollNext && !dive && FLY > 0 && circleW < 0.5 && viewW.fpv < 0.3) rollT = 0;   // 第一人稱時不翻滾（只看到機腹一閃而過）
  let rollAng = 0;
  if (rollT >= 0) {
    rollT += dt; const k = Math.min(rollT / 1.5, 1);
    rollAng = 360 * (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
    if (k >= 1) { rollT = -1; rollNext = clk + 28 + Math.random() * 20; rollAng = 0; }
  }
  const heading = THREE.MathUtils.radToDeg(Math.atan2(vx, fwd)) - Math.sin(circleT) * 30 * circleW;
  const turn = THREE.MathUtils.clamp(ax * 40, -40, 40) + Math.cos(circleT) * 30 * circleW;   // 轉彎往內側傾
  const show = 16 * Math.sin(0.11 * ph + 0.7) * FLY;                                         // 慢慢轉身，露出機腹、龍骨、另一邊翼面
  const bank = PLANE.bank + turn + 2 * Math.sin(t * 0.9) + rollAng;
  const pitch = PLANE.pitch + THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(Math.atan2(vyS, fwd)) * 1.4, -50, 40) + 3 * Math.cos(t * 1.3);
  plane.rotation.set(THREE.MathUtils.degToRad(pitch), THREE.MathUtils.degToRad(-PLANE.yaw - heading + show), THREE.MathUtils.degToRad(-bank));
  planeShadow.position.copy(plane.position); planeShadow.rotation.copy(plane.rotation);
  // ── 鏡頭：一般（延遲跟拍）／大俯視／第一人稱，三組姿勢依權重混合 ──
  const kc = dt > 0 ? 1 - Math.exp(-dt / 1.1) : 1, ky = dt > 0 ? 1 - Math.exp(-dt / 0.8) : 1;
  const dy = y - (CAM0.y + PDIR.y * PLANE.d);
  camLag.x += ((x - (CAM0.x + PDIR.x * PLANE.d)) * 0.75 - camLag.x) * kc;
  camLag.y += (dy * THREE.MathUtils.lerp(0.6, 0.78, env) - camLag.y) * ky;
  camLag.roll += (turn * 0.28 - camLag.roll) * kc;
  camLag.yaw += (heading * 0.3 - camLag.yaw) * kc;
  // 一般
  const camY = CAM.y + camLag.y + 0.15 * Math.sin(t * 0.7);
  const aim = Math.atan2(y - camY, Math.hypot(x - CAM.x - camLag.x, bz)) - Math.atan2(PDIR.y, Math.hypot(PDIR.x, PDIR.z));
  camLag.pitch += (aim * 0.8 - camLag.pitch) * ky;
  _pN.set(CAM.x + camLag.x, camY, 0);
  _qN.setFromEuler(_eu.set(THREE.MathUtils.degToRad(CAM.pitch) + camLag.pitch, THREE.MathUtils.degToRad(-CAM.yaw - camLag.yaw), THREE.MathUtils.degToRad(CAM.roll - camLag.roll), 'YXZ'));
  // 大俯視：高處往前下方看整座紙模城，飛機在畫面中下方；升降只跟一半
  topLag.x += (x * 0.6 - topLag.x) * kc; topLag.y += ((y - cruiseY) * 0.55 - topLag.y) * ky;
  _pT.set(topLag.x * 0.9 + 2, cruiseY + 38 + topLag.y, bz + 26);
  _tmpM.lookAt(_pT, _v.set(topLag.x * 0.9, y - 12, bz - 24), _up);
  _qT.setFromRotationMatrix(_tmpM).multiply(_q2.setFromAxisAngle(_zAx, THREE.MathUtils.degToRad(-turn * 0.12)));
  // 第一人稱：貼在機尾後上方約 3 m（像坐在飛機上），翼面在畫面下緣；視角加寬 14°、順著飛行方向看，翼面留在畫面下緣；側傾只跟一半
  fpvLag.pitch += (THREE.MathUtils.clamp(Math.atan2(vyS, fwd), -0.8, 0.6) * 0.85 - fpvLag.pitch) * ky;
  fpvLag.yaw += (-Math.atan2(vx, fwd) * 0.9 - fpvLag.yaw) * kc;
  fpvLag.roll += (THREE.MathUtils.degToRad(-(turn + rollAng * 0.15) * 0.45) - fpvLag.roll) * ky;
  _qF.setFromEuler(_eu.set(fpvLag.pitch + 0.02, fpvLag.yaw, fpvLag.roll, 'YXZ'));
  _pF.set(0, 2.1, 2.2).applyQuaternion(_qF).add(plane.position);
  // 權重：auto 依時間輪播，?view= 鎖定
  const want = VIEW_LOCK || VIEW_SEQ[Math.floor(clk / VIEW_SEC) % VIEW_SEQ.length];
  const kv = dt > 0 ? 1 - Math.exp(-dt / 0.9) : 1;
  for (const k of ['normal', 'top', 'fpv']) viewW[k] += ((k === want ? 1 : 0) - viewW[k]) * kv;
  const wsum = viewW.normal + viewW.top + viewW.fpv;
  const wT = viewW.top / wsum, wF = viewW.fpv / wsum;
  camera.position.copy(_pN).multiplyScalar(1 - wT - wF).addScaledVector(_pT, wT).addScaledVector(_pF, wF);
  camera.quaternion.copy(_qN).slerp(_qT, wT / Math.max(1e-4, 1 - wF)).slerp(_qF, wF);
  // 第一人稱時，飛機機頭轉回順著飛行方向（一般視角那 35° 斜擺是構圖用的）
  plane.rotation.y += THREE.MathUtils.degToRad(PLANE.yaw - show) * wF;
  planeShadow.rotation.copy(plane.rotation);
  plane.scale.setScalar(PLANE.s * (1 + 0.35 * wT));
  const fov = CAM.fov + 14 * wF;
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }                 // 大俯視時放大一點，才讀得到
  camera.position.y = Math.max(camera.position.y, 30);
  draw();
}
function draw() {
  renderer.autoClear = true;
  if (mb) mb.render(scene, cur.speed * cur.mb); else renderer.render(scene, camera);
  renderer.autoClear = false;                // 不清深度：模糊那一關已把城市深度寫回，飛機會被空橋擋住
  renderer.render(planeScene, camera);
  renderer.autoClear = true;
}
requestAnimationFrame(frame);

window.theme = {
  CAM, PLANE, scene, camera, renderer, STATES, PARAMS: STATES, CONFIG, applyState,
  draw, resizePost: () => mb && mb.resize(), cityReady: Promise.resolve(),
  requestState: () => stateName, setState: (n) => { stateName = n; },
  setSessions: (a) => { sessions = a || []; },
  // 測試：立刻找橋俯衝／立刻翻滾；flight 看目前飛行狀態
  dive: () => { nextDive = clk; }, roll: () => { rollNext = clk; },
  get flight() { return { clk, dive, nextDive, rollT, y: plane.position.y, d: plane.position.distanceTo(camera.position) }; },
  shot: async (name = 'shot.png') => {
    renderer.setPixelRatio(1); renderer.setSize(1920, 1080, false); camera.aspect = 16 / 9; camera.updateProjectionMatrix(); if (mb) mb.resize();
    step(performance.now(), 0);
    const blob = await new Promise((r) => renderer.domElement.toBlob(r, name.endsWith('.jpg') ? 'image/jpeg' : 'image/png', 0.9));
    const r = await fetch('/_save/' + name, { method: 'PUT', body: blob }); return r.status;
  },
};
