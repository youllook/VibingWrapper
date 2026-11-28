// 無限騎行 — 場景組裝與渲染迴圈。
// 三招（docs/素材庫/mengto_ride_skills，MIT）：
//   1 endless-riding-parallax   → 這裡的 distance／landscape 閉環、terrain.js 的循環池
//   2 ride-particles-and-clouds → particles.js、sky.js 的 makeCloudPass
//   3 scroll-fisheye-dolly-zoom → lens.js（w 由狀態給，不接滾輪）
// 網址參數：?state=absent|clear|overcast|storm|clearing|waiting、?hour=0–24（或 ?day=1／?night=1）、?full=1 全解析、?w=0–1 固定鏡頭寬度
import * as THREE from './vendor/three.module.min.js';
import { U, P, roadC, roadC1, roadC2, roadE, roadE1, groundY, makeNoise } from './common.js';
import { makeTerrain, makeGrass, makeProps } from './terrain.js';
import { makeRider } from './rider.js';
import { makeSky, makeLandscape, makeCloudPass } from './sky.js';
import { makeParticles, CORRIDOR, SIDE } from './particles.js';
import { applyLens, makeComposite } from './lens.js';
import { createStates } from './states.js';

const q = new URLSearchParams(location.search);
const RES = q.get('full') ? 1 : 0.75;           // 場景渲染比例；雲再減半
const CLOUD_RES = 0.5, CLOUD_EVERY = +(q.get('cloudEvery') || 2);   // 雲每 2 格重算一次
const SMALL = innerWidth * innerHeight < 1.0e6;
const CAM = { fov: 50, pos: [-0.9, 2.05, 6.3], look: [0.9, 2.6, -10], near: 0.3, far: 9000 };
const LOOP = { period: 140, k: 6 };             // 遠景閉環：x = k·1.2(1−cos a)、z = k·12 sin a（食譜是 k＝1；場景以公尺計，放大才看得到）

// ── 時段色盤（預設＝傍晚前的斜陽；?hour 可改）──
const C = h => { const c = new THREE.Color(h); return new THREE.Vector3(c.r, c.g, c.b); };
const PAL = {
  day:    { el: 46, sun: C('#fff3dc'), sunI: 3.3, amb: C('#9db6dc'), ambI: 1.0,  top: C('#2463b4'), hor: C('#b6d0ea'), fog: C('#bcd0e6'), fogSun: C('#fff0d2'), stars: 0, shadow: 1 },
  golden: { el: 17, sun: C('#ffd49a'), sunI: 3.4, amb: C('#8ea4c8'), ambI: 0.85, top: C('#1f559f'), hor: C('#cdd3d4'), fog: C('#b4c0d0'), fogSun: C('#ffdcaa'), stars: 0, shadow: 1 },
  dusk:   { el: 6,  sun: C('#ff9858'), sunI: 2.3, amb: C('#6c78a8'), ambI: 0.6,  top: C('#24346a'), hor: C('#eea878'), fog: C('#9c8ea6'), fogSun: C('#ffae70'), stars: 0.15, shadow: 0.8 },
  night:  { el: 34, sun: C('#9cb2e8'), sunI: 0.5, amb: C('#2c3c6a'), ambI: 0.4,  top: C('#050a1a'), hor: C('#18233f'), fog: C('#182238'), fogSun: C('#3c4c78'), stars: 1, shadow: 0.5 },
};
const hour = q.get('day') ? 10.5 : q.get('night') ? 22 : q.get('hour') != null ? +q.get('hour') : 16.5;
const TOD = hour >= 8.5 && hour < 15 ? 'day' : hour >= 15 && hour < 18.5 ? 'golden' : hour >= 18.5 && hour < 20 || hour >= 5.5 && hour < 8.5 ? 'dusk' : 'night';
const DUSK_TO = TOD === 'night' ? 'night' : 'dusk';
const pal = {}; for (const k in PAL.golden) pal[k] = typeof PAL.golden[k] === 'number' ? 0 : new THREE.Vector3();
function mixPal(a, b, t) { for (const k in pal) { if (typeof a[k] === 'number') pal[k] = a[k] + (b[k] - a[k]) * t; else pal[k].lerpVectors(a[k], b[k], t); } }

