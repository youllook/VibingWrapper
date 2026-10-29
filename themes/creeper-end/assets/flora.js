// 紫頌植物、黑曜石柱、林（子代理 C）。單位：1 = 1 方塊；原點＝底部中心；y 向上。
import * as THREE from '../vendor/three.module.min.js';
import { Voxels, rng } from '../lib/voxel.js';
import { P } from '../lib/palette.js';

// 同色系亮度微調（±amt）
function tint(hex, k) { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); }
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** 紫頌植物：{seed 亂數種子, height 主幹高(格), scale 一格大小, thick 主幹寬 1|2（預設高≥10 用 2）} → Group（slot chorusStem + chorusFlower） */
export function makeChorus({ seed = 1, height = 6, scale = 1, thick } = {}) {
  const r = rng(seed), stem = new Voxels(), flower = new Voxels();
  const W = thick ?? 1;
  const stemCol = () => tint(r() < 0.35 ? P.chorusStemDark : P.chorusStem, 0.92 + r() * 0.16);
  const flowerCol = () => tint(P.chorusFlower, 0.94 + r() * 0.1);
  const put = (x, y, z) => stem.set(x, y, z, stemCol());
  // 主幹
  for (let y = 0; y < height; y++) for (let a = 0; a < W; a++) for (let b = 0; b < W; b++) put(a, y, b);
  const tips = [[0, height, 0]];                       // 花苞位置（主幹頂）
  // 燭台分枝：到一定高度後成對（常對稱）水平伸出 2–3 格（柱與主幹留 ≥1 格空隙）再直角往上 2–4 格，粗大株有 2–3 層，枝上可再分一次
  const tiers = height <= 4 ? [] : height <= 8 ? [Math.round(height * 0.5)] : height <= 11 ? [Math.round(height * 0.4), Math.round(height * 0.7)] : [Math.round(height * 0.3), Math.round(height * 0.55), Math.round(height * 0.78)];
  const arm = (x0, z0, y, d, hl, up, sub) => {
    let x = x0, z = z0;
    for (let s = 0; s < hl; s++) { x += d[0]; z += d[1]; put(x, y, z); }
    for (let s = 1; s <= up; s++) put(x, y + s, z);
    if (sub && up >= 3) {                                 // 枝上再分一次（垂直於原方向）
      const pd = [d[1], d[0]], sy = y + 2;
      for (const sg of (r() < 0.5 ? [1] : [1, -1])) {
        let sx = x, sz = z;
        for (let s = 0; s < 2; s++) { sx += pd[0] * sg; sz += pd[1] * sg; put(sx, sy, sz); }
        put(sx, sy + 1, sz); tips.push([sx, sy + 2, sz]);
      }
    }
    tips.push([x, y + up + 1, z]);
  };
  tiers.forEach((y, i) => {
    const axis = i % 2 ? [0, 1] : [1, 0], flip = r() < 0.5 ? 1 : -1;
    const hl = height < 6 ? 2 : 2 + (r() < 0.5 ? 1 : 0), up = height < 6 ? 1 : 2 + Math.floor(r() * 3);
    const cap = Math.max(1, Math.min(up, height - y));
    const dirs = r() < 0.7 ? [1, -1] : [flip];
    for (const sg of dirs) {
      const d = [axis[0] * sg, axis[1] * sg];
      const ox = d[0] > 0 ? W - 1 : 0, oz = d[1] > 0 ? W - 1 : 0;
      arm(ox, oz, y, d, hl, cap, height >= 10 && i < tiers.length - 1 && r() < 0.6);
    }
  });
  for (const [x, y, z] of tips) {
    flower.set(x, y, z, flowerCol());
    if (height >= 10 && r() < 0.4) flower.set(x, y + 1, z, tint(P.chorusFlower, 1.08));
  }
  // 莖底多一圈小突起像根
  if (height >= 6 && r() < 0.6) { const d = DIRS[Math.floor(r() * 4)]; put(d[0] > 0 ? W : d[0] < 0 ? -1 : 0, 0, d[1] > 0 ? W : d[1] < 0 ? -1 : 0); }
  const g = new THREE.Group(), off = W / 2;
  const a = stem.merged({ slot: 'chorusStem', scale }), b = flower.merged({ slot: 'chorusFlower', scale });
  for (const m of [a, b]) { m.position.set(-off * scale, 0, -off * scale); g.add(m); }
  g.userData.kind = 'chorus';
  return g;
}

