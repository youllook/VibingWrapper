// 真騎士：Tripo 生成 → 重拓撲 → 自動綁 Mixamo 骨架（models/rider.glb）。
// 動作不另做：rider.js 的積木騎士每格照樣算出骨盆、上身、頭的轉動與手、腳的落點，這裡把它們套到骨架上——
// 軀幹與頭分攤到 Hips／Spine×3／Neck／Head（相對綁定姿勢的差），手臂與腿用兩節骨 IK 找出肘／膝，再把骨頭轉過去指著它。
// 模型座標：臉朝 +Z、左手邊 +X、腳底 y＝0；掛進來時繞 Y 轉 180°（臉朝 −Z＝車頭）並縮放到 height 公尺。
// 作法改寫自 skate-ride 的 skater.js（attachModel／poseRig）。
import * as THREE from './vendor/three.module.min.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), Qn = () => new THREE.Quaternion();
const PARENT = { Spine: 'Hips', Spine1: 'Spine', Spine2: 'Spine1', Neck: 'Spine2', Head: 'Neck' };
for (const sd of ['Left', 'Right']) Object.assign(PARENT, { [sd + 'UpLeg']: 'Hips', [sd + 'Leg']: sd + 'UpLeg', [sd + 'Foot']: sd + 'Leg', [sd + 'Shoulder']: 'Spine2', [sd + 'Arm']: sd + 'Shoulder', [sd + 'ForeArm']: sd + 'Arm', [sd + 'Hand']: sd + 'ForeArm' });

