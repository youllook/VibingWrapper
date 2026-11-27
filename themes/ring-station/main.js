// 環形太空站 · 步驟 3 擺景（Tripo 模型＋平光，只看構圖）
// 網址參數：?t=秒（固定時間）&freeze=1  ?ref=0.5（疊目標圖對照，數字＝不透明度）
//          ?yaw ?pitch ?roll ?fov ?cx ?cy（鏡頭微調，度／公尺）
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { applyMaterials } from './materials.js';
import { makeMotionBlur } from './post.js';
import { installHaze, makeSun, addWindowGlow, addProxyGlow, NIGHT, AXIAL } from './atmos.js';
import { R, X0, X1, DECK_H, SUN_X, LAND_HALF, landAt, shell, hab, standMatrix, rng } from './ring.js';

const Q = new URLSearchParams(location.search);
const num = (k, d) => (Q.has(k) ? parseFloat(Q.get(k)) : d);
const IDS = Q.has('ids');

// ── 鏡頭（對目標圖調）──
const CAM = {
  yaw: num('yaw', 46),     // 從「正前方 −Z」往右轉幾度（往 +X 軸向）
  pitch: num('pitch', 5),
  roll: num('roll', 0.5),
  fov: num('fov', 79),     // 垂直視角
  x: num('cx', 1.4), y: DECK_H + num('cy', 3.2),
};
const SPEED = num('speed', 45);           // 待命時的列車速度 m/s（各狀態另有目標速度）
const RT = R - DECK_H;                    // 軌道半徑
const OMEGA = SPEED / RT;                 // ?t= 換算角度用的基準角速度

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: Q.has('shot') });
renderer.setPixelRatio(num('pr', 0.6));                       // 規格：半解析度
renderer.outputColorSpace = THREE.SRGBColorSpace;
// 色調映射在每個材質裡強制做（含畫到動態模糊的 render target 時），霧才會像直接畫到螢幕一樣疊在色調映射之後
if (!IDS) {
  renderer.toneMapping = THREE.NoToneMapping; renderer.toneMappingExposure = num('exp', 1.05);
  // 渲染器關掉色調映射時 three.js 不會宣告 ACES 函式，所以這裡把同一個 ACES Filmic 公式直接寫進 main()
  THREE.ShaderChunk.tonemapping_fragment = `#ifndef RS_NO_TM
  { vec3 c = gl_FragColor.rgb * (${num('exp', 1.05).toFixed(3)} / 0.6);
    mat3 aIn = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
    mat3 aOut = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
    c = aIn * c; c = (c * (c + 0.0245786) - 0.000090537) / (c * (0.983729 * c + 0.4329510) + 0.238081); c = aOut * c;
    gl_FragColor.rgb = clamp(c, 0., 1.); }
#endif`;
  // 同理：sRGB 編碼也一律在 shader 裡做（浮點 render target 不會幫你編碼），畫到螢幕或 render target 結果一樣
  THREE.ShaderChunk.colorspace_fragment = 'gl_FragColor = sRGBTransferOETF( gl_FragColor );';
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;   // 已經在 shader 編過，別再編一次
}
renderer.localClippingEnabled = IDS;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const FOG = new THREE.Color('#cfe3dc');
scene.background = IDS ? new THREE.Color('#000') : FOG;
// 非遮罩模式用自訂大氣（atmos.js）：Fog 的 near＝密度、far＝往太陽方向的散射強度
scene.fog = IDS ? new THREE.Fog('#000', num('idfar', 1500) - 1, num('idfar', 1500)) : new THREE.Fog(FOG, num('fog', 0.00026), 1);
if (!IDS) scene.background = FOG.clone();

const camera = new THREE.PerspectiveCamera(CAM.fov, 16 / 9, 0.1, 30000);
camera.rotation.order = 'YXZ';
camera.position.set(CAM.x, CAM.y, 0);
camera.rotation.set(THREE.MathUtils.degToRad(CAM.pitch), THREE.MathUtils.degToRad(-CAM.yaw), THREE.MathUtils.degToRad(CAM.roll));
scene.add(camera);

// 太陽位置：氛圍優先，擺在目標圖的位置（世界固定、不隨棲地轉），不放在軸上
const SUN_POS = (() => {
  const az = THREE.MathUtils.degToRad(num('saz', 28)), el = THREE.MathUtils.degToRad(num('sel', 31)), D = 1400;
  return new THREE.Vector3(Math.sin(az) * Math.cos(el) * D, CAM.y + Math.sin(el) * D, -Math.cos(az) * Math.cos(el) * D);
})();
camera.updateMatrixWorld(true);
if (!IDS) installHaze(SUN_POS.clone().sub(camera.position).transformDirection(camera.matrixWorldInverse), new THREE.Color('#ffd58e'));

// 光：玉色天光＋暖地面反光的半球光、淡金色日光
const hemi = new THREE.HemisphereLight('#dff0e8', '#c9b89a', 1.25);
const sunLight = new THREE.DirectionalLight('#ffdca6', 2.4);
sunLight.position.copy(SUN_POS); sunLight.target.position.set(0, 0, 0);
scene.add(hemi, sunLight, sunLight.target);