// ── 渲染器與緩衝 ──
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); renderer.autoClear = true;
document.body.appendChild(renderer.domElement);
const gl = renderer.getContext();
let rt, cloudRT;
function makeTargets() {
  const w = Math.max(2, Math.round(innerWidth * RES)), h = Math.max(2, Math.round(innerHeight * RES));
  rt?.dispose(); cloudRT?.dispose();
  rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(w, h) });
  rt.depthTexture.minFilter = rt.depthTexture.magFilter = THREE.NearestFilter;
  cloudRT = new THREE.WebGLRenderTarget(Math.round(w * CLOUD_RES), Math.round(h * CLOUD_RES), { type: THREE.HalfFloatType, depthBuffer: false });
}
makeTargets();

const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(CAM.fov, innerWidth / innerHeight, CAM.near, CAM.far);
const baseCam = cam.clone();                     // 正常鏡頭（每格重建，鏡頭效果從它出發）

// ── 場景 ──
const noise = makeNoise(); U.uNoise.value = noise.tex2;
const sky = makeSky(); scene.add(sky);
const land = makeLandscape(noise); scene.add(land);          // 遠景全部掛這一個 transform
const terrain = makeTerrain(); scene.add(terrain);
const grass = makeGrass(SMALL); grass.forEach(g => scene.add(g));
const props = makeProps(); props.forEach(p => scene.add(p));
const rider = makeRider(); scene.add(rider.root);
const particles = makeParticles(SMALL ? 425 : 920); scene.add(particles);
const sunLight = new THREE.DirectionalLight('#fff', 1), hemi = new THREE.HemisphereLight('#fff', '#fff', 1), fill = new THREE.DirectionalLight('#fff', 1);
scene.add(sunLight, sunLight.target, hemi, fill); fill.position.set(-2, 3, 8);
const clouds = makeCloudPass(noise), post = makeComposite();
const states = createStates(q);

// ── 模擬狀態 ──
const sim = { distance: 137, t: 0, loopT: 0, travel: 0, drift: 0, cloudX: 0, cloudZ: 0, mistX: 0, w: states.cur.w, frame: 0, tailBlink: 0, flash: 0, nextStrike: 6 };
const prevVP = new THREE.Matrix4(), prevD = new THREE.Vector3(), tmp = new THREE.Vector3(), c0 = new THREE.Vector3(), grey = new THREE.Vector3();
const lum = v => v.x * 0.2126 + v.y * 0.7152 + v.z * 0.0722;
let firstFrame = true;
const FIX_W = q.get('w') != null ? +q.get('w') : null, STILL = !!q.get('still');

