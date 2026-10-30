// 鐵器：槓片、槓鈴（可彎、可加減片）、深蹲架、舉重台
// 單位公尺；y 向上、選手面朝 +Z、槓鈴沿 X 軸。顏色只用 palette 槽（kit.mesh）。
import * as THREE from '../vendor/three.module.min.js';
import { mesh, material, rng } from '../lib/kit.js';

// ── 真實尺寸（見 docs/健力健身房/02-素材盤點.md）──
const BAR = {
  half: 1.10,          // 總長 2.20
  shaftR: 0.014,       // 握把段 28 mm
  sleeveR: 0.025,      // 套筒 50 mm
  collarIn: 0.655,     // 內側擋環（距中心）
  collarOut: 0.685,    // 擋環外緣＝套筒起點（套筒長 0.415 → 到 1.10）
  collarR: 0.04,
};
const PLATE = { R: 0.225, hole: 0.0255, hub: 0.07, rimIn: 0.19, letterIn: 0.105, letterOut: 0.165 };
const PLATE_T = { 20: 0.05, 25: 0.06 };
const CLIP_T = 0.02;

// ── 硬邊車削：沿 X 軸旋轉一條 (h=x, r) 剖面，剖面轉折處法線不平滑（角是硬的），圓周方向平滑 ──
// pts：剖面點 [h, r]；整條剖面在 (r 橫, h 縱) 平面上要是逆時針（外法線 = (dh, -dr)）
// slotOf(i)：第 i 段（pts[i]→pts[i+1]）用哪個槽；回傳 { 槽: BufferGeometry }
function latheX(pts, segs, slotOf) {
  const buf = {};
  for (let i = 0; i < pts.length - 1; i++) {
    const [h0, r0] = pts[i], [h1, r1] = pts[i + 1];
    if (r0 === 0 && r1 === 0) continue;
    const dh = h1 - h0, dr = r1 - r0, L = Math.hypot(dh, dr);
    if (L < 1e-9) continue;
    const nh = dh / L, nr = -dr / L;   // (dh, -dr) 依序對應 (r, h) → r 分量 = dh、h 分量 = -dr
    const slot = slotOf(i);
    const b = buf[slot] || (buf[slot] = { p: [], n: [], idx: [] });
    const base = b.p.length / 3;
    for (let k = 0; k <= segs; k++) {
      const a = k / segs * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      b.p.push(h0, r0 * c, r0 * s, h1, r1 * c, r1 * s);
      b.n.push(nr, nh * c, nh * s, nr, nh * c, nh * s);
    }
    // 判斷繞序：拿第一個四邊形的面法線和預期法線比
    const P = (k, j) => new THREE.Vector3(...[0, 1, 2].map(q => b.p[(base + k * 2 + j) * 3 + q]));
    const [v0, v1, v2] = r0 !== 0 ? [P(0, 0), P(0, 1), P(1, 0)] : [P(0, 1), P(1, 1), P(1, 0)];   // 起點在軸上就改用另一個三角形
    const fn = new THREE.Vector3().subVectors(v1, v0).cross(new THREE.Vector3().subVectors(v2, v0));
    const mid = Math.PI / segs;
    const want = new THREE.Vector3(nr, nh * Math.cos(mid), nh * Math.sin(mid));
    const flip = fn.dot(want) < 0;
    for (let k = 0; k < segs; k++) {
      const a = base + k * 2, bb = a + 1, c = a + 2, d = a + 3;
      if (r0 !== 0) flip ? b.idx.push(a, c, bb) : b.idx.push(a, bb, c);
      if (r1 !== 0) flip ? b.idx.push(bb, c, d) : b.idx.push(bb, d, c);
    }
  }
  const out = {};
  for (const [slot, b] of Object.entries(buf)) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
    g.setIndex(b.idx);
    out[slot] = g;
  }
  return out;
}