// ?ids=1：分層遮罩（驗收用）——近景綠、城市藍、天空黑、鏡頭層紅
const LAYER = { near: '#00ff00', city: '#0000ff', sky: '#000000' };
// 城市只算轉軸以下那半圈（往上翹還沒倒掛的部分）；軸以上的倒掛城市歸遠景天空層
const ABOVE_AXIS = [new THREE.Plane(new THREE.Vector3(0, -1, 0), R)];
const mat = (c, layer) => IDS ? new THREE.MeshBasicMaterial({ color: LAYER[layer], fog: layer === 'city', clippingPlanes: layer === 'city' ? ABOVE_AXIS : null }) : new THREE.MeshLambertMaterial({ color: c });
const M = {
  floor: mat('#b9c7b4', 'city'), deck: mat('#9a9a94', 'near'), rail: mat('#6f6d68', 'near'), truss: mat('#d6d0c2', 'near'),
  bld: mat('#ece6d8', 'city'), dome: mat('#c9ccc8', 'city'), glass: mat('#a9cbc2', 'city'), tree: mat('#7fa36a', 'city'), water: mat('#8fb6c0', 'city'),
  rib: mat('#dfe6df', 'sky'), window: mat('#e8f2ee', 'sky'), worker: mat('#f4f4f0', 'near'), panel: mat('#8d8f8a', 'near'),
  lamp: new THREE.MeshBasicMaterial({ color: IDS ? LAYER.near : '#fff2c8' }),
};

// 玻璃窗帶：近看是窗外的星空（隨太空站自轉掃過），遠處被大氣霧成亮色，跟目標圖的天空一致
const SPIN = num('spin', 0.07);                 // 太空站自轉 rad/s（√(g/R) ≈ 0.07）
if (!IDS) M.window = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  uniforms: { uAng: { value: 0 }, uHaze: { value: FOG }, uFade: { value: new THREE.Vector2(num('wnear', 700), num('wfar', 2600)) } },
  vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: /* glsl */`
    varying vec3 vW; uniform float uAng; uniform vec3 uHaze; uniform vec2 uFade;
    float h31(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
    float stars(vec3 d, float sc, float th){
      vec3 p = d * sc, c = floor(p), f = fract(p);
      float h = h31(c); if (h < th) return 0.;
      vec3 o = vec3(h31(c + 7.1), h31(c + 13.7), h31(c + 29.3)) * 0.7 + 0.15;
      return smoothstep(0.13, 0.0, length(f - o)) * (0.35 + 0.65 * (h - th) / (1. - th));
    }
    void main(){
      vec3 v = vW - cameraPosition; float dist = length(v); vec3 d = v / dist;
      float c = cos(uAng), s = sin(uAng); d = vec3(d.x, c*d.y - s*d.z, s*d.y + c*d.z);
      float st = stars(d, 90., 0.93) * 2.2 + stars(d, 240., 0.94) * 1.1 + stars(d, 600., 0.95) * 0.6;
      vec3 space = vec3(0.002, 0.004, 0.012) + vec3(0.02, 0.01, 0.035) * pow(max(0., 1. - abs(d.y + 0.2)), 6.);
      vec3 col = space + vec3(0.9, 0.95, 1.) * st;
      col += vec3(0.010, 0.016, 0.014);                            // 玻璃本身一點綠灰
      gl_FragColor = vec4(col, 1.);
      #include <colorspace_fragment>
      // 霧跟其他材質一樣在編碼之後才混（atmos.js 的霧 chunk 也是），遠處窗帶才會跟霧同色
      gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, smoothstep(uFade.x, uFade.y, dist));
    }`,
});
for (const k of ['floor', 'window', 'rib', 'water', 'deck']) M[k].side = THREE.DoubleSide;
if (!IDS && !Q.has('gray')) applyMaterials(M);

// ── 棲地：整個繞 X 轉 ──
const habitat = new THREE.Group();
habitat.position.set(0, R, 0);
scene.add(habitat);

// 地面：三條陸地帶＋三條玻璃窗帶（窗帶外是星空，灰模先用亮霧色）
{
  const third = Math.PI * 2 / 3;
  for (let k = 0; k < 3; k++) {
    const c = k * third;
    habitat.add(new THREE.Mesh(shell(X0, X1, c - LAND_HALF, c + LAND_HALF, 0, 16, 256), M.floor));
    const w = new THREE.Mesh(shell(X0, X1, c + LAND_HALF, c + third - LAND_HALF, 0, 16, 96), M.window);
    habitat.add(w);
    // 窗帶上沿軸的縱肋（每 120 m 一條，合成一個網格）
    const ribs = [];
    for (let x = X0; x < X1; x += 120) ribs.push(shell(x - 3, x + 3, c + LAND_HALF, c + third - LAND_HALF, 4, 1, 24));
    habitat.add(new THREE.Mesh(mergeGeometries(ribs), M.rib));
  }
}

