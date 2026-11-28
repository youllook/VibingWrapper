// 霓虹隧道（neon-tunnel）· 無限系列 s07
// 鏡頭和車內固定，世界的週期性東西照行駛距離 offset 捲動（world.js），擋風玻璃雨在最後一關（glass.js）。
// 網址參數：?state=  ?day=1 ?night=1  ?ref=0.5（疊目標圖）  ?t=秒（起始時間）  ?freeze=1（停住）
//          ?yaw ?pitch ?fov（鏡頭，度）  ?pr=（pixel ratio，預設 0.6）  ?exit=（出口距離，公尺）
import * as THREE from 'three';
import { buildWorld, makeUniforms, T, LAMP_A } from './world.js';
import { makeGlass, WIPERS } from './glass.js';
import { makeCabin } from './cabin.js';

const Q = new URLSearchParams(location.search);
const num = (k, d) => (Q.has(k) ? parseFloat(Q.get(k)) : d);
const FREEZE = Q.has('freeze');

const CAM = { yaw: num('yaw', 21.7), pitch: num('pitch', 3.5), roll: num('roll', 0), fov: num('fov', 54) };
const EXIT_D = num('exit', 150);          // 平常出口一直在前方這麼遠
const OUT_LEN = num('outlen', 300);       // 出了隧道後，露天開多遠才進下一條

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: Q.has('shot') });
renderer.setPixelRatio(num('pr', 0.6));
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;    // 顏色在 glass.js／cabin.js 的 shader 裡自己編
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CAM.fov, 16 / 9, 0.05, 6000);
camera.rotation.order = 'YXZ';
camera.position.set(0, T.eye, 0);
const D2R = Math.PI / 180;
camera.rotation.set(CAM.pitch * D2R, -CAM.yaw * D2R, CAM.roll * D2R);

const U = makeUniforms();
buildWorld(scene, U);
const glass = makeGlass(renderer);
const cabin = makeCabin(camera);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  glass.resize();
}
addEventListener('resize', resize); resize();