// ── 槓片 ──
const plateGeoCache = new Map();
function plateGeos(kg, segs) {
  const key = kg + '/' + segs;
  if (plateGeoCache.has(key)) return plateGeoCache.get(key);
  const T = PLATE_T[kg] || (0.05 + (kg - 20) * 0.002), t = T / 2;
  const e = T * 0.2, lift = 0.003;                       // 內凹深度、字環凸起高度
  const { R, hole, hub, rimIn, letterIn: L0, letterOut: L1 } = PLATE;
  const ch = 0.004;                                      // 外緣倒角
  // 逆時針一圈：底面（-X 面）由內往外 → 外緣 → 頂面（+X 面）由外往內 → 中孔
  const half = [[hole, -t], [hub, -t], [hub, -t + e], [L0, -t + e], [L0, -t + e - lift], [L1, -t + e - lift],
    [L1, -t + e], [rimIn, -t + e], [rimIn, -t], [R - ch, -t]];
  const top = half.slice().reverse().map(([r, h]) => [r, -h]);
  const pts = [...half, [R, -t + ch], [R, t - ch], ...top, [hole, -t]].map(([r, h]) => [h, r]);
  // 第 4 段（字環頂面）、第 9–11 段（外緣倒角＋外圈）＝磨亮；頂面對稱那段同理
  const n = pts.length - 1;
  const worn = new Set([4, 9, 10, 11, n - 6]);
  const geos = latheX(pts, segs, i => worn.has(i) ? 'ironWorn' : 'iron');
  const res = { geos, T };
  plateGeoCache.set(key, res);
  return res;
}

/**
 * 舊式黑鐵槓片。原點＝片的中心，軸沿 X（套在槓上直接用）。
 * @param {object} [o]
 * @param {number} [o.kg=20]      重量：20（厚 0.05 m）或 25（厚 0.06 m）
 * @param {number} [o.seed=1]     亂數種子：繞軸轉角、裝在槓上的微歪
 * @param {number} [o.segments=30] 圓周分段數
 * @returns {THREE.Group} userData.thickness＝厚度（m）
 */
export function makePlate({ kg = 20, seed = 1, segments = 30 } = {}) {
  const { geos, T } = plateGeos(kg, segments);
  const g = new THREE.Group();
  g.name = 'plate' + kg;
  for (const [slot, geo] of Object.entries(geos)) g.add(mesh(geo, slot, slot === 'iron' ? 'plate' : 'plateWorn'));
  const r = rng(seed * 7919 + kg);
  g.rotation.x = r() * Math.PI * 2;
  g.userData.thickness = T;
  g.userData.kg = kg;
  g.userData.wobble = [(r() - 0.5) * 0.012, (r() - 0.5) * 0.012];   // 裝上槓時的微歪（弧度）
  return g;
}

// ── 槓鈴 ──
// 彎曲曲線：bend＝內側擋環（±0.655）相對槓中心的下垂量；中段二次曲線，擋環外（套筒、片）沿切線剛性延伸
function bendY(x, b) {
  const a = Math.abs(x), X0 = BAR.collarIn;
  return a <= X0 ? -b * (a / X0) ** 2 : -b * (1 + 2 * (a - X0) / X0);
}
const bendSlope = b => -2 * b / BAR.collarIn;   // 擋環外 +X 側的斜率（-X 側取負）

function barGeos(segs) {
  const { half, shaftR, sleeveR, collarIn, collarOut, collarR } = BAR;
  // 半邊剖面（x 由 -half 到 0）再鏡射；長段切細，彎曲才有頂點可以動
  const raw = [[-half, 0], [-half, sleeveR - 0.003], [-half + 0.003, sleeveR], [-collarOut, sleeveR], [-collarOut, collarR],
    [-collarIn, collarR], [-collarIn, shaftR], [0, shaftR]];
  const right = raw.slice(0, -1).reverse().map(([x, r]) => [-x, r]);
  const prof = [...raw, ...right];
  const pts = [prof[0]];
  for (let i = 1; i < prof.length; i++) {
    const [x0, r0] = prof[i - 1], [x1, r1] = prof[i];
    const n = Math.max(1, Math.ceil(Math.abs(x1 - x0) / 0.06));
    for (let k = 1; k <= n; k++) pts.push([x0 + (x1 - x0) * k / n, r0 + (r1 - r0) * k / n]);
  }
  // 滾花：中央 ±0.08、兩側 0.21–0.60；擋環 steelDark；其餘 steel
  const slotOf = i => {
    const [x0, r0] = pts[i], [x1, r1] = pts[i + 1], xm = Math.abs((x0 + x1) / 2);
    if (r0 === collarR || r1 === collarR) return 'steelDark';
    if (r0 === shaftR && r1 === shaftR && (xm < 0.08 || (xm > 0.21 && xm < 0.60))) return 'steelDark';
    return 'steel';
  };
  return latheX(pts, segs, slotOf);
}

const clipGeoCache = new Map();
function clipGeo(segs) {
  if (clipGeoCache.has(segs)) return clipGeoCache.get(segs);
  const t = CLIP_T / 2, r0 = BAR.sleeveR + 0.0005, r1 = 0.04;
  const g = latheX([[-t, r0], [-t, r1], [t, r1], [t, r0], [-t, r0]], segs, () => 'steelDark').steelDark;
  clipGeoCache.set(segs, g);
  return g;
}

