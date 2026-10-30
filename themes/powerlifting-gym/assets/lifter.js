// 比例假人：重量級健力選手（身高約 1.80 m、體重約 120 kg），膠囊／橢球拼成，有關節階層
// 用途：階段 3 擺場景、量 J 鉤高度與槓位、鏡頭構圖、試動作節奏。正式選手之後走 Tripo＋綁骨。
// 原點＝兩腳中間的地板，面朝 +Z；選手的左邊是 +X（_L 在 +X）。
import * as THREE from '../vendor/three.module.min.js';
import { mesh, rng } from '../lib/kit.js';

// ── 尺寸（公尺）──────────────────────────────────────────
const D = {
  ankleY: 0.085,        // 腳踝離地
  shin: 0.44,           // 踝→膝
  thigh: 0.45,          // 膝→髖關節
  hipHalf: 0.10,        // 兩髖關節半距
  stanceHalf: 0.26,     // 兩踝半距（腳比肩寬）
  ankleZ: -0.05,        // 踝的 z（讓腳掌中段落在原點附近）
  toeOut: 30,           // 腳尖外八（度）
  spineY: 0.12,         // 髖→腰椎樞紐
  chestY: 0.22,         // 腰椎→胸樞紐
  shoulderY: 0.20,      // 胸樞紐→肩關節高
  upperArm: 0.31,
  foreArm: 0.28,
  hand: 0.17,
  barAnchor: [0, 0.15, -0.19],   // 胸座標裡的低槓位（後三角肌下、肩胛骨上）
};
const SHOULDER_X = 0.225;          // 肩關節半寬
const BAR_Z = -0.01;               // 平衡：槓中心的 z 落在腳掌中段

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const deg = THREE.MathUtils.degToRad;
const lerp = THREE.MathUtils.lerp;

// ── 形體小工具 ────────────────────────────────────────────
function cap(r, len, slot, y, sx = 1, sz = 1, seg = 10) {
  const m = mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, len), 3, seg), slot);
  m.position.y = y; m.scale.set(sx, 1, sz);
  return m;
}
function ell(rx, ry, rz, slot, x = 0, y = 0, z = 0, w = 14, h = 9) {
  const m = mesh(new THREE.SphereGeometry(1, w, h), slot);
  m.scale.set(rx, ry, rz); m.position.set(x, y, z);
  return m;
}
function cyl(rt, rb, h, slot, y, sx = 1, sz = 1, seg = 12, open = false) {
  const m = mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), slot);
  m.position.y = y; m.scale.set(sx, 1, sz);
  return m;
}
function joint(name, parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group(); g.name = name; g.position.set(x, y, z);
  parent.add(g);
  return g;
}

/**
 * 建一個比例假人。
 * @param {object} [opts]
 * @param {number} [opts.seed=1]  亂數種子（只影響細部：膚色深淺、護膝紅邊位置等微調）
 * @returns {THREE.Group} userData.joints＝{ 關節名: Group }、userData.dims＝尺寸表、userData.pose＝目前姿勢
 */