// 河道：沿圓周的一條水帶（目標圖右側中景的水面）
function band(x0, x1, h, material, seg = 1024) {
  const g = new THREE.CylinderGeometry(R - h, R - h, x1 - x0, seg, 1, true);
  g.rotateZ(Math.PI / 2); g.translate((x0 + x1) / 2, 0, 0);   // 物件空間＝棲地座標（材質用得到）
  const m = new THREE.Mesh(g, material); habitat.add(m); return m;
}
for (let k = 0; k < 3; k++) for (const [a, b] of [[620, 760], [2600, 2760]]) {
  const c = k * Math.PI * 2 / 3, m = new THREE.Mesh(shell(a, b, c - LAND_HALF, c + LAND_HALF, 0.5, 2, 256), M.water); habitat.add(m);
}

// 高架軌道：橋面（x −6…+8）、兩組軌道、枕木
band(-6, 9.2, DECK_H, M.deck, 4096);
{
  const rails = [0, 3.8].flatMap((c) => [c - 0.72, c + 0.72]);
  for (const x of rails) {
    const g = new THREE.TorusGeometry(R - DECK_H - 0.18, 0.09, 4, 8192);
    g.rotateY(Math.PI / 2);
    const m = new THREE.Mesh(g, M.rail); m.position.x = x; habitat.add(m);
  }
  const SP = 0.7, N = Math.floor((2 * Math.PI * (R - DECK_H)) / SP);
  const tie = new THREE.BoxGeometry(2.4, 0.16, 0.24);
  for (const c of [0, 3.8]) {
    const im = new THREE.InstancedMesh(tie, M.rail, N), m4 = new THREE.Matrix4();
    for (let i = 0; i < N; i++) im.setMatrixAt(i, standMatrix(c, (i / N) * Math.PI * 2, DECK_H + 0.08, 0, 1, 1, 1, m4));
    habitat.add(im);
  }
}

// 護欄桁架（x = +7.6）：8 m 一節，上下弦＋X 斜撐＋立柱，每節中間一盞維修燈
{
  const L = 8, N = Math.round((2 * Math.PI * (R - DECK_H)) / L);
  const parts = [];
  const box = (w, h, d, x, y, z, rx = 0) => { const b = new THREE.BoxGeometry(w, h, d); if (rx) b.rotateX(rx); b.translate(x, y, z); parts.push(b); };
  box(0.45, 0.5, L, 0, 2.3, 0);           // 上弦
  box(0.45, 0.4, L, 0, 0.2, 0);           // 下弦
  box(0.4, 2.6, 0.45, 0, 1.25, -L / 2);    // 立柱
  const diag = Math.atan2(2.0, L / 2);
  box(0.3, 0.32, Math.hypot(2.0, L / 2), 0, 1.25, -L / 4, diag);
  box(0.3, 0.32, Math.hypot(2.0, L / 2), 0, 1.25, -L / 4, -diag);
  box(0.3, 0.32, Math.hypot(2.0, L / 2), 0, 1.25, L / 4, diag);
  box(0.3, 0.32, Math.hypot(2.0, L / 2), 0, 1.25, L / 4, -diag);
  box(0.12, 0.12, L, -0.35, 1.0, 0);       // 內側扶手管
  box(0.12, 0.46, 1.0, -0.24, 1.55, 0);     // 維修燈燈座（燈罩比它略凸）
  const trussG = mergeGeometries(parts);
  const lampG = new THREE.BoxGeometry(0.06, 0.3, 0.78).translate(-0.31, 1.55, 0);
  const tr = new THREE.InstancedMesh(trussG, M.truss, N), lp = new THREE.InstancedMesh(lampG, M.lamp, N), m4 = new THREE.Matrix4();
  for (let i = 0; i < N; i++) { standMatrix(8.6, (i / N) * Math.PI * 2, DECK_H, 0, 1, 1, 1, m4); tr.setMatrixAt(i, m4); lp.setMatrixAt(i, m4); }
  habitat.add(tr, lp);

  // 門形架：可見軌道左側一排立柱，橫梁往左跨過我們這條線（目標圖左側往遠處排的架子）
  const gantry = mergeGeometries([
    new THREE.BoxGeometry(0.6, 8, 0.6).translate(num('gpx', 0.4), 4, 0),
    new THREE.BoxGeometry(7, 0.8, 0.7).translate(num('gpx', 0.4) - 3.2, 8, 0),
    new THREE.BoxGeometry(0.35, 3.2, 0.35).rotateZ(0.8).translate(num('gpx', 0.4) - 1.0, 6.7, 0),
  ]);
  const GN = Math.round((2 * Math.PI * (R - DECK_H)) / num('gsp', 30));
  const ga = new THREE.InstancedMesh(gantry, M.truss, GN);
  for (let i = 0; i < GN; i++) ga.setMatrixAt(i, standMatrix(0, (i / GN) * Math.PI * 2 + 0.004, DECK_H, 0, 1, 1, 1, m4));
  habitat.add(ga);

}

