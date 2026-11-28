// 夢境之門 · 步驟 3 擺景（灰模，只看構圖）
// 座標：步道沿 −Z 往遠處，x＝0 是步道（門框）中線，y＝0 是步道面。鏡頭與女孩固定，門框往 +Z 移、過了鏡頭回收到最遠處。
// 網址參數：?freeze=1（停住、門照目標圖擺）&ids=1（分層遮罩）&ref=0.5（疊目標圖）；擺景參數見 P。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const Q = new URLSearchParams(location.search);
const num = (k, d) => (Q.has(k) ? parseFloat(Q.get(k)) : d);
const IDS = Q.has('ids'), FREEZE = Q.has('freeze');

// ── 擺景參數（公尺／度）──
const P = {
  fov: num('fov', 50), camX: num('camx', 0.64), camH: num('camh', 1.52), yaw: num('yaw', 5.5), pitch: num('pitch', -0.2),
  ow: num('ow', 3.25), ph: num('ph', 3.2), post: num('post', 0.3), beam: num('beam', 0.36), over: num('over', 0.35),
  z1: num('z1', 6.05), sp: num('sp', 5.2), n: 18,
  open: num('open', 80),                                    // 第一扇門的開門角度（往遠處開）
  wl: num('wl', -2.15), wr: num('wr', 2.15), nearR: num('nearr', 6.6), nearZ: num('nearz', 2.2), // 步道兩緣；近處右側平台
  gx: num('gx', -0.79), gz: num('gz', 4.78), gh: num('gh', 1.5),
  nz: num('nz', 1.0), nl: num('nl', -0.51), nr: num('nr', 0.832), nw: num('nw', 1.6), // 近景滑門：深度、左右內緣（相對鏡頭）
  sx: num('sx', -1.55), sy: num('sy', 2.35), sz: num('sz', 2.6), ss: num('ss', 1.9),  // 櫻花枝貼片
};

const renderer = new THREE.WebGLRenderer({ antialias: !IDS, preserveDrawingBuffer: Q.has('shot') });
renderer.setPixelRatio(num('pr', 0.6));
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(IDS ? '#000' : '#a9c6ea');
if (!IDS) scene.fog = new THREE.Fog('#cfdcef', 40, 140);

const camera = new THREE.PerspectiveCamera(P.fov, 16 / 9, 0.05, 2000);
camera.rotation.order = 'YXZ';
camera.position.set(P.camX, P.camH, 0);
camera.rotation.set(THREE.MathUtils.degToRad(P.pitch), THREE.MathUtils.degToRad(-P.yaw), 0);

scene.add(new THREE.HemisphereLight('#eaf2ff', '#c8b8a0', 1.6));
const sun = new THREE.DirectionalLight('#ffe2b0', 2.2); sun.position.set(-20, 30, -40); scene.add(sun);

// 分層遮罩色：近景紅、女孩黃、門綠、步道藍、天空黑
const ID = { near: '#ff0000', girl: '#ffff00', door: '#00ff00', walk: '#0000ff' };
const mat = (c, layer) => IDS ? new THREE.MeshBasicMaterial({ color: ID[layer] }) : new THREE.MeshLambertMaterial({ color: c });
const M = {
  walk: mat('#c9c2b6', 'walk'), frame: mat('#9a8068', 'door'), leaf: mat('#b89a78', 'door'),
  girl: mat('#c06850', 'girl'), near: mat('#8a6a50', 'near'), portal: IDS ? mat(0, 'door') : new THREE.MeshBasicMaterial({ color: '#bfe3ff' }),
};

// ── 步道：一條長板＋近處右側平台（目標圖右下的步道比門框寬）──
{
  const L = P.z1 + P.sp * P.n + 20;
  const g = new THREE.BoxGeometry(P.wr - P.wl, 0.4, L); g.translate((P.wl + P.wr) / 2, -0.2, 2 - L / 2);
  scene.add(new THREE.Mesh(g, M.walk));
  const s = new THREE.Shape(); // 右側平台：從門框右緣往外擴，越近越寬
  s.moveTo(P.wr, -P.z1); s.lineTo(P.wr, 3); s.lineTo(P.wr + P.nearR, 3); s.lineTo(P.wr + P.nearR * 0.15, -P.nearZ);
  const pg = new THREE.ExtrudeGeometry(s, { depth: 0.4, bevelEnabled: false }); pg.rotateX(Math.PI / 2); // 形狀平面 xy → xz（y 往下長）
  const pm = new THREE.Mesh(pg, M.walk); scene.add(pm);
}

