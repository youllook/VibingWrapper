/* =====================================================================================
 * 麥塊世界 (creeper-window) — assets, 2026-10-29
 *
 * Every texture is drawn here, pixel by pixel, from a fixed seed: original 16 px block art in a voxel style
 * (no game textures are used). Models are built from boxes with those textures.
 *  - TEX: name → { size, draw(px, rnd) }. makeCanvas(name) gives the canvas, texture(name) the THREE texture.
 *  - Models: creeper(), lantern(), spruce(), torch(), hut(). Units: 1 = one block; the origin is at the feet.
 * ===================================================================================== */
import * as THREE from 'three';

/* ------------------------------ helpers ------------------------------ */
export function rng(seed) {                           // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const shade = (c, k) => c.map(v => Math.max(0, Math.min(255, Math.round(v * k))));
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

// a tiny pixel buffer: set(x, y, rgb, a)
function buffer(n) {
  const d = new Uint8ClampedArray(n * n * 4);
  return { n, d,
    set(x, y, c, a = 255) { if (x < 0 || y < 0 || x >= n || y >= n) return; const i = (y * n + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = a; },
    get(x, y) { const i = (y * n + x) * 4; return [d[i], d[i + 1], d[i + 2]]; },
    fill(fn) { for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) fn(x, y); } };
}
// per-pixel jitter around a colour (brightness only, so the hue stays put)
const jit = (r, c, amt) => shade(c, 1 + (r() * 2 - 1) * amt);

/* ------------------------------ textures ------------------------------ */
const OAK = ['#a5804e', '#9a7546', '#8e6b3f'].map(hex), OAK_SEAM = hex('#5e4426');
const BARK = ['#5c4329', '#4c3721', '#6b4f31', '#3f2d1b'].map(hex);
const SBARK = ['#3d2b1b', '#33241a', '#4a3522', '#2a1d12'].map(hex);
const STONE = hex('#7c7c7a'), MORTAR = hex('#4a4a4a');
const DIRT = ['#79553a', '#6d4b32', '#86603f', '#5f412b'].map(hex);
const GRASS = ['#5d8a3c', '#527d34', '#6a9a45', '#476e2d'].map(hex);
const SPRUCE = ['#2f4d31', '#284329', '#375a39', '#203722'].map(hex);
const CREEP = ['#3d6e38', '#4a7d42', '#305c2c', '#5a8a50', '#264b23', '#3d6e38', '#4a7d42'].map(hex);   // dark, muted greens: the light shapes them (Fable #1)
const CREEP_HI = hex('#93b48b'), CREEP_DARK = hex('#0c120c'), CREEP_MOUTH = hex('#1a2a17');

export const TEX = {
  oak_planks: { size: 16, draw(b, r) {
    // four boards, 4 px tall, each with one end seam at its own offset
    for (let row = 0; row < 4; row++) {
      const base = OAK[row % 3], seam = Math.floor(r() * 12) + 2;
      for (let y = row * 4; y < row * 4 + 4; y++) for (let x = 0; x < 16; x++) {
        let c = jit(r, base, 0.06);
        if (y === row * 4 + 3) c = jit(r, OAK_SEAM, 0.05);          // the gap under each board
        else if (x === seam) c = shade(OAK_SEAM, 1.15);              // board end
        else if (r() < 0.06) c = shade(base, 0.85);                  // grain flecks
        b.set(x, y, c);
      }
    }
  } },
  oak_log: { size: 16, draw(b, r) {
    // vertical bark: each column picks a tone, runs of darker cracks
    for (let x = 0; x < 16; x++) {
      const col = pick(r, BARK);
      for (let y = 0; y < 16; y++) b.set(x, y, r() < 0.12 ? shade(col, 0.7) : jit(r, col, 0.07));
    }
    for (let k = 0; k < 4; k++) { const x = Math.floor(r() * 16), y0 = Math.floor(r() * 12); for (let y = y0; y < y0 + 4; y++) b.set(x, y, shade(BARK[3], 0.75)); }
  } },
  oak_log_top: { size: 16, draw(b, r) {
    const ring = ['#b58f5b', '#a07c4b', '#c19c67'].map(hex);
    b.fill((x, y) => {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      if (d > 6.5) b.set(x, y, jit(r, pick(r, BARK), 0.06));
      else b.set(x, y, jit(r, ring[Math.floor(d) % 2 ? 1 : (d < 2 ? 2 : 0)], 0.04));
    });
  } },
  spruce_log: { size: 16, draw(b, r) {
    for (let x = 0; x < 16; x++) { const col = pick(r, SBARK); for (let y = 0; y < 16; y++) b.set(x, y, r() < 0.15 ? shade(col, 0.7) : jit(r, col, 0.08)); }
  } },
  spruce_leaves: { size: 16, draw(b, r) {
    // needles: dark greens in short clumps, about one pixel in six left open (alpha-tested)
    b.fill((x, y) => { if (r() < 0.16) b.set(x, y, [0, 0, 0], 0); else b.set(x, y, jit(r, pick(r, SPRUCE), 0.1)); });
  } },
  stone: { size: 16, draw(b, r) {
    b.fill((x, y) => b.set(x, y, jit(r, STONE, 0.07)));
    for (let k = 0; k < 7; k++) {                                     // short darker streaks
      let x = Math.floor(r() * 16), y = Math.floor(r() * 16);
      for (let s = 0; s < 3 + r() * 3; s++) { b.set(x, y, shade(STONE, 0.8)); x += r() < 0.6 ? 1 : 0; y += r() < 0.5 ? 1 : -1; }
    }
  } },
  cobblestone: { size: 16, draw(b, r) {
    // voronoi stones with dark mortar between them; tiling via wrapped distances
    const pts = Array.from({ length: 9 }, () => [r() * 16, r() * 16, 0.85 + r() * 0.35]);
    b.fill((x, y) => {
      let d1 = 1e9, d2 = 1e9, best = null;
      for (const p of pts) for (let ox = -16; ox <= 16; ox += 16) for (let oy = -16; oy <= 16; oy += 16) {
        const d = Math.hypot(x + 0.5 - p[0] - ox, y + 0.5 - p[1] - oy);
        if (d < d1) { d2 = d1; d1 = d; best = p; } else if (d < d2) d2 = d;
      }
      if (d2 - d1 < 1.1) b.set(x, y, jit(r, MORTAR, 0.08));
      else b.set(x, y, jit(r, shade(STONE, best[2] * (d1 < 2 ? 1.08 : 1)), 0.06));
    });
  } },
  stone_bricks: { size: 16, draw(b, r) {
    b.fill((x, y) => {
      const row = y >> 3, xo = (x + (row ? 4 : 0)) % 16;
      const edge = y % 8 === 7 || xo % 8 === 7;
      b.set(x, y, edge ? jit(r, MORTAR, 0.06) : jit(r, shade(STONE, (y % 8 === 0 || xo % 8 === 0) ? 1.1 : 1), 0.06));
    });
  } },
  dirt: { size: 16, draw(b, r) { b.fill((x, y) => b.set(x, y, jit(r, pick(r, DIRT), 0.05))); } },
  grass_top: { size: 16, draw(b, r) { b.fill((x, y) => b.set(x, y, jit(r, pick(r, GRASS), 0.07))); } },
  grass_side: { size: 16, draw(b, r) {
    const drip = Array.from({ length: 16 }, () => 2 + Math.floor(r() * 3));
    b.fill((x, y) => b.set(x, y, y < drip[x] ? jit(r, pick(r, GRASS), 0.07) : jit(r, pick(r, DIRT), 0.05)));
  } },
  lantern: { size: 16, draw(b, r) {
    // iron frame around a warm core; the core is pure light (the bloom will pick it up at stage 4)
    const iron = hex('#2a2a30'), glow = ['#ffd98a', '#ffc46a', '#ffb050'].map(hex);
    b.fill((x, y) => {
      const frame = x < 2 || x > 13 || y < 2 || y > 13 || x === 7 || x === 8;
      b.set(x, y, frame ? jit(r, iron, 0.15) : jit(r, pick(r, glow), 0.05));
    });
  } },
  lantern_cap: { size: 16, draw(b, r) { b.fill((x, y) => b.set(x, y, jit(r, hex('#33333a'), 0.15))); } },
  torch: { size: 16, draw(b, r) {
    // a stick with a flame at the top; drawn on the centre 4 columns, the rest transparent
    b.fill((x, y) => {
      if (x < 6 || x > 9) return b.set(x, y, [0, 0, 0], 0);
      if (y < 3) b.set(x, y, jit(r, hex(y < 1 ? '#fff2b0' : '#ffb840'), 0.05));
      else if (y < 5) b.set(x, y, jit(r, hex('#e07020'), 0.08));
      else b.set(x, y, jit(r, hex('#6b4a2a'), 0.1));
    });
  } },
  lit_window: { size: 16, draw(b, r) {
    const wood = hex('#4b3520'), warm = ['#ffcf7a', '#f7b35a', '#ffdc95'].map(hex);
    b.fill((x, y) => {
      const frame = x < 2 || x > 13 || y < 2 || y > 13 || x === 7 || x === 8 || y === 7 || y === 8;
      b.set(x, y, frame ? jit(r, wood, 0.1) : jit(r, pick(r, warm), 0.06));
    });
  } },
  moon: { size: 16, draw(b, r) {
    // a full square (mc1): a bright 1 px rim, inside 2×2-px cells in pale blues that clump into lighter and darker
    // patches (the "seas")
    const TONES = ['#f0f5fc', '#d2dff0', '#b3c7e3', '#93acd2', '#7891bd'].map(hex);   // wide steps: they must survive the grade
    const cells = [];
    for (let cy = 0; cy < 7; cy++) for (let cx = 0; cx < 7; cx++) {
      const sea = Math.sin(cx * 1.3 + 0.7) * Math.cos(cy * 1.1 - 0.4) + (r() - 0.5) * 0.9;   // smooth patches + noise
      cells.push(Math.max(0, Math.min(4, Math.round(1.6 + sea * 1.4))));
    }
    b.fill((x, y) => {
      if (x === 0 || y === 0 || x === 15 || y === 15) return b.set(x, y, jit(r, hex('#f6f9ff'), 0.02));
      const t = cells[Math.min(6, (y - 1) >> 1) * 7 + Math.min(6, (x - 1) >> 1)];
      b.set(x, y, jit(r, TONES[t], 0.025));
    });
  } },
  sun: { size: 16, draw(b, r) {
    // like the moon: a full square, a pale rim, 2×2-px cells — warm yellows, brighter towards the middle
    const TONES = ['#fffbe6', '#fff0b0', '#ffe486', '#ffd560', '#ffc845'].map(hex);
    b.fill((x, y) => {
      if (x === 0 || y === 0 || x === 15 || y === 15) return b.set(x, y, jit(r, hex('#fffdf0'), 0.02));
      const cx = (x - 1) >> 1, cy = (y - 1) >> 1, d = Math.max(Math.abs(cx - 3), Math.abs(cy - 3));
      b.set(x, y, jit(r, TONES[Math.max(0, Math.min(4, d - 1 + Math.round((r() - 0.5) * 1.2)))], 0.02));
    });
  } },
  // the creeper: 8 px per face like the model's proportions, mottled greens with a few pale flecks
  creeper_skin: { size: 8, draw(b, r) {
    b.fill((x, y) => b.set(x, y, r() < 0.06 ? CREEP_HI : jit(r, pick(r, CREEP), 0.05)));
  } },
  creeper_face: { size: 8, draw(b, r) {
    TEX.creeper_skin.draw(b, r);
    const D = CREEP_DARK, M = CREEP_MOUTH;
    for (const [x, y] of [[1, 2], [2, 2], [1, 3], [2, 3], [5, 2], [6, 2], [5, 3], [6, 3]]) b.set(x, y, D);        // eyes
    for (const [x, y] of [[3, 4], [4, 4], [2, 5], [3, 5], [4, 5], [5, 5], [2, 6], [3, 6], [4, 6], [5, 6], [2, 7], [5, 7]]) b.set(x, y, D);   // mouth
    b.set(3, 6, M); b.set(4, 6, M);                                  // a hint of depth inside the mouth
  } },
};

let seedOf = name => [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
export function makeCanvas(name, seed = seedOf(name)) {
  const t = TEX[name], b = buffer(t.size);
  t.draw(b, rng(seed));
  const cv = document.createElement('canvas'); cv.width = cv.height = t.size;
  cv.getContext('2d').putImageData(new ImageData(b.d, t.size, t.size), 0, 0);
  return cv;
}
const cache = new Map();
export function texture(name, seed) {
  const key = name + ':' + (seed ?? '');
  if (cache.has(key)) return cache.get(key);
  const tex = new THREE.CanvasTexture(makeCanvas(name, seed));
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  cache.set(key, tex);
  return tex;
}

/* ------------------------------ block materials ------------------------------ */
// BoxGeometry face order: +x, -x, +y, -y, +z, -z
const mat = (name, opt = {}) => new THREE.MeshLambertMaterial({ map: texture(name), ...opt });
export function blockMaterial(kind) {
  switch (kind) {
    case 'grass': { const s = mat('grass_side'); return [s, s, mat('grass_top'), mat('dirt'), s, s]; }
    case 'oak_log': { const s = mat('oak_log'), t = mat('oak_log_top'); return [s, s, t, t, s, s]; }
    case 'spruce_log': { const s = mat('spruce_log'), t = mat('oak_log_top'); return [s, s, t, t, s, s]; }
    case 'spruce_leaves': return mat('spruce_leaves', { alphaTest: 0.5, side: THREE.DoubleSide });
    case 'lit_window': return mat('lit_window', { emissive: 0xffffff, emissiveMap: texture('lit_window') });
    default: return mat(kind);
  }
}
export const BLOCKS = ['oak_planks', 'oak_log', 'spruce_log', 'spruce_leaves', 'stone', 'cobblestone', 'stone_bricks', 'dirt', 'grass', 'lit_window'];

/* ------------------------------ models ------------------------------ */
const PX = 1 / 16;
function box(w, h, d, mats) { return new THREE.Mesh(new THREE.BoxGeometry(w * PX, h * PX, d * PX), mats); }

// the creeper: legs 4×6×4, body 8×12×4, head 8×8×8 (px). Joints you can turn:
//   root (whole thing: walk, turn), body (lean, pivot at the hips), head (tilt / look, pivot at the neck), legs[4] (hips).
// Each face gets its own skin seed, so no two faces repeat. Materials are shared per creeper so a flash is one uniform.
export function creeper(seed = 1) {
  let s = seed * 101;
  const skin = new THREE.MeshLambertMaterial({ map: null });            // template; each face clones the colours below
  const faceMat = () => { const m = skin.clone(); m.map = texture('creeper_skin', s++); return m; };
  const mats = [];
  const sixFaces = (front) => { const a = [faceMat(), faceMat(), faceMat(), faceMat(), front || faceMat(), faceMat()]; mats.push(...a); return a; };
  const root = new THREE.Group(); root.name = 'creeper';
  const legs = [];
  for (const [lx, lz] of [[-2, 4], [2, 4], [-2, -4], [2, -4]]) {     // front pair at +z (the face looks +z)
    const hip = new THREE.Group(); hip.position.set(lx * PX, 6 * PX, lz * PX);
    const m = box(4, 6, 4, sixFaces()); m.position.y = -3 * PX; hip.add(m);
    root.add(hip); legs.push(hip);
  }
  const body = new THREE.Group(); body.position.y = 6 * PX; root.add(body);
  const torso = box(8, 12, 4, sixFaces()); torso.position.y = 6 * PX; body.add(torso);
  const head = new THREE.Group(); head.position.y = 12 * PX; body.add(head);
  const faceM = skin.clone(); faceM.map = texture('creeper_face', seed * 7 + 3);
  const skull = box(8, 8, 8, sixFaces(faceM)); skull.position.y = 4 * PX; head.add(skull);
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  root.userData = { body, head, legs, mats, height: 26 * PX };
  return root;
}

// a hanging lantern on a table: a 6×7×6 px body, a cap and a little handle
export function lantern() {
  const g = new THREE.Group(); g.name = 'lantern';
  const glow = new THREE.MeshLambertMaterial({ map: texture('lantern'), emissive: 0xffffff, emissiveMap: texture('lantern') });
  const cap = new THREE.MeshLambertMaterial({ map: texture('lantern_cap') });
  const bodyM = box(6, 7, 6, glow); bodyM.position.y = 3.5 * PX; g.add(bodyM);
  const capM = box(4, 2, 4, cap); capM.position.y = 8 * PX; g.add(capM);
  const handle = box(1, 2, 1, cap); handle.position.y = 10 * PX; g.add(handle);
  g.userData = { glow };
  return g;
}

// a spruce: trunk of `h` logs, needles in tiers that widen and step back in going down (a top spike, then radius
// 1,1,2,1,2,3,2,3…), corners off the wide rings. Returns block lists (the scene puts them in instanced meshes).
export function spruce(h = 7, r = rng(1)) {
  const logs = [], leaves = [];
  for (let y = 0; y < h; y++) logs.push([0, y, 0]);
  const tiers = [1, 1, 2, 1, 2, 3, 2, 3, 2, 3];
  leaves.push([0, h, 0], [0, h + 1, 0]);
  const bottom = Math.max(2, Math.round(h * 0.3 + r()));
  for (let y = h - 1, i = 0; y >= bottom; y--, i++) {
    const rr = tiers[Math.min(i, tiers.length - 1)];
    for (let x = -rr; x <= rr; x++) for (let z = -rr; z <= rr; z++) {
      if (x === 0 && z === 0) continue;
      if (rr > 1 && Math.abs(x) === rr && Math.abs(z) === rr) continue;
      if (rr > 2 && Math.abs(x) + Math.abs(z) > rr + 1) continue;
      leaves.push([x, y, z]);
    }
  }
  return { logs, leaves };
}

// a torch: one thin post with a flame (pure light at the top)
export function torch() {
  const m = new THREE.MeshLambertMaterial({ map: texture('torch'), emissive: 0xffffff, emissiveMap: texture('torch'), alphaTest: 0.5 });
  const t = box(2, 10, 2, m); t.position.y = 5 * PX;
  const g = new THREE.Group(); g.add(t); g.name = 'torch'; return g;
}

// a small hut for the far shore: w×d footprint, cobble base row, plank walls, log corners, one lit window, a stepped
// plank roof. Returns block lists by kind: { cobblestone:[…], oak_planks:[…], oak_log:[…], lit_window:[…] }
export function hut(w = 5, d = 4, wallH = 3) {
  const out = { cobblestone: [], oak_planks: [], oak_log: [], lit_window: [] };
  for (let y = 0; y < wallH; y++) for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) {
    const edgeX = x === 0 || x === w - 1, edgeZ = z === 0 || z === d - 1;
    if (!edgeX && !edgeZ) continue;
    const kind = edgeX && edgeZ ? 'oak_log' : y === 0 ? 'cobblestone' : (y === 1 && z === 0 && x === Math.floor(w / 2) ? 'lit_window' : 'oak_planks');
    out[kind].push([x, y, z]);
  }
  for (let z = -1; z <= d; z++) {                                  // a gable roof, one step per block inwards
    const top = wallH + Math.min(z + 1, d - z);
    for (let x = -1; x <= w; x++) out.oak_planks.push([x, top, z]);
    if (z >= 0 && z < d) for (let y = wallH; y < top; y++) out.oak_planks.push([0, y, z], [w - 1, y, z]);   // gable ends
  }
  return out;
}
