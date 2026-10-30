// 遠景：遠島（台地＋倒錐底＋黑曜石柱＋紫頌剪影）、遠島群、虛空漸層背景。
// 階段 2：固有色＋平光，不做霧／發光／貼圖。規格見 docs/麥塊世界mc3/02-素材盤點.md
// draw call：farIsland = 4（endstone/obsidian/chorusStem/chorusFlower）；farField = 8（兩檔 scale × 4 槽）；void = 1。
import * as THREE from '../vendor/three.module.min.js';
import { Voxels, rng, countTris } from '../lib/voxel.js';
import { P } from '../lib/palette.js';

const jitter = (c, r, amt) => {          // 同色系明暗斑駁
  const k = 1 + (r() - 0.5) * 2 * amt, col = new THREE.Color(c);
  return col.multiplyScalar(k);
};

// 一組同 scale 的體素容器（一種槽一個 Voxels，之後各合併成一個 mesh）
function makeSet() { return { stone: new Voxels(), obs: new Voxels(), stem: new Voxels(), glow: new Voxels() }; }

// 在格座標 (cx,cy,cz)（單位 = scale 格）放一座島。rc = 以格計的半徑
function addIsland(set, cx, cy, cz, rc, r, opt = {}) {
  const { stone, obs, stem, glow } = set;
  const ph1 = r() * 6.28, ph2 = r() * 6.28, ph3 = r() * 6.28;
  const edge = (a) => 0.78 + 0.13 * Math.sin(a * 2 + ph1) + 0.09 * Math.sin(a * 3 + ph2) + 0.06 * Math.sin(a * 5 + ph3);
  const depth = Math.max(2, Math.round(rc * (1.3 + r() * 0.7)));
  const top = [];                                         // 頂面格（放柱、植物用）
  rc = rc / 0.8; const R = Math.ceil(rc) + 1;
  for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
    const d = Math.hypot(dx, dz), a = Math.atan2(dz, dx), lim = rc * edge(a);
    if (d > lim) continue;
    // 台地頂：1–2 層；邊緣較薄
    const thick = d < lim * 0.7 ? 2 : 1;
    for (let k = 0; k < thick; k++) {
      const c = k === 0 ? jitter(P.endstone, r, 0.06) : jitter(P.endstoneShade, r, 0.06);
      stone.set(cx + dx, cy - k, cz + dz, c);
    }
    top.push([cx + dx, cy, cz + dz, d / lim]);
  }
  // 倒錐：逐層縮小，邊緣參差
  for (let k = 2; k <= depth + 1; k++) {
    const t = (k - 1) / (depth + 1), rr = rc * Math.pow(1 - t, 1.0) * 0.92;
    if (rr < 0.4) break;
    const Rk = Math.ceil(rr) + 1;
    for (let dx = -Rk; dx <= Rk; dx++) for (let dz = -Rk; dz <= Rk; dz++) {
      const d = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
      if (d > rr * (edge(a) / 0.78) * 0.95 + (r() - 0.5) * 0.8) continue;
      stone.set(cx + dx, cy - k, cz + dz, jitter(t > 0.55 ? P.endstoneDark : P.endstoneShade, r, 0.07));
    }
  }
  // 黑曜石柱（細長，柱頂一點光）
  const pilN = opt.pillars ?? (rc >= 5 ? Math.round(r() * 2.2) : 0);
  const used = new Set();
  const pick = (maxT) => {
    for (let n = 0; n < 12; n++) {
      const c = top[Math.floor(r() * top.length)];
      if (c && c[3] < maxT && !used.has(c[0] + ',' + c[2])) { used.add(c[0] + ',' + c[2]); return c; }
    }
    return null;
  };
  for (let i = 0; i < pilN; i++) {
    const c = pick(0.7); if (!c) break;
    const h = opt.pillarH(r);
    for (let y = 1; y <= h; y++) obs.set(c[0], c[1] + y, c[2], jitter(y % 3 ? P.obsidian : P.obsidianEdge, r, 0.08));
    glow.set(c[0], c[1] + h + 1, c[2], P.chorusFlower);
  }
  // 紫頌剪影（主幹＋1–2 個側枝，端點發光）
  const chN = opt.chorus ?? Math.round(rc * 0.5 * (0.5 + r()));
  for (let i = 0; i < chN; i++) {
    const c = pick(0.95); if (!c) break;
    const h = 3 + Math.floor(r() * 4);                     // 3–6 格
    const col = P.chorusStem;
    for (let y = 1; y <= h; y++) stem.set(c[0], c[1] + y, c[2], col);
    let tipY = h, tipX = c[0], tipZ = c[2];
    if (h >= 3 || r() < 0.5) {
      const by = 2 + Math.floor(r() * (h - 1)), dir = Math.floor(r() * 4), ax = [1, -1, 0, 0][dir], az = [0, 0, 1, -1][dir];
      const bx = c[0] + ax, bz = c[2] + az, bl = 1 + Math.floor(r() * 2);
      for (let y = 0; y < bl; y++) stem.set(bx, c[1] + by + y, bz, col);
      glow.set(bx, c[1] + by + bl, bz, P.chorusFlower);
    }
    glow.set(tipX, c[1] + tipY + 1, tipZ, P.chorusFlower);
  }
}