// ── 門：門框（Tripo 兩款，載入前先用方塊）＋兩片往遠處開的門板（方塊＋正面貼圖，樞紐在門柱內緣）＋門後世界的入口面 ──
const rnd = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
const FRAME_H = P.ph + P.beam;                                   // 門框總高
const LEAVES = ['shoji', 'plank', 'vault', 'stained', 'painted', 'red'];
const texL = new THREE.TextureLoader();
const leafMats = LEAVES.map((n) => {
  if (IDS) return M.leaf;
  const t = texL.load(`tex/leaf_${n}.webp`); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const face = new THREE.MeshLambertMaterial({ map: t }), edge = new THREE.MeshLambertMaterial({ color: '#6b5340' });
  return [edge, edge, edge, edge, face, face];                   // BoxGeometry 的六面：±x ±y ±z
});
const leafG = new THREE.BoxGeometry(P.ow / 2, P.ph - 0.05, 0.07);
function makeDoor() {
  const g = new THREE.Group(), half = P.ow / 2;
  const box = new THREE.Group();                                  // 模型載入前的方塊門框
  const post = new THREE.BoxGeometry(P.post, P.ph, P.post);
  for (const s of [-1, 1]) { const m = new THREE.Mesh(post, M.frame); m.position.set(s * (half + P.post / 2), P.ph / 2, 0); box.add(m); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(P.ow + 2 * P.post + 2 * P.over, P.beam, P.post * 1.3), M.frame);
  beam.position.y = P.ph + P.beam / 2; box.add(beam); g.add(box); g.userData.frame = box;
  g.userData.leaves = [-1, 1].map((s) => {
    const pivot = new THREE.Group(); pivot.position.set(s * half, 0, 0);
    const m = new THREE.Mesh(leafG, M.leaf); m.position.set(-s * P.ow / 4, (P.ph - 0.05) / 2, 0); pivot.add(m); g.add(pivot);
    pivot.userData.s = s; pivot.userData.mesh = m; return pivot;
  });
  const portal = new THREE.Mesh(new THREE.PlaneGeometry(P.ow, P.ph), M.portal); portal.position.set(0, P.ph / 2, -0.02);
  portal.visible = false; g.add(portal); g.userData.portal = portal;
  return g;
}
function setOpen(door, deg) {
  for (const p of door.userData.leaves) p.rotation.y = -p.userData.s * THREE.MathUtils.degToRad(deg); // 往 −Z（遠處）開
}
// 門框模型：量出兩根門柱的內緣距離，x 方向縮放到開口＝P.ow、高度＝FRAME_H
const frameModels = [];
function fitFrame(root) {
  root.updateMatrixWorld(true);
  const xs = [], v = new THREE.Vector3(), box = new THREE.Box3().setFromObject(root);
  root.traverse((o) => { if (!o.isMesh) return; const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); if (Math.abs(v.y - box.max.y * 0.45) < box.max.y * 0.2) xs.push(v.x); } });
  const inner = Math.min(...xs.filter((x) => x > 0)) - Math.max(...xs.filter((x) => x < 0));
  const sy = FRAME_H / (box.max.y - box.min.y), sx = P.ow / inner;
  const g = new THREE.Group(); root.scale.set(sx, sy, sy); g.add(root);
  root.traverse((o) => { if (o.isMesh) { o.material = IDS ? M.frame : o.material; if (!IDS) { o.material.transparent = false; o.material.depthWrite = true; } } });
  return g;
}
const doors = [];
for (let i = 0; i < P.n; i++) { const d = makeDoor(); doors.push(d); scene.add(d); }
// 第 i 扇門在第 k 輪的長相（freeze 時第 0、1 扇照目標圖：木框＋格子窗／櫻花木門、鐵框＋保險庫門）
function styleOf(i, k) {
  if (FREEZE && i === 0) return { frame: 0, l: 0, r: 1 };
  if (FREEZE && i === 1) return { frame: 1, l: 2, r: 2 };
  return { frame: rnd(i, k + 5) < 0.6 ? 0 : 1, l: Math.floor(rnd(i, k + 9) * 6), r: Math.floor(rnd(i, k + 13) * 6) };
}
function dress(d, st) {
  if (frameModels.length && d.userData.frameType !== st.frame) {
    d.remove(d.userData.frame); d.userData.frame = frameModels[st.frame].clone(); d.add(d.userData.frame); d.userData.frameType = st.frame;
  }
  const [L, R] = d.userData.leaves; L.userData.mesh.material = leafMats[st.l]; R.userData.mesh.material = leafMats[st.r];
}
function layoutDoors(offset) {
  doors.forEach((d, i) => {
    d.position.z = -(P.z1 + i * P.sp) + offset;
    const k = Math.floor((offset - (P.z1 + i * P.sp)) / (P.sp * P.n)); // 第幾輪（回收時換門的長相與開法）
    if (d.userData.k !== k || d.userData.frameType === undefined && frameModels.length) { dress(d, styleOf(i, k)); d.userData.k = k; }
    setOpen(d, i === 0 && FREEZE ? P.open : 25 + 60 * rnd(i, k));
  });
}
const loader = new GLTFLoader();
const ready = Promise.all(['frame_wood', 'frame_iron'].map((n) => loader.loadAsync(`models/${n}.glb`))).then((gl) => {
  gl.forEach((g) => frameModels.push(fitFrame(g.scene)));
  doors.forEach((d) => { d.userData.k = null; d.userData.frameType = undefined; });
});