function makeClip(side) {
  const g = new THREE.Group();
  g.name = 'clip_' + side;
  g.add(mesh(clipGeo(16), 'steelDark'));
  const lever = mesh(new THREE.BoxGeometry(0.012, 0.05, 0.012), 'steelDark');   // 扣環扳手
  lever.position.set(0, 0.06, 0);
  g.add(lever);
  return g;
}

/**
 * 奧林匹克槓鈴（槓的中心＝原點，沿 X）。
 * @param {object} [o]
 * @param {number} [o.platesPerSide=0]  每邊片數 0–8
 * @param {number[]} [o.kinds=[25]]     由擋環往外每片的公斤數（20／25），不夠長就重複最後一個
 * @param {number} [o.bend=0]           彎曲量（m）：內側擋環相對槓中心的下垂；負值＝往上翹
 * @param {number} [o.seed=1]           亂數種子（片的轉角與微歪）
 * @returns {THREE.Group} 子物件：`bar`（槓身 Group）、`plates_L`、`plates_R`（各含 `clip_L`/`clip_R`）
 */
export function makeBarbell({ platesPerSide = 0, kinds = [25], bend = 0, seed = 1 } = {}) {
  const g = new THREE.Group();
  g.name = 'barbell';
  const bar = new THREE.Group();
  bar.name = 'bar';
  for (const [slot, geo] of Object.entries(barGeos(12))) {
    geo.userData.rest = Float32Array.from(geo.attributes.position.array);
    bar.add(mesh(geo, slot, 'bar_' + slot));
  }
  g.add(bar);
  for (const side of ['L', 'R']) {
    const pg = new THREE.Group();
    pg.name = 'plates_' + side;
    pg.position.x = (side === 'L' ? -1 : 1) * BAR.collarOut;
    pg.add(makeClip(side));
    g.add(pg);
  }
  g.userData = { bend: 0, kinds, seed, pool: { L: [], R: [] }, plates: 0 };
  setPlates(g, platesPerSide);
  setBend(g, bend);
  return g;
}

/**
 * 改槓的彎曲量，不重建：只改槓身頂點的 y，並把 plates_L/R 移到彎後的套筒上、跟著斜。
 * 動畫每格呼叫也可以（頂點約 1k 個）。
 * @param {THREE.Group} g       makeBarbell 回傳的 Group
 * @param {number} meters       彎曲量（同 makeBarbell 的 bend）
 */
export function setBend(g, meters) {
  g.userData.bend = meters;
  const bar = g.getObjectByName('bar');
  for (const m of bar.children) {
    const pos = m.geometry.attributes.position, rest = m.geometry.userData.rest, a = pos.array;
    for (let i = 0; i < a.length; i += 3) a[i + 1] = rest[i + 1] + bendY(rest[i], meters);
    pos.needsUpdate = true;
    m.geometry.boundingSphere = null;
    m.geometry.boundingBox = null;
  }
  const k = bendSlope(meters);
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? -1 : 1, pg = g.getObjectByName('plates_' + side);
    pg.position.set(s * BAR.collarOut, bendY(BAR.collarOut, meters), 0);
    pg.rotation.z = Math.atan(s * k);
  }
}

/**
 * 加減每邊片數，不重建槓（片會快取重用）。
 * @param {THREE.Group} g   makeBarbell 回傳的 Group
 * @param {number} n        每邊片數 0–8（片從擋環往外貼著排，扣環扣在最外片外側）
 */
export function setPlates(g, n) {
  n = Math.max(0, Math.min(8, Math.round(n)));
  const { kinds, seed, pool } = g.userData;
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? -1 : 1, pg = g.getObjectByName('plates_' + side), arr = pool[side];
    let x = 0;
    for (let i = 0; i < 8; i++) {
      if (i >= n) { if (arr[i]) pg.remove(arr[i]); continue; }
      if (!arr[i]) {
        const kg = kinds[Math.min(i, kinds.length - 1)];
        arr[i] = makePlate({ kg, seed: seed * 101 + i * 13 + (side === 'L' ? 0 : 7) });
        const [wy, wz] = arr[i].userData.wobble;
        arr[i].rotation.y = wy; arr[i].rotation.z = wz;
        arr[i].name = `plate_${side}${i}`;
      }
      const T = arr[i].userData.thickness;
      arr[i].position.x = s * (x + T / 2);
      x += T + 0.001;
      if (!arr[i].parent) pg.add(arr[i]);
    }
    pg.getObjectByName('clip_' + side).position.x = s * (x + CLIP_T / 2);
    if (x + CLIP_T > BAR.half - BAR.collarOut + 0.01) console.warn(`槓片超出套筒：${(x + CLIP_T).toFixed(3)} m > 0.415 m`);
  }
  g.userData.plates = n;
}

