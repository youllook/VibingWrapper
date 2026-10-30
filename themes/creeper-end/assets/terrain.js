// 麥塊世界 mc3 — 地形：末地石平台、鋸齒橋、浮島（子代理 B）
// 規格見 docs/麥塊世界mc3/02-素材盤點.md。全部 Voxels.set + merged（slot 'endstone'），固有色＋平光。
// 作法：先算「每個 (x,z) 柱的頂格/底格」，再只填外露的格子（內部不填，省 build 時間、看不出洞）。
import * as THREE from '../vendor/three.module.min.js';
import { Voxels, countTris, rng } from '../lib/voxel.js';
import { P } from '../lib/palette.js';

// ---------- 小工具 ----------
const CBASE = new THREE.Color(P.endstone), CSHADE = new THREE.Color(P.endstoneShade), CDARK = new THREE.Color(P.endstoneDark);
const _c = new THREE.Color();
// 末地石顏色：k = 距該柱頂面往下幾格；frac = 該格在整柱裡的相對深度 0..1；亮度每格隨機 ±6%
function stoneColor(k, frac, r) {
  _c.copy(CBASE);
  if (k > 0) _c.lerp(CSHADE, Math.min(k, 3) / 3 * 0.7);
  _c.lerp(CDARK, frac * 0.6);
  return _c.multiplyScalar(1 + (r() - 0.5) * 0.12).clone();
}

