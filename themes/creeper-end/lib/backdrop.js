// 中遠景背景（2026-10-29）：兩張扣圖當兩片看板，放在各自的深度，鏡頭微晃自然產生視差；
// 輔助圖（法線＋受光面＋晶塊）讓背景吃前景同一盞主光、跟著 Claude 狀態變色。素材由 docs/麥塊世界mc3/tools/backdrop.py 產生。
// makeBackdrop(refCam) → { group, update({ dt, t, keyView, keyView0, state, flash, camOff }) → 目前的狀態值 }
import * as THREE from '../vendor/three.module.min.js';

export const BG = {
  midD: 260, farD: 1400,      // 中景、遠景看板離鏡頭多遠（世界單位；要比橋尾遠，前景才蓋得住）
  midDe: 90, farDe: 400,      // 視差「看起來」的距離：鏡頭晃時看板反向補一點位移，視差比實際距離大（氛圍優先於光學）
  margin: 0.08,               // 看板比畫面多出幾成（鏡頭晃動不露邊）
  sway: [0.5, 0.18], swayHz: [0.031, 0.023],  // 鏡頭左右／上下晃幅（世界單位；0.5 ≈ 主角滑 12px）、頻率（Hz）
  keySway: 8, keyHz: 0.019,   // 主光左右擺角（度）、頻率：前景影子與背景亮面一起慢慢轉
  relight: 1.6,               // 背景亮面跟著主光方向變化的強度
  relayPeriod: 4.2,           // 思考：晶塊由近到遠接力亮起的一輪秒數（同苦力怕綠光 thinkPeriod）
  rate: 1.2,                  // 狀態切換的趨近速率（1/秒）
  // 各狀態的目標值：key 主光倍率（前景主光一起乘）、grade 整體色偏、sat 飽和度、glow 晶塊亮度、relay 接力（0＝各自呼吸）、sway 晃幅倍率、flash 等你閃白
  states: {
    absent:    { key: 0.75, grade: [0.82, 0.8, 0.9],   sat: 0.6,  glow: 0.3, relay: 0, sway: 0.6, flash: 0 },
    idle:      { key: 1,    grade: [1, 1, 1],          sat: 1,    glow: 0.6, relay: 0, sway: 1,   flash: 0 },
    thinking:  { key: 0.85, grade: [0.93, 0.88, 1.08], sat: 1.05, glow: 1.2, relay: 1, sway: 1,   flash: 0 },
    executing: { key: 1.3,  grade: [1.05, 1, 0.95],    sat: 1.1,  glow: 1.1, relay: 0, sway: 1.3, flash: 0 },
    finishing: { key: 1.12, grade: [1.07, 1.0, 0.9],   sat: 1,    glow: 0.7, relay: 0, sway: 1,   flash: 0 },
    waiting:   { key: 1,    grade: [1, 0.98, 1.03],    sat: 1,    glow: 1,   relay: 0, sway: 0.8, flash: 1 },
  },
};

const VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = `uniform sampler2D uMap, uAux; uniform float uMid;
uniform vec3 uL, uL0, uGrade; uniform float uKey, uRelight, uSat, uGlow, uRelay, uFlash, uT, uRelayPeriod;
varying vec2 vUv;
void main() {
  vec2 uv = clamp(vUv, 0.001, 0.999);
  vec4 c = texture2D(uMap, uv), a = texture2D(uAux, uv);
  vec3 n = vec3(a.xy * 2.0 - 1.0, 0.0); n.z = sqrt(max(0.0, 1.0 - dot(n.xy, n.xy)));
  // 重打光：受光面乘上主光倍率，再依法線比較「現在的主光方向」和「原圖的主光方向」
  float sh = max(0.0, 1.0 + uRelight * (dot(n, uL) - dot(n, uL0)));
  vec3 col = c.rgb * mix(1.0, uKey * sh, a.b);
  // 晶塊：平常各自慢慢呼吸；思考時一道波由左下（橋頭）往右上（遠方）掃過
  float breathe = 0.55 + 0.45 * sin(uT * 1.1 + uv.x * 23.0 + uv.y * 17.0);
  float wave = pow(max(0.0, sin(6.2832 * fract(uT / uRelayPeriod - (uv.x * 0.6 + uv.y * 0.4)))), 3.0);
  col += (c.rgb + vec3(0.25, 0.08, 0.3)) * a.a * uGlow * mix(breathe, wave * 1.6, uRelay);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSat) * uGrade;
  col = mix(col, vec3(1.0, 0.94, 1.0), uFlash * (0.06 + 0.12 * a.b + 0.3 * a.a));
  gl_FragColor = vec4(col, uMid > 0.5 ? c.a : 1.0);
  #include <colorspace_fragment>
}`;

