/* =====================================================================================
 * 麥塊世界 (creeper-window) — stage 4: light, effects, atmosphere, 2026-10-29
 *
 * Everything here works in world space (the scene root is mirrored, see scene.js; nothing below cares).
 *  - sky():      a dome with a navy gradient and a glow around the moon; the moon itself is an HDR square.
 *  - rain():     streaks as instanced line segments, animated in the vertex shader (no CPU work per frame).
 *  - water():    a mirror pass (reflection camera, clipped at the surface) + rain rings and a breeze in the normal.
 *  - glass():    the panes are never drawn in the main pass; a mask pass writes their drop normals, and the
 *                composite refracts the scene through them (static beads, sliding drops with trails).
 *  - post:       mist (a density field marched along each view ray from the window outwards: height falloff × drifting
 *                noise, moon-tinted in-scatter), then depth of field, glass, bloom, grade, grain.
 * ===================================================================================== */
import * as THREE from 'three';

const HASH = /* glsl */`
float hash1(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float hash1(vec3 p) { p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(mix(hash1(i), hash1(i + vec3(1,0,0)), f.x), mix(hash1(i + vec3(0,1,0)), hash1(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash1(i + vec3(0,0,1)), hash1(i + vec3(1,0,1)), f.x), mix(hash1(i + vec3(0,1,1)), hash1(i + vec3(1,1,1)), f.x), f.y), f.z);
}`;

/* ------------------------------ sky + moon ------------------------------ */
export function sky(moonDir) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uMoon: { value: moonDir.clone().normalize() }, uFlash: { value: 0 },
                uHor: { value: new THREE.Color(.034, .050, .092) }, uZen: { value: new THREE.Color(.004, .007, .018) },
                uHalo: { value: new THREE.Color(1, 1, 1) }, uDusk: { value: new THREE.Color(0, 0, 0) } },
    vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform vec3 uMoon, uHor, uZen, uHalo, uDusk; uniform float uFlash; varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir); float h = clamp(d.y, 0., 1.);
        vec3 col = mix(uHor, uZen, pow(h, .35));                                         // horizon → zenith (the time of day sets both)
        col += uDusk * pow(1. - h, 3.) * (.35 + .65 * max(dot(normalize(d.xz + 1e-4), normalize(uMoon.xz + 1e-4)), 0.));   // dusk / dawn: the horizon on the sun's side
        float m = max(dot(d, uMoon), 0.);
        col += uHalo * (vec3(.16, .20, .30) * pow(m, 500.) + vec3(.022, .032, .055) * pow(m, 150.) + vec3(.012, .018, .032) * pow(m, 40.) + vec3(.010, .015, .028) * pow(m, 6.));   // + a wide radial wash: the moon lights the sky   // halo round the moon / sun: tight ring, glow, faint wide
        col += vec3(.35, .40, .55) * uFlash * (0.4 + 0.6 * h);                           // far lightning
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), mat);
  dome.frustumCulled = false; dome.renderOrder = -10;
  return dome;
}

