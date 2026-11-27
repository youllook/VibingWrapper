// 環形太空站的幾何常數與座標換算。
// 棲地是一個圓筒的內壁：轉軸沿世界 +X、穿過 (0, R, 0)。鏡頭腳下的地面在 y = 0。
// 棲地上的一點用 (x, θ, h) 描述：x＝沿軸位置、θ＝繞軸角度（0＝鏡頭正下方，正值＝前方 −Z 並往上翹）、h＝離地高度。
// 整個棲地掛在一個 Group 底下，Group 繞 X 轉 −φ 就是列車往前開；圓筒沿圓周天然無縫，φ 取 mod 2π。
import * as THREE from 'three';

export const R = 2000;            // 圓筒半徑（m）
export const X0 = -2500, X1 = 14000; // 圓筒沿軸範圍；兩端都埋在霧裡
export const DECK_H = 22;         // 高架軌道面離地高度
export const SUN_X = 3600;        // （保留）軸上的位置參考

// O'Neill 式三陸三窗：陸地帶以 0°、120°、240° 為中心各寬 2·LAND_HALF，其餘是玻璃窗帶
export const LAND_HALF = THREE.MathUtils.degToRad(+(new URLSearchParams(location.search).get('land') || 50));   // 陸地 ±50° → 窗帶每段 20°（2026-11-28 用戶定）
export function landAt(th) {
  const k = ((th % (Math.PI * 2 / 3)) + Math.PI * 2 / 3) % (Math.PI * 2 / 3);   // 0…120°
  return k <= LAND_HALF || k >= Math.PI * 2 / 3 - LAND_HALF;
}

// 圓筒內壁的一片曲面（x0…x1 × θ0…θ1，離地 h），法線朝軸
export function shell(x0, x1, th0, th1, h = 0, nx = 8, nth = 64) {
  const pos = [], nor = [], uv = [], idx = [], v = new THREE.Vector3();
  for (let j = 0; j <= nth; j++) {
    const th = th0 + (th1 - th0) * j / nth;
    for (let i = 0; i <= nx; i++) {
      const x = x0 + (x1 - x0) * i / nx;
      hab(x, th, h, v); pos.push(v.x, v.y, v.z); nor.push(0, Math.cos(th), Math.sin(th)); uv.push(i / nx, j / nth);
    }
  }
  for (let j = 0; j < nth; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); return g;
}

// 棲地區域座標（相對轉軸）：θ 處、離地 h 的點
export function hab(x, th, h = 0, out = new THREE.Vector3()) {
  const r = R - h;
  return out.set(x, -r * Math.cos(th), -r * Math.sin(th));
}

// 站在 θ 處的物件：本地 +Y＝朝軸（往上）、本地 −Z＝沿圓周往前
const _q = new THREE.Quaternion(), _qy = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _ax = new THREE.Vector3(1, 0, 0), _up = new THREE.Vector3(0, 1, 0);
export function standMatrix(x, th, h, yaw = 0, sx = 1, sy = 1, sz = 1, out = new THREE.Matrix4()) {
  _q.setFromAxisAngle(_ax, th);
  if (yaw) _q.multiply(_qy.setFromAxisAngle(_up, yaw));
  return out.compose(hab(x, th, h, _p), _q, _s.set(sx, sy, sz));
}

// 可重現的亂數
export function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
