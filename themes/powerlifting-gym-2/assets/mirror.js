// 鏡中倒影：選手、槓、架子另外畫進一張小畫面（透明底、線性 HDR），再做兩趟高斯模糊（橫、直），交給底圖合成
// 倒影要糊到看不清細節、但看得出蹲起的節奏 —— 三檔模糊（?blur=1|2|3，預設 2）
import * as THREE from '../vendor/three.module.min.js';

export const BLUR = { 0: 0.01, 1: 0.5, 2: 1.0, 3: 1.75 };   // 高斯 sigma（小畫面像素；小畫面是底圖的 1/4，反正要糊）

const BLUR_FRAG = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uDir; uniform float uSigma; varying vec2 vUv;
void main() {
  vec4 s = vec4(0.0); float w = 0.0;
  for (int i = -12; i <= 12; i++) {
    float x = float(i) * max(uSigma, 0.01) / 4.0;     // 25 個樣本鋪滿 ±3σ
    float k = exp(-x * x / (2.0 * uSigma * uSigma + 1e-4));
    s += texture2D(tSrc, vUv + uDir * x) * k; w += k;
  }
  gl_FragColor = s / w;
}`;

export function makeMirror(renderer, { width = 418, height = 235 } = {}) {
  const opt = { type: THREE.HalfFloatType, depthBuffer: true, samples: 2 };
  const raw = new THREE.WebGLRenderTarget(width, height, opt);
  const a = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, depthBuffer: false });
  const b = a.clone();
  const u = { tSrc: { value: null }, uDir: { value: new THREE.Vector2() }, uSigma: { value: BLUR[2] } };
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: u, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: BLUR_FRAG,
  }));
  const qs = new THREE.Scene(); qs.add(quad);
  const qc = new THREE.Camera();
  const clear = new THREE.Color(0, 0, 0);

  /** 把 scene 從 cam 畫進小畫面並模糊；回傳的貼圖給底圖合成用 */
  function render(scene, cam, sigma = u.uSigma.value) {
    const prevAlpha = renderer.getClearAlpha(), prevCol = renderer.getClearColor(new THREE.Color());
    renderer.setClearColor(clear, 0);
    renderer.setRenderTarget(raw); renderer.clear(); renderer.render(scene, cam);
    u.uSigma.value = sigma;
    u.tSrc.value = raw.texture; u.uDir.value.set(1 / width, 0);
    renderer.setRenderTarget(a); renderer.render(qs, qc);
    u.tSrc.value = a.texture; u.uDir.value.set(0, 1 / height);
    renderer.setRenderTarget(b); renderer.render(qs, qc);
    renderer.setRenderTarget(null); renderer.setClearColor(prevCol, prevAlpha);
    return b.texture;
  }
  return { render, texture: b.texture, u, targets: { raw, a, b } };
}