export function makeLifter({ seed = 1 } = {}) {
  const r = rng(seed), j = {};
  const root = new THREE.Group(); root.name = 'lifter';
  const J = (name, parent, x, y, z) => (j[name] = joint(name, parent, x, y, z));

  // 骨盆（樞紐＝兩髖關節中點）
  const hips = J('hips', root, 0, 0.94, 0);
  hips.add(ell(0.205, 0.15, 0.16, 'tank', 0, 0.03, 0));               // 短褲／骨盆
  hips.add(ell(0.11, 0.12, 0.10, 'tank', 0.085, -0.01, -0.08));         // 臀
  hips.add(ell(0.11, 0.12, 0.10, 'tank', -0.085, -0.01, -0.08));

  const spine = J('spine', hips, 0, D.spineY, -0.01);
  spine.add(ell(0.20, 0.16, 0.165, 'tank', 0, 0.05, 0.02));             // 肚子（背心下擺）
  const belt = cyl(0.205, 0.205, 0.11, 'belt', 0.0, 1, 0.80, 16);
  belt.position.z = 0.02;       // 腰帶 10 cm
  spine.add(belt);
  const buckle = mesh(new THREE.BoxGeometry(0.07, 0.065, 0.02), 'belt');
  buckle.position.set(0, 0.0, 0.175); spine.add(buckle);
  const prong = mesh(new THREE.BoxGeometry(0.05, 0.04, 0.012), 'sleeve'); prong.position.set(0, 0, 0.187); spine.add(prong);

  const chest = J('chest', spine, 0, D.chestY, 0);
  chest.add(ell(0.255, 0.23, 0.17, 'tank', 0, 0.06, 0.0));               // 胸廓＋背（背心）
  chest.add(ell(0.13, 0.08, 0.06, 'skin', 0, 0.20, 0.085));              // 背心領口露出的上胸
  chest.add(ell(0.20, 0.075, 0.115, 'skin', 0, 0.215, -0.04));           // 斜方肌（粗）
  chest.add(ell(0.17, 0.10, 0.045, 'tank', 0, 0.12, -0.13));              // 上背肌肉（厚背）
  const anchor = J('barAnchor', chest, ...D.barAnchor);

  const neck = J('neck', chest, 0, 0.25, -0.025);
  neck.add(cyl(0.075, 0.085, 0.13, 'skin', 0.03, 1, 1, 10));              // 粗脖
  const head = J('head', neck, 0, 0.085, 0.01);
  head.add(ell(0.095, 0.118, 0.11, 'skin', 0, 0.09, 0.0));               // 頭
  head.add(ell(0.10, 0.06, 0.11, 'hair', 0, 0.16, -0.012, 12, 6));        // 平頭短髮
  head.add(ell(0.085, 0.06, 0.07, 'hair', 0, 0.03, 0.05, 10, 6));         // 鬍子
  head.add(ell(0.02, 0.035, 0.02, 'skin', 0, 0.085, 0.11, 6, 4));         // 鼻

  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    // 鎖骨（肩胛樞紐）→ 肩關節
    const sh = J('shoulder_' + L, chest, s * 0.07, D.shoulderY, -0.02);
    sh.add(ell(0.105, 0.095, 0.105, 'skin', s * 0.15, 0.0, 0.0, 12, 8));   // 三角肌
    const ua = J('upperArm_' + L, sh, s * (SHOULDER_X - 0.07), 0, 0);
    ua.add(cap(0.072, D.upperArm - 0.09, 'skin', -D.upperArm / 2, 1, 1));
    const fa = J('foreArm_' + L, ua, 0, -D.upperArm, 0);
    fa.add(cap(0.054, D.foreArm - 0.08, 'skin', -D.foreArm / 2 + 0.01, 1, 0.9));
    fa.add(cyl(0.052, 0.050, 0.07, 'sleeve', -D.foreArm + 0.04, 1, 0.85, 10));     // 護腕
    fa.add(cyl(0.0535, 0.0535, 0.014, 'sleeveRed', -D.foreArm + 0.06, 1, 0.85, 10)); // 護腕紅邊
    const hd = J('hand_' + L, fa, 0, -D.foreArm, 0);
    hd.add(ell(0.045, 0.085, 0.028, 'skin', 0, -0.075, 0, 8, 6));           // 手掌＋指

    // 腿：大腿樞紐＝髖關節
    const th = J('thigh_' + L, hips, s * D.hipHalf, 0, 0);
    th.add(cap(0.112, D.thigh - 0.14, 'skin', -D.thigh / 2 + 0.01, 1.08, 1.0));
    th.add(cyl(0.128, 0.118, 0.17, 'tank', -0.06, 1.08, 1.0, 12));           // 短褲褲管
    th.add(cyl(0.083, 0.088, 0.10, 'sleeve', -D.thigh + 0.04, 1, 1, 12));    // 護膝上半
    const sn = J('shin_' + L, th, 0, -D.thigh, 0);
    sn.add(cyl(0.088, 0.078, 0.15, 'sleeve', -0.06, 1, 1, 12));              // 護膝下半
    const redY = -0.13 - r() * 0.005;
    sn.add(cyl(0.080, 0.079, 0.016, 'sleeveRed', redY, 1, 1, 12));            // 護膝紅邊
    sn.add(cap(0.064, D.shin - 0.16, 'skin', -D.shin / 2 + 0.01, 1, 1.05));
    sn.add(ell(0.062, 0.10, 0.07, 'skin', 0, -0.15, -0.02, 10, 6));          // 小腿肚
    sn.add(cyl(0.056, 0.052, 0.15, 'sleeve', -D.shin + 0.08, 1, 1, 10));     // 黑長襪
    const ft = J('foot_' + L, sn, 0, -D.shin, 0);
    const shoe = ell(0.058, 0.05, 0.155, 'shoe', 0, -0.035, 0.07, 10, 6);
    ft.add(shoe);
    const sole = mesh(new THREE.BoxGeometry(0.11, 0.025, 0.30), 'shoe');
    sole.position.set(0, -D.ankleY + 0.0125, 0.075); ft.add(sole);
  }

  // 膚色在同色系裡微調明暗：做法是整隻的 skin 共用材質，不動；保留 seed 給之後的細節
  root.userData.joints = j;
  root.userData.dims = { ...D, shoulderX: SHOULDER_X };
  root.userData.seed = seed;
  setPose(root, { squat: 0 });
  return root;
}