/* ------------------------------ rain ------------------------------ */
// box: world-space min/max; drops fall at `speed`, leaning with the wind; streaks fade with distance from the camera
export function rain(box, n = 9000) {
  const seed = new Float32Array(n * 2 * 4);
  for (let i = 0; i < n; i++) {
    const a = Math.random(), b = Math.random(), c = Math.random(), s = Math.random();
    for (let e = 0; e < 2; e++) seed.set([a, b, c, e ? 1 : 0], (i * 2 + e) * 4);
    seed[(i * 2) * 4 + 3] = 0; seed[(i * 2 + 1) * 4 + 3] = 0.5 + s * 0.5;   // tail end gets its own length factor
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uT: { value: 0 }, uMin: { value: box.min }, uSize: { value: box.getSize(new THREE.Vector3()) },
                uWind: { value: new THREE.Vector2(0.18, 0.05) }, uAmt: { value: 0.7 }, uCol: { value: new THREE.Color(0.42, 0.48, 0.58) } },   // grey-blue, not white
    vertexShader: `attribute vec4 seed; uniform float uT, uAmt; uniform vec3 uMin, uSize; uniform vec2 uWind;
      varying float vA;
      void main() {
        float speed = 13.0 + seed.z * 5.0;
        vec3 p = uMin + vec3(seed.x, 0., seed.y) * uSize;
        p.y = uMin.y + mod(seed.z * uSize.y * 7.31 - uT * speed, uSize.y);
        vec3 vel = normalize(vec3(uWind.x, -1., uWind.y));
        p += vel * seed.w * 0.9;                                     // the streak's tail (motion blur over ~1/25 s)
        p.x += uWind.x * (uMin.y + uSize.y - p.y) * 0.4;
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        float dist = -mv.z;
        vA = step(fract(seed.x * 7.13 + seed.y * 3.7), uAmt) * (1. - smoothstep(9., 30., dist)) * smoothstep(3.5, 8.0, dist);   // uAmt thins it; near streaks, the far rain is left to the mist
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 uCol; varying float vA; void main() { gl_FragColor = vec4(uCol * vA * 0.06, 1.); }`,
  });
  const lines = new THREE.LineSegments(g, mat);
  lines.frustumCulled = false;
  return lines;
}