function tick(dt) {
  states.update(dt); const c = states.cur;
  sim.t += dt; sim.frame++;
  // 1) 一個累積里程驅動一切（JS double）；GPU 只拿各週期的餘數
  const dPrev = sim.distance % P;
  sim.distance += c.speed * dt;
  const d = sim.distance, dP = d % P, Cd = roadC(dP), Ed = roadE(dP);
  prevD.set(firstFrame ? dP : dP - c.speed * dt, roadC(dPrev), roadE(dPrev)); if (firstFrame) prevD.set(dP, Cd, Ed);
  U.uD.value = dP; U.uCd.value = Cd; U.uEd.value = Ed; U.uTime.value = sim.t % 3600; U.uWind.value = c.wind;
  for (const o of [...grass, ...props]) o.material.uniforms.uDl.value = d % o.userData.L;
  // 遠景：140 秒封閉的相機相對小迴圈（接縫處位置與速度都連續），再加上路的橫移／起伏造成的真實視差
  sim.loopT += dt * Math.min(1, c.speed / 10);
  const a = 2 * Math.PI * (sim.loopT % LOOP.period) / LOOP.period;
  land.position.set(LOOP.k * 1.2 * (1 - Math.cos(a)) - Cd, -Ed, LOOP.k * 12 * Math.sin(a));

  // 2) 色盤與天氣
  mixPal(PAL[TOD], PAL[DUSK_TO], c.dusk);
  const el = THREE.MathUtils.degToRad(pal.el), az = 0.62;
  U.uSun.value.set(-Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  U.uSunCol.value.copy(pal.sun).multiplyScalar(pal.sunI * c.sun);
  grey.setScalar(lum(U.uSunCol.value)); U.uSunCol.value.lerp(grey, c.dark * 0.6);
  U.uAmbCol.value.copy(pal.amb).multiplyScalar(pal.ambI * (1 + 0.3 * c.cover) * (1 - 0.4 * c.dark));
  grey.setScalar(lum(U.uAmbCol.value)); U.uAmbCol.value.lerp(grey, c.dark * 0.5);
  const fogL = lum(pal.fog);
  U.uFogCol.value.copy(pal.fog).lerp(tmp.set(0.36, 0.40, 0.46).multiplyScalar(fogL * 1.3), c.dark * 0.85).multiplyScalar(1 - 0.25 * c.dark);
  U.uFogSun.value.copy(pal.fogSun).multiplyScalar(0.6 + 0.4 * Math.min(1.2, c.sun)).lerp(U.uFogCol.value, c.dark * 0.8);
  U.uFogDen.value = 0.00032 + 0.0009 * c.mist + 0.0006 * c.dark;
  U.uMist.value = c.mist;
  const su = sky.material.uniforms;
  su.uSkyTop.value.copy(pal.top).lerp(tmp.set(0.2, 0.23, 0.28).multiplyScalar(lum(pal.top) * 3), c.dark * 0.8);
  su.uSkyHor.value.copy(pal.hor).lerp(U.uFogCol.value, c.dark * 0.8 + 0.1);
  su.uSunVis.value = 1; su.uStars.value = pal.stars * (1 - c.cover);
  const shadow = THREE.MathUtils.clamp(c.sun * 1.3 - 0.25, 0, 1) * pal.shadow;
  terrain.material.uniforms.uShadow.value = shadow; grass.forEach(g => g.material.uniforms.uShadow.value = shadow);
  const headOn = Math.max(c.dusk, TOD === 'night' ? 1 : 0, c.dark * 0.6);
  terrain.material.uniforms.uHead.value = headOn * 0.5; terrain.material.uniforms.uWet.value = c.wet;
  // 騎士用 three 內建材質：燈跟共用 uniform 同步（×π 對齊自寫 shader 的亮度）
  sunLight.color.setRGB(U.uSunCol.value.x, U.uSunCol.value.y, U.uSunCol.value.z); sunLight.intensity = Math.PI;
  sunLight.position.copy(U.uSun.value).multiplyScalar(50); sunLight.target.position.set(0, 1, 0);
  hemi.color.setRGB(U.uAmbCol.value.x, U.uAmbCol.value.y, U.uAmbCol.value.z); hemi.groundColor.setRGB(U.uAmbCol.value.x * 0.45, U.uAmbCol.value.y * 0.5, U.uAmbCol.value.z * 0.35); hemi.intensity = Math.PI;
  fill.color.copy(hemi.color); fill.intensity = 1.2;

  // 3) 騎士：朝向跟著路、過彎內傾、輪子照里程轉
  const braking = states.PARAMS[states.state].speed < c.speed - 1.5;
  sim.tailBlink = states.state === 'waiting' && c.speed < 1 ? 1.6 + 1.4 * Math.sin(sim.t * 2.4) : 0;
  rider.update(dt, sim.t, {
    dist: d % (Math.PI * 2 * 0.31 * 1000), speed: c.speed, wind: c.wind, look: c.look > 0.5, head: headOn,
    yaw: -Math.atan(roadC1(dP)), pitch: Math.atan(roadE1(dP)),
    roll: -Math.atan(c.speed * c.speed * roadC2(dP) / 9.8) + Math.sin(sim.t * 1.7) * Math.sin(sim.t * 0.9) * 0.012 * c.wind,
    tail: braking ? 4 : Math.max(1.0 + headOn, sim.tailBlink),
  });

  // 4) 鏡頭：先擺正常鏡頭，再套鎖主體的 dolly zoom（w 由狀態緩動）
  const ahead = roadC(dP + 18) - Cd, run = Math.min(1, c.speed / 10);
  baseCam.position.set(CAM.pos[0] + Math.sin(sim.t * 0.23) * 0.12 + ahead * 0.06, CAM.pos[1] + Math.sin(sim.t * 0.31 + 1) * 0.05 + Math.sin(sim.t * 7.3) * 0.004 * run, CAM.pos[2]);
  baseCam.lookAt(CAM.look[0] + ahead * 0.22, CAM.look[1], CAM.look[2]);
  baseCam.rotateZ(rider.root.children[0].rotation.z * 0.12);
  baseCam.fov = CAM.fov; baseCam.aspect = cam.aspect; baseCam.updateProjectionMatrix(); baseCam.updateMatrixWorld(true);
  c0.copy(rider.chest).project(baseCam);
  sim.w = FIX_W != null ? FIX_W : c.w;
  const lens = applyLens(cam, { pos: baseCam.position, quat: baseCam.quaternion, tanHalf: Math.tan(THREE.MathUtils.degToRad(CAM.fov) / 2) },
    rider.chest, c0, sim.w, (x, z) => groundY(x, z, dP) + 0.45);
  const pu = post.mat.uniforms, asp = cam.aspect, cx = c0.x * 0.5 + 0.5, cy = c0.y * 0.5 + 0.5;
  pu.uCenter.value.set(cx, cy); pu.uCurve.value = lens.curve; pu.uAspect.value = asp;
  pu.uMaxR2.value = Math.pow(Math.max(cx, 1 - cx) * asp, 2) + Math.pow(Math.max(cy, 1 - cy), 2);
  pu.uExposure.value = c.exposure * (TOD === 'night' ? 1.5 : 1); pu.uSat.value = c.sat;

  // 5) 粒子：走廊深度用里程推進，風再加一點；上一格的值留著拉殘影
  const m = particles.material.uniforms, dTravel = (c.speed + c.wind * 1.5) * dt, dDrift = c.wind * 2.2 * dt;
  sim.travel = (sim.travel + dTravel) % CORRIDOR; sim.drift = (sim.drift + dDrift) % SIDE;
  m.uTravel.value.set(sim.travel, sim.travel - dTravel); m.uDrift.value.set(sim.drift, sim.drift - dDrift); m.uTimeP.value.set(sim.t, sim.t - dt);
  m.uPrevD.value.copy(prevD); m.uCamZ.value = cam.position.z; m.uActive.value = c.part; m.uStreak.value = c.streak; m.uAspect.value = asp; m.uPx.value = 2 / rt.height;
  if (firstFrame) prevVP.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);   // 沒有歷史：這一格不拉殘影
  m.uPrevVP.value.copy(prevVP);

  // 6) 雲與霧：風推雜訊，跟路面各走各的（里程只帶一點點，遠景本來就慢）
  sim.cloudX = (sim.cloudX - (5 + 16 * c.wind) * dt) % 889200; sim.cloudZ = (sim.cloudZ - (2 + 4 * c.wind + c.speed * 0.25) * dt) % 889200;
  sim.mistX = (sim.mistX + (1.5 + 5 * c.wind) * dt) % 240;
  const cu = clouds.mat.uniforms;
  cu.uCover.value = c.cover; cu.uDark.value = c.dark; cu.uCloudOff.value.set(sim.cloudX, sim.cloudZ); cu.uMistOff.value.set(sim.mistX, 0);
  cu.uSkyHor.value.copy(su.uSkyHor.value); cu.uMistTop.value = 2.5 + 7 * c.mist; cu.uFrame.value = 0;
  // 執行（暴風）時偶爾一道雲內閃電：只亮雲，畫面整體只帶一點
  if (states.state === 'storm' && c.dark > 0.6 && !STILL) { sim.nextStrike -= dt; if (sim.nextStrike <= 0) { sim.flash = 1; sim.nextStrike = 9 + Math.random() * 12; } }
  sim.flash *= Math.exp(-dt * 5); if (sim.flash < 0.003) sim.flash = 0;
  const fl = sim.flash * (0.6 + 0.4 * Math.sin(sim.t * 55));
  cu.uFlash.value = fl; pu.uFlash.value = fl * 0.035;
  firstFrame = false;
}