export function makeRiderRig(model, height = 1.74) {
  const meshes = [];
  model.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
  if (!meshes.length) { console.warn('rider model: no skinned mesh'); return null; }
  for (const o of meshes) o.skeleton.pose();                                    // 骨頭擺回反綁定矩陣給的綁定姿勢（Tripo 綁的骨頭靜止位置不一定對）
  model.updateMatrixWorld(true);
  const bones = {}, bindQ = {}, bindP = {};
  model.traverse(o => { if (o.isBone) { const n = o.name.replace(/^mixamorig:?/, ''); bones[n] = o; bindQ[n] = o.getWorldQuaternion(Qn()); bindP[n] = o.getWorldPosition(V()); } });
  for (const n in PARENT) if (!bones[n] || !bones[PARENT[n]]) { console.warn('rider model: missing bone', n); return null; }
  for (const o of meshes) {
    o.frustumCulled = false; o.castShadow = o.receiveShadow = true;
    const m = o.material; m.transparent = false; m.opacity = 1; m.alphaTest = 0; m.depthWrite = true; m.side = THREE.FrontSide;   // Tripo 匯出一律是半透明混合
  }
  let top = 0; { const v = V(); for (const o of meshes) { const P = o.geometry.attributes.position; for (let i = 0; i < P.count; i++) top = Math.max(top, v.fromBufferAttribute(P, i).applyMatrix4(o.bindMatrix).y); } }   // 安全帽頂
  const S = height / top;
  const len = (a, b) => bindP[a].distanceTo(bindP[b]);
  const L = { thigh: len('LeftUpLeg', 'LeftLeg'), shin: len('LeftLeg', 'LeftFoot'), uarm: len('LeftArm', 'LeftForeArm'), farm: len('LeftForeArm', 'LeftHand') };
  const bindL = {}; for (const n in bones) bindL[n] = bones[n].quaternion.clone();

  const qT = Qn(), qA = Qn(), qB = Qn(), qF = Qn(), D0 = Qn(), D1 = Qn(), D2 = Qn(), qI = Qn();
  // 手指：每節繞「指向 × 掌心法線」的局部軸彎，握把時一起彎
  const curl = [];
  for (const sd of ['Left', 'Right']) {
    const H = bindP[sd + 'Hand'], M1 = bindP[sd + 'HandMiddle1'], I1 = bindP[sd + 'HandIndex1'], P1 = bindP[sd + 'HandPinky1']; if (!H || !M1 || !I1 || !P1) continue;
    const nrm = V().subVectors(I1, P1).cross(V().subVectors(M1, H)).normalize(); if (nrm.z < 0) nrm.negate();   // A-pose 掌心朝前
    for (const f of ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb']) for (let j = 1; j <= 3; j++) {
      const n = sd + 'Hand' + f + j, b = bones[n]; if (!b) continue;
      const nx = bones[sd + 'Hand' + f + (j + 1)] || b.children.find(c => c.isBone); if (!nx) continue;
      const dir = nx.getWorldPosition(V()).sub(bindP[n]).normalize(), ax = V().crossVectors(dir, nrm).normalize();
      curl.push({ b, q0: bindL[n], axL: ax.applyQuaternion(bindQ[n].clone().invert()).normalize(), k: f === 'Thumb' ? 0.35 : 1.05 });
    }
  }
  const grip = g => { for (const c of curl) c.b.quaternion.copy(c.q0).multiply(qA.setFromAxisAngle(c.axL, g * c.k)); };

  const rig = new THREE.Group(); rig.scale.setScalar(S); rig.rotation.y = Math.PI; rig.add(model);

  // ── 擺姿勢（模型座標：x、z 反號、÷S）──
  const W = {}, P = {};
  const ra = V(), rb = V(), rc = V(), rd = V(), re = V(), rf = V(), rp = V(), rdir = V(), e = V(), dd = V();
  const conj = (out, q) => out.set(-q.x, q.y, -q.z, q.w);                    // 騎士座標的轉動 → 模型座標
  const toM = v => v.set(-v.x / S, v.y / S, -v.z / S), dirM = v => v.set(-v.x, v.y, -v.z);
  function setW(n, qw) { const w = W[n] || (W[n] = Qn()); w.copy(qw); const pq = W[PARENT[n]]; if (pq) bones[n].quaternion.copy(qT.copy(pq).invert()).multiply(w); else bones[n].quaternion.copy(w); }
  const keepW = n => (W[n] || (W[n] = Qn())).copy(W[PARENT[n]]).multiply(bones[n].quaternion);
  const fk = n => (P[n] || (P[n] = V())).copy(bones[n].position).applyQuaternion(W[PARENT[n]]).add(P[PARENT[n]]);
  const delta = (out, n) => out.copy(bindQ[n]).invert().premultiply(W[n]);
  function ik(a, c, l1, l2, pole, b) {
    dd.subVectors(c, a); let Ld = dd.length(); const max = (l1 + l2) * 0.995;
    if (Ld > max) { c.copy(a).addScaledVector(dd, max / Ld); Ld = max; }
    dd.divideScalar(Math.max(Ld, 1e-4));
    const x = (l1 * l1 - l2 * l2 + Ld * Ld) / (2 * Ld), h = Math.sqrt(Math.max(l1 * l1 - x * x, 0));
    e.copy(pole).addScaledVector(dd, -pole.dot(dd)); if (e.lengthSq() < 1e-6) e.set(0, 0, 1); e.normalize();
    b.copy(a).addScaledVector(dd, x).addScaledVector(e, h);
  }
  function aim(n, child, Dp, dir, bend, Dout) {
    rd.subVectors(bindP[child], bindP[n]).normalize().applyQuaternion(Dp);
    Dout.copy(qB.setFromUnitVectors(rd, dir)).multiply(Dp);
    if (bend) {
      re.set(0, 0, 1).applyQuaternion(Dout); re.addScaledVector(dir, -re.dot(dir));
      rf.copy(bend).addScaledVector(dir, -bend.dot(dir));
      if (re.lengthSq() > 1e-6 && rf.lengthSq() > 1e-6) Dout.premultiply(qB.setFromUnitVectors(re.normalize(), rf.normalize()));
    }
    setW(n, qA.copy(Dout).multiply(bindQ[n]));
  }
  // J（騎士座標）：hip 骨盆位置、pelvisQ、torsoQ（含骨盆）、headQ（相對上身）、hand[左,右]、ankle[左,右]、footQ[左,右]、kneeOut、grip
  function pose(J) {
    setW('Hips', conj(qA, J.pelvisQ).multiply(bindQ.Hips));
    bones.Hips.position.copy(toM(ra.copy(J.hip))); P.Hips = bones.Hips.position;
    for (const [n, w] of [['Spine', 0.3], ['Spine1', 0.65], ['Spine2', 1]]) { qF.copy(J.pelvisQ).slerp(J.torsoQ, w); fk(n); setW(n, conj(qA, qF).multiply(bindQ[n])); }
    fk('Neck'); qF.copy(J.torsoQ).multiply(qB.copy(qI).slerp(J.headQ, 0.4)); setW('Neck', conj(qA, qF).multiply(bindQ.Neck));
    fk('Head'); qF.copy(J.torsoQ).multiply(J.headQ); setW('Head', conj(qA, qF).multiply(bindQ.Head));
    for (let i = 0; i < 2; i++) {
      const sd = i ? 'Right' : 'Left', s = i ? 1 : -1;
      fk(sd + 'UpLeg'); ra.copy(P[sd + 'UpLeg']);
      rc.copy(J.ankle[i]); toM(rc);
      rp.set(s * J.kneeOut[i], 0.25, -1); dirM(rp);                             // 膝蓋往前、略往外
      ik(ra, rc, L.thigh, L.shin, rp, rb); rp.copy(e);
      delta(D0, 'Hips');
      aim(sd + 'UpLeg', sd + 'Leg', D0, rdir.subVectors(rb, ra).normalize(), rp, D1);
      aim(sd + 'Leg', sd + 'Foot', D1, rdir.subVectors(rc, rb).normalize(), null, D2);
      setW(sd + 'Foot', conj(qA, J.footQ[i]).multiply(bindQ[sd + 'Foot']));
    }
    for (let i = 0; i < 2; i++) {
      const sd = i ? 'Right' : 'Left', s = i ? 1 : -1;
      keepW(sd + 'Shoulder'); fk(sd + 'Shoulder'); fk(sd + 'Arm'); ra.copy(P[sd + 'Arm']);
      rc.copy(J.hand[i]); toM(rc);
      rp.set(s * 0.8, -0.6, 0.3).applyQuaternion(J.torsoQ); dirM(rp);          // 手肘往外、往下
      ik(ra, rc, L.uarm, L.farm, rp, rb); rp.copy(e).negate();
      delta(D0, sd + 'Shoulder');
      aim(sd + 'Arm', sd + 'ForeArm', D0, rdir.subVectors(rb, ra).normalize(), rp, D1);
      aim(sd + 'ForeArm', sd + 'Hand', D1, rdir.subVectors(rc, rb).normalize(), null, D2);
      // 手掌：手背朝上、扣在握把上（相對前臂再往下壓一點）
      bones[sd + 'Hand'].quaternion.copy(bindL[sd + 'Hand']);
    }
    grip(J.grip);
  }
  const hipH = bindP.Hips.y * S, ankleH = bindP.LeftFoot.y * S, shoulderW = Math.abs(bindP.LeftArm.x - bindP.RightArm.x) * S;
  return { rig, pose, S, hipH, ankleH, shoulderW, reach: (L.uarm + L.farm) * S, legLen: (L.thigh + L.shin) * S, meshes };
}