// 城市：Tripo 生成的 7 款建築與樹，instancing 鋪滿三條陸地帶（前密後疏、越遠越大）
// 每款兩個 InstancedMesh（近＝1 萬面、遠＝數百面），LOD 每 12 格依「轉到哪裡」重新分配
const MODELS = ['dome_hall', 'greenhouse', 'round_tower', 'spire_tower', 'terrace_block', 'townhouses', 'tree'];
// 三級 LOD：近＝Tripo 1 萬面、中＝減面版、遠＝程式代理形狀（20–60 面，貼圖平均色）。樹只有近／遠兩級
const NEAR = num('lodnear', 500), MID = num('lodmid', 1500), TREE_NEAR = num('lodtree', 150);
const city = { items: Object.fromEntries(MODELS.map((n) => [n, []])), meshes: {} };
{
  const r = rng(7);
  const put = (n, x, th, yaw, s) => city.items[n].push({ x, th, yaw, s });
  const blocked = (x) => (x > -12 && x < 16) || (x > 615 && x < 765) || (x > 2595 && x < 2765);
  const zone = (xa, xb, n, sMul) => {
    for (let i = 0; i < n; i++) {
      const x = xa + (xb - xa) * r(), th = r() * Math.PI * 2;
      if (blocked(x) || !landAt(th)) continue;
      const k = r(), yaw = Math.floor(r() * 4) * Math.PI / 2 + (r() - 0.5) * 0.2, s = sMul * (0.75 + r() * 0.5);
      if (x > -120 && x < 140) {                       // 高架橋兩側：只放低矮的連棟屋與樹，不高過橋面
        if (k < 0.5) put('townhouses', x, th, yaw, Math.min(s, 0.75)); else for (let j = 0; j < 3; j++) put('tree', x + (r() - 0.5) * 30, th + (r() - 0.5) * 0.01, r() * 6.3, 0.8 + r() * 0.5);
        continue;
      }
      if (k < 0.30) put('terrace_block', x, th, yaw, s);
      else if (k < 0.55) put('townhouses', x, th, yaw, s);
      else if (k < 0.66) put('round_tower', x, th, yaw, s * (0.8 + r() * 0.6));
      else if (k < 0.74) put('spire_tower', x, th, yaw, s * (0.6 + r() * 0.5));
      else if (k < 0.79) put('dome_hall', x, th, yaw, s * 0.7);
      else if (k < 0.86) put('greenhouse', x, th, yaw, s * 0.6);
      else for (let j = 0; j < 5; j++) put('tree', x + (r() - 0.5) * 40, th + (r() - 0.5) * 0.02, r() * 6.3, 0.8 + r() * 0.6);
    }
  };
  zone(16, 600, 2600, 1.0);
  zone(765, 2600, 5000, 1.15);
  zone(2765, 7000, 4200, 1.4);
  zone(7000, 13500, 2400, 1.8);
  zone(-2400, -12, 2400, 1.2);
  for (let i = 0; i < 1800; i++) { const th = r() * Math.PI * 2, x = 18 + r() * 50; if (landAt(th)) put('tree', x, th, r() * 6.3, 0.8 + r() * 0.5); }

  // 主角建築（目標圖 t=0 時看得到的位置）
  put('dome_hall', num('dx', 330), num('dth', 0.045), 0.3, 1.0);
  put('greenhouse', 330, 0.135, Math.PI / 2, 1.0);
  for (const [x, th, sc] of [[560, 0.16, 0.9], [700, 0.25, 1.2], [1250, 0.2, 1.1], [1900, 0.14, 1.3], [2300, 0.22, 1.15]]) put('spire_tower', x, th, 0, sc);
}

// glbprep 會把頂點量化成正規化 int16（靠節點縮放還原），直接烘變換會被夾在 ±1 → 先轉回 float
function dequantize(src) {
  const g = new THREE.BufferGeometry(); g.setIndex(src.index);
  for (const [k, a] of Object.entries(src.attributes)) {
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = a.getComponent(i, c);
    g.setAttribute(k, new THREE.BufferAttribute(out, a.itemSize));
  }
  return g;
}

// GLB → 單一幾何＋材質（把節點變換烘進幾何）
async function loadModel(url) {
  const g = (await new GLTFLoader().loadAsync(url)).scene; g.updateMatrixWorld(true);
  let geo = null, m = null;
  g.traverse((o) => { if (o.isMesh && !geo) { geo = dequantize(o.geometry).applyMatrix4(o.matrixWorld); m = o.material; } });
  if (IDS) m = M.bld; else { m.side = THREE.FrontSide; m.transparent = false; m.metalness = 0; if (/dome|green|tower|terrace|town/.test(url)) addWindowGlow(m); }
  return { geo, m };
}

