// 霓虹隧道 · 車內：儀表台、方向盤、A 柱。都在陰影裡，只看得到輪廓、邊緣反光和掠過的燈光。
// 掛在鏡頭底下，畫在擋風玻璃那一關之後，所以不會被雨珠折射。輸出已經是顯示用的顏色（不經過色調映射）。
// 正式外型是 models/cabin.glb（Tripo 自己生成＋智能拆分，見 docs/neon-tunnel/02）；載不到時用程式拼的簡單幾何代替。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// 擺法都在「車的座標」：原點＝駕駛的眼睛，−Z 朝車頭，+X 朝右（左駕）。
// 鏡頭往右偏 21.7°（構圖對目標圖），車內整組跟著鏡頭轉（ry），否則左 A 柱會跑出畫面、方向盤卡在正中間。
const Q = new URLSearchParams(location.search);
const num = (k, d) => (Q.has(k) ? parseFloat(Q.get(k)) : d);
export const CABIN_FIT = {
  x: num('cx', 0.5), y: num('cy', -0.6), z: num('cz', -0.66),    // 模型原點（底面中心）
  sx: num('csx', 1.7), sy: num('csy', 1.0), sz: num('csz', 1.2),  // 模型是 1.45 m 寬的小車廂，橫向放寬
  ry: num('cry', -21.7),                                          // 繞 Y 轉（度）
  liftY: num('cly', -0.1), liftK: num('clk', 9),                  // A 柱框：這個高度以上往上拉長（模型的框太矮，車頂橫樑會擋到畫面）
  lean: num('cln', 0.2),                                          // 左 A 柱越高越往外斜（目標圖的 A 柱是往左上斜出去）
  wheel: { dx: num('cwx', -0.26), dy: num('cwy', 0.06), dz: num('cwz', 0.06), tilt: num('cwt', -8) },  // 方向盤另外微調（公尺、度）
};
const FRAME_PARTS = ['tripo_part_1'];                       // A 柱＋車頂橫樑
const WHEEL_PARTS = ['tripo_part_3', 'tripo_part_11'];      // 方向盤圈＋中間氣囊蓋

const VS = /* glsl */`
  // 車內這一層的世界座標＝車的座標往上平移眼睛高度（鏡頭的轉向被 car 那層抵銷了）
  varying vec3 vN; varying vec3 vV; varying vec3 vP; varying vec2 vUv;
  uniform float uEye, uLiftY, uLiftK, uLean;
  void main(){
    vec4 wp = modelMatrix * vec4(position, 1.);
    vec3 cp = wp.xyz - vec3(0., uEye, 0.);
#ifdef LIFT
    if (cp.y > uLiftY) {
      float h = cp.y - uLiftY;
      cp.y = uLiftY + h * uLiftK;
      if (cp.x < 0.) cp.x -= h * uLiftK * uLean;
    }
#endif
    wp.xyz = cp + vec3(0., uEye, 0.);
    vP = cp; vUv = uv;
    vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp; }`;
const FS = /* glsl */`
  uniform float uFlash, uBlinkL, uBlinkR; uniform vec3 uAmb, uKey; uniform sampler2D uMap, uNMap;
  varying vec3 vN; varying vec3 vV; varying vec3 vP; varying vec2 vUv;
  void main(){
    vec3 n = normalize(vN);
#ifdef USE_NMAP
    // 法線貼圖（4K）：沒有切線，用螢幕空間導數算 TBN（同 three.js 的 perturbNormal2Arb）
    {
      vec3 q0 = dFdx(vP), q1 = dFdy(vP); vec2 st0 = dFdx(vUv), st1 = dFdy(vUv);
      vec3 N = n, q1perp = cross(q1, N), q0perp = cross(N, q0);
      vec3 Tt = q1perp * st0.x + q0perp * st1.x, B = q1perp * st0.y + q0perp * st1.y;
      float det = max(dot(Tt, Tt), dot(B, B)), sc = det == 0. ? 0. : inversesqrt(det);
      vec3 mn = texture2D(uNMap, vUv).xyz * 2. - 1.;
      n = normalize(mat3(Tt * sc, B * sc, N) * vec3(mn.xy * 1.3, mn.z));
    }
#endif
    if (!gl_FrontFacing) n = -n;
    // 模型貼圖只取明暗當細節（車內是黑色系），沒有貼圖就是一般黑塑料
    float alb = 1.;
#ifdef USE_TEX
    vec3 t = texture2D(uMap, vUv).rgb; alb = clamp(dot(t, vec3(.3, .59, .11)) * 4.5, .15, 3.);
#endif
    // 光從擋風玻璃外面來：前上方（隧道燈）＋前方（隧道的反光）
    float top = max(dot(n, normalize(vec3(-0.25, 0.85, -0.45))), 0.);
    float front = max(dot(n, vec3(0., 0.2, -1.)), 0.);
    float rim = pow(1. - max(dot(n, normalize(vV)), 0.), 5.);
    vec3 c = vec3(0.0016, 0.0014, 0.0012);
    c += uAmb * 0.1 * (0.3 + 0.7 * top) * alb;
    c += uKey * (0.004 + 0.06 * uFlash) * (top * 0.12 * alb + rim * 0.5);
    float bl = uBlinkL * smoothstep(0.3, -0.6, vP.x) + uBlinkR * smoothstep(-0.3, 0.6, vP.x);
    c += vec3(1., 0.45, 0.08) * 0.05 * bl * (0.3 + top + rim) * (0.4 + 0.6 * front + 0.6 * top);
    gl_FragColor = vec4(pow(c, vec3(1. / 2.2)), 1.);
  }`;

