// 階段 5：背景看板的打光（日夜、室內燈、霓虹、燈泡、裁判燈、白板字）＋光束裡的粉塵＋鎂粉爆開
// 背景是一張 2D 看板，所以這些都在全螢幕的 shader 裡做，靠 textures/mask-glow.png（RGB：R 霓虹 G 燈泡 B 窗）與 mask-beam.png（光束）
// mask-glow 不能帶 alpha：原本 A＝裁判燈、幾乎全 0，瀏覽器解碼時預乘會把 RGB 吃掉 → 已轉成 RGB，裁判燈改用圓心座標畫
import * as THREE from '../vendor/three.module.min.js';

const W0 = 1672, H0 = 941;
// 白板四角 (1381,339)(1665,308)(1658,534)(1391,533) → 白板 uv 的透視轉換（底圖像素 → uv，column-major）
const WB_H = new THREE.Matrix3().fromArray([0.0115667907, 0.00149639413, 0.00155113326, -0.000596226324, 0.0137089011, -0.000906445801, -15.7716172, -6.71383776, 1]);
const JUDGE = [[1124.3, 645.9], [1173.9, 645.0], [1225.0, 644.2]];   // 裁判燈圓心（像素），半徑約 18
const NEON = [1527, 222];                                               // 霓虹字中心