/* ------------------------------ water ------------------------------ */
export function water(mesh, size) {
  const rt = new THREE.WebGLRenderTarget(size[0], size[1], { type: THREE.HalfFloatType });
  const mirrorCam = new THREE.PerspectiveCamera();
  const texMatrix = new THREE.Matrix4();
  const mat = new THREE.ShaderMaterial({
    fog: false,
    uniforms: { uRefl: { value: rt.texture }, uTexM: { value: texMatrix }, uT: { value: 0 }, uRain: { value: 0.7 },
                uFogCol: { value: new THREE.Color() }, uFogD: { value: 0 }, uCamPos: { value: new THREE.Vector3() },
                uMoonDir: { value: new THREE.Vector3(0, 1, 0) } },
    vertexShader: `uniform mat4 uTexM; varying vec4 vProj; varying vec3 vW;
      void main() { vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vProj = uTexM * w; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform sampler2D uRefl; uniform float uT, uRain, uFogD; uniform vec3 uFogCol, uCamPos, uMoonDir; varying vec4 vProj; varying vec3 vW;
      ${HASH}
      // rain rings: one candidate drop per 0.7-unit cell, each on its own cycle; the ring's slope bends the normal
      vec2 rings(vec2 p) {
        vec2 n = vec2(0.); float s = 0.7;
        for (int k = 0; k < 2; k++) {
          vec2 q = p / s + float(k) * 0.37, id = floor(q), f = fract(q) - .5;
          float h = hash1(id + float(k) * 9.1), ph = fract(uT * (0.9 + h * 0.6) + h);
          if (h < uRain) {
            vec2 c = vec2(hash1(id + 3.3), hash1(id + 7.7)) - .5; c *= .6;
            vec2 d = f - c; float r = length(d), R = ph * .45;
            float w = sin((r - R) * 40.) * smoothstep(.08, 0., abs(r - R)) * (1. - ph) * (1. - ph);
            n += d / max(r, 1e-3) * w;
          }
          s *= 0.53;
        }
        return n;
      }
      void main() {
        vec2 p = vW.xz;
        vec2 n = rings(p) * 0.6;
        n += (vec2(vnoise(vec3(p * 1.3, uT * .5)), vnoise(vec3(p * 1.3 + 5., uT * .5))) - .5) * .25;   // breeze
        vec3 V = normalize(uCamPos - vW);
        float fres = 0.04 + 0.96 * pow(1. - max(V.y, 0.), 5.);
        vec4 pr = vProj; pr.x += n.x * 0.012 * pr.w; pr.y += n.y * 0.06 * pr.w;   // ripples smear the reflection into vertical streaks (Fable #5)
        vec3 refl = texture2DProj(uRefl, pr).rgb;
        vec3 deep = vec3(.004, .008, .016);
        vec3 col = mix(deep, refl * 1.25, clamp(fres * 1.15 + .4, 0., 1.));
        // the moon's glitter: every ripple facet that tips towards it flashes (a broad path, sparkles on top)
        vec3 N = normalize(vec3(-n.x * 1.4, 1., -n.y * 1.4));
        float sp = max(dot(reflect(-V, N), uMoonDir), 0.);
        col += vec3(.75, .85, 1.1) * (pow(sp, 40.) * .12 + pow(sp, 600.) * 1.2);
        // a broad moonlit sheen over the whole lake (mc1: the water is the brightest thing outside after the moon) —
        // stronger towards the moon's side, broken up by the same ripples
        col += vec3(.05, .07, .11) * (pow(sp, 6.) * .9 + .15) * (.7 + .3 * n.y);
        float fog = 1. - exp(-pow(uFogD * length(uCamPos - vW), 2.));
        gl_FragColor = vec4(mix(col, uFogCol, fog), 1.);
      }`,
  });
  mesh.material = mat;
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const P = new THREE.Vector3(), N = new THREE.Vector3(0, 1, 0), C = new THREE.Vector3(), view = new THREE.Vector3(),
        target = new THREE.Vector3(), look = new THREE.Vector3(), rot = new THREE.Matrix4();
  // render the mirror image (hide: objects that must not show in it)
  function update(renderer, scene, cam, hide) {
    mesh.getWorldPosition(P);
    plane.setFromNormalAndCoplanarPoint(N, P);
    C.setFromMatrixPosition(cam.matrixWorld);
    view.subVectors(P, C).reflect(N).negate().add(P);
    rot.extractRotation(cam.matrixWorld);
    look.set(0, 0, -1).applyMatrix4(rot).add(C);
    target.subVectors(P, look).reflect(N).negate().add(P);
    mirrorCam.position.copy(view);
    mirrorCam.up.set(0, 1, 0).applyMatrix4(rot).reflect(N);
    mirrorCam.lookAt(target);
    mirrorCam.near = cam.near; mirrorCam.far = cam.far; mirrorCam.fov = cam.fov; mirrorCam.aspect = cam.aspect;
    mirrorCam.updateMatrixWorld(); mirrorCam.projectionMatrix.copy(cam.projectionMatrix);
    texMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(mirrorCam.projectionMatrix).multiply(mirrorCam.matrixWorldInverse);
    const vis = hide.map(o => o.visible); hide.forEach(o => (o.visible = false)); mesh.visible = false;
    const clip = renderer.clippingPlanes; renderer.clippingPlanes = [new THREE.Plane(N, -P.y - 0.02)];
    renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, mirrorCam);
    renderer.clippingPlanes = clip; hide.forEach((o, i) => (o.visible = vis[i])); mesh.visible = true;
    mat.uniforms.uCamPos.value.copy(C);
  }
  return { mat, rt, update, setSize: (w, h) => rt.setSize(w, h) };
}