// 看板：四角＝參考鏡頭畫面四角（多出 margin）的視線，與「離鏡頭 D」那個平面的交點；uv 跟著外推（取樣時夾在邊上）
function billboard(refCam, D, m) {
  const f = refCam.getWorldDirection(new THREE.Vector3()), pos = [], uv = [];
  for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const X = x * (1 + m), Y = y * (1 + m);
    const d = new THREE.Vector3(X, Y, 0.5).unproject(refCam).sub(refCam.position).normalize();
    pos.push(...refCam.position.clone().addScaledVector(d, D / d.dot(f)).toArray());
    uv.push((X + 1) / 2, (Y + 1) / 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

export function makeBackdrop(refCam, b = BG) {
  const ld = new THREE.TextureLoader();
  const tex = (p, srgb) => { const t = ld.load(p); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const aux = tex('textures/backdrop-aux.png', false);
  const cur = { ...b.states.idle, grade: [...b.states.idle.grade] };
  // 原圖的主光方向（畫面空間）：以 ENV.keyDir 在參考鏡頭下的方向為準，呼叫端第一次 update 時填
  const L0 = new THREE.Vector3(), L = new THREE.Vector3();
  const shared = {
    uAux: { value: aux }, uL: { value: L }, uL0: { value: L0 }, uGrade: { value: new THREE.Vector3(1, 1, 1) },
    uKey: { value: 1 }, uRelight: { value: b.relight }, uSat: { value: 1 }, uGlow: { value: cur.glow }, uRelay: { value: 0 },
    uFlash: { value: 0 }, uT: { value: 0 }, uRelayPeriod: { value: b.relayPeriod },
  };
  const group = new THREE.Group(), boards = [];
  for (const [file, D, mid, De] of [['textures/backdrop-far.webp', b.farD, 0, b.farDe], ['textures/backdrop-mid.webp', b.midD, 1, b.midDe]]) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...shared, uMap: { value: tex(file, true) }, uMid: { value: mid } },
      vertexShader: VERT, fragmentShader: FRAG, transparent: !!mid, depthWrite: false, toneMapped: false, fog: false,
    });
    const mesh = new THREE.Mesh(billboard(refCam, D, b.margin), mat);
    mesh.renderOrder = mid ? -9 : -10; mesh.frustumCulled = false;
    group.add(mesh); boards.push([mesh, 1 - D / De]);
  }
  let init = false;
  function update({ dt, t, keyView, keyView0, state, flash = 0, camOff }) {
    // 鏡頭位移 s 時，看板移 s(1 − D/De)：畫面上的位移就和距離 De 的東西一樣
    if (camOff) for (const [m, k] of boards) m.position.copy(camOff).multiplyScalar(k);
    if (!init) { L0.copy(keyView0); init = true; }
    L.copy(keyView);
    const T = b.states[state] || b.states.idle, k = Math.min(1, dt * b.rate);
    for (const n of ['key', 'sat', 'glow', 'relay', 'sway']) cur[n] += (T[n] - cur[n]) * k;
    for (let i = 0; i < 3; i++) cur.grade[i] += (T.grade[i] - cur.grade[i]) * k;
    shared.uKey.value = cur.key; shared.uSat.value = cur.sat; shared.uGlow.value = cur.glow; shared.uRelay.value = cur.relay;
    shared.uGrade.value.set(...cur.grade); shared.uFlash.value = T.flash * flash; shared.uT.value = t;
    return cur;
  }
  return { group, update, cur, uniforms: shared };
}
