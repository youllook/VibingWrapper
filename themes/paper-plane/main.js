// 紙飛機穿城 · 主程式（步驟 4 紙質、步驟 5 光影霧與狀態）
// 網址參數：?t=秒（固定時間）&freeze=1  ?ref=0.5（疊目標圖）  ?state=idle|thinking|working|finishing|waiting|absent
//          ?day=1／?night=1  ?yaw ?pitch ?roll ?fov ?cx ?cy（鏡頭）  ?mb=0（關動態模糊）  ?shadow=0  ?pr=0.6
import * as THREE from 'three';
import { SEG, FAR_SEG, STREET, Strip, buildSegment, buildFarSegment } from './city.js';
import { makePaperPlane } from './plane.js';
import { makeCityMaterial, makeGroundMaterial, makePlaneMaterial, NIGHT, TRAVEL } from './paper.js';
import { makeMotionBlur } from './post.js';

const Q = new URLSearchParams(location.search);
const num = (k, d) => (Q.has(k) ? parseFloat(Q.get(k)) : d);

const CAM = {
  yaw: num('yaw', -20), pitch: num('pitch', -9), roll: num('roll', 0), fov: num('fov', 60),
  x: num('cx', -4), y: num('cy', 60),
};

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: Q.has('shot') });
renderer.setPixelRatio(num('pr', 0.6));                       // 規格：半解析度
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = num('shadow', 1) > 0;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
scene.fog = new THREE.FogExp2('#f1efed', 0.0016);

const camera = new THREE.PerspectiveCamera(CAM.fov, 16 / 9, 0.5, 4000);
camera.rotation.order = 'YXZ';
camera.position.set(CAM.x, CAM.y, 0);
camera.rotation.set(THREE.MathUtils.degToRad(CAM.pitch), THREE.MathUtils.degToRad(-CAM.yaw), THREE.MathUtils.degToRad(CAM.roll));
scene.add(camera);

// 光：午後側光從右上後方來（街上投出長影）＋天光
const hemi = new THREE.HemisphereLight('#f4f6fa', '#d6cdc2', 1.1);
const sun = new THREE.DirectionalLight('#fff3e4', 2.0);
const SUN_DIR = new THREE.Vector3(num('sx', 0.62), num('sy', 0.62), num('sz', 0.48)).normalize();
sun.target.position.set(0, 0, -160);
sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 700);
sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -230, right: 230, top: 230, bottom: -230, near: 100, far: 1500 });
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6; sun.shadow.radius = 3;
scene.add(hemi, sun, sun.target);
const planeHemi = hemi.clone(), planeSun = new THREE.DirectionalLight('#fff3e4', 2.0);
planeSun.position.copy(SUN_DIR).multiplyScalar(100);
planeScene.add(planeHemi, planeSun);

// 城市
const cityMat = makeCityMaterial();
const near = new Strip(scene, cityMat, { cap: 1600, build: buildSegment, len: SEG, behind: 70, ahead: 1300 });
const far = new Strip(scene, cityMat, { cap: 200, build: buildFarSegment, len: FAR_SEG, behind: 300, ahead: 2400 });
far.slots.forEach((sl) => { sl.mesh.castShadow = false; });
const STYLE = { body: null, roof: 0.95, trim: 0.95, bridge: 0.95, rail: 0.95, far: 0.1 };
const colorOf = (b, c) => {
  // r＝紙色深淺、g＝立面樣式（0 溝槽／1 窗帶／2 格子／3 素面）、b＝種子；同一棟樓同一組參數
  const h = Math.abs(Math.sin(b.x * 12.9898 + b.z * 78.233) * 43758.5453) % 1;
  const st = STYLE[b.kind] ?? (h < 0.35 ? 0.05 : h < 0.5 ? 0.3 : h < 0.6 ? 0.55 : 0.8);
  return c.setRGB(0.5 + 0.5 * ((h * 7.3) % 1), st, (h * 13.1) % 1);
};
near.colorOf = colorOf; far.colorOf = colorOf;
const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 6000).rotateX(-Math.PI / 2), makeGroundMaterial(STREET));
ground.position.z = -2500; ground.receiveShadow = true; scene.add(ground);