/* ------------------------------ glass (mask pass) ------------------------------ */
// output: rg = drop normal * .5 + .5, b = how much of a drop is here (bead or film), a = 1 where there is glass
export function glassMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uWet: { value: 0.7 } },
    vertexShader: `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uT, uWet; varying vec3 vW;
      ${HASH}
      // one layer of beads: a bead in most cells, radius by hash; returns normal.xy and coverage in z
      vec3 beads(vec2 p, float scale, float density) {
        vec2 q = p * scale, id = floor(q), f = fract(q) - .5;
        float h = hash1(id);
        vec2 c = (vec2(hash1(id + 1.7), hash1(id + 4.3)) - .5) * .6;
        float r = .10 + .22 * hash1(id + 9.2);
        vec2 d = (f - c) * vec2(1., .85);
        float m = smoothstep(r, r * .55, length(d)) * step(1. - density, h);
        return vec3(d / r * m, m);
      }
      // sliding drops: per column a drop that runs down, pauses, runs; a trail of tiny beads above it
      vec3 sliders(vec2 p) {
        float cols = 3.2; float cx = p.x * cols, col = floor(cx); float fx = fract(cx) - .5;
        float h = hash1(vec2(col, 3.1));
        if (h > uWet * 1.1) return vec3(0.);
        float speed = .25 + .35 * hash1(vec2(col, 8.4));
        float t = uT * speed + h * 10.;
        float y = 1. - fract(t * .25);                       // 0..1 down a 4-unit tall cell
        y += sin(t * 6.) * .01;                              // stutter
        float cellY = p.y * .25, fy = fract(cellY);
        float wob = sin(p.y * 3. + h * 6.) * .08;
        vec2 d = vec2((fx - wob) * 1.0, (fy - y) * 4. * .45);
        float r = .16;
        float m = smoothstep(r, r * .5, length(d * vec2(1., 1.25)));
        vec2 n = d / r * m;
        // trail: above the drop, narrow, dotted
        float tr = smoothstep(.06, .0, abs(fx - wob)) * step(y, fy) * smoothstep(1., .0, (fy - y) * 4.);
        float dots = smoothstep(.35, .15, length(vec2(fx - wob, fract(p.y * 9.) - .5) * vec2(5., 1.)));
        float tm = tr * dots * .8;
        return vec3(n, max(m, tm));
      }
      void main() {
        vec2 p = vec2(vW.x, vW.y);
        vec3 a = beads(p, 9., .55 * uWet + .1), b = beads(p + 3.7, 17., .5 * uWet), s = sliders(p);
        vec2 n = a.xy + b.xy * .7 + s.xy * 1.2;
        float cov = clamp(max(max(a.z, b.z * .8), s.z), 0., 1.) * smoothstep(0., .25, uWet);   // dry glass: nothing
        gl_FragColor = vec4(clamp(n * .5 + .5, 0., 1.), cov, 1.);
      }`,
  });
}

/* ------------------------------ post ------------------------------ */
const FS_VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;
export function fullscreen(frag, uniforms) {
  const m = new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m); mesh.frustumCulled = false;
  const scene = new THREE.Scene(); scene.add(mesh);
  return { mat: m, scene, u: uniforms };
}

// mist: the scene's colour + depth → colour with in-scattered mist. Starts at the window plane (z = uWinZ), so the
// cabin stays clear. density(p) = base·exp(-(y - water)/H) · (0.4 + noise drifting with the wind) + a low band over the lake
export const MIST_FRAG = /* glsl */`
uniform sampler2D tColor, tDepth; uniform mat4 uInvProj, uCamWorld; uniform vec3 uCamPos, uMoonDir, uScat0, uScat1;
uniform float uT, uDens, uWinZ, uWaterY, uFlash; varying vec2 vUv;
${HASH}
float dens(vec3 p) {
  float h = p.y - uWaterY;
  float n = vnoise(p * .09 + vec3(uT * .05, 0., uT * .02)) * .65 + vnoise(p * .23 + vec3(uT * .11, uT * .02, 0.)) * .35;
  float band = exp(-max(h, 0.) / 1.6) * smoothstep(.35, .75, n) * 1.6;      // the mist lying on the lake
  return uDens * (exp(-max(h, 0.) / 9.) * (.35 + n * .9) + band);
}
void main() {
  vec3 c = texture2D(tColor, vUv).rgb;
  float d = texture2D(tDepth, vUv).x;
  vec4 vp = uInvProj * vec4(vUv * 2. - 1., d * 2. - 1., 1.); vp /= vp.w;
  if (d >= 1.) vp.xyz = normalize(vp.xyz) * 400.;
  vec3 wp = (uCamWorld * vec4(vp.xyz, 1.)).xyz, ro = uCamPos, rd = normalize(wp - ro);
  float dist = length(wp - ro);
  float t0 = rd.z > 1e-3 ? (uWinZ - ro.z) / rd.z : 1e9;
  if (t0 >= dist) { gl_FragColor = vec4(c, 1.); return; }                  // inside the cabin: no mist
  float t1 = min(dist, 160.);
  float mu = max(dot(rd, uMoonDir), 0.);
  vec3 scat = mix(uScat0, uScat1, pow(mu, 6.)) + vec3(.2, .24, .32) * uFlash;           // ambient / towards the moon or sun
  float T = 1.; vec3 S = vec3(0.);
  const int N = 9;
  float j = hash1(vUv * 913.7 + fract(uT));
  for (int i = 0; i < N; i++) {
    float a = (float(i) + j) / float(N), b = (float(i) + 1. + j) / float(N);
    float ta = t0 + (t1 - t0) * a * a, tb = t0 + (t1 - t0) * b * b;           // more steps near the window
    vec3 p = ro + rd * (ta + tb) * .5;
    float sig = dens(p), dt = tb - ta;
    float e = exp(-sig * dt);
    S += T * (1. - e) * scat; T *= e;
  }
  gl_FragColor = vec4(c * T + S, 1.);
}`;