// ── 深蹲架 ──
/**
 * 健力深蹲架（4 根 75 mm 方管、高 2.3、內寬 1.20、內深 1.20）。原點＝底面中心，正面＝+Z。
 * @param {object} [o]
 * @param {number} [o.hookHeight=1.35]   J 鉤上放槓時「槓中心」的高度（m）
 * @param {number} [o.safetyHeight=0.75] 保護槓頂面高度（m）
 * @param {number} [o.seed=1]            亂數種子（目前只影響孔邊磨損大小）
 * @param {number} [o.depth=1.2]         內深（m）；gym1 的半架約 0.6
 * @returns {THREE.Group} 子物件：`hook_L`/`hook_R`（position.y＝槓中心高）、`safety_L`/`safety_R`（position.y＝頂面高）；
 *   userData.barZ＝放在鉤上時槓中心的 z
 */
export function makeRack({ hookHeight = 1.35, safetyHeight = 0.75, seed = 1, depth = 1.2 } = {}) {
  const S = 0.075, H = 2.3, W = 1.2, D = depth;
  const ux = W / 2 + S / 2, uz = D / 2 + S / 2;   // 立柱中心
  const g = new THREE.Group();
  g.name = 'rack';
  const box = (sx, sy, sz, x, y, z, slot = 'rack', name) => {
    const m = mesh(new THREE.BoxGeometry(sx, sy, sz), slot, name);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  // 立柱
  for (const x of [-ux, ux]) for (const z of [-uz, uz]) box(S, H, S, x, H / 2, z, 'rack', 'upright');
  // 上橫樑（前、後、左右）＋前方引體向上桿
  box(W + S * 2, S, S, 0, H - S / 2, uz);
  box(W + S * 2, S, S, 0, H - S / 2, -uz);
  for (const x of [-ux, ux]) box(S, S, D, x, H - S / 2, 0);
  const pull = mesh(new THREE.CylinderGeometry(0.016, 0.016, W + S * 2, 10), 'rackWorn', 'pullup');
  pull.rotation.z = Math.PI / 2; pull.position.set(0, H - 0.12, uz + 0.09);
  g.add(pull);
  for (const x of [-ux, ux]) box(S, 0.01, 0.1, x, H - 0.12, uz + 0.06);   // 引體桿托板
  // 底座：左右兩根沿 Z（前後各伸出 0.15 當腳）、後方橫樑；前方開口讓人走進去
  for (const x of [-ux, ux]) box(S, S, D + S * 2 + 0.3, x, S / 2, 0);
  box(W, S, S, 0, S / 2, -uz);

  // 孔：每根立柱前後兩面（±Z），前兩根再加左右兩面；InstancedMesh 兩層：磨亮的孔緣＋黑孔
  const r = rng(seed);
  const spots = [];
  for (const x of [-ux, ux]) for (const z of [-uz, uz]) {
    const faces = [[0, 0, 1], [0, 0, -1]];
    if (z > 0) faces.push([1, 0, 0], [-1, 0, 0]);
    for (const [nx, , nz] of faces) for (let y = 0.2; y <= H - 0.12; y += 0.05) spots.push([x + nx * S / 2, y, z + nz * S / 2, nx, nz]);
  }
  const ringGeo = new THREE.CircleGeometry(0.019, 8), holeGeo = new THREE.CircleGeometry(0.0125, 8);
  const rings = new THREE.InstancedMesh(ringGeo, material('rackWorn'), spots.length);
  const holes = new THREE.InstancedMesh(holeGeo, material('rubber'), spots.length);
  rings.name = 'holeWear'; rings.userData.slot = 'rackWorn';
  holes.name = 'holes'; holes.userData.slot = 'rubber';   // 孔＝暗洞；階段 4 可改成專用槽
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);
  spots.forEach(([x, y, z, nx, nz], i) => {
    q.setFromUnitVectors(Z, new THREE.Vector3(nx, 0, nz));
    const w = 0.8 + r() * 0.5;   // 孔緣磨損大小不一
    rings.setMatrixAt(i, m4.compose(p.set(x + nx * 0.001, y, z + nz * 0.001), q, sc.set(w, w, 1)));
    holes.setMatrixAt(i, m4.compose(p.set(x + nx * 0.002, y, z + nz * 0.002), q, sc.set(1, 1, 1)));
  });
  g.add(rings, holes);

  // J 鉤：掛在前立柱內側（-Z 面），鉤臂往架內伸；Group 原點＝槓放上去時的槓中心
  const seatZ = D / 2 - 0.06;
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? -1 : 1;
    const h = new THREE.Group();
    h.name = 'hook_' + side;
    h.position.set(s * ux, hookHeight, seatZ);
    const add = (sx, sy, sz, x, y, z, slot = 'rack') => {
      const m = mesh(new THREE.BoxGeometry(sx, sy, sz), slot);
      m.position.set(x, y, z);
      h.add(m);
    };
    const zu = uz - seatZ;                       // 立柱中心（本地）
    const ax = -s * 0.012;                       // 鉤臂往內偏，讓開擋環
    add(0.09, 0.16, 0.008, 0, -0.03, zu - S / 2 - 0.004);                 // 背板（貼立柱內面）
    for (const sx of [-1, 1]) add(0.006, 0.16, S + 0.01, sx * (S / 2 + 0.003), -0.03, zu);   // 夾住立柱的側板
    add(0.05, 0.02, 0.1, ax, -0.032, 0.01);       // 鉤臂
    add(0.05, 0.008, 0.09, ax, -0.018, 0.005, 'rackWorn');   // 襯墊（槓躺的地方）
    add(0.05, 0.055, 0.012, ax, -0.016, -0.046);  // 前端上翹的擋唇
    g.add(h);
  }
  // 保護槓：左右各一根沿 Z 穿過前後立柱
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? -1 : 1;
    const sg = new THREE.Group();
    sg.name = 'safety_' + side;
    sg.position.set(s * ux, safetyHeight, 0);
    const bar = mesh(new THREE.BoxGeometry(0.05, 0.05, D + S * 2 + 0.16), 'rack');
    bar.position.y = -0.025;
    const wear = mesh(new THREE.BoxGeometry(0.051, 0.004, D * 0.8), 'rackWorn');   // 頂面被槓砸掉漆
    wear.position.y = -0.0015;
    for (const z of [-1, 1]) {   // 插銷頭
      const pin = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.07, 8), 'steelDark');
      pin.rotation.z = Math.PI / 2; pin.position.set(s * 0.06, -0.025, z * (D / 2 + S + 0.05));
      sg.add(pin);
    }
    sg.add(bar, wear);
    g.add(sg);
  }
  g.userData.barZ = seatZ;
  return g;
}

