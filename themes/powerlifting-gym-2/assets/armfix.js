// 握槓姿勢修正（用戶 2026-10-31：肩膀略高、手肘像目標圖一樣指向地板）。
// 動作檔裡扛槓時手肘是往後平舉的；這裡每格在動畫之後補一層：
//   1. 鎖骨（Shoulder 骨）往上轉一點 → 肩膀抬高
//   2. 握距只往內收一點（narrow）：收太多肩胛會被擠在一起、頭縮進去（Tripo 自動權重撐不住，像鐘樓怪人）
//   3. 上臂、前臂用兩骨 IK 重新擺到新的手位，手肘轉到「往下、略往外」貼在身體兩側（往後收太多會把肩膀扭成駝峰）
// weight 0–1：只在扛槓相關的動作套用，走路、坐著時淡出。
// 動作檔沒有肩膀、手臂的關鍵格（常數軌被剪掉了），動畫不會把骨頭蓋回去 → 每格畫完要 restore()，不然修正會一格疊一格（越來越駝）
import * as THREE from '../vendor/three.module.min.js';

const v = () => new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

/** 把骨頭在世界座標多轉 delta（世界旋轉），換算回 local */
function rotateWorld(bone, delta) {
  const pw = bone.parent.getWorldQuaternion(_q);
  const bw = bone.getWorldQuaternion(_q2);
  bone.quaternion.copy(pw.clone().invert().multiply(delta).multiply(bw));
  bone.updateMatrixWorld(true);
}
/** 轉骨頭，讓它的子骨從 from 指到 to（世界方向） */
function aim(bone, child, to) {
  const o = bone.getWorldPosition(v()), c = child.getWorldPosition(v());
  const d = new THREE.Quaternion().setFromUnitVectors(c.sub(o).normalize(), to.clone().normalize());
  rotateWorld(bone, d);
}

export function makeArmFix(lifter, { lift = 0.015, back = 0.05, out = 0.5, narrow = 0.07 } = {}) {
  const B = n => lifter.getObjectByName('mixamorig' + n);
  const sides = ['Left', 'Right'].map(s => ({ sh: B(s + 'Shoulder'), arm: B(s + 'Arm'), fore: B(s + 'ForeArm'), hand: B(s + 'Hand') }));
  const saved = sides.map(() => ({ sh: new THREE.Quaternion(), arm: new THREE.Quaternion(), fore: new THREE.Quaternion() }));
  const up = new THREE.Vector3(0, 1, 0);

  let applied = false;
  function restore() {
    if (!applied) return;
    sides.forEach((s, i) => { s.sh.quaternion.copy(saved[i].sh); s.arm.quaternion.copy(saved[i].arm); s.fore.quaternion.copy(saved[i].fore); });
    applied = false;
  }
  function apply(weight) {
    if (weight <= 0.001) return;
    applied = true;
    lifter.updateMatrixWorld(true);
    // 選手的「後方」（世界座標）：面朝 +Z（local），後方是 -Z
    const backDir = new THREE.Vector3(0, 0, -1).applyQuaternion(lifter.getWorldQuaternion(new THREE.Quaternion()));
    // 新手位：沿兩手連線（＝槓）各往內 narrow 公尺
    const HL = sides[0].hand.getWorldPosition(v()), HR = sides[1].hand.getWorldPosition(v());
    const mid = HL.clone().add(HR).multiplyScalar(0.5), axis = HR.clone().sub(HL).normalize();
    const target = [HL.clone().addScaledVector(axis, narrow), HR.clone().addScaledVector(axis, -narrow)];
    sides.forEach((s, i) => {
      const keep = saved[i];
      keep.sh.copy(s.sh.quaternion); keep.arm.copy(s.arm.quaternion); keep.fore.copy(s.fore.quaternion);
      const H = target[i];
      // 1. 肩膀抬高：鎖骨轉到上臂根部往上 lift 公尺
      const P = s.sh.getWorldPosition(v()), A0 = s.arm.getWorldPosition(v());
      aim(s.sh, s.arm, A0.clone().addScaledVector(up, lift).sub(P));
      // 2. 兩骨 IK：肩 S、手 H，手肘往「下＋略後」
      const S = s.arm.getWorldPosition(v()), E0 = s.fore.getWorldPosition(v());
      const a = E0.distanceTo(S), b = s.hand.getWorldPosition(v()).distanceTo(E0);
      const SH = H.clone().sub(S), dist = Math.min(SH.length(), a + b - 1e-4), dn = SH.normalize();
      const cosA = THREE.MathUtils.clamp((a * a + dist * dist - b * b) / (2 * a * dist), -1, 1);
      const outDir = S.clone().sub(mid).projectOnPlane(up).normalize();   // 這一側的外側
      const pole = new THREE.Vector3(0, -1, 0).addScaledVector(backDir, back).addScaledVector(outDir, out);
      pole.addScaledVector(dn, -pole.dot(dn)).normalize();       // 垂直於肩→手
      const E = S.clone().addScaledVector(dn, a * cosA).addScaledVector(pole, a * Math.sqrt(1 - cosA * cosA));
      aim(s.arm, s.fore, E.clone().sub(S));
      aim(s.fore, s.hand, H.clone().sub(s.fore.getWorldPosition(v())));
      // 依 weight 跟原動作混合
      if (weight < 0.999) {
        s.sh.quaternion.slerpQuaternions(keep.sh, s.sh.quaternion.clone(), weight);
        s.arm.quaternion.slerpQuaternions(keep.arm, s.arm.quaternion.clone(), weight);
        s.fore.quaternion.slerpQuaternions(keep.fore, s.fore.quaternion.clone(), weight);
        s.sh.updateMatrixWorld(true);
      }
    });
  }
  return { apply, restore };
}