// ── 姿勢求解 ──────────────────────────────────────────────
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

// 讓骨頭的本地 -Y 指向世界方向 dir，本地 +Z 盡量朝 hint
function aim(bone, dir, hint) {
  const y = dir.clone().normalize().negate();
  const z = hint.clone().sub(y.clone().multiplyScalar(hint.dot(y)));
  if (z.lengthSq() < 1e-8) z.set(0, 0, 1).sub(y.clone().multiplyScalar(y.z));
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  _m.makeBasis(x, y, z);
  const qw = new THREE.Quaternion().setFromRotationMatrix(_m);
  bone.parent.getWorldQuaternion(_q);
  bone.quaternion.copy(_q.invert().multiply(qw));
  bone.updateWorldMatrix(false, true);
}
// 兩骨 IK：A→C，長 a、b，往 pole 方向彎；回傳中間關節位置
function ik2(A, C, a, b, pole) {
  const AC = C.clone().sub(A); let d = AC.length();
  d = Math.min(Math.max(d, Math.abs(a - b) + 1e-4), (a + b) * 0.9995);
  const n = AC.normalize();
  const x = (a * a - b * b + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a * a - x * x));
  const p = pole.clone().sub(n.clone().multiplyScalar(pole.dot(n))).normalize();
  return A.clone().add(n.clone().multiplyScalar(x)).add(p.multiplyScalar(h));
}
const wpos = o => o.getWorldPosition(new THREE.Vector3());
// 世界方向 → lifter 本地方向（lifter 可能被擺在場景任意位置／轉向）
function toWorldDir(lifter, v) { return v.clone().transformDirection(lifter.matrixWorld); }
function toWorldPos(lifter, v) { return v.clone().applyMatrix4(lifter.matrixWorld); }
function toLocalPos(lifter, v) { return lifter.worldToLocal(v.clone()); }

function solveLeg(lifter, s, kneePoleExtra) {
  const j = lifter.userData.joints, side = s > 0 ? 'L' : 'R';
  const th = j['thigh_' + side], sn = j['shin_' + side], ft = j['foot_' + side];
  const yaw = deg(D.toeOut) * s;
  const toe = toWorldDir(lifter, V(Math.sin(yaw), 0, Math.cos(yaw)));
  const A = wpos(th), C = toWorldPos(lifter, V(s * D.stanceHalf, D.ankleY, D.ankleZ));
  const pole = toe.clone().add(toWorldDir(lifter, kneePoleExtra || V()));
  const K = ik2(A, C, D.thigh, D.shin, pole);
  aim(th, K.clone().sub(A), pole);
  aim(sn, C.clone().sub(K), pole);
  // 腳板平貼地面、腳尖外八（世界朝向固定 → 腳跟不離地）
  const lq = lifter.getWorldQuaternion(new THREE.Quaternion());
  const qw = lq.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw));
  sn.getWorldQuaternion(_q);
  ft.quaternion.copy(_q.invert().multiply(qw));
  ft.updateWorldMatrix(false, true);
}