// ── 女孩：Tripo 生成＋Mixamo 骨架、Tripo 內建 walk（原地）；背對鏡頭往 −Z 走 ──
let mixer = null;
const girlReady = loader.loadAsync('models/girl.glb').then((g) => {
  const root = g.scene; root.rotation.y = Math.PI; root.position.set(P.gx, 0, -P.gz); root.scale.setScalar(P.gh / 1.5);
  root.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; if (IDS) o.material = M.girl; else { o.material.transparent = false; o.material.depthWrite = true; } } });
  scene.add(root);
  mixer = new THREE.AnimationMixer(root); const act = mixer.clipAction(g.animations[0]); act.play();
  if (FREEZE) mixer.setTime(num('gt', 0.6));
});

// ── 近景：剛穿過的那扇門的滑門（往兩側滑開，貼著鏡頭）＋櫻花枝 ──
{
  const H = 6;
  const l = new THREE.Mesh(new THREE.BoxGeometry(P.nw, H, 0.06), M.near); l.position.set(P.camX + P.nl * P.nz - P.nw / 2, P.camH, -P.nz);
  const r = new THREE.Mesh(new THREE.BoxGeometry(P.nw, H, 0.06), M.near); r.position.set(P.camX + P.nr * P.nz + P.nw / 2, P.camH, -P.nz);
  scene.add(l, r);
  const tex = new THREE.TextureLoader().load('tex/sakura_branch.webp');
  tex.colorSpace = THREE.SRGBColorSpace;
  const sm = IDS ? new THREE.MeshBasicMaterial({ color: ID.near, alphaMap: tex, alphaTest: 0.5 }) : new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.05, fog: false });
  if (IDS) { tex.colorSpace = THREE.NoColorSpace; } // alphaMap 讀綠色通道 → 用 onBeforeCompile 換成讀 alpha
  if (IDS) sm.onBeforeCompile = (s) => { s.fragmentShader = s.fragmentShader.replace('#include <alphamap_fragment>', 'diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).a;'); };
  const br = new THREE.Mesh(new THREE.PlaneGeometry(P.ss * 2, P.ss), sm);
  br.position.set(P.camX + P.sx, P.camH + P.sy - 1.52, -P.sz); scene.add(br);
}

// 對照：疊目標圖
if (Q.has('ref')) {
  const im = document.createElement('img'); im.src = '../../docs/dream-doors/target.png';
  Object.assign(im.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', opacity: Q.get('ref') || '0.5', pointerEvents: 'none' });
  document.body.appendChild(im);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

let offset = 0, last = performance.now(), lastDraw = 0;
const SPEED = num('speed', 1.3); // 待命：慢步 m/s
function frame(now) {
  requestAnimationFrame(frame);
  if (now - lastDraw < 1000 / 30 - 2) return; lastDraw = now;
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!FREEZE) offset = (offset + SPEED * dt) % (P.sp * P.n * 1000);
  layoutDoors(FREEZE ? 0 : offset % (P.sp * P.n));
  if (mixer && !FREEZE) mixer.update(dt * SPEED / 1.3);
  renderer.render(scene, camera);
}
layoutDoors(0);
requestAnimationFrame(frame);

window.theme = { P, camera, scene, renderer, doors, get mixer() { return mixer; }, ready: Promise.all([ready, girlReady]), draw: () => { layoutDoors(FREEZE ? 0 : offset % (P.sp * P.n)); renderer.render(scene, camera); } };
window.theme.mask = (w = 480, h = 270) => {
  const rt = new THREE.WebGLRenderTarget(w, h); const a = camera.aspect; camera.aspect = 16 / 9; camera.updateProjectionMatrix();
  renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null);
  const px = new Uint8Array(w * h * 4); renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
  camera.aspect = a; camera.updateProjectionMatrix();
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'), im = g.createImageData(w, h);
  for (let y = 0; y < h; y++) im.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  g.putImageData(im, 0, 0); return cv.toDataURL('image/png');
};