/** 黑曜石柱：{seed, height 15–40, width 2–4, scale} → Group（slot obsidian + obsidianGlow）。頂端一顆粉紫光點 */
export function makePillar({ seed = 1, height = 30, width = 3, scale = 1 } = {}) {
  const r = rng(seed), v = new Voxels(), glow = new Voxels();
  const w = Math.max(2, Math.min(4, width));
  const col = () => tint(r() < 0.25 ? P.obsidianEdge : P.obsidian, 0.9 + r() * 0.2);
  for (let y = 0; y < height; y++) {
    const inset = (w >= 3 && y >= height - 2) ? 1 : 0;      // 頂端兩層內縮，像目標圖柱頭
    for (let x = inset; x < w - inset; x++) for (let z = inset; z < w - inset; z++) v.set(x, y, z, col());
  }
  // 表面偶爾凹凸一格（4 個側面各隨機幾處；凸出的是外加方塊，凹進的是挖掉邊上一格）
  const bumps = Math.round(height * 0.07);
  for (let i = 0; i < bumps; i++) {
    const y = 1 + Math.floor(r() * (height - 4)), t = Math.floor(r() * w), side = Math.floor(r() * 4), out = r() < 0.5;
    let x, z, dx = 0, dz = 0;
    if (side === 0) { x = w - 1; z = t; dx = 1; } else if (side === 1) { x = 0; z = t; dx = -1; }
    else if (side === 2) { x = t; z = w - 1; dz = 1; } else { x = t; z = 0; dz = -1; }
    if (out) v.set(x + dx, y, z + dz, tint(P.obsidianEdge, 0.95 + r() * 0.15));
    else if (w > 2) v.del(x, y, z);
  }
  // 頂端光點：1 格粉紫，立在柱頂中心
  const cx = Math.floor((w - 1) / 2), cz = Math.floor((w - 1) / 2);
  glow.set(cx, height, cz, P.obsidianGlow);
  const g = new THREE.Group(), off = w / 2;
  const a = v.merged({ slot: 'obsidian', scale }), b = glow.merged({ slot: 'obsidianGlow', scale });
  for (const m of [a, b]) { m.position.set(-off * scale, 0, -off * scale); g.add(m); }
  g.userData.kind = 'pillar';
  return g;
}

/**
 * 在浮島頂面格子上撒植物點：{seed, density 每格機率(0–1，約 0.04 = 目標圖的林), minGap 兩株最小間距(格), edgeMargin 距島緣至少幾格(預設 2)}
 * surface = [[x,y,z],…]（y 為該格上表面高度）→ [{x,y,z,kind:'chorus'|'pillar',height}]（chorus 高 3–14；柱 15–35，稀少）
 */
export function scatter(surface, { seed = 1, density = 0.04, minGap = 2, edgeMargin = 2 } = {}) {
  const r = rng(seed), out = [];
  const K = (x, z) => x.toFixed(2) + ',' + z.toFixed(2), have = new Set(surface.map(c => K(c[0], c[2])));
  const inner = c => { for (let dx = -edgeMargin; dx <= edgeMargin; dx++) for (let dz = -edgeMargin; dz <= edgeMargin; dz++) if (!have.has(K(c[0] + dx, c[2] + dz))) return false; return true; };
  const cells = surface.filter(inner);
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  const gap2 = minGap * minGap;
  for (const [x, y, z] of cells) {
    if (r() > density) continue;
    const pil = r() < 0.04;                                 // 約 1/25 是柱
    const gp = pil ? minGap * 2.5 : minGap;
    if (out.some(o => { const dx = o.x - x, dz = o.z - z; return dx * dx + dz * dz < Math.max(gap2, gp * gp); })) continue;
    const t = r();
    out.push({ x, y, z, kind: pil ? 'pillar' : 'chorus', height: pil ? 15 + Math.floor(r() * 21) : t < 0.45 ? 3 + Math.floor(r() * 2) : t < 0.85 ? 6 + Math.floor(r() * 3) : 10 + Math.floor(r() * 5) });
  }
  return out;
}

function grove() {
  const N = 24, v = new Voxels(), r = rng(11), surface = [];
  for (let x = 0; x < N; x++) for (let z = 0; z < N; z++) {
    const k = 0.94 + r() * 0.1;
    v.set(x, -1, z, tint(P.endstone, k)); v.set(x, -2, z, tint(P.endstoneShade, k));
    surface.push([x - N / 2 + 0.5, 0, z - N / 2 + 0.5]);
  }
  const root = new THREE.Group(), land = v.merged({ slot: 'endstone' });
  land.position.set(-N / 2, 0, -N / 2); root.add(land);
  // 2 根柱先下，剩餘由 scatter 撒
  const pil = [{ x: -3.5, z: -2.5, h: 34, w: 3 }, { x: 1.5, z: -5.5, h: 22, w: 4 }];
  for (const p of pil) { const m = makePillar({ seed: p.x * 7 + 3, height: p.h, width: p.w }); m.position.set(p.x, 0, p.z); root.add(m); }
  const pts = scatter(surface.filter(([x, , z]) => !pil.some(p => Math.abs(x - p.x) < 4 && Math.abs(z - p.z) < 4)), { seed: 5, density: 0.2, minGap: 2.2 })
    .filter(p => p.kind === 'chorus').slice(0, 32);
  pts.forEach((p, i) => { const m = makeChorus({ seed: 100 + i, height: p.height }); m.position.set(p.x - 0.0, 0, p.z); root.add(m); });
  root.userData.surface = surface; root.userData.placed = pts.length;
  return root;
}

export const items = {
  chorusS: { build: () => makeChorus({ seed: 3, height: 4 }), note: '紫頌小株 高 4' },
  chorusM: { build: () => makeChorus({ seed: 7, height: 7 }), note: '紫頌中株 高 7' },
  chorusL: { build: () => makeChorus({ seed: 12, height: 12 }), note: '紫頌大株 高 12（近景；要粗壯可 thick:2 或 scale 放大）' },
  pillarS: { build: () => makePillar({ seed: 2, height: 15, width: 2 }), note: '黑曜石柱 高 15' },
  pillarL: { build: () => makePillar({ seed: 4, height: 35, width: 3 }), note: '黑曜石柱 高 35' },
  grove: { build: grove, note: '24×24 平地＋32 株紫頌＋2 柱' },
};