function hash(x, z, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(seed | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// 平滑 value noise 0..1
function vnoise(x, z, seed) {
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash(xi, zi, seed), b = hash(xi + 1, zi, seed), c = hash(xi, zi + 1, seed), d = hash(xi + 1, zi + 1, seed);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

// cols: Map key -> {x, z, top, bot}（top/bot 為格索引，含）。只填外露格；extra: [[x,y,z,frac]] 單獨吊著的方塊
function paint(cols, r, { scale = 1, extra = [] } = {}) {
  const key = (x, z) => (x + 4096) * 8192 + (z + 4096);
  const map = new Map();
  for (const c of cols) map.set(key(c.x, c.z), c);
  const v = new Voxels();
  const covers = (x, z, y) => { const c = map.get(key(x, z)); return !!c && y >= c.bot && y <= c.top; };
  for (const c of cols) {
    const total = Math.max(1, c.top - c.bot);
    for (let y = c.bot; y <= c.top; y++) {
      const edge = y === c.top || y === c.bot;
      if (!edge && covers(c.x + 1, c.z, y) && covers(c.x - 1, c.z, y) && covers(c.x, c.z + 1, y) && covers(c.x, c.z - 1, y)) continue;
      v.set(c.x, y, c.z, stoneColor(c.top - y, (c.top - y) / total, r));
    }
  }
  for (const [x, y, z, f] of extra) v.set(x, y, z, stoneColor(3, f ?? 0.9, r));
  const m = v.merged({ slot: 'endstone', scale });
  const g = new THREE.Group();
  g.add(m);
  return g;
}

// ---------- 浮島 ----------
/** makeIsland({seed, radius(格), terraces 1–3, depth(中心倒錐深,格), scale(一格多大,預設1)}) → Group，userData.surface=[[x,y,z]]（頂面可站格，y=上表面高度） */
export function makeIsland({ seed = 1, radius = 10, terraces = 2, depth = 14, scale = 1, jag = 0 } = {}) {   // jag：底部每根柱長度隨機差（0–1，目標圖的參差鐘乳石）
  const r = rng(seed * 7 + 3);
  const T = Math.max(1, Math.min(3, terraces | 0));
  const ax = radius * (0.9 + r() * 0.2), az = radius * (0.9 + r() * 0.2), rot = r() * Math.PI;
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const E = Math.ceil(Math.max(ax, az) * 1.3) + 1;
  const bounds = T === 1 ? [] : T === 2 ? [0.55] : [0.4, 0.72];
  const cols = [], surface = [];
  for (let x = -E; x <= E; x++) for (let z = -E; z <= E; z++) {
    const dx = x * cs + z * sn, dz = -x * sn + z * cs;
    let d = Math.hypot(dx / ax, dz / az);
    d *= 1 + 0.3 * (vnoise(x * 0.18 + 11, z * 0.18, seed) - 0.5) + 0.14 * (vnoise(x * 0.5, z * 0.5 + 5, seed + 1) - 0.5) + 0.07 * (hash(x, z, seed) - 0.5);
    if (d > 1) continue;
    const dn = d + 0.1 * (vnoise(x * 0.35, z * 0.35 + 3, seed + 2) - 0.5);
    let lvl = 0; for (const b of bounds) if (dn > b) lvl++;
    const top = -lvl - 1;
    // 外緣一圈有厚度（垂直峭壁），往中心倒錐；低頻噪聲做大塊起伏，每格只 ±1
    const rim = 2 + depth * 0.12;
    let thick = rim + depth * Math.pow(Math.max(0, 1 - d), 0.95) * (0.8 + 0.4 * vnoise(x * 0.22 + 7, z * 0.22, seed + 3));
    thick += (vnoise(x * 0.6, z * 0.6 + 9, seed + 4) - 0.5) * 3 + (hash(x, z, seed + 5) < 0.5 ? 1 : 0);
    // 鐘乳石：低頻噪聲高處成簇垂下
    if (d < 0.95 && vnoise(x * 0.4 + 2, z * 0.4, seed + 6) > 0.72) thick += (1 + hash(x, z, seed + 7) * depth * 0.16) * (1.05 - d);
    // 參差：以 2×2 為一組（柱比單格粗，像目標圖的方塊柱）各自隨機加長，相鄰組長短差大 → 每根柱都露出正面與側面
    if (jag) thick += Math.floor(Math.pow(hash(x >> 1, z >> 1, seed + 9), 2) * depth * jag * (1.1 - d));
    thick = Math.max(1, Math.floor(thick));
    cols.push({ x, z, top, bot: top - thick + 1 });
    surface.push([x * scale, (top + 1) * scale, z * scale]);
  }
  // 最底端幾顆單獨吊著的小方塊
  const extra = [];
  const deepest = cols.slice().sort((a, b) => a.bot - b.bot).slice(0, Math.max(3, cols.length >> 6));
  const nHang = Math.min(deepest.length, 2 + Math.floor(radius / 8));
  for (let i = 0; i < nHang; i++) {
    const c = deepest[Math.floor(r() * deepest.length)];
    extra.push([c.x + (r() < 0.5 ? 0 : (r() < 0.5 ? 1 : -1)), c.bot - 2 - Math.floor(r() * 3), c.z, 0.95]);
  }
  const g = paint(cols, r, { scale, extra });
  g.userData.surface = surface;
  g.userData.radius = radius * scale;
  return g;
}

// ---------- 近景平台 ----------
/** makeForeCliff({seed, size(邊長格,預設22), edits:[[x0,z0,x1,z1,dh],…]（含端點的矩形區域地表加減 dh 格，場景用來配目標圖的凹洞台階）}) → Group；+x、+z 兩側是斷崖；userData.surface、userData.heroSpot=建議苦力怕站位[x,y,z]（靠斷崖的台階） */
export function makeForeCliff({ seed = 5, size = 22, edits = [] } = {}) {
  const r = rng(seed * 13 + 1), W = size, D = size, half = size / 2;
  // 地表高度（格）：往左後方逐階抬高；右前是斷崖
  const surf = (x, z) => {
    let h = 0;
    if (x < 14 && z < 11) h = 1;
    if (x < 7 && z < 5 + ((x * 3) % 2)) h = 2;
    if (x > 15 && z < 8) h = 1;               // 右後一塊抬高的台階
    if (x >= 9 && x <= 11 && z >= 12 && z <= 14) h = 1;  // 中間一格高的小台階（苦力怕腳邊）
    return h;
  };
  const pits = [[5, 14, 2], [14, 5, 2], [8, 2, 1]];  // [x,z,邊長]：一格深凹洞
  const cols = [], surface = [];
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
    // 左緣、後緣參差；斷崖邊（x=W-1、z=D-1）筆直
    const jag = (x < 2 ? hash(x, z, seed) < 0.35 - x * 0.15 : false) || (z < 2 ? hash(x, z, seed + 1) < 0.35 - z * 0.15 : false);
    if (jag) continue;
    let h = surf(x, z);
    for (const [px, pz, s] of pits) if (x >= px && x < px + s && z >= pz && z < pz + s) h -= 1;
    for (const [x0, z0, x1, z1, dh] of edits) if (x >= x0 && x <= x1 && z >= z0 && z <= z1) h += dh;
    const u = Math.max(Math.abs(x + 0.5 - half), Math.abs(z + 0.5 - half)) / half;  // 切比雪夫 0 中心..1 邊
    let thick = 8 + hash(x, z, seed + 2) * 1.6 + 16 * Math.pow(Math.max(0, 1 - u), 1.15) * (0.8 + 0.4 * vnoise(x * 0.35, z * 0.35, seed));
    if (u > 0.8 && x < W - 1 && z < D - 1) thick -= hash(x, z, seed + 3) * 3;
    if (vnoise(x * 0.5 + 3, z * 0.5, seed + 4) > 0.75 && u < 0.9) thick += 2 + hash(x, z, seed + 5) * 5;
    thick = Math.max(3, Math.floor(thick));
    const top = h - 1;
    cols.push({ x, z, top, bot: top - thick + 1 });
    surface.push([x, h, z]);
  }
  const extra = [[10, -17, 11, 0.95], [12, -20, 10, 0.95]];
  const g = paint(cols, r, { extra });
  g.userData.surface = surface;
  g.userData.heroSpot = [16, 0, 13];  // 靠右前斷崖、平的一格
  return g;
}

// ---------- 鋸齒窄橋 ----------
/** makeBridge({seed, points:[[x,z],…], width(2–3), gap(尾端留空格數,預設0), hang(底下垂墜強度 0–1,預設1), depth(橋身額外加厚格數,預設0)}) → Group；userData.surface、endPoint、endDir（往尾端外延 gap 格再接島） */
export function makeBridge({ seed = 3, points = [[0, 0], [10, 3], [20, -2], [30, 4], [40, 0]], width = 3.2, gap = 0, hang = 1, depth = 0 } = {}) {
  const r = rng(seed * 17 + 5);
  const cells = new Map();
  const segs = [];
  let L = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, z0] = points[i], [x1, z1] = points[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    segs.push({ x0, z0, x1, z1, len, s0: L }); L += len;
  }
  const last = segs[segs.length - 1];
  const endDir = [(last.x1 - last.x0) / last.len, (last.z1 - last.z0) / last.len];
  const minX = Math.floor(Math.min(...points.map(p => p[0])) - width - 2), maxX = Math.ceil(Math.max(...points.map(p => p[0])) + width + 2);
  const minZ = Math.floor(Math.min(...points.map(p => p[1])) - width - 2), maxZ = Math.ceil(Math.max(...points.map(p => p[1])) + width + 2);
  const lim = L - gap;
  for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
    let best = 1e9, bs = 0;
    for (const s of segs) {
      const dx = s.x1 - s.x0, dz = s.z1 - s.z0;
      const t = Math.max(0, Math.min(1, ((x + 0.5 - s.x0) * dx + (z + 0.5 - s.z0) * dz) / (s.len * s.len)));
      const d = Math.hypot(x + 0.5 - (s.x0 + dx * t), z + 0.5 - (s.z0 + dz * t));
      if (d < best) { best = d; bs = s.s0 + t * s.len; }
    }
    if (bs > lim) continue;
    const hw = width / 2 + (vnoise(x * 0.4, z * 0.4, seed) - 0.5) * 0.8;
    if (best > hw) continue;
    if (best > hw - 0.6 && hash(x, z, seed + 1) < 0.22) continue;           // 邊緣缺塊
    const thick = 1 + (vnoise(x * 0.3 + 4, z * 0.3, seed + 2) > 0.35 ? 1 : 0) + (hash(x, z, seed + 3) < 0.25 ? 1 : 0)
      + Math.round(depth * (1 - 0.5 * Math.max(0, best / Math.max(0.5, hw))));   // 加厚：中線最厚、往兩側收
    cells.set(x + ',' + z, { x, z, top: -1, bot: -thick, d: best / Math.max(0.5, hw) });
  }
  const cols = [...cells.values()];
  const surface = cols.map(c => [c.x, 0, c.z]);
  // 底下零星掛 1–3 格小垂墜（連在橋底，故用加長柱）
  for (const c of cols) if (hash(c.x, c.z, seed + 4) < 0.16 * hang || vnoise(c.x * 0.35, c.z * 0.35, seed + 6) > 1 - 0.28 * hang) c.bot -= 1 + Math.floor(hash(c.x, c.z, seed + 5) * 3 * hang);
  const g = paint(cols, r, {});
  g.userData.surface = surface;
  g.userData.endPoint = [last.x1, last.z1];
  g.userData.endDir = endDir;
  g.userData.length = L;
  return g;
}

