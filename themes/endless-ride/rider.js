// 騎士＋小機車：全用 three.js 基本形狀拼（之後可換成 GLB）。原點在兩輪中間的地面，車頭朝 -Z。
import * as THREE from './vendor/three.module.min.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

export function makeRider() {
  const root = new THREE.Group(), lean = new THREE.Group(); root.add(lean);
  const M = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.75, metalness: 0 }, o));
  const mat = {
    tyre: M('#141414', { roughness: 0.95 }), metal: M('#8d9094', { roughness: 0.35, metalness: 0.8 }), dark: M('#26282b', { roughness: 0.6, metalness: 0.4 }),
    tank: M('#e8dcc0', { roughness: 0.35 }), seat: M('#3a2a20'), canvas: M('#5d6842'), roll: M('#b89a6a'),
    jacket: M('#c8361f', { roughness: 0.8 }), pants: M('#2b3340'), boot: M('#3b2a1e'), glove: M('#1c1c1c'),
    helmet: M('#efe8d8', { roughness: 0.3 }), visor: M('#101418', { roughness: 0.15, metalness: 0.6 }), skin: M('#c99b7a'),
    scarf: M('#f0c040', { side: THREE.DoubleSide, roughness: 0.9 }),
    tail: M('#400000', { emissive: '#ff2010', emissiveIntensity: 1.5 }), lamp: M('#fff0c0', { emissive: '#ffd890', emissiveIntensity: 1 }),
  };
  const add = (geo, m, p, parent = lean) => { const o = new THREE.Mesh(geo, m); o.position.copy(p); parent.add(o); return o; };
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 10);
  const q = new THREE.Quaternion(), d = V(0, 0, 0);
  function setLimb(o, a, b) { d.subVectors(b, a); const l = d.length(); o.position.addVectors(a, b).multiplyScalar(0.5); o.scale.set(o.userData.r, l, o.userData.r); o.quaternion.copy(q.setFromUnitVectors(UP, d.divideScalar(l))); }
  function limb(m, r, a, b, parent = lean) { const o = new THREE.Mesh(cyl, m); o.userData.r = r; parent.add(o); if (a) setLimb(o, a, b); return o; }

  // ── 車 ──
  const R = 0.31;
  function wheel(z) {
    const g = new THREE.Group(); g.position.set(0, R, z); lean.add(g);
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(R - 0.065, 0.065, 8, 22), mat.tyre); tyre.rotation.y = Math.PI / 2; g.add(tyre);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R - 0.13, 0.015, 6, 22), mat.metal); rim.rotation.y = Math.PI / 2; g.add(rim);
    for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.02, (R - 0.13) * 2, 0.022), mat.metal); s.rotation.x = i * Math.PI / 4; g.add(s); }
    const hub = new THREE.Mesh(cyl, mat.dark); hub.scale.set(0.06, 0.12, 0.06); hub.rotation.z = Math.PI / 2; g.add(hub);
    return g;
  }
  const wF = wheel(-0.68), wR = wheel(0.62);
  add(new THREE.BoxGeometry(0.2, 0.26, 0.36), mat.dark, V(0, 0.44, -0.02));                      // 引擎
  add(new THREE.BoxGeometry(0.1, 0.1, 0.9), mat.dark, V(0, 0.62, 0.05));                         // 車架
  const tank = add(new THREE.SphereGeometry(1, 14, 10), mat.tank, V(0, 0.80, -0.2)); tank.scale.set(0.15, 0.12, 0.25);
  add(new THREE.BoxGeometry(0.25, 0.07, 0.52), mat.seat, V(0, 0.80, 0.27));
  const fender = add(new THREE.BoxGeometry(0.13, 0.025, 0.42), mat.tank, V(0, 0.665, 0.66)); fender.rotation.x = -0.12;
  add(new THREE.BoxGeometry(0.12, 0.025, 0.3), mat.tank, V(0, 0.66, -0.68));
  add(new THREE.BoxGeometry(0.36, 0.2, 0.3), mat.canvas, V(0, 0.95, 0.66));                      // 後架行李
  const roll = add(cyl, mat.roll, V(0, 1.11, 0.66)); roll.scale.set(0.085, 0.44, 0.085); roll.rotation.z = Math.PI / 2;
  add(new THREE.BoxGeometry(0.03, 0.03, 0.32), mat.dark, V(0.19, 0.84, 0.66)); add(new THREE.BoxGeometry(0.03, 0.03, 0.32), mat.dark, V(-0.19, 0.84, 0.66));
  const tail = add(new THREE.BoxGeometry(0.11, 0.05, 0.03), mat.tail, V(0, 0.72, 0.87));
  limb(mat.metal, 0.04, V(0.16, 0.36, -0.05), V(0.17, 0.4, 0.78));                                // 排氣管
  limb(mat.dark, 0.022, V(0.17, 0.6, 0.2), V(0.1, 0.33, 0.62)); limb(mat.dark, 0.022, V(-0.17, 0.6, 0.2), V(-0.1, 0.33, 0.62));   // 後搖臂
  limb(mat.metal, 0.022, V(0.09, R, -0.68), V(0.09, 1.02, -0.42)); limb(mat.metal, 0.022, V(-0.09, R, -0.68), V(-0.09, 1.02, -0.42));   // 前叉
  limb(mat.dark, 0.018, V(-0.31, 1.05, -0.4), V(0.31, 1.05, -0.4));                               // 把手
  for (const s of [-1, 1]) { limb(mat.dark, 0.008, V(s * 0.24, 1.05, -0.4), V(s * 0.33, 1.25, -0.37)); const mr = add(new THREE.SphereGeometry(0.05, 8, 6), mat.dark, V(s * 0.33, 1.27, -0.37)); mr.scale.set(1, 0.7, 0.3); }
  add(new THREE.SphereGeometry(0.085, 10, 8), mat.lamp, V(0, 0.93, -0.53));
  limb(mat.dark, 0.012, V(-0.2, 0.36, 0.02), V(0.2, 0.36, 0.02));                                 // 腳踏桿

  // ── 人 ──
  add(new THREE.BoxGeometry(0.31, 0.18, 0.27), mat.pants, V(0, 0.93, 0.24));
  const torso = new THREE.Group(); torso.position.set(0, 0.98, 0.24); lean.add(torso);
  const chest = add(new THREE.CapsuleGeometry(0.15, 0.3, 4, 10), mat.jacket, V(0, 0.28, 0), torso); chest.scale.set(1.28, 1, 0.92);
  add(new THREE.BoxGeometry(0.26, 0.3, 0.12), mat.canvas, V(0, 0.3, 0.16), torso);                // 小背包
  const head = new THREE.Group(); head.position.set(0, 0.6, -0.01); torso.add(head);
  add(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 8), mat.skin, V(0, -0.02, 0), head);
  add(new THREE.SphereGeometry(0.14, 16, 12), mat.helmet, V(0, 0.12, 0), head);
  add(new THREE.BoxGeometry(0.215, 0.075, 0.1), mat.visor, V(0, 0.125, -0.095), head);
  add(new THREE.BoxGeometry(0.035, 0.02, 0.29), mat.jacket, V(0, 0.255, 0), head);                // 帽頂色條
  add(new THREE.BoxGeometry(0.17, 0.09, 0.06), mat.helmet, V(0, 0.04, -0.11), head);              // 下巴護罩
  const arms = [-1, 1].map(s => ({ s, up: limb(mat.jacket, 0.052), lo: limb(mat.jacket, 0.045), hand: add(new THREE.SphereGeometry(0.055, 8, 6), mat.glove, V(0, 0, 0)) }));
  const legs = [-1, 1].map(s => ({ s, up: limb(mat.pants, 0.075), lo: limb(mat.pants, 0.058), boot: add(new THREE.BoxGeometry(0.1, 0.09, 0.25), mat.boot, V(0, 0, 0)) }));
  // 圍巾：9 節的帶子，每格在 CPU 更新
  const SN = 9, sPos = new Float32Array((SN + 1) * 2 * 3), sIdx = [];
  for (let i = 0; i < SN; i++) { const a = i * 2; sIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const sGeo = new THREE.BufferGeometry(); sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3)); sGeo.setIndex(sIdx);
  const scarf = new THREE.Mesh(sGeo, mat.scarf); scarf.frustumCulled = false; lean.add(scarf);
  const collar = add(new THREE.TorusGeometry(0.075, 0.035, 6, 12), mat.scarf, V(0, 0.585, 0), torso); collar.rotation.x = Math.PI / 2;

  const a = V(0, 0, 0), b = V(0, 0, 0), c = V(0, 0, 0), e = V(0, 0, 0), sw = V(0, 0, 0);
  const st = { look: 0, stop: 0, flap: 0 };
  function update(dt, t, o) {   // o: { dist, speed, yaw, pitch, roll, look(0/1 目標), wind, tail }
    const k = x => 1 - Math.exp(-x * dt);
    const stopT = o.speed < 0.6 ? 1 : 0;
    st.stop += (stopT - st.stop) * k(2.2);
    st.look += ((o.look && o.speed < 1.5 ? 1 : 0) - st.look) * k(1.6);
    const run = Math.min(1, o.speed / 8), ride = 1 - st.stop;
    root.rotation.set(o.pitch, o.yaw, 0, 'YXZ');
    lean.rotation.z = o.roll + st.stop * 0.075;                                           // 停車時往左靠、左腳撐地
    lean.position.y = Math.sin(t * 9.2) * 0.004 * (1.2 - run) + (Math.sin(o.dist * 0.83) * 0.008 + Math.sin(o.dist * 2.3 + 1) * 0.004) * run;
    wF.rotation.x = wR.rotation.x = -(o.dist / R) % (Math.PI * 2);
    const breathe = Math.sin(t * 1.4) * 0.012;
    torso.rotation.set(-0.36 * ride - 0.1 * st.stop + breathe - run * 0.04 * Math.sin(t * 0.7), 0.5 * st.look, -0.5 * st.stop * 0.06);
    head.rotation.set(0.3 * ride + 0.05 + Math.sin(t * 0.43) * 0.03, 1.3 * st.look + Math.sin(t * 0.31) * 0.06 * (1 - st.look), 0);
    torso.updateMatrix(); head.updateMatrix();
    for (const A of arms) {
      a.set(A.s * 0.215, 0.47, 0).applyMatrix4(torso.matrix); c.set(A.s * 0.28, 1.06, -0.4);
      if (A.s < 0) c.lerp(e.set(-0.2, 0.9, 0.05), st.look * 0.9);                         // 回頭時左手離把、搭在大腿
      b.addVectors(a, c).multiplyScalar(0.5); b.y -= 0.07; b.x += A.s * 0.07;
      setLimb(A.up, a, b); setLimb(A.lo, b, c); A.hand.position.copy(c);
    }
    for (const Lg of legs) {
      a.set(Lg.s * 0.11, 0.9, 0.2); c.set(Lg.s * 0.2, 0.4, 0.03);
      if (Lg.s < 0) c.lerp(e.set(-0.42, 0.09, 0.16), st.stop);
      b.addVectors(a, c).multiplyScalar(0.5); b.z -= 0.2 - 0.05 * st.stop * (Lg.s < 0 ? 1 : 0); b.y += 0.1; b.x += Lg.s * 0.05;
      setLimb(Lg.up, a, b); setLimb(Lg.lo, b, c); Lg.boot.position.set(c.x, c.y - 0.03, c.z - 0.05);
      Lg.boot.rotation.z = Lg.s < 0 ? -st.stop * 0.075 : 0;
    }
    // 圍巾：停著垂下，越快越往後飄
    const stream = Math.min(1, o.speed / 12 + o.wind * 0.12), amp = 0.02 + 0.07 * stream + 0.03 * o.wind;
    st.flap += dt * (3 + 14 * stream);
    a.set(0.05, 0.56, 0.1).applyMatrix4(torso.matrix);
    sw.set(0.05 * o.wind, -1 + stream * 1.12, 0.12 + stream).normalize();
    for (let i = 0; i <= SN; i++) {
      const u = i / SN, wv = Math.sin(st.flap - i * 0.85) * amp * u, wv2 = Math.cos(st.flap * 0.8 - i * 0.6) * amp * u;
      const px = a.x + sw.x * u * 0.62 + wv, py = a.y + sw.y * u * 0.62 + wv2 - u * u * 0.12 * stream, pz = a.z + sw.z * u * 0.62;
      const w = 0.05 * (1 - u * 0.35);
      sPos.set([px - w * 0.8, py + w * 0.6, pz, px + w * 0.8, py - w * 0.6, pz], i * 6);
    }
    sGeo.attributes.position.needsUpdate = true; sGeo.computeVertexNormals();
    mat.tail.emissiveIntensity = o.tail;
    mat.lamp.emissiveIntensity = 0.6 + o.head * 3;
  }
  return { root, update, st, chest: V(0, 1.15, 0) };
}