// 紙飛機：位置用畫面座標（0–1）＋離鏡頭距離
const plane = makePaperPlane(makePlaneMaterial());
const PLANE = { u: num('pu', 0.40), v: num('pv', 0.60), d: num('pd', 15), s: num('ps', 3.3), yaw: num('pyaw', 35), bank: num('pbank', 10), pitch: num('ppitch', 18) };
plane.scale.setScalar(PLANE.s);
plane.rotation.order = 'YXZ';
planeScene.add(plane);
camera.updateMatrixWorld(true);
const planeAt = (u, v, d) => new THREE.Vector3(u * 2 - 1, 1 - v * 2, 0.5).unproject(camera).sub(camera.position).normalize().multiplyScalar(d).add(camera.position);
const PLANE_POS = planeAt(PLANE.u, PLANE.v, PLANE.d);

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
  idle:      { speed: 14, fog: 0.0016, sun: 2.9, sunC: '#fff3e4', hazeC: '#f1efed', topC: '#e6e9ee', mb: 0.03, amp: 5, alt: 3,   ag: 1.0, dip: 0,    circle: 0 },
  thinking:  { speed: 7,  fog: 0.0042, sun: 2.2, sunC: '#ffebd2', hazeC: '#f2ece3', topC: '#ece8e2', mb: 0.02, amp: 3, alt: 2,   ag: 0.6, dip: 1,    circle: 0 },
  working:   { speed: 38, fog: 0.0013, sun: 3.0, sunC: '#fff6ea', hazeC: '#eff0f0', topC: '#e2e7ee', mb: 0.05, amp: 8, alt: 4.5, ag: 1.8, dip: -3,   circle: 0 },
  finishing: { speed: 10, fog: 0.0011, sun: 2.8, sunC: '#ffe6c8', hazeC: '#f4ece2', topC: '#e9e6e6', mb: 0.025, amp: 4, alt: 3,   ag: 0.9, dip: 4,    circle: 0 },
  waiting:   { speed: 2,  fog: 0.0016, sun: 2.9, sunC: '#fff3e4', hazeC: '#f1efed', topC: '#e6e9ee', mb: 0.0, amp: 0, alt: 1,   ag: 0.5, dip: 0,    circle: 1 },
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
const _c = new THREE.Color(), _hd = new THREE.Color('#f4f6fa'), _hn = new THREE.Color('#46536f'), _gd = new THREE.Color('#cfc6bb'), _gn = new THREE.Color('#2b2e36');
let night = 0, circleT = 0, circleW = 0, ph = 0;
const camLag = { x: 0, y: 0, roll: 0, yaw: 0 };
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
  sun.intensity = planeSun.intensity = THREE.MathUtils.lerp(cur.sun, NIGHT_ST.sun, night);
  sun.color.copy(cur.sunC); planeSun.color.copy(cur.sunC);
  hemi.color.copy(_hd).lerp(_hn, night); hemi.groundColor.copy(_gd).lerp(_gn, night);
  hemi.intensity = THREE.MathUtils.lerp(1.1, 0.55, night);
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
  // ── 飛行：S 形穿梭＋升降（兩組正弦疊加，不重複感），鏡頭延遲跟拍＋側傾 ──
  ph += dt * cur.ag;
  if (Q.has('t') && frozen) ph = t * cur.ag;
  const A = cur.amp, B = cur.alt, ag = cur.ag;
  const px = A * (0.62 * Math.sin(0.23 * ph) + 0.38 * Math.sin(0.51 * ph + 1.1));
  const vx = A * ag * (0.62 * 0.23 * Math.cos(0.23 * ph) + 0.38 * 0.51 * Math.cos(0.51 * ph + 1.1));
  const ax = -A * ag * ag * (0.62 * 0.0529 * Math.sin(0.23 * ph) + 0.38 * 0.2601 * Math.sin(0.51 * ph + 1.1));
  const py = B * (0.6 * Math.sin(0.19 * ph + 2.0) + 0.4 * Math.sin(0.43 * ph)) + cur.dip;
  const vy = B * ag * (0.6 * 0.19 * Math.cos(0.19 * ph + 2.0) + 0.4 * 0.43 * Math.cos(0.43 * ph));
  const fwd = Math.max(cur.speed, 5);
  // 等你：原地繞小圈（世界座標）
  circleT += dt * 0.9 * circleW;
  const ox = Math.cos(circleT) * 5 * circleW, oy = Math.sin(circleT) * 2.2 * circleW;
  const bob = 0.25 * Math.sin(t * 1.3);
  plane.position.set(PLANE_POS.x + px + ox, PLANE_POS.y + py + oy + bob, PLANE_POS.z);
  const heading = THREE.MathUtils.radToDeg(Math.atan2(vx, fwd)) - Math.sin(circleT) * 30 * circleW;
  const turn = THREE.MathUtils.clamp(ax * 40, -40, 40) + Math.cos(circleT) * 30 * circleW;   // 轉彎往內側傾
  const bank = PLANE.bank + turn + 2 * Math.sin(t * 0.9);
  const pitch = PLANE.pitch + THREE.MathUtils.radToDeg(Math.atan2(vy, fwd)) * 1.4 + 3 * Math.cos(t * 1.3);
  plane.rotation.set(THREE.MathUtils.degToRad(pitch), THREE.MathUtils.degToRad(-PLANE.yaw - heading), THREE.MathUtils.degToRad(-bank));
  // 鏡頭：落後約 1 秒跟上飛機的橫移與升降，跟著轉彎側傾一點、偏頭一點
  const kc = dt > 0 ? 1 - Math.exp(-dt / 1.1) : 1;
  camLag.x += ((px + ox) * 0.75 - camLag.x) * kc;
  camLag.y += ((py + oy) * 0.6 - camLag.y) * kc;
  camLag.roll += (turn * 0.28 - camLag.roll) * kc;
  camLag.yaw += (heading * 0.3 - camLag.yaw) * kc;
  camera.position.set(CAM.x + camLag.x, CAM.y + camLag.y + 0.15 * Math.sin(t * 0.7), 0);
  camera.rotation.set(THREE.MathUtils.degToRad(CAM.pitch), THREE.MathUtils.degToRad(-CAM.yaw - camLag.yaw), THREE.MathUtils.degToRad(CAM.roll - camLag.roll));
  draw();
}
function draw() {
  renderer.autoClear = true;
  if (mb) mb.render(scene, cur.speed * cur.mb); else renderer.render(scene, camera);
  renderer.autoClear = false; renderer.clearDepth();
  renderer.render(planeScene, camera);
  renderer.autoClear = true;
}
requestAnimationFrame(frame);

window.theme = {
  CAM, PLANE, scene, camera, renderer, STATES, PARAMS: STATES, CONFIG, applyState,
  draw, resizePost: () => mb && mb.resize(), cityReady: Promise.resolve(),
  requestState: () => stateName, setState: (n) => { stateName = n; },
  setSessions: (a) => { sessions = a || []; },
  shot: async (name = 'shot.png') => {
    renderer.setPixelRatio(1); renderer.setSize(1920, 1080, false); camera.aspect = 16 / 9; camera.updateProjectionMatrix(); if (mb) mb.resize();
    step(performance.now(), 0);
    const blob = await new Promise((r) => renderer.domElement.toBlob(r, name.endsWith('.jpg') ? 'image/jpeg' : 'image/png', 0.9));
    const r = await fetch('/_save/' + name, { method: 'PUT', body: blob }); return r.status;
  },
};
