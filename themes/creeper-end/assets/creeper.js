// 苦力怕產生器（原版比例：頭 8³、身 8×12×4、腳 4×6×4 ×4；1 px = 1/16 方塊；總高 1.625；臉朝 +Z；原點腳底中心）
// 每像素一顆體素，merged 只出外露面。部件各掛樞紐：頭在脖子（頭底中心）、腳在臀部（腳頂）。
import * as THREE from '../vendor/three.module.min.js';
import { Voxels, rng } from '../lib/voxel.js';
import { P } from '../lib/palette.js';

const S = 1 / 16;

// 斑駁綠皮：隨機挑 creeper / Light / Dark，另加 ±5% 亮度抖動
function skinColor(r) {
  const t = r();
  const base = t < 0.38 ? P.creeper : t < 0.78 ? P.creeperLight : P.creeperDark;
  const c = new THREE.Color(base);
  return c.multiplyScalar(0.95 + r() * 0.1);
}

// ── 皮膚貼圖（選配）：setCreeperSkin(圖) 後，表面體素改照原版 64×32 皮膚版型取樣，只取亮度、映射到色票三階綠 ──
// 版型：盒子 (w,h,d) 從 (u,v) 起——上 (u+d,v)、下 (u+d+w,v)、右側 (u,v+d)、前 (u+d,v+d)、左側 (u+d+w,v+d)、後 (u+2d+w,v+d)
let SKIN = null;
export function setCreeperSkin(im) {
  if (!im) { SKIN = null; return; }
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const g = c.getContext('2d'); g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data, W = c.width;
  const lum = (x, y) => { const i = (y * W + x) * 4; return d[i + 3] < 128 ? null : 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; };
  const all = []; for (let y = 0; y < c.height; y++) for (let x = 0; x < W; x++) { const l = lum(x, y); if (l !== null) all.push(l); }
  all.sort((a, b) => a - b);
  SKIN = { lum, lo: all[all.length * 0.05 | 0], hi: all[all.length * 0.95 | 0] };
}
const RAMP = [P.creeperDark, P.creeper, P.creeperLight].map(c => new THREE.Color(c));
function skinTone(l) {   // 亮度 → 暗綠／綠／亮綠之間內插
  const t = Math.max(0, Math.min(1, (l - SKIN.lo) / (SKIN.hi - SKIN.lo))) * 2;
  return t < 1 ? RAMP[0].clone().lerp(RAMP[1], t) : RAMP[1].clone().lerp(RAMP[2], t - 1);
}
function skinUV(uv, w, h, dp, i, j, k) {   // 盒內座標 i(x)、j(y 由下往上)、k(z，前＝dp-1) → 皮膚像素
  const [u, v] = uv, row = v + dp + (h - 1 - j);
  if (k === dp - 1) return [u + dp + i, row];                  // 前
  if (j === h - 1) return [u + dp + i, v + k];                 // 上（相機在上方，頂面比側面常見）
  if (k === 0) return [u + 2 * dp + w + (w - 1 - i), row];     // 後
  if (i === 0) return [u + k, row];                            // 右側（-x）
  if (i === w - 1) return [u + dp + w + (dp - 1 - k), row];    // 左側（+x）
  return [u + dp + w + i, v + (dp - 1 - k)];                   // 下
}

// 在 [x0,x1)×[y0,y1)×[z0,z1)（像素整數座標）填滿皮膚；uv＝這個盒子在皮膚上的起點（有皮膚時才用）
function box(v, r, x0, y0, z0, x1, y1, z1, uv) {
  const w = x1 - x0, h = y1 - y0, dp = z1 - z0;
  for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) {
    let c = null;
    if (SKIN && uv) { const [sx, sy] = skinUV(uv, w, h, dp, x - x0, y - y0, z - z0), l = SKIN.lum(sx, sy); if (l !== null) c = skinTone(l); }
    v.set(x, y, z, c || skinColor(r));
  }
}

