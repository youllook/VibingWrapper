// 夢境之門 · 最後一道畫面處理（2026-11-28「要像高品質藝術品」）
// 場景先畫進 HDR 浮點畫布（4× MSAA），再依序：亮部擷取 → 多層光暈（bloom）→ 光束（從太陽往外的徑向模糊）
// → 合成：曝光、ACES 柔和壓高光、調色（冷暗部／暖亮部、飽和、對比）、暗角、底片顆粒 → 直接輸出 sRGB。
// 場景裡的材質畫進浮點畫布時 three.js 不做 sRGB 轉換（輸出線性），所以天空 shader 也要輸出線性值。
import * as THREE from 'three';

const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;
const quadGeo = new THREE.PlaneGeometry(2, 2);
function pass(frag, uniforms) {
  const m = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(quadGeo, m); mesh.frustumCulled = false;
  const s = new THREE.Scene(); s.add(mesh); return { m, s };
}
const rt = (w, h, o = {}) => new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), { type: THREE.HalfFloatType, depthBuffer: false, ...o });

export function createPost(renderer, scene, camera, sunDir, P = {}) {
  const prm = { exposure: 0.82, bloom: 0.4, threshold: 1.4, rays: 0.35, sat: 1.12, contrast: 1.06, vignette: 0.28, grain: 0.022, warm: 0.06, cool: 0.07, ...P };
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const LV = 6;
  let W = 1, H = 1, main, bright, mips = [], ups = [], rayA;

  const brightP = pass(`uniform sampler2D t; uniform float thr; varying vec2 vUv;
    void main(){ vec3 c = texture2D(t, vUv).rgb; if (any(isnan(c)) || any(isinf(c))) c = vec3(0.); c = min(c, vec3(32.)); float l = max(c.r, max(c.g, c.b));
      float k = clamp(l - thr + .25, 0., .5); k = k * k * 2.;                  // 柔和門檻
      gl_FragColor = vec4(c * max(k, l - thr) / max(l, 1e-4), 1.); }`, { t: { value: null }, thr: { value: prm.threshold } });
  const downP = pass(`uniform sampler2D t; uniform vec2 px; varying vec2 vUv;
    void main(){ vec3 c = texture2D(t, vUv).rgb * 4.;
      c += texture2D(t, vUv + px * vec2(-1,-1)).rgb + texture2D(t, vUv + px * vec2(1,-1)).rgb + texture2D(t, vUv + px * vec2(-1,1)).rgb + texture2D(t, vUv + px * vec2(1,1)).rgb;
      gl_FragColor = vec4(c / 8., 1.); }`, { t: { value: null }, px: { value: new THREE.Vector2() } });
  const upP = pass(`uniform sampler2D t, base; uniform vec2 px; varying vec2 vUv;
    void main(){ vec3 c = vec3(0.);
      c += texture2D(t, vUv + px * vec2(-2, 0)).rgb + texture2D(t, vUv + px * vec2(2, 0)).rgb + texture2D(t, vUv + px * vec2(0, -2)).rgb + texture2D(t, vUv + px * vec2(0, 2)).rgb;
      c += (texture2D(t, vUv + px * vec2(-1,-1)).rgb + texture2D(t, vUv + px * vec2(1,-1)).rgb + texture2D(t, vUv + px * vec2(-1,1)).rgb + texture2D(t, vUv + px * vec2(1,1)).rgb) * 2.;
      gl_FragColor = vec4(c / 12. + texture2D(base, vUv).rgb, 1.); }`, { t: { value: null }, base: { value: null }, px: { value: new THREE.Vector2() } });
  const raysP = pass(`uniform sampler2D t; uniform vec2 sun; uniform float aspect; varying vec2 vUv;
    void main(){ vec2 d = (sun - vUv) / 48.; vec2 uv = vUv; vec3 acc = vec3(0.); float w = 1.;
      for (int i = 0; i < 48; i++) { acc += texture2D(t, uv).rgb * w; w *= .955; uv += d; }
      vec2 q = (vUv - sun) * vec2(aspect, 1.); float fall = exp(-dot(q, q) * 1.6);
      gl_FragColor = vec4(acc / 16. * fall, 1.); }`, { t: { value: null }, sun: { value: new THREE.Vector2(.5, .5) }, aspect: { value: 1 } });
  const compP = pass(`uniform sampler2D tScene, tBloom, tRays; uniform float exposure, bloom, rays, sat, contrast, vignette, grain, warm, cool, time, raysOn; uniform vec2 res;
    varying vec2 vUv;
    vec3 aces(vec3 x){ return clamp(x * (2.51 * x + .03) / (x * (2.43 * x + .59) + .14), 0., 1.); }
    vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
    void main(){
      vec3 c = texture2D(tScene, vUv).rgb;
      if (any(isnan(c)) || any(isinf(c))) c = vec3(0.);                // 場景偶有壞像素（NaN）：別讓它擴散成整片黑
      c += texture2D(tBloom, vUv).rgb * bloom;
      c += texture2D(tRays, vUv).rgb * rays * raysOn * vec3(1., .86, .66);
      c = aces(c * exposure);
      c = toSRGB(c);
      float l = dot(c, vec3(.2126, .7152, .0722));
      c = mix(vec3(l), c, sat);                                      // 飽和
      c = (c - .5) * contrast + .5;                                  // 對比
      c += vec3(-.35, -.1, .45) * cool * (1. - smoothstep(.0, .55, l)); // 暗部偏冷（藍紫）
      c += vec3(.45, .2, -.3) * warm * smoothstep(.45, 1., l);        // 亮部偏暖（金）
      vec2 q = vUv - .5; q.x *= res.x / res.y;
      c *= 1. - vignette * smoothstep(.35, 1.05, length(q));        // 暗角
      c += (hash(vUv * res) - .5) * grain;                            // 底片顆粒
      gl_FragColor = vec4(clamp(c, 0., 1.), 1.);
    }`, { tScene: { value: null }, tBloom: { value: null }, tRays: { value: null }, exposure: { value: prm.exposure }, bloom: { value: prm.bloom }, rays: { value: prm.rays },
    sat: { value: prm.sat }, contrast: { value: prm.contrast }, vignette: { value: prm.vignette }, grain: { value: prm.grain }, warm: { value: prm.warm }, cool: { value: prm.cool },
    time: { value: 0 }, raysOn: { value: 1 }, res: { value: new THREE.Vector2() } });

  function setSize(w, h) {
    W = Math.max(1, Math.round(w)); H = Math.max(1, Math.round(h));
    [main, bright, rayA, ...mips, ...ups].forEach((r) => r && r.dispose());
    main = rt(W, H, { depthBuffer: true, samples: 4 });
    bright = rt(W >> 1, H >> 1); rayA = rt(W >> 2, H >> 2);
    mips = []; ups = [];
    for (let i = 0, w2 = W >> 1, h2 = H >> 1; i < LV; i++) { w2 = Math.max(1, w2 >> 1); h2 = Math.max(1, h2 >> 1); mips.push(rt(w2, h2)); ups.push(rt(w2, h2)); }
    compP.m.uniforms.res.value.set(W, H); raysP.m.uniforms.aspect.value = W / H;
  }
  const draw = (p, target) => { renderer.setRenderTarget(target); renderer.render(p.s, ortho); };
  const _v = new THREE.Vector3();
  function render(t = 0) {
    renderer.setRenderTarget(main); renderer.render(scene, camera);
    brightP.m.uniforms.t.value = main.texture; draw(brightP, bright);
    let src = bright;
    for (let i = 0; i < LV; i++) { downP.m.uniforms.t.value = src.texture; downP.m.uniforms.px.value.set(1 / src.width, 1 / src.height); draw(downP, mips[i]); src = mips[i]; }
    let up = mips[LV - 1];
    for (let i = LV - 2; i >= 0; i--) { upP.m.uniforms.t.value = up.texture; upP.m.uniforms.base.value = mips[i].texture; upP.m.uniforms.px.value.set(1 / up.width, 1 / up.height); draw(upP, ups[i]); up = ups[i]; }
    // 光束：太陽在畫面裡（或附近）才開
    _v.copy(camera.position).addScaledVector(sunDir, 500).project(camera);
    const on = _v.z < 1 ? THREE.MathUtils.clamp(1.6 - Math.max(Math.abs(_v.x), Math.abs(_v.y)), 0, 1) : 0;
    compP.m.uniforms.raysOn.value = on;
    if (on > 0) { raysP.m.uniforms.t.value = bright.texture; raysP.m.uniforms.sun.value.set(_v.x * .5 + .5, _v.y * .5 + .5); draw(raysP, rayA); }
    const u = compP.m.uniforms; u.tScene.value = main.texture; u.tBloom.value = up.texture; u.tRays.value = rayA.texture; u.time.value = t % 100;
    draw(compP, null);
  }
  return { render, setSize, uniforms: compP.m.uniforms, params: prm, threshold: brightP.m.uniforms.thr };
}
