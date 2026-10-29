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
  merged({ slot = 'default', scale = 1, material } = {}) {
    const pos = [], nor = [], col = [], uv = [], idx = [], nv = VARIANTS[slot] || 1;
    for (const [x, y, z, c] of this.cells.values()) {
      for (let fi = 0; fi < 6; fi++) {
        const [n, quad] = FACES[fi];
        if (this.has(x + n[0], y + n[1], z + n[2])) continue;
        const base = pos.length / 3;
        for (const q of quad) {
          pos.push((x + q[0]) * scale, (y + q[1]) * scale, (z + q[2]) * scale);
          nor.push(...n); col.push(c.r, c.g, c.b);
        }
        const u0 = nv > 1 ? fhash(x, y, z, fi) % nv / nv : 0, u1 = u0 + 1 / nv;
        uv.push(u0, 0, u1, 0, u1, 1, u0, 1);
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
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
