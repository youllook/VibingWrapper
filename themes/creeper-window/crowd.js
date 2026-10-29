/* =====================================================================================
 * 麥塊世界 (creeper-window) — the crowd, 2026-10-29
 *
 * A pack of creepers that runs out to stare into the cabin. Twenty of them as full models would cost ~36 draw calls
 * each; here every body part is one InstancedMesh (legs, torso, head → about 8 draw calls for all of them), and each
 * creeper's pose is built on the CPU every frame: root (position, yaw, scale) → hips → torso (lean) → neck → head
 * (tilt, look) and four hips → legs (swing).
 *  - Positions and yaws are in layout space: the meshes go under the mirrored exterior group (see scene.js).
 *  - Each creeper has a target spot, a start spot it runs from, a delay (they come out one after another) and its own
 *    random phases for the idle head moves.
 *  - aFlash (per instance) washes a creeper pale: the fuse while Claude waits for you.
 * ===================================================================================== */
import * as THREE from 'three';
import { texture } from './assets.js';

const PX = 1 / 16;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// a Lambert material with a per-instance pale wash (aFlash) and a cool rim where the surface turns away from the
// camera (the moon is behind them: their outlines catch it, so they read against the dark without glowing)
export const crowdRim = { value: 1 };                               // 1 at night (the theme sets it)
// the far ones (aFar = 1) are small shapes out on the shore: at night they get the cabin's light on the side facing it
// (it lifts the green by its own colour, so the dark eyes and mouth stay dark and the face reads) and a stronger rim
export const crowdFar = { value: 1 };                               // 0 by day .. 1 at night (the theme sets it)
function flashMat(map) {
  const m = new THREE.MeshLambertMaterial({ map });
  m.onBeforeCompile = sh => {
    sh.uniforms.uRim = crowdRim; sh.uniforms.uFar = crowdFar;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aFlash, aFar; varying float vFlash, vFar;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlash = aFlash; vFar = aFar;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFlash, vFar; uniform float uRim, uFar;')
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        gl_FragColor.rgb += vec3(.10, .12, .10) * vFlash;
        float rim = 1. - abs(dot(normalize(normal), normalize(vViewPosition)));
        gl_FragColor.rgb += vec3(.035, .05, .08) * pow(rim, 2.) * uRim * (1. + 2.5 * vFar * uFar);
        float front = max(0., dot(normalize(normal), normalize(vViewPosition)));
        gl_FragColor.rgb += diffuseColor.rgb * vec3(.55, .42, .26) * (.25 + .75 * front) * vFar * uFar;`);
  };
  return m;
}

// spots: [{ pos: [x,y,z], scale, start: [x,y,z], delay, near }] in layout space; parent: the mirrored exterior group
export function creeperCrowd(parent, spots, seed = 5) {
  const n = spots.length;
  const skin = flashMat(texture('creeper_skin', seed)), skin2 = flashMat(texture('creeper_skin', seed + 1));
  const face = flashMat(texture('creeper_face', seed + 2));
  const part = (w, h, d, mats, count) => {
    const g = new THREE.BoxGeometry(w * PX, h * PX, d * PX);
    g.setAttribute('aFlash', new THREE.InstancedBufferAttribute(new Float32Array(count), 1));
    const far = new Float32Array(count), k = count / n;
    spots.forEach((s, i) => { if (!s.near) far.fill(1, i * k, (i + 1) * k); });
    g.setAttribute('aFar', new THREE.InstancedBufferAttribute(far, 1));
    const m = new THREE.InstancedMesh(g, mats, count);
    m.castShadow = m.receiveShadow = true; m.frustumCulled = false;
    parent.add(m); return m;
  };
  const legs = part(4, 6, 4, skin2, n * 4);
  const torso = part(8, 12, 4, skin, n);
  const heads = part(8, 8, 8, [skin, skin, skin, skin, face, skin], n);   // the face looks +z (the model's front)
  const tint = new THREE.Color();
  spots.forEach((s, i) => {
    const r = Math.sin(i * 91.7 + seed) * 0.5 + 0.5;                        // a little shade per creeper
    tint.setRGB(0.86 + r * 0.22, 0.9 + r * 0.16, 0.86 + r * 0.2);
    for (const [m, k] of [[torso, 1], [heads, 1], [legs, 4]]) for (let j = 0; j < k; j++) m.setColorAt(i * k + j, tint);
    s.ph = r * 10; s.ph2 = Math.cos(i * 37.1) * 5;                          // idle phases
    // idle moves (clear): eased [from, to, t0, duration] for a body turn, a step along x (near ones), a head look
    s.idle = { next: 2 + r * 6, yaw: [0, 0, 0, 1], off: [0, 0, 0, 1], hy: [0, 0, 0, 1], hx: [0, 0, 0, 1], back: 0, step: 0 };
  });

  const M = new THREE.Matrix4(), R = new THREE.Matrix4(), B = new THREE.Matrix4(), Hd = new THREE.Matrix4(), T = new THREE.Matrix4();
  const S = new THREE.Matrix4(), E = new THREE.Euler(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), V = new THREE.Vector3(1, 1, 1);
  const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
  const LEGS = [[-2, 4], [2, 4], [-2, -4], [2, -4]];
  const ev = (o, t) => o[0] + (o[1] - o[0]) * ss(0, 1, (t - o[2]) / o[3]);
  const go = (o, t, b, d, delay = 0) => { o[0] = ev(o, t); o[1] = b; o[2] = t + delay; o[3] = d; };
  // idle (clear): each creeper on its own clock turns its head to look about, shifts round on the spot, and the near
  // ones now and then pace a short step along the deck and turn back to the window
  function idle(s, t, roam) {
    const d = s.idle;
    if (roam < 0.5) {                                                        // other states: settle back
      if (d.back >= 0) { for (const k of ['yaw', 'off', 'hy', 'hx']) go(d[k], t, 0, 0.8); d.back = -1; d.step = t + 0.8; }
      return;
    }
    if (d.back < 0) { d.back = 0; d.next = t + 1 + Math.random() * 4; }
    if (d.back > 0 && t > d.back) { go(d.yaw, t, (Math.random() - 0.5) * 0.3, 0.6); d.back = 0; d.step = t + 0.6; }
    if (t < d.next) return;
    const k = Math.random();
    if (s.near && k < 0.3) {                                                 // pace: side-on, a step along x, then back
      let x; do x = (Math.random() * 2 - 1) * 0.3; while (Math.abs(x - d.off[1]) < 0.15);
      const dir = Math.sign(x - d.off[1]), dur = Math.abs(x - d.off[1]) / 0.5 + 0.3;
      go(d.hy, t, 0, 0.5); go(d.yaw, t, -dir * 1.3, 0.5); go(d.off, t, x, dur, 0.4);
      d.back = t + 0.4 + dur; d.step = d.back; d.next = d.back + 2 + Math.random() * 4;
    } else if (k < 0.5) {                                                    // shift round on the spot
      go(d.yaw, t, (Math.random() - 0.5) * (s.near ? 0.8 : 1.2), 0.7); d.step = t + 0.7;
      d.next = t + 2 + Math.random() * 5;
    } else {                                                                 // look about
      const y = Math.random() < 0.25 ? 0 : (Math.random() * 2 - 1) * 0.8;
      go(d.hy, t, y, 0.5 + Math.random() * 0.6); go(d.hx, t, y ? -0.06 + Math.random() * 0.18 : 0, 0.7);
      d.next = t + 1.5 + Math.random() * 4.5;
    }
  }

  // t: seconds since the crowd was called out (counts down when sent away); cam: camera position in layout space;
  // pose: { tilt, lean, look, fuse } 0..1 eased by the theme; simT: time; groundAt(x, z): ground height
  function update({ t, cam, pose, simT, groundAt }) {
    spots.forEach((s, i) => {
      const run = s.near ? 2.2 : 3.2;                                        // seconds of running
      const p = ss(s.delay, s.delay + run, t);
      if (p <= 0) {                                                          // not out yet
        torso.setMatrixAt(i, HIDE); heads.setMatrixAt(i, HIDE); for (let j = 0; j < 4; j++) legs.setMatrixAt(i * 4 + j, HIDE);
        return;
      }
      const moving = p > 0 && p < 1;
      if (!moving) idle(s, simT, pose.roam || 0);
      const off = moving ? 0 : ev(s.idle.off, simT), stepping = !moving && simT < s.idle.step;
      P.set(s.start[0] + (s.pos[0] - s.start[0]) * p + off, 0, s.start[2] + (s.pos[2] - s.start[2]) * p);
      P.y = moving ? groundAt(P.x, P.z) : s.pos[1];
      // facing: along the run while running, then round to the window
      const runYaw = Math.atan2(s.pos[0] - s.start[0], s.pos[2] - s.start[2]);
      const lookYaw = Math.atan2(cam.x - s.pos[0], cam.z - s.pos[2]);
      let dy = lookYaw - runYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const yaw = runYaw + dy * ss(0.85, 1, p) + (moving ? 0 : ev(s.idle.yaw, simT));
      const hop = moving ? Math.abs(Math.sin(simT * 14 + s.ph)) * 0.06 * s.scale : 0;
      M.compose(P.setY(P.y + hop), Q.setFromEuler(E.set(0, yaw, 0)), V.setScalar(s.scale));
      // torso: pivots at the hips; leans towards the glass while Claude runs tools (the near ones more)
      const breathe = Math.sin(simT * 0.8 + s.ph) * 0.012;
      const lean = (moving ? 0.25 : pose.lean * (s.near ? 0.1 : 0.06)) + breathe;
      B.copy(M).multiply(T.makeTranslation(0, 6 * PX, 0)).multiply(R.makeRotationX(lean));
      torso.setMatrixAt(i, S.copy(B).multiply(T.makeTranslation(0, 6 * PX, 0)));
      // head: tilts (thinking: each at its own pace), turns to the camera (waiting)
      const tilt = pose.tilt * Math.sin(simT * 0.6 + s.ph) * 0.25 + Math.sin(simT * 0.37 + s.ph2) * 0.03;
      let toCam = lookYaw - yaw; toCam = Math.atan2(Math.sin(toCam), Math.cos(toCam));
      const turn = pose.look * toCam * 0.85 + (1 - pose.look) * (Math.sin(simT * 0.21 + s.ph) * 0.12 + ev(s.idle.hy, simT));
      Hd.copy(B).multiply(T.makeTranslation(0, 12 * PX, 0)).multiply(R.makeRotationFromEuler(E.set(-pose.look * 0.08 + ev(s.idle.hx, simT), turn, tilt, 'YXZ')));
      heads.setMatrixAt(i, Hd.multiply(T.makeTranslation(0, 4 * PX, 0)));
      // legs: diagonal pairs swing while running
      const sw = moving ? Math.sin(simT * 14 + s.ph) * 0.7 : stepping ? Math.sin(simT * 8 + s.ph) * 0.4 : 0;
      LEGS.forEach(([lx, lz], j) => {
        S.copy(M).multiply(T.makeTranslation(lx * PX, 6 * PX, lz * PX)).multiply(R.makeRotationX((j === 0 || j === 3) ? sw : -sw));
        legs.setMatrixAt(i * 4 + j, S.multiply(T.makeTranslation(0, -3 * PX, 0)));
      });
      // the fuse: a pale wash on a beat that ripples outwards from the window (the near ones first)
      const beat = Math.pow(Math.max(0, Math.sin(simT * Math.PI / 0.8 - s.delay * 1.3)), 6);
      const f = pose.fuse * beat * (moving ? 0 : 1);
      torso.geometry.attributes.aFlash.setX(i, f); heads.geometry.attributes.aFlash.setX(i, f);
      for (let j = 0; j < 4; j++) legs.geometry.attributes.aFlash.setX(i * 4 + j, f);
    });
    for (const m of [legs, torso, heads]) { m.instanceMatrix.needsUpdate = true; m.geometry.attributes.aFlash.needsUpdate = true; }
  }
  const last = Math.max(...spots.map(s => s.delay + (s.near ? 2.2 : 3.2)));
  return { update, meshes: [legs, torso, heads], materials: [skin, skin2, face], duration: last };
}