function render() {
  renderer.setRenderTarget(rt); renderer.render(scene, cam);
  prevVP.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  if (sim.frame % CLOUD_EVERY === 0 || !render.did) {
    const cu = clouds.mat.uniforms;
    cu.uDepth.value = rt.depthTexture; cu.uProjInv.value.copy(cam.projectionMatrixInverse); cu.uCamWorld.value.copy(cam.matrixWorld);
    renderer.setRenderTarget(cloudRT); renderer.render(clouds.scene, cam);
    render.did = true;
  }
  const pu = post.mat.uniforms; pu.uScene.value = rt.texture; pu.uDepth.value = rt.depthTexture; pu.uCloud.value = cloudRT.texture; pu.uCloudPx.value.set(1 / cloudRT.width, 1 / cloudRT.height);
  renderer.setRenderTarget(null); renderer.render(post.scene, cam);
}

addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; makeTargets(); render.did = false; });

// ── 迴圈：30 fps 上限；wpPause／分頁隱藏時停 ──
const clock = { last: performance.now(), acc: 0, frames: 0 };
let paused = false;
window.wpPause = on => { paused = !!on; };
const stat = { frameMs: 0 };
renderer.setAnimationLoop(now => {
  if (paused || document.hidden) { clock.last = now; return; }
  const dt = Math.min(0.1, (now - clock.last) / 1000); clock.last = now;
  clock.acc += dt; if (clock.acc < 1 / 30 - 0.002) return;
  const step = clock.acc; clock.acc = 0;
  const t0 = performance.now();
  tick(step); render();
  stat.frameMs += (performance.now() - t0 - stat.frameMs) * 0.05;   // CPU 端送出一格的時間（GPU 時間用 theme.bench()）
  if (!window.__ready && ++clock.frames > 1) window.__ready = true;
});