export function makeCabin(camera) {
  const U = {
    uFlash: { value: 0 },          // 頭頂燈掠過時打在車內的橘光（0–1）
    uBlinkL: { value: 0 }, uBlinkR: { value: 0 },   // 方向燈／雙黃燈
    uAmb: { value: new THREE.Color(0.03, 0.036, 0.04) },
    uKey: { value: new THREE.Color(0.8, 0.96, 1.0) },
    uEye: { value: 1.22 },                          // 眼睛高度：世界座標減掉它就是車的座標
    uLiftY: { value: CABIN_FIT.liftY }, uLiftK: { value: CABIN_FIT.liftK }, uLean: { value: CABIN_FIT.lean },
  };
  // 每件各自一份材質（貼圖不同），其餘 uniform 共用同一個物件，main.js 改一次全部跟著變
  const makeMat = (map, lift, nmap) => { if (map) map.anisotropy = 8; if (nmap) nmap.anisotropy = 8; return new THREE.ShaderMaterial({
    uniforms: { ...U, uMap: { value: map || null }, uNMap: { value: nmap || null } },
    defines: { ...(map ? { USE_TEX: 1 } : {}), ...(nmap ? { USE_NMAP: 1 } : {}), ...(lift ? { LIFT: 1 } : {}) },
    vertexShader: VS, fragmentShader: FS,
  }); };
  const mat = makeMat(null, false);

  const g = new THREE.Group();
  // ── 代替品：程式拼的方向盤、儀表台、A 柱（鏡頭座標） ──
  const fallback = new THREE.Group();
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.024, 12, 64), mat);
  wheel.position.set(-0.27, -0.37, -0.46); wheel.rotation.set(-0.42, 0.1, 0);
  const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.03), mat);
  spoke.position.set(0, -0.05, 0.01); wheel.add(spoke);
  const dash = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.35, 0.7), mat);
  dash.position.set(0.1, -0.53, -0.88); dash.rotation.x = 0.08;
  const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1.5, 0.08), mat);
  pillar.position.set(-0.86, 0.1, -0.8); pillar.rotation.set(-0.45, 0, -0.2);
  fallback.add(wheel, dash, pillar);
  g.add(fallback);

  // ── 正式：Tripo 車內模型 ──
  const car = new THREE.Group();            // 把鏡頭的轉向抵銷掉，裡面就是車的座標
  g.add(car);
  const fit = () => {
    car.quaternion.copy(camera.quaternion).invert();
    U.uEye.value = camera.position.y;
  };
  fit();
  const parts = {};
  const place = (m) => {
    const F = CABIN_FIT;
    m.position.set(F.x, F.y, F.z); m.rotation.y = F.ry * Math.PI / 180; m.scale.set(F.sx, F.sy, F.sz);
    const p = parts.wheelPivot;
    if (p) {
      p.position.copy(p.userData.base).add(new THREE.Vector3(F.wheel.dx, F.wheel.dy, F.wheel.dz).divide(m.scale));
      p.rotation.x = F.wheel.tilt * Math.PI / 180;
    }
    U.uLiftY.value = F.liftY; U.uLiftK.value = F.liftK; U.uLean.value = F.lean;
  };
  const ready = new GLTFLoader().loadAsync(new URL('./models/cabin.glb', import.meta.url).href).then((gltf) => {
    const m = gltf.scene;
    m.updateMatrixWorld(true);
    const meshes = [];
    m.traverse((o) => { if (o.isMesh) meshes.push(o); });
    for (const o of meshes) {
      const name = o.name || (o.parent && o.parent.name) || '';
      const isFrame = FRAME_PARTS.some((k) => name.startsWith(k));
      o.material = makeMat(o.material && o.material.map, isFrame, o.material && o.material.normalMap);
      o.frustumCulled = false;
    }
    // 方向盤掛到自己的樞紐（圈的中心），之後可以單獨移動、仰角
    const wheelMeshes = meshes.filter((o) => WHEEL_PARTS.some((k) => (o.name || o.parent.name).startsWith(k)));
    if (wheelMeshes.length) {
      const box = new THREE.Box3();
      wheelMeshes.forEach((o) => box.expandByObject(o));
      const c = box.getCenter(new THREE.Vector3());      // 模型座標（m 還沒擺位，世界＝模型座標）
      const pivot = new THREE.Group(); pivot.position.copy(c); pivot.userData.base = c.clone();
      m.add(pivot);
      for (const o of wheelMeshes) { pivot.attach(o); }
      parts.wheelPivot = pivot;
    }
    car.add(m);
    place(m);
    fallback.visible = false;
    parts.model = m;
    return m;
  }).catch((e) => { console.warn('cabin.glb 載不到，用程式車內代替', e); return null; });

  camera.add(g);
  const scene = new THREE.Scene();
  scene.add(camera);    // 只為了讓 render(scene, camera) 畫到掛在鏡頭底下的車內
  return { U, group: g, car, scene, ready, fit, parts, refit: () => parts.model && place(parts.model) };
}