function solveArm(lifter, s, wrist, pole, handTip, handHint) {
  const j = lifter.userData.joints, side = s > 0 ? 'L' : 'R';
  const ua = j['upperArm_' + side], fa = j['foreArm_' + side], hd = j['hand_' + side];
  const A = wpos(ua);
  const E = ik2(A, wrist, D.upperArm, D.foreArm, pole);
  aim(ua, E.clone().sub(A), pole);
  aim(fa, wrist.clone().sub(E), pole);
  aim(hd, handTip.clone().sub(wpos(hd)), handHint || pole);
}

function setTorso(j, lean, pelvisShare = 0.55) {
  j.hips.rotation.set(lean * pelvisShare, 0, 0);
  j.spine.rotation.set(lean * (1 - pelvisShare) * 0.6, 0, 0);
  j.chest.rotation.set(lean * (1 - pelvisShare) * 0.4, 0, 0);
}

/**
 * 擺姿勢（每格可呼叫）。
 * @param {THREE.Group} lifter  makeLifter 的回傳值
 * @param {object} pose
 * @param {number} [pose.squat]   0＝扛槓站直、1＝深蹲最低點（髖略低於膝、軀幹前傾約 45°），可連續內插
 * @param {boolean} [pose.sit]    true＝坐在 0.43 m 高凳上休息、手肘撐膝（凳面中心在 z≈-0.42）
 * @param {number} [pose.chalk]   0..1＝抹粉的拍手循環（一個循環拍兩下），站姿、雙手在胸前
 * @param {number} [pose.grip=0.55]  握槓半距（槓中心到每隻手的距離）
 * @param {boolean} [pose.bar=true] squat 姿勢時雙手是否握槓；false＝手自然下垂
 */
export function setPose(lifter, pose = {}) {
  const j = lifter.userData.joints;
  lifter.updateWorldMatrix(true, false);
  lifter.userData.pose = { ...pose };
  for (const n of ['shoulder_L', 'shoulder_R', 'neck', 'head']) j[n].rotation.set(0, 0, 0);

  if (pose.sit) return poseSit(lifter, j);
  if (pose.chalk != null) return poseChalk(lifter, j, pose.chalk);
  return poseSquat(lifter, j, THREE.MathUtils.clamp(pose.squat ?? 0, 0, 1), pose.grip ?? 0.55, pose.bar !== false);
}