// 經典臉（頭前面 8×8，row 0 在頂）：兩個方眼＋倒 T 嘴
const FACE = [
  [1, 2], [2, 2], [5, 2], [6, 2],
  [1, 3], [2, 3], [5, 3], [6, 3],
  [3, 4], [4, 4],
  [2, 5], [3, 5], [4, 5], [5, 5],
  [2, 6], [5, 6],
];

function part(v, slot, px, py, pz) {
  const m = v.merged({ slot, scale: S });
  m.position.set(px * S, py * S, pz * S);
  return m;
}

/**
 * 苦力怕。
 * @param {{seed?:number, pose?:'walk'|'lookBack', headYaw?:number, headPitch?:number}} opts
 *   seed 決定斑駁；pose 'walk' 站直 / 'lookBack' 頭往後上方轉；headYaw/headPitch 單位度（可覆寫 pose 預設）
 */
export function makeCreeper({ seed = 1, pose = 'walk', headYaw, headPitch } = {}) {
  const r = rng(seed * 7919 + 13);
  const g = new THREE.Group();

  // 頭：樞紐在脖子（y=18px）；像素 x -4..3, y 0..7, z -4..3
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 18 * S, 0);
  headPivot.rotation.order = 'YXZ';
  const hv = new Voxels();
  box(hv, r, -4, 0, -4, 4, 8, 4, [0, 0]);
  const head = hv.merged({ slot: 'creeper', scale: S });
  headPivot.add(head);
  const fv = new Voxels();
  for (const [x, y] of FACE) fv.set(x - 4, 7 - y, 3, P.creeperFace);
  const face = fv.merged({ slot: 'creeperFace', scale: S });
  face.position.z = 0.0015;   // 略凸出避免 z-fight
  headPivot.add(face);
  g.add(headPivot);

  // 身：x -4..3, y 0..11（接在腿上 6px 起）, z -2..1
  const bv = new Voxels();
  box(bv, r, -4, 0, -2, 4, 12, 2, [16, 16]);
  const body = part(bv, 'creeper', 0, 6, 0);
  g.add(body);

  // 四腳：樞紐在腳頂（y=6px）；front z 2..6，back z -6..-2；left 在 +x
  const legs = [];
  for (const [lx, lz] of [[0, 2], [-4, 2], [0, -6], [-4, -6]]) {
    const lv = new Voxels();
    box(lv, r, 0, -6, 0, 4, 0, 4, [0, 16]);
    for (let x = 0; x < 4; x++) for (let z = 0; z < 4; z++) if (!SKIN && r() < 0.6) lv.set(x, -6, z, new THREE.Color(P.creeperDark).multiplyScalar(0.35));   // 腳底暗邊
    const pivot = new THREE.Group();
    pivot.position.set(lx * S, 6 * S, lz * S);
    pivot.add(lv.merged({ slot: 'creeper', scale: S }));
    g.add(pivot);
    legs.push(pivot);
  }

  if (pose === 'lookBack') {
    headPivot.rotation.y = THREE.MathUtils.degToRad(headYaw ?? 45);
    headPivot.rotation.x = THREE.MathUtils.degToRad(headPitch ?? -22);
  } else {
    headPivot.rotation.y = THREE.MathUtils.degToRad(headYaw ?? 0);
    headPivot.rotation.x = THREE.MathUtils.degToRad(headPitch ?? 0);
  }

  g.userData.parts = { head: headPivot, body, legs };
  g.userData.pose = pose;
  return g;
}

/** 一列 n 隻 walker，沿 +x、間距 spacing 方塊（不同 seed）。 */
export function makeRow({ n = 6, spacing = 3, seed = 10 } = {}) {
  const row = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const c = makeCreeper({ seed: seed + i * 31, pose: 'walk' });
    c.position.x = i * spacing;
    row.add(c);
  }
  return row;
}

export const items = {
  hero: { build: () => makeCreeper({ seed: 3, pose: 'lookBack' }), note: '主角：頭轉向後上方（headYaw 45 / headPitch -22）' },
  walker: { build: () => makeCreeper({ seed: 5, pose: 'walk' }), note: '隊伍用，站直' },
  row: { build: () => makeRow({ n: 6, spacing: 3 }), note: '6 隻 walker 間距 3 一列' },
};