// 遠景代理形狀：依近模的包圍盒做（原點在底面）
function proxyGeo(n, box) {
  const sz = box.getSize(new THREE.Vector3()), w = sz.x, h = sz.y, d = sz.z, r = Math.max(w, d) / 2;
  const parts = [];
  if (n === 'dome_hall') {
    parts.push(new THREE.CylinderGeometry(r, r, h * 0.45, 10, 1).translate(0, h * 0.225, 0));
    parts.push(new THREE.SphereGeometry(r, 10, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, (h * 0.55) / r, 1).translate(0, h * 0.45, 0));
  } else if (n === 'greenhouse') {
    parts.push(new THREE.CylinderGeometry(d / 2, d / 2, w, 8, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2).scale(1, h / (d / 2), 1));
  } else if (n === 'round_tower') {
    parts.push(new THREE.CylinderGeometry(r, r, h, 8, 1).translate(0, h / 2, 0));
  } else if (n === 'spire_tower') {
    parts.push(new THREE.BoxGeometry(w * 0.8, h * 0.72, d * 0.8).translate(0, h * 0.36, 0));
    parts.push(new THREE.ConeGeometry(r * 0.55, h * 0.28, 4).rotateY(Math.PI / 4).translate(0, h * 0.86, 0));
  } else if (n === 'tree') {
    parts.push(new THREE.IcosahedronGeometry(1, 1).scale(w / 2, h * 0.4, d / 2).translate(0, h * 0.58, 0));
    parts.push(new THREE.CylinderGeometry(w * 0.05, w * 0.07, h * 0.3, 5).translate(0, h * 0.15, 0));
  } else {
    parts.push(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0));
  }
  const g = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  g.computeVertexNormals(); return g;
}
// 貼圖平均色（畫到 4×4 canvas 取平均）
function meanColor(mat) {
  const img = mat.map && mat.map.image; if (!img) return new THREE.Color('#d8cfbe');
  const c = document.createElement('canvas'); c.width = c.height = 4; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 4, 4);
  const d = g.getImageData(0, 0, 4, 4).data; let r = 0, gg = 0, b = 0;
  for (let i = 0; i < 64; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
  return new THREE.Color().setRGB(r / 16 / 255, gg / 16 / 255, b / 16 / 255, THREE.SRGBColorSpace);
}

const cityReady = (async () => {
  await Promise.all(MODELS.map(async (n) => {
    const tree = n === 'tree';
    const [hi, mid] = await Promise.all([loadModel(`models/${n}.glb`), tree ? null : loadModel(`models/${n}_far.glb`)]);
    const list = city.items[n];
    for (const it of list) { it.m = standMatrix(it.x, it.th, 0, it.yaw, it.s, it.s, it.s, new THREE.Matrix4()); it.p = hab(it.x, it.th, 0); }
    hi.geo.computeBoundingBox();
    const pm = IDS ? M.bld : new THREE.MeshLambertMaterial({ color: meanColor(hi.m).multiplyScalar(tree ? 0.85 : 1.25) });
    if (!IDS && !tree) addProxyGlow(pm, R);
    const mk = (geo, mat) => { const m = new THREE.InstancedMesh(geo, mat, list.length); m.count = 0; m.frustumCulled = false; habitat.add(m); return m; };
    city.meshes[n] = { tree, list, H: mk(hi.geo, hi.m), Mi: mid ? mk(mid.geo, mid.m) : null, L: mk(proxyGeo(n, hi.geo.boundingBox), pm) };
  }));
  updateLOD(true);
})();

// 依目前棲地轉角重新分級（每 8 格一次）
function updateLOD(force) {
  const a = habitat.rotation.x, c = Math.cos(a), sn = Math.sin(a), cx = camera.position.x, cy = camera.position.y - R, cz = camera.position.z;
  for (const n in city.meshes) {
    const { tree, H, Mi, L, list } = city.meshes[n]; let h = 0, mi = 0, l = 0;
    const n2 = (tree ? TREE_NEAR : NEAR) ** 2, m2 = MID * MID;
    for (const it of list) {
      const y = it.p.y * c - it.p.z * sn, z = it.p.y * sn + it.p.z * c, dx = it.p.x - cx, dy = y - cy, dz = z - cz, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < n2) H.setMatrixAt(h++, it.m); else if (Mi && d2 < m2) Mi.setMatrixAt(mi++, it.m); else L.setMatrixAt(l++, it.m);
    }
    H.count = h; L.count = l; H.instanceMatrix.needsUpdate = L.instanceMatrix.needsUpdate = true;
    if (Mi) { Mi.count = mi; Mi.instanceMatrix.needsUpdate = true; }
  }
}

// 圓筒結構拱肋：沿軸每 650 m 一圈（從裡面看是繞著太陽的一圈圈同心弧）
for (let x = 800; x < X1; x += 650) {
  const g = new THREE.TorusGeometry(R - 70, 7, 6, 256); g.rotateY(Math.PI / 2);
  const m = new THREE.Mesh(g, M.rib); m.position.x = x; habitat.add(m);
}

// 人造太陽：亮盤＋柔光
let sunGlow = null, sunDisc = null;
{
  const s = new THREE.Mesh(new THREE.SphereGeometry(42, 32, 16), new THREE.MeshBasicMaterial({ color: IDS ? '#000' : '#fffbe8', fog: false, toneMapped: false }));
  s.material.defines = { RS_NO_TM: '' };
  s.position.copy(SUN_POS); scene.add(s);
  if (!IDS) { sunGlow = makeSun(SUN_POS, 820); scene.add(sunGlow); }
  sunDisc = s;
}