function poseSquat(lifter, j, s, grip, withBar) {
  // 前傾在下蹲前段就先出來（低槓特性），髖的高度線性下降
  const e = Math.sin(s * Math.PI / 2);
  const lean = deg(lerp(withBar ? 18 : 3, 50, e));
  setTorso(j, lean);
  j.neck.rotation.x = -lean * 0.45;      // 頭別跟著低下去，視線往前下方
  j.head.rotation.x = -lean * 0.2;
  j.shoulder_L.rotation.z = 0.06; j.shoulder_R.rotation.z = -0.06;   // 夾肩胛、撐起上背

  // 平衡：槓的 z 落在腳掌中段（BAR_Z），髖的前後位置由此反推
  j.hips.position.set(0, 0.9, 0);
  lifter.updateWorldMatrix(false, true);
  const a = toLocalPos(lifter, wpos(j.barAnchor)), h0 = j.hips.position.clone();
  const offZ = a.z - h0.z;
  const hipZ = BAR_Z - offZ;
  const dx = D.stanceHalf - D.hipHalf, dz = hipZ - D.ankleZ;
  const standY = D.ankleY + Math.sqrt((D.thigh + D.shin - 0.006) ** 2 - dx * dx - dz * dz);
  const hipY = lerp(standY, 0.415, s);
  j.hips.position.set(0, hipY, hipZ);
  lifter.updateWorldMatrix(false, true);

  for (const s2 of [1, -1]) solveLeg(lifter, s2, V(0, 0.15 * s, 0));

  for (const sd of [1, -1]) {
    if (withBar) {
      const bar = wpos(j.barAnchor);
      const cq = j.chest.getWorldQuaternion(new THREE.Quaternion());
      const up = V(0, 1, 0).applyQuaternion(cq), fwd = V(0, 0, 1).applyQuaternion(cq);
      const xw = toWorldDir(lifter, V(sd, 0, 0));
      const g = bar.clone().add(xw.clone().multiplyScalar(grip));
      const wrist = g.clone().add(up.clone().multiplyScalar(0.075)).add(fwd.clone().multiplyScalar(-0.035));
      const pole = fwd.clone().multiplyScalar(-1).add(up.clone().multiplyScalar(-0.7)).add(xw.clone().multiplyScalar(0.25));
      const tip = g.clone().add(fwd.clone().multiplyScalar(0.06)).add(up.clone().multiplyScalar(-0.03));
      solveArm(lifter, sd, wrist, pole, tip, fwd);
    } else {
      const A = wpos(j['upperArm_' + (sd > 0 ? 'L' : 'R')]);
      const xw = toWorldDir(lifter, V(sd, 0, 0)), dn = toWorldDir(lifter, V(0, -1, 0)), fw = toWorldDir(lifter, V(0, 0, 1));
      const wrist = A.clone().add(dn.clone().multiplyScalar(0.56)).add(xw.clone().multiplyScalar(0.10)).add(fw.clone().multiplyScalar(0.04));
      solveArm(lifter, sd, wrist, fw.clone().multiplyScalar(-1).add(xw), wrist.clone().add(dn.clone().multiplyScalar(0.1)), xw.clone().multiplyScalar(-1));
    }
  }
  return lifter;
}

function poseSit(lifter, j) {
  const lean = deg(50);
  setTorso(j, lean, 0.5);
  j.neck.rotation.x = -lean * 0.35; j.head.rotation.x = -lean * 0.15;
  j.hips.position.set(0, 0.43 + 0.095, -0.40);     // 坐骨在凳面上，髖關節高出凳面約 9.5 cm
  lifter.updateWorldMatrix(false, true);
  for (const s of [1, -1]) solveLeg(lifter, s, V(0, 0.6, 0));
  for (const sd of [1, -1]) {
    const side = sd > 0 ? 'L' : 'R';
    const K = wpos(j['shin_' + side]);             // 膝
    const xw = toWorldDir(lifter, V(sd, 0, 0)), up = toWorldDir(lifter, V(0, 1, 0)), fw = toWorldDir(lifter, V(0, 0, 1));
    // 手肘撐在膝上方內側；雙手在兩膝之間前方，十指輕扣
    const A = wpos(j['upperArm_' + side]);
    const elbowT = K.clone().add(up.clone().multiplyScalar(0.10)).add(xw.clone().multiplyScalar(-0.06)).add(fw.clone().multiplyScalar(-0.07));
    const E = A.clone().add(elbowT.clone().sub(A).normalize().multiplyScalar(D.upperArm));
    const Kl = toLocalPos(lifter, K);
    const W = toWorldPos(lifter, V(sd * 0.04, Kl.y - 0.03, Kl.z + 0.10));
    const wrist = E.clone().add(W.clone().sub(E).normalize().multiplyScalar(D.foreArm));
    const pole = fw.clone().negate().add(xw);
    aim(j['upperArm_' + side], E.clone().sub(A), pole);
    aim(j['foreArm_' + side], wrist.clone().sub(E), pole);
    aim(j['hand_' + side], W.clone().sub(wrist).add(up.clone().multiplyScalar(-0.05)), up);
  }
  return lifter;
}

