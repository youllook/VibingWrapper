// 05 光束：高窗射進來的體積光。每格在小畫面（底圖的 1/4）上，從每個像素往太陽方向（左上）回推，
// 累加路上窗玻璃的亮度 → 窗格的直條（窗框擋光）自然變成光裡的暗紋。結果交給底圖合成（plate.js）加上去。
import * as THREE from '../vendor/three.module.min.js';
import { W0, H0 } from './plate.js';

const FRAG = /* glsl */`
uniform sampler2D tDay, tMask;
uniform vec2 uDir;        // 光的行進方向（底圖像素，往右下）；回推時反著走
uniform float uLen, uTime, uDrift;
varying vec2 vUv;
const vec2 S = vec2(${W0}.0, ${H0}.0);
const int N = 32;
float hash(float n) { return fract(sin(n) * 43758.5453); }
float noise(float x) { float i = floor(x), f = fract(x); return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)); }
void main() {
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * S;
  vec2 d = normalize(uDir);
  float acc = 0.0;
  for (int i = 1; i <= N; i++) {
    float t = float(i) / float(N);
    vec2 p = px - d * t * uLen;
    if (p.y < 0.0) break;
    vec2 uv = vec2(p.x, S.y - p.y) / S;
    // 窗取很糊的版本：目標圖的光是一整片光霧，不是一條條窗格直紋（窗格的紋理只留淡淡一點）
    float win = mix(texture2D(tMask, uv, 4.5).r, texture2D(tMask, uv, 1.5).r, 0.25);
    win *= mix(0.6, 1.0, smoothstep(470.0, 600.0, p.x));    // 左上那組窗的光弱一點
    float lum = dot(texture2D(tDay, uv, 4.5).rgb, vec3(0.3, 0.59, 0.11));
    acc += win * smoothstep(0.25, 0.8, lum) * exp(-t * 1.6);   // 只有亮的玻璃會透光；窗框、遮擋物是暗的
  }
  acc = pow(acc / (float(N) * 0.18), 0.8);
  // 光束不是均勻的一片：沿垂直光線的方向有幾條粗細不一的「光柱」，慢慢呼吸、飄移
  float across = dot(px, vec2(-d.y, d.x));
  float shafts = 0.7 + 0.3 * noise(across / 60.0 + uDrift) * (0.8 + 0.2 * noise(across / 17.0 - uTime * 0.05));
  gl_FragColor = vec4(vec3(acc * shafts), 1.0);
}`;

export function makeBeams(renderer, { day, mask, scale = 0.25 }) {
  const rt = new THREE.WebGLRenderTarget(Math.round(W0 * scale), Math.round(H0 * scale), { type: THREE.HalfFloatType, depthBuffer: false });
  const u = { tDay: { value: day }, tMask: { value: mask }, uDir: { value: new THREE.Vector2(0.62, 1) }, uLen: { value: 820 }, uTime: { value: 0 }, uDrift: { value: 0 } };
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: u, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: FRAG,
  })));
  const cam = new THREE.Camera();
  function render() { renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(null); }
  return { render, texture: rt.texture, u };
}

// 粉塵：鏡頭前一大片慢慢飄的點。白天只在光束裡亮（投影到畫面後讀光束小畫面）；晚上靠近燈泡才亮（讀燈泡遮罩的模糊版）。
// 少數幾顆在鏡頭前很近 → 失焦的大光點。uStir：收尾時揚起的包絡（0→1→0，約 6 秒）：慢慢浮起、變多變亮，再落回
export function makeDust({ beam, maskB, count = 2600, bokeh = 36 }) {
  const n = count + bokeh, pos = new Float32Array(n * 3), seed = new Float32Array(n), big = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const b = i >= count, z = b ? -0.5 - Math.random() * 1.2 : -1.5 - Math.random() * 6;
    const w = -z * 0.95, h = -z * 0.7;   // 跟著視錐變寬
    pos.set([(Math.random() * 2 - 1) * w, 0.45 + (Math.random() * 2 - 0.6) * h, z], i * 3);
    seed[i] = Math.random(); big[i] = b ? 1 : 0;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  g.setAttribute('big', new THREE.BufferAttribute(big, 1));
  const u = { tBeam: { value: beam }, tMaskB: { value: maskB }, uTime: { value: 0 }, uAmount: { value: 1 }, uDay: { value: 1 }, uSun: { value: 1 },
    uStir: { value: 0 }, uCover: { value: new THREE.Vector2(1, 1) }, uPx: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: /* glsl */`
      attribute float seed, big; uniform float uTime, uPx, uDay, uSun, uStir, uAmount; uniform vec2 uCover;
      uniform sampler2D tBeam, tMaskB; varying float vA, vBig;
      void main() {
        vec3 p = position;
        float t = uTime * (0.025 + 0.04 * seed) + seed * 50.0;
        // 慢慢翻：左右晃、整體微微下沉；揚起時往上翻
        p += vec3(sin(t * 1.3 + seed * 9.0) * 0.3 + t * 0.05, sin(t * 0.7) * 0.2 - fract(t * 0.015) * 0.6 , cos(t * 1.1) * 0.25);
        p += uStir * vec3(sin(seed * 13.0) * 0.06, 0.12 + 0.18 * seed, 0.0);   // 最快約 0.15 m/s（原本每秒甩半公尺，太快）
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vec2 sc = gl_Position.xy / gl_Position.w * 0.5 + 0.5;
        vec2 uv = 0.5 + (sc - 0.5) * uCover;
        float inBeam = texture2D(tBeam, uv).r * uSun;
        float nearBulb = textureLod(tMaskB, uv, 6.0).r * 6.0;   // 燈泡附近（糊開的遮罩）
        float lit = mix(nearBulb * 0.6, inBeam * 1.6 + nearBulb * 0.3, uDay);
        float tw = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (0.8 + seed * 2.5) + seed * 40.0), 3.0);   // 轉到角度才閃
        float show = step(seed, 0.35 + 0.65 * clamp(uAmount + uStir, 0.0, 1.0));      // 量少時只留一部分
        vBig = big;
        vA = lit * mix(tw, 0.35, big) * show * (1.0 + 0.6 * uStir);
        gl_PointSize = big > 0.5 ? uPx * (18.0 + seed * 26.0) / -mv.z * 2.0 : uPx * (1.0 + seed * 1.6) * 5.0 / -mv.z + 1.5;
      }`,
    fragmentShader: /* glsl */`
      varying float vA, vBig;
      void main() {
        float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
        float a = vBig > 0.5 ? smoothstep(0.5, 0.38, d) * 0.12 : (1.0 - d * 2.0);   // 大光點：失焦的圓盤，邊緣軟、很淡
        gl_FragColor = vec4(vec3(1.0, 0.8, 0.55) * a * vA * 1.8, 1.0);
      }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false; pts.renderOrder = 5;
  return { pts, u };
}
