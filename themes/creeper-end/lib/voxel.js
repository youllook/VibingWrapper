// 共用體素工具：所有素材都從這裡生方塊（1 單位 = 1 方塊；苦力怕 1 像素 = 1/16 方塊）。
// 靜態地形用 Voxels.merged()（只出外露面，一個 draw call）；會動的東西用 Voxels.instanced()。
// 每個 mesh 帶 userData.slot（材質槽名，階段 4 換貼圖用）與 userData.tris（三角形數，算預算用）。
import * as THREE from '../vendor/three.module.min.js';

const FACES = [   // 法線、四個角（單位方塊 0..1）
  [[1, 0, 0], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]],
  [[-1, 0, 0], [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]]],
  [[0, 1, 0], [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]]],
  [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]],
  [[0, 0, 1], [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]]],
  [[0, 0, -1], [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]]],
];

// 貼圖變體數（貼圖集橫排 n 格；lib/textures.js 要畫同樣格數）。每個方塊面依座標 hash 挑一格，避免整片重複。
export const VARIANTS = { endstone: 4, obsidian: 2 };
const fhash = (x, y, z, f) => { let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791) ^ Math.imul(f + 1, 2654435761); h ^= h >>> 13; return (Math.imul(h, 0x5bd1e995) >>> 0); };

// 頂點 AO 的四階亮度（0＝兩側都擋住，3＝沒擋）
export const AO_LEVELS = [0.5, 0.66, 0.82, 1];

export class Voxels {
  constructor() { this.cells = new Map(); this.boxes = []; }
  key(x, y, z) { return x + ',' + y + ',' + z; }
  // 整數格上的單位方塊（merged 用，相鄰面自動剔除）；同格後寫覆蓋
  set(x, y, z, color) { this.cells.set(this.key(x, y, z), [x, y, z, new THREE.Color(color)]); return this; }
  has(x, y, z) { return this.cells.has(this.key(x, y, z)); }
  del(x, y, z) { this.cells.delete(this.key(x, y, z)); return this; }
  // 任意位置、任意大小的長方塊（instanced 用；中心座標）
  box(cx, cy, cz, sx, sy, sz, color) { this.boxes.push([cx, cy, cz, sx, sy, sz, new THREE.Color(color)]); return this; }

  // 整數格 → 只含外露面的單一 Mesh（頂點色）。scale：一格多大（遠景可用 2、4 省三角形）
  // ao：頂點環境遮蔽（原版麥塊那種）：每個面頂點看法線那一層的兩個側鄰格＋角鄰格，越多被擋越暗；凹角、交界自然變暗
  merged({ slot = 'default', scale = 1, material, ao = true } = {}) {
    const pos = [], nor = [], col = [], uv = [], idx = [], nv = VARIANTS[slot] || 1;
    for (const [x, y, z, c] of this.cells.values()) {
      for (let fi = 0; fi < 6; fi++) {
        const [n, quad] = FACES[fi];
        if (this.has(x + n[0], y + n[1], z + n[2])) continue;
        const base = pos.length / 3, axis = n[0] ? 0 : n[1] ? 1 : 2, t1 = (axis + 1) % 3, t2 = (axis + 2) % 3, occ = [];
        for (const q of quad) {
          let k = 1;
          if (ao) {
            const o = [x + n[0], y + n[1], z + n[2]], a = o.slice(), b = o.slice();
            a[t1] += q[t1] ? 1 : -1; b[t2] += q[t2] ? 1 : -1;
            const s1 = this.has(...a), s2 = this.has(...b), cc = this.has(a[0] + (t2 === 0 ? b[0] - o[0] : 0), a[1] + (t2 === 1 ? b[1] - o[1] : 0), a[2] + (t2 === 2 ? b[2] - o[2] : 0));
            const lvl = s1 && s2 ? 0 : 3 - s1 - s2 - cc;
            k = AO_LEVELS[lvl];
          }
          occ.push(k);
          pos.push((x + q[0]) * scale, (y + q[1]) * scale, (z + q[2]) * scale);
          nor.push(...n); col.push(c.r * k, c.g * k, c.b * k);
        }
        const u0 = nv > 1 ? fhash(x, y, z, fi) % nv / nv : 0, u1 = u0 + 1 / nv;
        uv.push(u0, 0, u1, 0, u1, 1, u0, 1);
        // 對角較亮的那條當切線，避免 AO 漸層出現斜向折痕
        if (occ[0] + occ[2] >= occ[1] + occ[3]) idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        else idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material || new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.userData = { slot, tris: idx.length / 3 };
    return m;
  }

  // box() 清單 → 一個 InstancedMesh（每顆 12 三角形）
  instanced({ slot = 'default', material } = {}) {
    const n = this.boxes.length;
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material || new THREE.MeshLambertMaterial(), n);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3();
    this.boxes.forEach(([cx, cy, cz, sx, sy, sz, c], i) => {
      m.setMatrixAt(i, M.compose(P.set(cx, cy, cz), Q, S.set(sx, sy, sz)));
      m.setColorAt(i, c);
    });
    m.userData = { slot, tris: n * 12 };
    return m;
  }
}

// 一個 Object3D 底下所有 mesh 的三角形數
export function countTris(obj) {
  let t = 0;
  obj.traverse(o => { if (o.userData && o.userData.tris) t += o.userData.tris; });
  return t;
}

// 可重現的亂數（同 seed 同結果）
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => ((s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9 >>> 0) / 4294967296);
}

// 把 root 底下所有靜態 merged mesh（非 instanced）依 userData.slot 合併成一個 mesh 一個 slot，座標烘成 root 局部。
// 回傳新的 Group（原 root 不動）。一座島＋上面幾十株植物 → 4–5 個 draw call。
export function mergeBySlot(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), M = new THREE.Matrix4(), N = new THREE.Matrix3();
  const bins = new Map(), keep = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    if (o.isInstancedMesh || !o.geometry.index || !o.geometry.attributes.color) { keep.push(o); return; }
    const s = o.userData.slot || 'default';
    if (!bins.has(s)) bins.set(s, []);
    bins.get(s).push(o);
  });
  const out = new THREE.Group();
  for (const [slot, list] of bins) {
    const pos = [], nor = [], col = [], uv = [], idx = [];
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    for (const o of list) {
      M.multiplyMatrices(inv, o.matrixWorld); N.getNormalMatrix(M);
      const g = o.geometry, P = g.attributes.position, Nn = g.attributes.normal, C = g.attributes.color, U = g.attributes.uv, base = pos.length / 3;
      for (let i = 0; i < P.count; i++) {
        p.fromBufferAttribute(P, i).applyMatrix4(M); pos.push(p.x, p.y, p.z);
        n.fromBufferAttribute(Nn, i).applyMatrix3(N).normalize(); nor.push(n.x, n.y, n.z);
        col.push(C.getX(i), C.getY(i), C.getZ(i)); uv.push(U.getX(i), U.getY(i));
      }
      const I = g.index.array; for (let i = 0; i < I.length; i++) idx.push(I[i] + base);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, list[0].material);
    m.userData = { slot, tris: idx.length / 3 };
    out.add(m);
  }
  for (const o of keep) { const c = o.clone(); M.multiplyMatrices(inv, o.matrixWorld); c.matrix.copy(M); c.matrix.decompose(c.position, c.quaternion, c.scale); out.add(c); }
  return out;
}