function poseChalk(lifter, j, t) {
  setTorso(j, deg(4));
  j.neck.rotation.x = deg(8); j.head.rotation.x = deg(10);      // 低頭看手
  const dx = D.stanceHalf - D.hipHalf;
  j.hips.position.set(0, D.ankleY + Math.sqrt((D.thigh + D.shin - 0.012) ** 2 - dx * dx - 0.06 ** 2), -0.01);
  lifter.updateWorldMatrix(false, true);
  for (const s of [1, -1]) solveLeg(lifter, s, V());
  // 一個循環拍兩下：手掌間距 0（拍到）～ 0.16
  const gap = 0.16 * Math.abs(Math.sin(t * Math.PI * 2));
  const cq = j.chest.getWorldQuaternion(new THREE.Quaternion());
  const fw = V(0, 0, 1).applyQuaternion(cq), up = V(0, 1, 0).applyQuaternion(cq);
  const c = wpos(j.chest).add(fw.clone().multiplyScalar(0.34)).add(up.clone().multiplyScalar(0.07));
  for (const sd of [1, -1]) {
    const xw = toWorldDir(lifter, V(sd, 0, 0));
    const palm = c.clone().add(xw.clone().multiplyScalar(gap / 2 + 0.028));
    const wrist = palm.clone().add(up.clone().multiplyScalar(-0.07)).add(fw.clone().multiplyScalar(-0.03)).add(xw.clone().multiplyScalar(0.01));
    const pole = up.clone().multiplyScalar(-1).add(xw.clone().multiplyScalar(1.2)).add(fw.clone().multiplyScalar(-0.3));
    // 手掌面向對方：手的 +Z（掌背法線方向的近似）朝外
    solveArm(lifter, sd, wrist, pole, palm.clone().add(up.clone().multiplyScalar(0.08)).add(fw.clone().multiplyScalar(0.03)), xw);
  }
  return lifter;
}

/**
 * 目前姿勢下槓鈴中心該在的世界座標（低槓位：後三角肌下方、肩胛骨上）。
 * @param {THREE.Group} lifter
 * @returns {THREE.Vector3}
 */
export function getBarAnchor(lifter) {
  lifter.updateWorldMatrix(true, true);
  return lifter.userData.joints.barAnchor.getWorldPosition(new THREE.Vector3());
}

// ── 檢視項目 ──────────────────────────────────────────────
// 示意槓：只在檢視項目裡加，makeLifter 本身不含槓
function withBar(lifter) {
  const g = new THREE.Group(); g.add(lifter);
  const p = getBarAnchor(lifter);
  const bar = mesh(new THREE.CylinderGeometry(0.014, 0.014, 2.2, 10), 'steel', 'barGuide');
  bar.rotation.z = Math.PI / 2; bar.position.copy(p);
  g.add(bar);
  return g;
}

export const items = {
  standBar:    { build: () => withBar(makeLifter({ seed: 1 })), note: '扛槓站直（squat 0）＋示意槓' },
  squatBottom: { build: () => { const l = makeLifter({ seed: 1 }); setPose(l, { squat: 1 }); return withBar(l); }, note: '深蹲最低點（squat 1）＋示意槓' },
  sit:         { build: () => { const l = makeLifter({ seed: 2 }); setPose(l, { sit: true }); const g = new THREE.Group(); g.add(l);
                   const seat = mesh(new THREE.BoxGeometry(1.2, 0.43, 0.30), 'benchBlack'); seat.position.set(0, 0.215, -0.42); g.add(seat); return g; },
                 note: '坐 0.43 m 凳（凳為示意方塊）' },
  chalkUp:     { build: () => { const l = makeLifter({ seed: 3 }); setPose(l, { chalk: 0.25 }); return l; }, note: '抹粉（chalk 0.25＝手張最開；0／0.5＝拍到）' },
};