const BG_FRAG = /* glsl */`
uniform sampler2D tBg, tMask, tBeam, tInk;
uniform mat3 uWB;
uniform vec2 uCover;
uniform float uDay, uHouse, uNeon, uBulb, uTime;
uniform vec3 uJudge;            // 每盞燈：0 不亮、1 白、2 紅（可帶小數做亮度：1.4＝白燈 40%）
varying vec2 vUv;
const vec2 S = vec2(${W0}.0, ${H0}.0);
vec3 lampCol(float s) { return s < 0.01 ? vec3(0.0) : s <= 1.0 ? vec3(1.0, 0.93, 0.80) * s : vec3(1.0, 0.08, 0.04) * (s - 1.0); }
void main() {
  vec2 uv = 0.5 + (vUv - 0.5) * uCover;
  vec2 px = vec2(uv.x, 1.0 - uv.y) * S;                 // 底圖像素（左上原點）
  vec3 c = texture2D(tBg, uv).rgb;
  vec4 m = texture2D(tMask, uv);
  float beam = texture2D(tBeam, uv).r;

  // 夜：光束拿掉、整體壓暗偏藍，窗變深藍
  vec3 night = c * (1.0 - beam) * vec3(0.20, 0.15, 0.12);   // 晚上靠鎢絲燈：偏暖、約四成亮（線性 0.15–0.2）
  night = mix(night, vec3(0.004, 0.010, 0.040), smoothstep(0.05, 0.5, m.b));
  night = mix(night, c, max(m.r, m.g));                      // 霓虹、燈泡自己會亮，晚上不壓
  vec3 col = mix(night, c, uDay);
  // 室內燈：不在時關一半（窗、霓虹、燈泡不受影響）
  float self = max(max(m.r, m.g), m.b * uDay);
  col *= mix(uHouse, 1.0, self);
  // 霓虹：燈管本身＋牆上大片紅色漫射
  col += c * m.r * (uNeon - 1.0) * 1.2;
  float dn = length((px - vec2(${NEON[0]}.0, ${NEON[1]}.0)) / vec2(320.0, 260.0));
  col += vec3(0.55, 0.04, 0.02) * exp(-dn * dn * 2.0) * 0.10 * uNeon * (1.6 - uDay * 0.6);
  // 燈泡：晚上更亮、光暈更大
  col += c * m.g * (uBulb - 1.0);
  // 裁判燈
  for (int i = 0; i < 3; i++) {
    vec2 o = ${JUDGE.map(([x, y], i) => `i == ${i} ? vec2(${x}, ${y}) :`).join(' ')} vec2(0.0);
    float s = uJudge[i];
    float d = length(px - o);
    float lens = smoothstep(19.0, 16.0, d);
    vec3 lc = lampCol(s);
    col = mix(col, col * 0.25 + lc * 2.2, lens * step(0.01, s)) * mix(1.0, 0.45, lens * step(s, 0.01));   // 不亮：燈面壓暗
    col += lc * exp(-d * d / 2600.0) * 0.55;                                                             // 光暈
  }
  // 白板字（墨水乘上底色，字會吃到霓虹的紅光）
  vec3 wb = uWB * vec3(px, 1.0);
  vec2 buv = wb.xy / wb.z;
  if (buv.x > 0.0 && buv.x < 1.0 && buv.y > 0.0 && buv.y < 1.0) {
    vec4 ink = texture2D(tInk, vec2((buv.x - 0.03) / 0.94, 1.0 - (buv.y - 0.03) / 0.94));
    col *= mix(vec3(1.0), ink.rgb * 0.9, ink.a);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

/**
 * 全螢幕背景看板。先畫它，再疊 3D（renderer.autoClear = false）。
 * @returns {{ scene, cam, u, setAspect(a) }}  u 是 uniforms：uDay、uHouse、uNeon、uBulb、uJudge…
 */
export function makeBackdrop({ bg, mask, beam, ink }) {
  for (const t of [mask, beam]) t.colorSpace = THREE.NoColorSpace;
  const u = {
    tBg: { value: bg }, tMask: { value: mask }, tBeam: { value: beam }, tInk: { value: ink },
    uWB: { value: WB_H }, uCover: { value: new THREE.Vector2(1, 1) },
    uDay: { value: 1 }, uHouse: { value: 1 }, uNeon: { value: 1 }, uBulb: { value: 1 }, uTime: { value: 0 },
    uJudge: { value: new THREE.Vector3() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: BG_FRAG,
  });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  // 跟相機的 cover 規則一致：畫面比 16:9 寬 → 裁上下；比較窄 → 裁左右
  const setAspect = a => { const a0 = W0 / H0; u.uCover.value.set(a < a0 ? a / a0 : 1, a > a0 ? a0 / a : 1); };
  return { scene, cam: new THREE.Camera(), u, setAspect };
}

// 粉塵：一團在架子後方慢慢飄的點，只在光束裡亮（投影到螢幕後讀光束遮罩）
export function makeDust({ beam, count = 900 }) {
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos.set([-2.4 + Math.random() * 4.6, 0.2 + Math.random() * 3.4, -3.2 + Math.random() * 3.0], i * 3);
    seed[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const u = { tBeam: { value: beam }, uTime: { value: 0 }, uAmount: { value: 1 }, uDay: { value: 1 }, uCover: { value: new THREE.Vector2(1, 1) }, uPx: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float seed; uniform float uTime, uPx; uniform vec2 uCover; varying float vA; uniform sampler2D tBeam;
      void main() {
        vec3 p = position;
        float t = uTime * (0.03 + 0.05 * seed) + seed * 40.0;
        p += vec3(sin(t * 1.3 + seed * 9.0) * 0.25 + t * 0.06, sin(t * 0.7) * 0.18 - fract(t * 0.02) * 0.4, cos(t * 1.1) * 0.2);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vec2 sc = gl_Position.xy / gl_Position.w * 0.5 + 0.5;
        vec2 uv = 0.5 + (sc - 0.5) * uCover;
        vA = texture2D(tBeam, uv).r * (0.5 + 0.5 * sin(uTime * (1.0 + seed * 3.0) + seed * 30.0));
        gl_PointSize = uPx * (1.2 + seed * 2.2) * 2.4 / -mv.z;
      }`,
    fragmentShader: /* glsl */`
      uniform float uAmount, uDay; varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
        gl_FragColor = vec4(vec3(1.0, 0.78, 0.5) * (1.0 - d * 2.0) * vA * uAmount * uDay * 0.9, 1.0);
      }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false; pts.renderOrder = 5;
  return { pts, u };
}

// 鎂粉爆開：拍手、掛槓時從一點噴出一團白粉，慢慢散開往下飄
export function makeBurst({ count = 600 } = {}) {
  const pos = new Float32Array(count * 3), vel = new Float32Array(count * 3), life = new Float32Array(count).fill(-1), age = new Float32Array(count);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('a', new THREE.BufferAttribute(age, 1));
  const u = { uPx: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      attribute float a; uniform float uPx; varying float vA;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        vA = a; gl_PointSize = a <= 0.0 ? 0.0 : uPx * (14.0 + 30.0 * (1.0 - a)) / -mv.z; }`,
    fragmentShader: /* glsl */`
      varying float vA;
      void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5 || vA <= 0.0) discard;
        gl_FragColor = vec4(vec3(0.92, 0.9, 0.86), (1.0 - d * 2.0) * vA * 0.22); }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false; pts.renderOrder = 6;
  let next = 0;
  function emit(at, n = 120, speed = 0.8, up = 0.4) {
    for (let k = 0; k < n; k++) {
      const i = next++ % count, th = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random());
      pos.set([at.x, at.y, at.z], i * 3);
      vel.set([Math.cos(th) * s, up * (0.3 + Math.random()) * speed, Math.sin(th) * s], i * 3);
      life[i] = 2.5 + Math.random() * 2;
      age[i] = 1;
    }
  }
  function update(dt) {
    for (let i = 0; i < count; i++) {
      if (life[i] < 0) { age[i] = 0; continue; }
      const k = Math.exp(-dt * 2.2);
      vel[i * 3] *= k; vel[i * 3 + 1] = vel[i * 3 + 1] * k - 0.05 * dt; vel[i * 3 + 2] *= k;
      for (let j = 0; j < 3; j++) pos[i * 3 + j] += vel[i * 3 + j] * dt;
      life[i] -= dt; age[i] = Math.max(0, Math.min(1, life[i] / 2.5));
    }
    g.attributes.position.needsUpdate = true; g.attributes.a.needsUpdate = true;
  }
  return { pts, u, emit, update };
}

/** 把畫面像素 (x, y)（底圖座標）沿相機射線推到距離 depth（沿視線方向）的世界點 */
export function unproject(cam, x, y, depth) {
  const v = new THREE.Vector3(x / W0 * 2 - 1, 1 - y / H0 * 2, 0.5).unproject(cam).sub(cam.position).normalize();
  const fwd = cam.getWorldDirection(new THREE.Vector3());
  return cam.position.clone().addScaledVector(v, depth / v.dot(fwd));
}