function setToGroup(set, scale, group) {
  group.add(set.stone.merged({ slot: 'endstone', scale }));
  if (set.obs.cells.size) group.add(set.obs.merged({ slot: 'obsidian', scale }));
  if (set.stem.cells.size) group.add(set.stem.merged({ slot: 'chorusStem', scale }));
  if (set.glow.cells.size) group.add(set.glow.merged({ slot: 'chorusFlower', scale }));
}

/** 單座遠島。radius：方塊數（預設 15）；scale：粗方塊邊長 2–4（預設 2）；seed：亂數種子。頂面中心 y=0。 */
export function makeFarIsland({ seed = 1, radius = 15, scale = 2 } = {}) {
  const r = rng(seed), set = makeSet(), g = new THREE.Group();
  addIsland(set, 0, 0, 0, Math.max(1.5, radius / scale), r, {
    pillars: radius >= 10 ? 1 + Math.floor(r() * 2) : 0,
    pillarH: (rr) => Math.round((14 + rr() * 22) / scale),
    chorus: Math.round(radius / scale * 0.7),
  });
  setToGroup(set, scale, g);
  g.userData.scale = scale;
  return g;
}

/**
 * 一整片遠島群。count：島數（30–60）；area：範圍寬深（方塊，預設 600）；seed。
 * 原點＝範圍中心。離中心越遠越小越粗（scale 2→4），垂直落差約 ±40。兩檔 scale 各合併成 4 個 mesh（共 8 draw call）。
 */
export function makeFarField({ seed = 7, count = 50, area = 600 } = {}) {
  const r = rng(seed), g = new THREE.Group();
  const sets = { 2: makeSet(), 4: makeSet() };
  const placed = [];
  for (let i = 0, tries = 0; i < count && tries < count * 20; tries++) {
    const x = (r() - 0.5) * area, z = (r() - 0.5) * area, y = (r() - 0.5) * 80;
    const t = Math.min(1, Math.hypot(x, z) / (area * 0.7));          // 0 中心 → 1 邊緣
    const rad = Math.max(4, Math.round((25 - 21 * Math.pow(t, 0.8)) * (0.55 + r() * 0.6)));
    if (placed.some(p => Math.hypot(p[0] - x, p[2] - z) < (p[3] + rad) * 1.1 && Math.abs(p[1] - y) < 30)) continue;
    placed.push([x, y, z, rad]); i++;
    const scale = t < 0.3 ? 2 : 4;
    addIsland(sets[scale], Math.round(x / scale), Math.round(y / scale), Math.round(z / scale), Math.max(1.5, rad / scale), r, {
      pillars: rad >= 12 ? (r() < 0.6 ? 1 + Math.floor(r() * 2) : 0) : (rad >= 7 && r() < 0.25 ? 1 : 0),
      pillarH: (rr) => Math.round((14 + rr() * 26) / scale),
      chorus: Math.round(rad / scale * 0.8 * (0.4 + r() * 0.6)),
    });
  }
  setToGroup(sets[2], 2, g);
  setToGroup(sets[4], 4, g);
  g.userData.count = placed.length;
  return g;
}

/** 虛空背景：反向大球，垂直漸層（上 voidTop → 地平 haze → 下 void）。radius 預設 2000。 */
export function makeVoid({ radius = 2000 } = {}) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(P.voidTop) }, haze: { value: new THREE.Color(P.haze) }, bot: { value: new THREE.Color(P.void) } },
    vertexShader: 'varying float vY; void main(){ vY = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 haze; uniform vec3 bot; varying float vY;
      void main(){
        vec3 c = vY >= 0.0 ? mix(haze, top, smoothstep(0.0, 0.55, vY)) : mix(haze, bot, smoothstep(0.0, 0.5, -vY));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat);
  m.userData = { slot: 'void', tris: 32 * 16 * 2 - 64 };
  m.renderOrder = -1;
  return m;
}

export const items = {
  farIsland: { build: () => makeFarIsland({ seed: 3, radius: 15, scale: 2 }), note: '單座遠島 R15，scale 2，含黑曜石柱＋紫頌剪影' },
  farField: { build: () => makeFarField({ seed: 7, count: 50, area: 600 }), note: '遠島群 50 座 600×600，8 draw call' },
  voidBackdrop: { build: () => makeVoid({ radius: 300 }), note: "檢視器只能從球外看內側，所以這裡半徑縮成 300；實用預設 2000" },
};
export { countTris };