// 維修工＋配電箱（偶發事件；t = 0 時出現在右下）：站在軌道與桁架之間，背對鏡頭、手伸進桁架上的配電箱
const WORKER_TH = num('wth', 0.0032);
let worker = null;
(async () => {
  const g = new THREE.Group();
  const [w, p] = await Promise.all([loadModel('models/worker.glb'), loadModel('models/service_panel.glb')]);
  if (IDS) w.m = p.m = M.worker;
  const wm = new THREE.Mesh(w.geo, w.m); wm.rotation.y = num('wyaw', -90) * Math.PI / 180; wm.position.x = -0.55;
  const pm = new THREE.Mesh(p.geo, p.m); pm.rotation.y = num('pyaw', 90) * Math.PI / 180; pm.position.set(num('ppx', 0.45), 0.85, 0); pm.scale.setScalar(0.8);
  g.add(wm, pm);
  g.matrixAutoUpdate = false; standMatrix(8.2, WORKER_TH, DECK_H, 0, 1, 1, 1, g.matrix);
  habitat.add(g); worker = g;
})();

// ── 鏡頭層：車廂右側牆＋圓角車窗（有厚度的窗框）＋玻璃＋前排座椅背（世界固定，不隨棲地轉）──
// 牆面在 x = WX 的平面上，沿車廂（z）延伸；窗口 z∈[ZF, ZR]、y∈[YS, YT]（相對鏡頭高度）
const WIN = { wx: num('wx', 0.55), zr: num('zr', 0.35), zf: -9, ys: num('ys', -2.3), yt: num('yt', 7), rad: 0.22, thick: num('wt', 0.22) };
{
  const WX = CAM.x + WIN.wx, Y0 = CAM.y;
  const hole = new THREE.Path(), r = WIN.rad, a0 = WIN.zf, a1 = WIN.zr, b0 = Y0 + WIN.ys, b1 = Y0 + WIN.yt;
  const shape = new THREE.Shape(), oy0 = b0 - 3, oy1 = b1 + 2;   // 牆面外框永遠比窗口大
  shape.moveTo(a0 - 5, oy0); shape.lineTo(a1 + 4, oy0); shape.lineTo(a1 + 4, oy1); shape.lineTo(a0 - 5, oy1); shape.closePath();
  hole.moveTo(a0 + r, b0); hole.lineTo(a1 - r, b0); hole.quadraticCurveTo(a1, b0, a1, b0 + r); hole.lineTo(a1, b1 - r); hole.quadraticCurveTo(a1, b1, a1 - r, b1);
  hole.lineTo(a0 + r, b1); hole.quadraticCurveTo(a0, b1, a0, b1 - r); hole.lineTo(a0, b0 + r); hole.quadraticCurveTo(a0, b0, a0 + r, b0);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: WIN.thick, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.04, bevelSegments: 3, curveSegments: 10 });
  // 形狀座標 (a, b, c) → 世界 (x = WX + c, y = b, z = a)
  g.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, WX, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));
  g.computeVertexNormals();
  const wallMat = IDS ? new THREE.MeshBasicMaterial({ color: '#ff0000', side: THREE.DoubleSide, fog: false })
    : new THREE.MeshStandardMaterial({ color: '#d8cfbe', roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide, fog: false });
  scene.add(new THREE.Mesh(g, wallMat));

  // 玻璃：窗口裡一片幾乎透明的平面，只帶一點車內反光與擦拭痕（加法混色）
  if (!IDS) {
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(a1 - a0, b1 - b0), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: /* glsl */`varying vec2 vUv;
        #define GLASS_K 1.0
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main(){
          float near = smoothstep(0.55, 1.0, vUv.x);                         // 靠近鏡頭那端反光較強
          float top = smoothstep(0.35, 1.0, vUv.y);
          float wipe = smoothstep(0.02, 0.0, abs(fract(vUv.x * 3.0 + vUv.y * 0.8) - 0.5) - 0.42) * 0.4;   // 斜向擦拭痕
          float dust = step(0.997, h(floor(vUv * vec2(900., 160.)))) * 0.5;
          float a = (0.05 + 0.10 * near * top + 0.04 * wipe) + dust * 0.15;
          gl_FragColor = vec4(vec3(1.0, 0.97, 0.9) * a * GLASS_K, 1.);   // 有動態模糊時是在線性 HDR 裡疊加，要換成線性的量
        }`,
    }));
    glass.position.set(WX + WIN.thick * 0.5, (b0 + b1) / 2, (a0 + a1) / 2); glass.rotation.y = -Math.PI / 2; glass.renderOrder = 5;
    scene.add(glass);
  }

  // 前方隔板／窗柱：擋住消失點左邊（車廂內），邊緣剛好在正前方偏左一點
  const pil = new THREE.Mesh(new THREE.BoxGeometry(3.2, 6, 0.18), wallMat);
  pil.position.set(CAM.x + num('px', -0.23) - 1.6, Y0, num('pz', -1.6)); scene.add(pil);
  const pilEdge = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 6, 12), wallMat);
  pilEdge.position.set(CAM.x + num('px', -0.23), Y0, num('pz', -1.6) + 0.02); scene.add(pilEdge);

  // 前排座椅背（畫面左下）：藍綠布面＋白色頭枕套
  const seatMat = IDS ? wallMat : new THREE.MeshStandardMaterial({ color: '#2f5b5c', roughness: 0.95, fog: false });
  const capMat = IDS ? wallMat : new THREE.MeshStandardMaterial({ color: '#ece6da', roughness: 0.9, fog: false });
  const seat = new THREE.Group();
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.14, 4, 4, 1), seatMat);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.24, 0.16), capMat); cap.position.set(0, 0.28, 0.01);
  seat.add(back, cap);
  seat.position.set(CAM.x + num('sx', -0.15), CAM.y + num('sy', -0.75), num('sz', -1.4)); seat.rotation.y = 0.12;
  scene.add(seat);
}