// ---------- items ----------
const BRIDGE_PTS = [[0, 0], [9, 4], [17, -1], [27, 5], [36, 1], [43, 6]];
export const items = {
  foreCliff: { build: () => makeForeCliff({ seed: 5 }), note: '近景平台 22×22，台階＋凹洞＋斷崖＋倒錐；heroSpot 建議站位' },
  bridge: {
    build: () => {
      const g = new THREE.Group();
      const b = makeBridge({ seed: 3, points: BRIDGE_PTS, width: 3.2 });
      g.add(b); g.userData.surface = b.userData.surface;
      // 缺口一格後接 islandSmall（示意）：島中心 = 尾端 + 方向*(1 + 半徑)
      const isl = makeIsland({ seed: 11, radius: 5, terraces: 1, depth: 9 });
      const [ex, ez] = b.userData.endPoint, [dx, dz] = b.userData.endDir;
      isl.position.set(ex + dx * 6.5, 0, ez + dz * 6.5);
      g.add(isl);
      return g;
    },
    note: '鋸齒橋 ~44 格；尾端空 1 格接 islandSmall（示意）',
  },
  islandSmall: { build: () => makeIsland({ seed: 11, radius: 5, terraces: 1, depth: 9 }), note: '橋尾小圓島 r5，很圓、倒錐深' },
  islandMid: { build: () => makeIsland({ seed: 21, radius: 12, terraces: 2, depth: 17 }), note: '中景下層中型島 r12' },
  islandBig: { build: () => makeIsland({ seed: 31, radius: 28, terraces: 3, depth: 36 }), note: '中景大島 r28，三層台地、底部垂墜厚' },
};