// composite: depth of field (gather, near layer spills over), glass refraction + drops, bloom from the mip chain,
// a warm lantern haze, grade (ACES), vignette, grain
export const COMP_FRAG = /* glsl */`
uniform sampler2D tColor, tDepth, tMask; uniform vec2 uRes; uniform float uNear, uFar, uFocus, uAperture, uT, uExposure;
uniform vec2 uLamp; uniform float uLampGlow; uniform vec2 uCreeper; uniform float uCreeperGlow; uniform vec3 uCreeperCol;
uniform float uContrast, uSat, uBlack; uniform vec2 uMoon; uniform float uMoonGlow; uniform vec3 uGlowCol;
varying vec2 vUv;
float lin(float d) { float z = d * 2. - 1.; return 2. * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
float coc(float z) { float k = 1. / z - 1. / uFocus; return clamp(abs(k) * uAperture * (k < 0. ? .25 : 1.), 0., 14.); }   // the far field stays nearly sharp
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }
float h1(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 px = 1. / uRes;
  vec4 mk = texture2D(tMask, vUv);
  // glass: bend the view through the drops, a film of water softens everything behind it
  vec2 uv = vUv; float glass = mk.a, drop = mk.b; vec2 n = mk.rg * 2. - 1.;
  if (glass > .5) uv += n * drop * .022;
  float zc = lin(texture2D(tDepth, uv).x), R = coc(zc);
  if (glass > .5) R = max(R, .5 + drop * 1.5);
  // near-field spill: a blurry foreground pixel nearby widens this pixel's blur
  const int K = 12; const float GA = 2.39996;
  float Rn = R;
  for (int i = 0; i < 6; i++) {
    float a = float(i) * GA * 2., r = 14. * sqrt((float(i) + .5) / 6.);
    float zt = lin(texture2D(tDepth, uv + vec2(cos(a), sin(a)) * r * px).x);
    if (zt < zc) Rn = max(Rn, min(coc(zt), r + 2.) );
  }
  R = mix(R, Rn, .85);
  vec3 acc = vec3(0.); float wsum = 0.;
  float lod = clamp(log2(R * .5), 0., 3.);
  for (int i = 0; i < K; i++) {
    float a = float(i) * GA, r = R * sqrt((float(i) + .5) / float(K));
    vec2 o = vec2(cos(a), sin(a)) * r * px;
    vec3 s = texture2DLodEXT(tColor, uv + o, lod).rgb;
    float w = 1. + dot(s, vec3(.3, .5, .2)) * .6;        // bokeh: bright points weigh more
    acc += s * w; wsum += w;
  }
  vec3 c = acc / wsum;
  // bloom: the bright part of a few blurred mip levels
  vec3 bl = vec3(0.);
  bl += max(texture2DLodEXT(tColor, vUv, 2.).rgb - .7, 0.) * .45;
  bl += max(texture2DLodEXT(tColor, vUv, 3.5).rgb - .5, 0.) * .55;
  bl += max(texture2DLodEXT(tColor, vUv, 5.).rgb - .9, 0.) * .45;      // wide terms: only real lights (the lantern),
  bl += max(texture2DLodEXT(tColor, vUv, 6.5).rgb - .8, 0.) * .3;       // not the sky around the moon
  c += bl;
  // glass: drops catch the lantern (a warm rim on the side facing it) and the sky (a cool rim below)
  if (glass > .5) {
    vec2 toL = normalize(uLamp - vUv + 1e-4);
    float rimL = pow(max(dot(n, -toL), 0.), 6.) * drop, rimS = pow(max(n.y, 0.), 5.) * drop;
    float near = exp(-length((vUv - uLamp) * vec2(uRes.x / uRes.y, 1.)) * 3.);
    c += vec3(1., .62, .3) * rimL * (.25 + 1.4 * near) * uLampGlow + vec3(.35, .45, .65) * rimS * .12;
    c += vec3(1., .6, .3) * near * .035 * uLampGlow;                       // the lantern's reflection haze on the pane
    float cg = exp(-length((vUv - uCreeper) * vec2(uRes.x / uRes.y, 1.)) * 7.);
    c += uCreeperCol * cg * uCreeperGlow * (.4 + drop);                     // the creeper's green on the wet glass
  }
  // the moon's glow (mc1: a soft blue bloom around it), on screen so it also shows through the gaps between clouds
  float md = length((vUv - uMoon) * vec2(uRes.x / uRes.y, 1.));
  // how much of the moon shows: five depth taps over its face (anything nearer than ~300 is a cloud in front)
  float vis = 0.;
  for (int i = 0; i < 5; i++) {
    vec2 o = i == 0 ? vec2(0.) : vec2(cos(float(i) * 1.5708), sin(float(i) * 1.5708)) * vec2(.014 * uRes.y / uRes.x, .014);
    vis += step(300., lin(texture2D(tDepth, uMoon + o).x)) * .2;
  }
  float off = max(md - .045, 0.);                                     // from the moon's edge outwards: its face keeps its cells
  float inner = mix(1., smoothstep(.015, .036, md), vis);              // hidden: the glow may spill over the cloud in front
  c += uGlowCol * (exp(-off * 26.) * .34 + exp(-off * 8.) * .045) * inner * mix(.18, 1., vis) * uMoonGlow;
  // lantern haze in the room
  float lg = exp(-length((vUv - uLamp) * vec2(uRes.x / uRes.y, 1.)) * 4.5);
  c += vec3(1., .55, .22) * lg * .06 * uLampGlow;
  c *= uExposure;
  c = aces(c);
  // grade: lift the shadows a little towards blue, keep the warm highlights
  c = pow(c, vec3(1. / 2.2));
  c = mix(c, c * vec3(.94, .98, 1.08), smoothstep(.5, 0., dot(c, vec3(.33))));
  // the final filter: black point, an S-curve, saturation
  c = max(c - uBlack, 0.) / (1. - uBlack);
  c = mix(c, c * c * (3. - 2. * c), uContrast);
  float lum = dot(c, vec3(.2126, .7152, .0722));
  c = clamp(mix(vec3(lum), c, uSat), 0., 1.);
  float v = smoothstep(1.25, .35, length((vUv - .5) * vec2(1.25, 1.)));
  c *= mix(.62, 1., v);
  c += (h1(vUv * uRes + fract(uT) * 91.) - .5) * .025;
  gl_FragColor = vec4(c, 1.);
}`;