// ── 對照：疊目標圖 ──
if (Q.has('ref')) {
  const img = document.createElement('img');
  img.src = '../../docs/ring-station/target.png';
  Object.assign(img.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', opacity: Q.get('ref') || '0.5', pointerEvents: 'none' });
  document.body.appendChild(img);
}

// ── 迴圈 ──
// 動態模糊（post.js）：快門 1/45 秒內棲地轉過的角度；?blur=0 關掉
const SHUTTER = num('shutter', 1 / 45);
const mb = !IDS && num('blur', 1) > 0 ? makeMotionBlur(renderer, camera, R) : null;
function draw() { if (mb) mb.render(scene, (speed / RT) * SHUTTER); else renderer.render(scene, camera); }
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  if (mb) mb.resize();
}
addEventListener('resize', resize); resize();

let paused = false, phi = 0, last = performance.now(), frameNo = 0, lastDraw = 0;
const T0 = num('t', 0), FREEZE = Q.has('freeze');
window.wpPause = (on) => { paused = !!on; };
document.addEventListener('visibilitychange', () => { last = performance.now(); });

// ── 狀態 → 氛圍目標值（每秒讀 state.json；?state= 可固定一種）──
// speed m/s、sun 日光強度、glow 太陽散射、fog 霧密度、night 窗燈比例、lamp 桁架燈亮度、haze 霧色
const STATES = {
  idle:      { speed: 45, sun: 2.4, glow: 1.1, fog: 0.00026, night: 0,    lamp: 1.0, haze: '#d2e2d6' },
  thinking:  { speed: 32, sun: 2.0, glow: 1.3, fog: 0.00030, night: 0.35, lamp: 1.2, haze: '#cde0dc' },
  working:   { speed: 95, sun: 2.6, glow: 0.9, fog: 0.00024, night: 0,    lamp: 2.6, haze: '#d3e6df' },
  finishing: { speed: 24, sun: 2.2, glow: 1.7, fog: 0.00030, night: 0.1,  lamp: 1.0, haze: '#e6dcc4' },
  waiting:   { speed: 0,  sun: 2.2, glow: 1.2, fog: 0.00026, night: 0.15, lamp: 1.6, haze: '#d6e2da' },
  absent:    { speed: 30, sun: 0.35, glow: 0.35, fog: 0.00030, night: 1,  lamp: 0.75, haze: '#26313d' },
};
const SKY2STATE = { clear: 'idle', overcast: 'thinking', storm: 'working', clearing: 'finishing', waiting: 'waiting' };
// 時鐘：19–6 點是人造太陽的夜間（18–19、6–7 點漸變；?day=1／?night=1 固定）
// 測試介面（themes/README.md 第 5 點；錄影工具會關掉 polling、固定 clockHours）
const CONFIG = { polling: !Q.has('state'), clockHours: Q.has('day') ? 10.5 : Q.has('night') ? 22 : null };
const clockHours = () => CONFIG.clockHours != null ? CONFIG.clockHours : new Date().getHours() + new Date().getMinutes() / 60;
let stateName = Q.get('state') || 'idle', sessions = [null];
// bridge 的天空狀態＋各 session → 本主題的狀態名
function applyState(sky, sess) {
  if (sess !== undefined) sessions = sess || [];
  const any = (sessions || []).some((x) => x);
  stateName = !any || sky === 'none' ? 'absent' : SKY2STATE[sky] || 'idle';
}
async function poll() {
  if (!CONFIG.polling) return;
  try {
    const j = await (await fetch('state.json', { cache: 'no-store' })).json();
    applyState(j.state, j.sessions);
  } catch { /* 開發時沒有 bridge：維持目前狀態 */ }
}
setInterval(poll, 1000); poll();

