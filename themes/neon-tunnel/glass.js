// 霓虹隧道 · 擋風玻璃：雨珠折射、滑落的水痕、雨刷，加上光暈、色調映射。
// 世界先畫到 HDR render target；這一關把它當成「玻璃後面的景」去折射。
// 雨刷掃過的時間記在 256 格的角度表裡（每支雨刷一列），shader 用像素相對樞紐的角度查「多久前被掃過」，
// 再決定哪些雨珠已經長回來。
import * as THREE from 'three';

const FS_QUAD = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
const BINS = 256;

export const WIPERS = [
  // 樞紐（螢幕座標，x 已乘寬高比前的 0–1）、刷片半徑範圍、停放角與最高角（度，0＝朝右）
  { px: 0.2, py: 0.215, r0: 0.09, r1: 0.74, a0: 9, a1: 122 },
  { px: 0.6, py: 0.215, r0: 0.08, r1: 0.6, a0: 8, a1: 104 },
];

export function makeGlass(renderer) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const q = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  const rA = q(), rB = q(), rC = q(), rD = q();

  const stamps = new Float32Array(BINS * 2).fill(-1e4);
  const wipeTex = new THREE.DataTexture(stamps, BINS, 2, THREE.RedFormat, THREE.FloatType);
  wipeTex.magFilter = wipeTex.minFilter = THREE.LinearFilter; wipeTex.needsUpdate = true;

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quad.frustumCulled = false;
  const pscene = new THREE.Scene(); pscene.add(quad);
  const pcam = new THREE.Camera();
  const pass = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); renderer.render(pscene, pcam); };

  const down = new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
    vertexShader: FS_QUAD,
    fragmentShader: /* glsl */`
      varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel;
      void main(){ vec4 c = vec4(0.);
        for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) c += texture2D(tSrc, vUv + vec2(i, j) * uTexel * 1.5);
        gl_FragColor = min(c / 9., vec4(60.)); }`,
    depthTest: false, depthWrite: false,
  });
  const blur = new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
    vertexShader: FS_QUAD,
    fragmentShader: /* glsl */`
      varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uDir;
      void main(){ vec4 c = texture2D(tSrc, vUv) * 0.2270;
        c += (texture2D(tSrc, vUv + uDir * 1.3846) + texture2D(tSrc, vUv - uDir * 1.3846)) * 0.3162;
        c += (texture2D(tSrc, vUv + uDir * 3.2308) + texture2D(tSrc, vUv - uDir * 3.2308)) * 0.0703;
        gl_FragColor = c; }`,
    depthTest: false, depthWrite: false,
  });

  const U = {
    tScene: { value: rt.texture }, tBlur: { value: rA.texture }, tBlur2: { value: rC.texture }, tWipe: { value: wipeTex },
    uTime: { value: 0 }, uAspect: { value: 16 / 9 }, uRes: { value: size.clone() },
    uRain: { value: 1 }, uFill: { value: 9 }, uSpeed: { value: 0 }, uExposure: { value: 0.8 },
    uBloom: { value: 0.9 }, uLampFlash: { value: 0 }, uWipers: { value: WIPERS.map((w) => new THREE.Vector4(w.px, w.py, w.r0, w.r1)) },
    uWAng: { value: [0, 0] }, uWet: { value: 0 },
  };
  const comp = new THREE.ShaderMaterial({
    uniforms: U, vertexShader: FS_QUAD, depthTest: false, depthWrite: false,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform sampler2D tScene, tBlur, tBlur2, tWipe;
      uniform float uTime, uAspect, uRain, uFill, uSpeed, uExposure, uBloom, uLampFlash, uWet;
      uniform vec2 uRes; uniform vec4 uWipers[2]; uniform float uWAng[2];
      float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      vec3 h32(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }
      const float PI = 3.14159265;

      // 這個像素多久前被雨刷掃過（不在任何一支的掃動範圍內＝很久）
      float wipeAge(vec2 q){
        float age = 1e4;
        for (int i = 0; i < 2; i++) {
          vec2 d = q - vec2(uWipers[i].x * uAspect, uWipers[i].y);
          float r = length(d);
          if (r < uWipers[i].z || r > uWipers[i].w) continue;
          float a = atan(d.y, d.x);
          if (a < 0.) continue;
          float st = texture2D(tWipe, vec2(a / PI, (float(i) + 0.5) / 2.)).r;
          age = min(age, uTime - st);
        }
        return age;
      }
      // 靜止的雨珠：每格一顆，掃掉之後依各自的出生時間慢慢長回來
      // 回傳 (位移 xy, 球面高 z, 遮罩 w)
      vec4 drops(vec2 q, float scale, float age, float seed, float density){
        vec2 g = q * scale, id = floor(g), f = fract(g) - 0.5;
        vec3 h = h32(id + seed);
        if (h.z > density) return vec4(0.);
        vec2 c = (h.xy - 0.5) * 0.55;
        float rad = mix(0.1, 0.3, h21(id * 1.31 + seed) * h21(id * 0.71 - seed));
        float born = h21(id * 2.17 + seed * 3.) * uFill;
        float grow = smoothstep(born, born + 0.8, age);
        rad *= mix(0.4, 1., grow);
        vec2 d = (f - c) / vec2(rad, rad * 1.08);
        float l = dot(d, d);
        if (l >= 1. || grow <= 0.) return vec4(0.);
        float m = smoothstep(1., 0.7, l) * grow;
        return vec4(d * rad / scale, sqrt(1. - l), m);
      }
      // 往下滑的大水珠：每一欄一顆，拖出一串細小的水痕
      vec4 runners(vec2 q, float scale, float age, float seed){
        vec2 g = vec2(q.x * scale, q.y * scale * 0.25);
        float col = floor(g.x), fx = fract(g.x) - 0.5;
        vec3 h = h32(vec2(col, seed));
        if (h.z > 0.45 * uRain) return vec4(0.);
        float spd = mix(0.05, 0.16, h.x) * (1. + 0.6 * sin(uTime * 0.7 + h.y * 9.));
        float y = fract(h.y - uTime * spd * 0.25);             // 欄內的位置（0–1，往下減）
        float wob = sin(q.y * 30. + h.x * 20.) * 0.06 + (h.y - 0.5) * 0.35;
        float gy = fract(g.y);
        float dy = (gy - y) * 4.;                                // 換回接近等比
        vec2 d = vec2(fx - wob, dy) / vec2(0.16, 0.2);
        float l = dot(d, d);
        vec4 res = vec4(0.);
        float alive = smoothstep(0.5, 3., age);
        if (l < 1.) res = vec4(d * 0.16 / scale, sqrt(1. - l), smoothstep(1., 0.65, l) * alive);
        // 水痕：水珠上方（剛滑過的地方）一串小點
        float trail = dy > 0. && dy < 2.4 ? 1. : 0.;
        if (trail > 0. && res.w == 0.) {
          float k = floor(gy * 34.), ty = fract(gy * 34.) - 0.5;
          vec2 td = vec2((fx - wob) / 0.05, ty / 0.35);
          float tl = dot(td, td), keep = step(0.45, h21(vec2(k, col + seed)));
          if (tl < 1. && keep > 0.) res = vec4(td * 0.035 / scale, sqrt(1. - tl), (1. - dy / 2.4) * 0.8 * alive);
        }
        return res;
      }
      vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0., 1.); }
      void main(){
        vec2 q = vec2(vUv.x * uAspect, vUv.y);
        float age = wipeAge(q);
        vec4 d1 = drops(q, 28., age, 1.3, 0.75 * uRain);
        vec4 d2 = drops(q, 55., age, 7.9, 0.65 * uRain);
        vec4 d3 = drops(q, 110., age, 3.3, 0.55 * uRain);
        vec4 rr = runners(q, 9., age, 5.1);
        vec4 d = d1;
        if (d2.w > d.w) d = d2; if (d3.w > d.w) d = d3; if (rr.w > d.w) d = rr;
        // 水膜：剛掃過的那半秒有一層被拖開的水，之後很快乾掉；其他地方是細霧
        float smear = exp(-age * 2.2) * step(age, 2.);
        float mist = clamp(0.25 + 0.5 * smoothstep(0., uFill, age), 0., 1.) * uRain * 0.6;
        vec2 uv = vUv;
        // 雨珠像小凸透鏡：裡面是倒過來、縮小的景
        vec2 off = -d.xy * 7.5;
        off.x /= uAspect;
        vec3 sharp = texture2D(tScene, uv + off * d.w).rgb;
        vec3 soft = texture2D(tBlur, uv).rgb;
        vec3 col = mix(sharp, soft, mist * (1. - d.w) * 0.55);
        // 拖開的水膜：沿掃動方向的細紋
        float lines = sin(length(q - vec2(uWipers[1].x * uAspect, uWipers[1].y)) * 420.) * 0.5 + 0.5;
        col = mix(col, soft * (0.9 + 0.3 * lines), smear * 0.7);
        // 雨珠的暗邊與高光（光從左上的燈來）
        float rim = smoothstep(0.55, 1.0, 1. - d.z) * d.w;
        col *= 1. - 0.45 * rim;
        vec3 n = normalize(vec3(d.xy * 60., d.z + 0.2));
        float spec = pow(max(dot(n, normalize(vec3(-0.5, 0.7, 0.6))), 0.), 24.) * d.w;
        col += vec3(1., 0.62, 0.3) * spec * (0.6 + 2.5 * uLampFlash);
        // 光暈：兩層模糊減掉門檻
        vec3 b1 = max(texture2D(tBlur, uv).rgb - 0.8, 0.), b2 = max(texture2D(tBlur2, uv).rgb - 0.5, 0.);
        col += (b1 * 0.35 + b2 * 0.6) * uBloom;
        col = aces(col * uExposure);
        // 暗角＋一點顆粒
        vec2 vc = vUv - vec2(0.45, 0.5);
        col *= 1. - 0.55 * dot(vc, vc) * 1.6;
        col += (h21(gl_FragCoord.xy + fract(uTime) * 100.) - 0.5) * 0.012;
        col = pow(col, vec3(1. / 2.2));
        // 雨刷本體：細長的黑色刷片＋上緣一點反光
        for (int i = 0; i < 2; i++) {
          vec2 pv = vec2(uWipers[i].x * uAspect, uWipers[i].y);
          float a = uWAng[i];
          vec2 dir = vec2(cos(a), sin(a)), nrm = vec2(-dir.y, dir.x);
          vec2 rel = q - pv; float along = dot(rel, dir), across = dot(rel, nrm);
          float blade = step(uWipers[i].z * 0.6, along) * step(along, uWipers[i].w) * smoothstep(0.0075, 0.0045, abs(across + 0.002));
          float arm = step(0., along) * step(along, uWipers[i].w * 0.92) * smoothstep(0.0045, 0.0025, abs(across - 0.009));
          float hi = smoothstep(0.003, 0.0, abs(across - 0.0045)) * step(uWipers[i].z, along) * step(along, uWipers[i].w);
          col = mix(col, vec3(0.012, 0.01, 0.009), clamp(blade + arm, 0., 1.));
          col += vec3(0.5, 0.3, 0.14) * hi * (0.15 + 0.6 * uLampFlash);
        }
        gl_FragColor = vec4(col, 1.);
      }`,
  });

  function resize() {
    const s = renderer.getDrawingBufferSize(new THREE.Vector2());
    rt.setSize(s.x, s.y);
    const qw = Math.max(1, s.x >> 2), qh = Math.max(1, s.y >> 2);
    rA.setSize(qw, qh); rB.setSize(qw, qh);
    rC.setSize(Math.max(1, qw >> 2), Math.max(1, qh >> 2)); rD.setSize(rC.width, rC.height);
    U.uRes.value.copy(s); U.uAspect.value = s.x / s.y;
  }
  resize();

  // 雨刷：把這一格掃過的角度範圍蓋上時間戳記
  const prevAng = WIPERS.map((w) => w.a0 * Math.PI / 180);
  function wipe(i, ang, now) {
    const a = Math.min(prevAng[i], ang), b = Math.max(prevAng[i], ang);
    const i0 = Math.floor(a / Math.PI * BINS), i1 = Math.ceil(b / Math.PI * BINS);
    if (Math.abs(ang - prevAng[i]) > 1e-4) for (let k = Math.max(0, i0); k <= Math.min(BINS - 1, i1); k++) stamps[i * BINS + k] = now;
    prevAng[i] = ang; U.uWAng.value[i] = ang;
  }

  return {
    U, rt, resize, wipe,
    stampAll(now) { stamps.fill(now); wipeTex.needsUpdate = true; },
    render(scene, camera, overlay, now) {
      wipeTex.needsUpdate = true;
      U.uTime.value = now;
      renderer.setRenderTarget(rt); renderer.render(scene, camera);
      down.uniforms.tSrc.value = rt.texture; down.uniforms.uTexel.value.set(1 / rt.width, 1 / rt.height); pass(down, rA);
      blur.uniforms.tSrc.value = rA.texture; blur.uniforms.uDir.value.set(1 / rA.width, 0); pass(blur, rB);
      blur.uniforms.tSrc.value = rB.texture; blur.uniforms.uDir.value.set(0, 1 / rA.height); pass(blur, rA);
      down.uniforms.tSrc.value = rA.texture; down.uniforms.uTexel.value.set(1 / rA.width, 1 / rA.height); pass(down, rC);
      blur.uniforms.tSrc.value = rC.texture; blur.uniforms.uDir.value.set(1 / rC.width, 0); pass(blur, rD);
      blur.uniforms.tSrc.value = rD.texture; blur.uniforms.uDir.value.set(0, 1 / rC.height); pass(blur, rC);
      pass(comp, null);
      if (overlay) { const ac = renderer.autoClear; renderer.autoClear = false; renderer.clearDepth(); renderer.render(overlay, camera); renderer.autoClear = ac; }
    },
  };
}
