// 共用小工具：材質槽、可重現亂數、三角形計數
import * as THREE from '../vendor/three.module.min.js';
import { PALETTE } from './palette.js';
import { surfaceMaterial } from './surface.js';

const mats = new Map();

// 同一個槽共用一個材質；階段 4 換材質時只要改這裡依 slot 回傳的東西
export function material(slot) {
  if (!mats.has(slot)) {
    if (!(slot in PALETTE)) console.warn('palette 沒有這個槽：' + slot);
    mats.set(slot, surfaceMaterial(slot));   // 階段 4：PBR＋三向投影做舊（lib/surface.js）
  }
  return mats.get(slot);
}

// 建 mesh 並標上材質槽（userData.slot），階段 4 依槽換材質
export function mesh(geo, slot, name) {
  const m = new THREE.Mesh(geo, material(slot));
  m.userData.slot = slot;
  if (name) m.name = name;
  return m;
}

// 物件底下所有 mesh 的三角形總數（InstancedMesh 乘上實例數）
export function countTris(obj) {
  let t = 0;
  obj.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry;
    const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    t += n * (o.isInstancedMesh ? o.count : 1);
  });
  return Math.round(t);
}

// 可重現的亂數（mulberry32，同 seed 同結果）
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