const cur = { ...STATES.idle, haze: new THREE.Color(STATES.idle.haze) }, _hz = new THREE.Color(), _night = new THREE.Color('#26313d');
let speed = STATES.idle.speed, prevState = '', workerPlaced = false;
const _hemiDay = new THREE.Color('#dff0e8'), _hemiNight = new THREE.Color('#5b6f8c'), _gndDay = new THREE.Color('#c9b89a'), _gndNight = new THREE.Color('#3a3530');
function applyAtmos(dt) {
  const tgt = STATES[stateName] || STATES.idle;
  const h = clockHours(), clockNight = (h >= 19 || h < 6) ? 1 : h >= 18 ? h - 18 : h < 7 ? 7 - h : 0;
  const night = Math.max(tgt.night, clockNight);
  const k = 1 - Math.exp(-dt / 2.5), ks = 1 - Math.exp(-dt / 4);
  for (const key of ['sun', 'glow', 'fog', 'lamp']) {
    let t = tgt[key];
    if (key === 'sun' || key === 'glow') t = THREE.MathUtils.lerp(t, 0.35, clockNight);
    // 夜裡桁架燈整體壓暗（各狀態仍保留相對亮暗：執行最亮），免得爆成白塊
    if (key === 'lamp') t = THREE.MathUtils.lerp(t, 0.7 + 0.25 * (t - 1), clockNight);
    cur[key] += (t - cur[key]) * k;
  }
  cur.night += (night - cur.night) * k;
  _hz.set(tgt.haze).lerp(_night, clockNight); cur.haze.lerp(_hz, k);
  speed += (tgt.speed - speed) * ks;
  // 思考：太陽微微脈動
  const pulse = stateName === 'thinking' ? 1 + 0.08 * Math.sin(performance.now() / 700) : 1;
  sunLight.intensity = cur.sun * pulse;
  const dayK = THREE.MathUtils.clamp((cur.sun - 0.35) / 2.05, 0, 1);       // 0＝夜、1＝白天
  hemi.intensity = 0.18 + 1.07 * dayK; hemi.color.lerpColors(_hemiNight, _hemiDay, dayK); hemi.groundColor.lerpColors(_gndNight, _gndDay, dayK);
  scene.fog.near = cur.fog; scene.fog.far = cur.glow * pulse; scene.fog.color.copy(cur.haze); scene.background.copy(cur.haze);
  if (M.window.uniforms) M.window.uniforms.uHaze.value.copy(cur.haze);
  if (sunGlow) { sunGlow.material.opacity = Math.min(0.85, 0.2 + 0.4 * cur.glow) * pulse; sunDisc.material.color.setScalar(0.4 + 0.6 * Math.min(1, cur.sun / 2)); }
  NIGHT.value = cur.night; AXIAL.value = 0.9 * cur.sun / 2.4;
  M.lamp.color.setRGB(1, 0.72, 0.42).multiplyScalar(cur.lamp);   // 暖黃、夜裡不爆成純白（爆白的小燈被動態模糊拖成白條很突兀）
  // 等你：列車停下，維修工出現在停車位置旁
  if (stateName !== 'waiting') workerPlaced = false;
  else if (!workerPlaced && worker && speed < 0.8) {               // 幾乎停住了才擺，位置才準
    const th = phi + OMEGA * T0 + WORKER_TH;
    standMatrix(8.2, th, DECK_H, 0, 1, 1, 1, worker.matrix); worker.matrixWorldNeedsUpdate = true; workerPlaced = true;
  }
  prevState = stateName;
}

function frame(now) {
  requestAnimationFrame(frame);
  if (paused || document.hidden) { last = now; return; }
  if (now - lastDraw < 1000 / 30 - 2) return;                 // 規格：30 fps 上限
  lastDraw = now;
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!IDS) applyAtmos(dt);
  if (!FREEZE) phi = (phi + (speed / RT) * dt) % (Math.PI * 2);
  habitat.rotation.x = -(phi + OMEGA * T0);
  if (M.window.uniforms) M.window.uniforms.uAng.value = (habitat.rotation.x - SPIN * (now / 1000 + T0)) % (Math.PI * 2);
  if (++frameNo % 8 === 0 && Object.keys(city.meshes).length) updateLOD();
  draw();
}
requestAnimationFrame(frame);
window.theme = { CAM, camera, habitat, renderer, scene, city, cityReady, updateLOD, STATES, CONFIG, PARAMS: STATES,
  draw: () => draw(), resizePost: () => mb && mb.resize(), applyState, setSessions: (a) => { sessions = a || []; }, requestState: () => stateName, setState: (n) => { stateName = n; } };
// 驗收：用 480×270 算一張遮罩，回傳 PNG dataURL
window.theme.mask = (w = 480, h = 270) => {
  const rt = new THREE.WebGLRenderTarget(w, h); const a = camera.aspect; camera.aspect = 16 / 9; camera.updateProjectionMatrix();
  renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null);
  const px = new Uint8Array(w * h * 4); renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
  camera.aspect = a; camera.updateProjectionMatrix();
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'), im = g.createImageData(w, h);
  for (let y = 0; y < h; y++) im.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  g.putImageData(im, 0, 0); return cv.toDataURL('image/png');
};

// 開發用：以 1920×1080 算一張存到 docs/ring-station/shots/<name>（要用 devserver.py 開）
window.theme.shot = async (name = 'shot.jpg') => {
  await cityReady; habitat.rotation.x = -(phi + OMEGA * T0); updateLOD(); if (!IDS) applyAtmos(1e6);
  const pr = renderer.getPixelRatio(); renderer.setPixelRatio(1); renderer.setSize(1920, 1080, false);
  camera.aspect = 16 / 9; camera.updateProjectionMatrix(); if (mb) mb.resize(); draw();
  const blob = await new Promise((ok) => renderer.domElement.toBlob(ok, name.endsWith('.png') ? 'image/png' : 'image/jpeg', 0.9));
  renderer.setPixelRatio(pr); resize();
  const r = await fetch('/_save/' + name, { method: 'PUT', body: blob }); return r.status;
};