if (Q.has('ref')) {
  const img = document.createElement('img'); img.src = '../../docs/neon-tunnel/target.jpg';
  Object.assign(img.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', opacity: Q.get('ref') || '0.5', pointerEvents: 'none' });
  document.body.appendChild(img);
}

// ── 狀態 ──
// speed m/s、wipe 雨刷間歇秒數（−1＝不動、0＝連續）、stroke 單趟秒數、rain 雨量、lamp 隧道燈亮度、sparse 只留三分之一的燈
const STATES = {
  idle:      { speed: 22, wipe: 3.5, stroke: 0.6, rain: 1.0, lamp: 1.0, sparse: 0 },
  thinking:  { speed: 12, wipe: 5.0, stroke: 0.7, rain: 0.9, lamp: 1.0, sparse: 0, blink: 'L' },
  working:   { speed: 36, wipe: 0, stroke: 0.42, rain: 1.6, lamp: 1.15, sparse: 0 },
  finishing: { speed: 25, wipe: 2.0, stroke: 0.55, rain: 0.8, lamp: 1.0, sparse: 0 },
  waiting:   { speed: 0, wipe: -1, stroke: 0.6, rain: 1.0, lamp: 1.0, sparse: 0, blink: 'H' },
  absent:    { speed: 0, wipe: -1, stroke: 0.6, rain: 0.7, lamp: 0.4, sparse: 1 },
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
  try { const j = await (await fetch('state.json', { cache: 'no-store' })).json(); applyState(j.state, j.sessions); } catch { /* 沒有 bridge */ }
}
setInterval(poll, 1000); poll();

// ── 隧道段落：in（在隧道裡，出口一直在前方 EXIT_D）→ exiting（出口固定，開過去）→ out（露天）→ 進下一條 ──
const road = { off: 0, sIn: -1e5, sOut: EXIT_D, mode: 'in' };
let speed = STATES[stateName].speed, prevState = '';
const cur = { rain: 1, lamp: 1, sparse: 0, day: 0 };
function updateRoad(dt) {
  road.off += speed * dt;
  if (road.mode === 'in') {
    road.sOut = Math.max(road.off, road.sIn) + EXIT_D;
    if (stateName === 'finishing' && prevState !== 'finishing' && road.off > road.sIn + 20) road.mode = 'exiting';
  }
  if (road.mode === 'exiting' && road.off > road.sOut + 40) {      // 出口已經在身後：換成下一條隧道的入口
    road.sIn = road.sOut + OUT_LEN; road.mode = 'out';
  }
  if (road.mode === 'out' && road.off > road.sIn) road.mode = 'in';
  if (road.mode === 'out') road.sOut = road.sIn + EXIT_D;
  // 數字不要無限長大（float 精度）：在隧道裡時整段往回挪 48 m 的倍數（所有週期的公倍數）
  if (road.mode === 'in' && road.off > 9600 && road.off - road.sIn > 9600) {
    const k = Math.floor(road.off / 48) * 48 - 480;
    road.off -= k; road.sIn -= k; road.sOut -= k;
  }
}

// 雨刷：每支照「停→上掃→下掃→停」循環；間歇時間跟著狀態
const wip = { phase: 0, waitLeft: 0.5 };
function updateWipers(dt, now) {
  const st = STATES[stateName];
  let t = 0;                                       // 0 停放 → 1 最高
  if (wip.phase > 0) {
    wip.phase += dt / (2 * st.stroke);
    if (wip.phase >= 1) { wip.phase = 0; wip.waitLeft = st.wipe; }
    else t = Math.sin(Math.PI * wip.phase);
  } else if (st.wipe >= 0) {
    wip.waitLeft -= dt;
    if (wip.waitLeft <= 0) wip.phase = 1e-4;
  }
  WIPERS.forEach((w, i) => glass.wipe(i, (w.a0 + (w.a1 - w.a0) * t) * D2R, now));
}

let paused = false, last = performance.now(), lastDraw = 0, clock = num('t', 0);
window.wpPause = (on) => { paused = !!on; };
document.addEventListener('visibilitychange', () => { last = performance.now(); });

function step(dt) {
  const st = STATES[stateName] || STATES.idle;
  const k = 1 - Math.exp(-dt / 1.5);
  speed += (st.speed - speed) * (1 - Math.exp(-dt / (st.speed < speed ? 2.2 : 3.5)));
  cur.rain += (st.rain - cur.rain) * k; cur.lamp += (st.lamp - cur.lamp) * k; cur.sparse += (st.sparse - cur.sparse) * k;
  const h = clockHours(), day = h >= 7 && h < 17 ? 1 : h >= 6 && h < 7 ? h - 6 : h >= 17 && h < 18 ? 18 - h : 0;
  cur.day += (day - cur.day) * k;
  if (!FREEZE) updateRoad(dt);
  clock += dt;
  updateWipers(FREEZE ? 0 : dt, clock);
  prevState = stateName;

  U.uOff.value = road.off; U.uSIn.value = road.sIn; U.uSOut.value = road.sOut; U.uTime.value = clock;
  U.uLampK.value = cur.lamp; U.uSparse.value = cur.sparse; U.uDay.value = cur.day; U.uRainK.value = cur.rain;
  // 彎道：很慢地左右飄
  U.uBend.value = 0.00011 * Math.sin(clock / 47) - 0.00006; U.uHill.value = 0.00003 * Math.sin(clock / 61 + 1);
  const outside = !(road.off >= road.sIn && road.off <= road.sOut);
  // 頭頂燈掠過：離最近一盞燈越近，打進車內的橘光越強
  const P = LAMP_A.P, rel = ((road.off - LAMP_A.ph) % P + P) % P;                   // 剛經過的那盞在身後 rel 公尺
  const ahead = P - rel;
  const flash = outside ? 0 : cur.lamp * (Math.exp(-((ahead - 1.6) ** 2) / 2.2) + 0.6 * Math.exp(-(rel ** 2) / 1.2));
  cabin.U.uFlash.value = flash;
  glass.U.uLampFlash.value = flash; glass.U.uRain.value = cur.rain * (outside ? 1.3 : 1);
  glass.U.uFill.value = outside ? 3.5 : 9 / cur.rain;
  const blink = (Math.floor(clock / 0.42) % 2) === 0 ? 1 : 0;
  cabin.U.uBlinkL.value = st.blink ? blink : 0; cabin.U.uBlinkR.value = st.blink === 'H' ? blink : 0;
  cabin.U.uAmb.value.setRGB(0.05, 0.03, 0.016).multiplyScalar(outside ? 0.3 : 0.4 + 0.6 * cur.lamp);
  if (outside) cabin.U.uAmb.value.add(new THREE.Color(0.012, 0.016, 0.03));
}

function draw() { camera.updateMatrixWorld(); glass.render(scene, camera, cabin.scene, clock); }

function frame(now) {
  requestAnimationFrame(frame);
  if (paused || document.hidden) { last = now; return; }
  if (now - lastDraw < 1000 / 30 - 2) return;
  lastDraw = now;
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  step(dt); draw();
}
requestAnimationFrame(frame);

window.theme = {
  CAM, camera, renderer, scene, U, glass, cabin, road, STATES, PARAMS: STATES, CONFIG,
  applyState, setSessions: (a) => { sessions = a || []; }, requestState: () => stateName, setState: (n) => { stateName = n; },
  // 背景分頁 rAF 不跑：手動推進
  tick(sec, fps = 30) { for (let i = 0; i < sec * fps; i++) step(1 / fps); draw(); },
  draw,
};
// 開發用：以 1920×1080 算一張存到 docs/neon-tunnel/shots/<name>（要用 devserver.py 開）
window.theme.shot = async (name = 'shot.jpg') => {
  const pr = renderer.getPixelRatio(); renderer.setPixelRatio(1); renderer.setSize(1920, 1080, false);
  camera.aspect = 16 / 9; camera.updateProjectionMatrix(); glass.resize(); draw();
  const blob = await new Promise((ok) => renderer.domElement.toBlob(ok, name.endsWith('.png') ? 'image/png' : 'image/jpeg', 0.9));
  renderer.setPixelRatio(pr); resize();
  return (await fetch('/_save/' + name, { method: 'PUT', body: blob })).status;
};