// ── 舉重台 ──
/**
 * 舉重台 2.4×2.4×0.04：中間 1.2 m 寬木心（三片木板，沿 Z）＋兩側黑橡膠。原點＝底面中心。
 * @param {object} [o]
 * @param {number} [o.seed=1]  亂數種子（木板高低差 ±1 mm）
 * @returns {THREE.Group}
 */
export function makePlatform({ seed = 1 } = {}) {
  const g = new THREE.Group();
  g.name = 'platform';
  const r = rng(seed), T = 0.04, size = 2.4, woodW = 1.2;
  const n = 3, pw = woodW / n;
  for (let i = 0; i < n; i++) {
    const dt = (r() - 0.5) * 0.002;
    const m = mesh(new THREE.BoxGeometry(pw - 0.003, T + dt, size - 0.003), 'wood', 'wood' + i);
    m.position.set(-woodW / 2 + pw * (i + 0.5), (T + dt) / 2, 0);
    g.add(m);
  }
  for (const s of [-1, 1]) {
    const w = (size - woodW) / 2;
    const m = mesh(new THREE.BoxGeometry(w, T, size), 'rubber', s < 0 ? 'rubber_L' : 'rubber_R');
    m.position.set(s * (woodW / 2 + w / 2), T / 2, 0);
    g.add(m);
  }
  return g;
}

export const items = {
  plate20: { build: () => makePlate({ kg: 20 }), note: '舊式黑鐵 20 kg，厚 0.05' },
  plate25: { build: () => makePlate({ kg: 25, seed: 2 }), note: '舊式黑鐵 25 kg，厚 0.06' },
  barbell: { build: () => makeBarbell(), note: '空槓 2.20 m' },
  barbellLoaded: { build: () => makeBarbell({ platesPerSide: 4 }), note: '每邊 4×25 kg' },
  barbellBent: { build: () => makeBarbell({ platesPerSide: 4, bend: 0.06 }), note: 'bend 0.06' },
  rack: { build: () => makeRack(), note: '深蹲架 hook 1.35／safety 0.75' },
  platform: { build: () => makePlatform(), note: '2.4×2.4×0.04' },
};