// ── 測試介面（themes/README.md）──
window.theme = {
  scene, cam, renderer, rider, land, sim, states, U, PAL, CAM, LOOP, stat,
  STATES: states.STATES, PARAMS: states.PARAMS, CONFIG: states.CONFIG,
  applyState: states.applyState, setSessions: states.setSessions, requestState: states.applyState,
  get frameMs() { return stat.frameMs; },
  strike() { sim.flash = 1; },
  // 食譜 3 的自檢：胸口到座墊在輸出畫面上的像素距離（正常與拉廣應該只差幾個百分點）
  measure() {
    const pu = post.mat.uniforms, c = pu.uCenter.value, k = pu.uCurve.value, asp = pu.uAspect.value;
    const pts = [rider.chest, new THREE.Vector3(0, 0.8, 0.27)].map(p => {
      const n = p.clone().project(cam), u = new THREE.Vector2(n.x * 0.5 + 0.5, n.y * 0.5 + 0.5), o = u.clone();
      for (let i = 0; i < 12; i++) { const dx = (o.x - c.x) * asp, dy = o.y - c.y, f = (1 + k * (dx * dx + dy * dy) / pu.uMaxR2.value) / (1 + k); o.set(c.x + (u.x - c.x) / f, c.y + (u.y - c.y) / f); }
      return o;
    });
    return Math.hypot((pts[0].x - pts[1].x) * innerWidth, (pts[0].y - pts[1].y) * innerHeight);
  },
  // 手動推進（截圖、隱藏視窗用）：step(dt, n)；snap＝數值直接到位
  step(dt = 1 / 30, n = 1, snap = false) { if (snap) states.snap(); for (let i = 0; i < n; i++) { tick(dt); if (i >= n - 3) render(); } },
  render,
  // 量每格毫秒：連跑 n 格，每格後讀 1 像素逼 GPU 做完
  bench(n = 120) {
    const px = new Uint8Array(4); for (let i = 0; i < 10; i++) { tick(1 / 30); render(); }
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const t0 = performance.now();
    for (let i = 0; i < n; i++) { tick(1 / 30); render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
    return (performance.now() - t0) / n;
  },
  gpu() { const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); },
};
tick(1 / 30); render(); window.__ready = true;
console.log('endless-ride ready', TOD, 'tris', renderer.info.render.triangles);
