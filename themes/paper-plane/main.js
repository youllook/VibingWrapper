// 紙飛機穿城 · 步驟 3 擺景（程式白模＋平光，只看構圖）
// 網址參數：?t=秒（固定時間）&freeze=1  ?ref=0.5（疊目標圖對照，數字＝不透明度）
//          ?yaw ?pitch ?roll ?fov ?cx ?cy（鏡頭微調，度／公尺）  ?speed=m/s
import * as THREE from 'three';
import { SEG, FAR_SEG, Strip, buildSegment, buildFarSegment } from './city.js';
import { makePaperPlane } from './plane.js';

const Q = new URLSearchParams(location.search);
const num = (k, d) => (Q.has(k) ? parseFloat(Q.get(k)) : d);

const CAM = {
  yaw: num('yaw', -20), pitch: num('pitch', -9), roll: num('roll', 0), fov: num('fov', 60),
  x: num('cx', -4), y: num('cy', 60),
};
const SPEED = num('speed', 14);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: Q.has('shot') });
renderer.setPixelRatio(num('pr', 0.6));
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const SKY = new THREE.Color('#eceef0');
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, num('fnear', 60), num('ffar', 1400));

const camera = new THREE.PerspectiveCamera(CAM.fov, 16 / 9, 0.5, 4000);
camera.rotation.order = 'YXZ';
camera.position.set(CAM.x, CAM.y, 0);
camera.rotation.set(THREE.MathUtils.degToRad(CAM.pitch), THREE.MathUtils.degToRad(-CAM.yaw), THREE.MathUtils.degToRad(CAM.roll));
scene.add(camera);

// 平光：半球光＋右上側光（午後）
scene.add(new THREE.HemisphereLight('#ffffff', '#b8b8b8', 1.2));
const sun = new THREE.DirectionalLight('#ffffff', 2.0);
sun.position.set(420, 520, 260); scene.add(sun);

const white = new THREE.MeshLambertMaterial({ color: 0xffffff });
const near = new Strip(scene, white, { cap: 700, build: buildSegment, len: SEG, behind: 70, ahead: 1300 });
const far = new Strip(scene, white, { cap: 200, build: buildFarSegment, len: FAR_SEG, behind: 300, ahead: 2400 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 6000).rotateX(-Math.PI / 2), white);
ground.position.z = -2500; scene.add(ground);

// 紙飛機：鏡頭前方，畫面左中；機頭朝消失點方向、往右傾
const plane = makePaperPlane(new THREE.MeshLambertMaterial({ color: '#a9c8e6', side: THREE.DoubleSide }));
// 位置用畫面座標（0–1，左上原點）＋離鏡頭距離決定，鏡頭怎麼調都留在構圖上同一點
const PLANE = { u: num('pu', 0.40), v: num('pv', 0.60), d: num('pd', 16), s: num('ps', 3.0), yaw: num('pyaw', 35), bank: num('pbank', 10), pitch: num('ppitch', 14) };
camera.updateMatrixWorld(true);
const PLANE_POS = new THREE.Vector3(PLANE.u * 2 - 1, 1 - PLANE.v * 2, 0.5).unproject(camera).sub(camera.position).normalize().multiplyScalar(PLANE.d).add(camera.position);
plane.scale.setScalar(PLANE.s);
plane.rotation.order = 'YXZ';
scene.add(plane);

// ?ref：疊目標圖
if (Q.has('ref')) {
  const img = document.createElement('img');
  img.src = '../../docs/paper-plane/target.png';
  Object.assign(img.style, { position: 'fixed', inset: 0, width: '100vw', height: '100vh', opacity: num('ref', 0.5), pointerEvents: 'none' });
  document.body.appendChild(img);
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

let paused = false;
window.wpPause = (on) => { paused = !!on; };
const t0 = performance.now();
let s = 0, last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (paused || document.hidden) { last = now; return; }
  acc += now - last; last = now;
  if (acc < 1000 / 30 - 2) return;          // 30 fps 上限
  const dt = Math.min(acc / 1000, 0.1); acc = 0;
  step(now, dt);
}
function step(now, dt) {
  const t = Q.has('t') ? num('t', 0) + (Q.has('freeze') ? 0 : (now - t0) / 1000) : (now - t0) / 1000;
  s = t * SPEED;
  near.update(s); far.update(s);
  plane.position.copy(PLANE_POS); plane.position.y += 0.25 * Math.sin(t * 1.3);
  plane.rotation.set(THREE.MathUtils.degToRad(PLANE.pitch), THREE.MathUtils.degToRad(-PLANE.yaw), THREE.MathUtils.degToRad(-PLANE.bank + 2 * Math.sin(t * 0.9)));
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

window.theme = {
  CAM, PLANE, scene, camera, renderer,
  shot: async (name = 'shot.png') => {
    renderer.setPixelRatio(1); renderer.setSize(1920, 1080, false); camera.aspect = 16 / 9; camera.updateProjectionMatrix();
    step(performance.now(), 0);
    const blob = await new Promise((r) => renderer.domElement.toBlob(r, name.endsWith('.jpg') ? 'image/jpeg' : 'image/png', 0.9));
    const r = await fetch('/_save/' + name, { method: 'PUT', body: blob }); return r.status;
  },
};
