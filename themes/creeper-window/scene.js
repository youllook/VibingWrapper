/* =====================================================================================
 * 麥塊世界 (creeper-window) — scene layout, 2026-10-29
 *
 * Builds the world out of blocks (1 unit = 1 block, y up, the camera looks roughly +z):
 *  - inside: a plank cabin, the window wall at z = 3 with a big window split by a log mullion, a table and lantern
 *    in the near left corner, a small window in the left wall.
 *  - outside: a stone porch the creeper stands on (top at y = 1), a lake to the right, stepped shores with spruces,
 *    a few huts with lit windows on the far shore, a far ridge in 4× blocks, flat block clouds, a square moon.
 * buildScene(matFor) takes a material per block kind (stage 2: flat colours; stage 3: textures) and returns the
 * groups plus the points later stages need (lantern, creeper spots, window panes, water level).
 * ===================================================================================== */
import * as THREE from 'three';
import { rng, spruce, hut, creeper, lantern, torch } from './assets.js';

export const mirror = ([x, y, z]) => [-x, y, z];
export const WATER_Y = 0.55;          // nearly up to the porch, like mc1 (the lake shows over the ledge)
export const LAYOUT = {
  wallZ: 3,                            // the window wall occupies z 3..4
  // window openings [x0, x1, y0, y1] in blocks: the left one frames the creeper, the right one is tall and runs past
  // the edge of the frame (the lake view). Between them a thin log mullion (not on the block grid).
  // The camera, the frame, the creeper, the table and the lantern are fitted to mc1 as seen from the camera.
  panes: [[-2, 1, 1, 5], [1, 40, 1, 12], [-5, -4, 2, 5]],   // + a small window far left (mc1's 8–12 %)
  wallDepth: 0.45,                     // the window wall is thinner than a block: mc1's frames are slim
  mullion: [1, 1.42],                  // x from..to
  roof: 7, wallTop: 12, x0: -7, x1: 41, // cabin extent; the window wall runs above the ceiling so the right pane opens to sky
  creeper: [-0.85, 1, 4.3], creeperScale: 1.82,   // feet on the porch right behind the left pane (toes 0.15 off the glass); a big one
  lantern: [0.9, 1.84, 0.36],          // back-projected from mc1's line drawing (docs/麥塊世界/codex-fg)
  cam: { pos: [3.043, 2.363, -0.72], look: [-0.8, 2.32, 8.51], fov: 60.1 },   // fitted to mc1 (02-場景擺放.md)
  moon: [-13.3, 33.1, 93],             // in the right pane at mc1's (61 %, 21 %), 100 from the camera
};

/* ------------------------------ rounded box (clouds) ------------------------------ */
// a w×h×d box whose edges and corners are rounded with radius r: a 4×4×4-segment box whose inner vertex rings are moved
// to where the round starts (H - r), then every vertex pushed onto the rounded surface (a chamfer, rounded at the corners)
export function roundedBox(w, h, d, r) {
  const g = new THREE.BoxGeometry(1, 1, 1, 4, 4, 4), p = g.attributes.position, nrm = g.attributes.normal;
  const half = [w / 2, h / 2, d / 2], v = new THREE.Vector3(), inner = new THREE.Vector3(), dir = new THREE.Vector3();
  const ring = (c, H) => { const a = Math.abs(c), s = Math.sign(c); return s * (a > 0.49 ? H : a > 0.3 ? H - r / 2 : a > 0.1 ? H - r : a * 2 * (H - r) / 0.333); };
  for (let i = 0; i < p.count; i++) {
    v.set(ring(p.getX(i), half[0]), ring(p.getY(i), half[1]), ring(p.getZ(i), half[2]));
    inner.set(THREE.MathUtils.clamp(v.x, -half[0] + r, half[0] - r), THREE.MathUtils.clamp(v.y, -half[1] + r, half[1] - r),
              THREE.MathUtils.clamp(v.z, -half[2] + r, half[2] - r));
    dir.subVectors(v, inner);
    if (dir.lengthSq() > 1e-10) { dir.normalize(); v.copy(inner).addScaledVector(dir, r); nrm.setXYZ(i, dir.x, dir.y, dir.z); }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

/* ------------------------------ texture helpers (stage 3) ------------------------------ */
// A box of w×h×d blocks whose UVs follow the world size: one 16 px texture per block, so thin or long boxes get the
// texture repeated (RepeatWrapping) instead of squashed. Face order as BoxGeometry: +x, -x, +y, -y, +z, -z.
export function sizedBox(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const su = [d, d, w, w, w, w], sv = [h, h, d, d, h, h];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * su[f], uv.getY(i) * sv[f]); }
  return g;
}
// per-block brightness / hue drift so big areas of one texture do not read as a stamp. Deterministic from the position.
const hash3 = (x, y, z) => { let h = (Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const TINT = {                                                   // kind → [base rgb, brightness spread, hue spread]
  oak_planks: [[1, 0.93, 0.85], 0.16, 0.05], oak_log: [[0.8, 0.72, 0.66], 0.22, 0.05], spruce_log: [[0.85, 0.85, 0.9], 0.2, 0.03],
  spruce_leaves: [[0.78, 0.9, 0.95], 0.25, 0.04], stone: [[0.7, 0.76, 0.86], 0.2, 0.02], cobblestone: [[0.62, 0.68, 0.78], 0.22, 0.02],
  stone_bricks: [[0.45, 0.52, 0.66], 0.35, 0.02], dirt: [[0.7, 0.72, 0.8], 0.2, 0.03], grass: [[0.72, 0.84, 0.9], 0.22, 0.04],
  lit_window: [[1, 1, 1], 0.0, 0],
};
const _c = new THREE.Color();
function tintColor(kind, x, y, z, inside) {
  const [base, spread, hue] = TINT[kind] || [[1, 1, 1], 0, 0];
  const a = hash3(x, y, z), b = hash3(x + 91, y - 37, z + 5), k = 1 + (a * 2 - 1) * spread;
  let [r, g, bl] = base;
  if (inside && kind === 'oak_planks' && y === 0) { r *= 0.62; g *= 0.6; bl *= 0.58; }          // the sill row: dark, lacquered by rain
  else if (inside && kind === 'oak_planks') { const old = hash3(x >> 1, y >> 1, 3) < 0.35 ? 0.78 : 1; r *= old; g *= old; bl *= old; }   // patches of older, darker boards
  if (inside && kind === 'oak_log' && hash3(x, 7, z) < 0.4) { r *= 0.72; g *= 0.72; bl *= 0.72; }          // some posts are older, darker
  if (kind === 'spruce_leaves' && !inside) { r *= 0.75; g *= 0.75; bl *= 0.75; }               // needles are darker than they paint
  return _c.setRGB(r * k * (1 + (b - 0.5) * hue), g * k, bl * k * (1 - (b - 0.5) * hue));
}

/* ------------------------------ noise ------------------------------ */
const r0 = rng(20261029);
const PERM = Array.from({ length: 512 }, () => r0());
const h2 = (x, z) => PERM[((x * 73856093) ^ (z * 19349663)) >>> 0 & 511];
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = h2(xi, zi), b = h2(xi + 1, zi), c = h2(xi, zi + 1), d = h2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, z) => vnoise(x, z) * 0.6 + vnoise(x * 2.1, z * 2.1) * 0.3 + vnoise(x * 4.3, z * 4.3) * 0.1;

/* ------------------------------ terrain ------------------------------ */
// how much a spot is lake (> 0 = water): a big oval to the right and an arm reaching in towards the porch
function lakeness(x, z) {
  const n = (fbm(x * 0.09, z * 0.09) - 0.5) * 0.5;
  const big = 1 - ((x - 15) / 22) ** 2 - ((z - 30) / 17) ** 2;
  const arm = 1 - ((x - 17) / 14) ** 2 - ((z - 10.5) / 6) ** 2;
  return Math.max(big, arm) + n;
}
export function groundH(x, z) {
  const L = lakeness(x, z);
  if (L > 0.12) return -3;
  if (L > 0) return -1;                                          // shallow edge
  let h = -1 + Math.floor(fbm(x * 0.07 + 3, z * 0.07) * 3.2 + Math.min(1.5, -L * 2));
  if (z > 44) h += Math.floor((z - 44) * 0.35 * fbm(x * 0.03, 9));  // land rises behind the lake
  if (x > 30) h += Math.floor((x - 30) * 0.3);                     // terraces on the right
  if (x < -6) h += Math.floor((-6 - x) * 0.25);                    // and on the left
  if (z < 12) h = Math.min(h, 0);                                  // the ground falls away from the porch
  else h = Math.max(h, 1);                                         // land further out stays above the water
  return h;
}

/* ------------------------------ build ------------------------------ */
export function buildScene(matFor) {
  const blocks = {};                                             // kind → [[x,y,z,scale?]]
  const put = (kind, x, y, z) => (blocks[kind] ||= []).push([x, y, z]);

  // ---- cabin ----
  const L = LAYOUT, W = L.wallZ;
  for (let x = L.x0; x <= L.x1; x++) for (let z = -4; z < W; z++) { put('oak_planks', x, -1, z); put('oak_planks', x, L.roof, z); }   // floor, ceiling
  const inPane = (x, y) => L.panes.some(([a, b, c, d]) => x >= a && x < b && y >= c && y < d);
  const nextTo = (x, y) => L.panes.some(([a, b, c, d]) => y >= c - 1 && y <= d && x >= a - 1 && x <= b);
  for (let x = L.x0; x <= L.x1; x++) for (let y = 0; y < L.wallTop; y++) {
    if (inPane(x, y)) continue;
    put(y === 0 && !(x === L.x0) ? 'oak_planks' : nextTo(x, y) || x === L.x0 ? 'oak_log' : 'oak_planks', x, y, W);      // logs frame every opening
  }
  for (let z = -4; z < W; z++) for (let y = 0; y < L.roof; y++) {     // left wall with a small window
    if (z >= -1 && z < 1 && y >= 2 && y < 4) continue;
    put(z === W - 1 || z === -2 || y === 0 ? 'oak_log' : 'oak_planks', L.x0, y, z);
  }
  for (let x = L.x0; x <= L.x1; x++) put('oak_log', x, L.roof - 1, -2);   // a ceiling beam

  // ---- porch: a deep one behind the left pane (the creeper's), a one-block ledge along the rest of the wall ----
  // (the deck runs on out under the right pane too: the crowd stands there)
  const deckZ = x => x <= 2 ? W + 3 : x <= 10 ? W + 2 : W + 1;     // porch 3 deep, deck under the right pane 2, then a ledge
  for (let x = -6; x <= 40; x++) for (let z = W + 1; z <= deckZ(x); z++) put('stone_bricks', x, 0, z);
  for (let x = -6; x <= 40; x++) for (let y = -2; y < 0; y++) put('cobblestone', x, y, deckZ(x));

  // ---- terrain ----
  const X0 = -44, X1 = 70, Z0 = 6, Z1 = 96;
  const H = (x, z) => groundH(x, z);
  const trees = [], tr = rng(7);
  for (let x = X0; x <= X1; x++) for (let z = Z0; z <= Z1; z++) {
    if (x >= -6 && x <= 40 && z <= (x <= 2 ? W + 3 : x <= 10 ? W + 2 : W + 1)) continue;   // under the porch / deck
    const h = H(x, z);
    const lo = Math.min(h, H(x + 1, z), H(x - 1, z), H(x, z + 1), H(x, z - 1));
    for (let y = h - 1; y >= Math.max(lo - 1, h - 6, -4); y--) {
      const kind = y === h - 1 ? (h <= -1 ? 'dirt' : 'grass') : (y < h - 3 ? 'stone' : 'dirt');
      put(h <= -2 && y === h - 1 ? 'stone' : kind, x, y, z);
    }
    // trees: none on the near shore so the view stays open, thicker far away
    const near = z < 18 && x > -9, dens = near ? 0 : (z > 40 ? 0.06 : 0.035);
    if (h >= 0 && tr() < dens) trees.push([x, h, z]);
  }
  for (const [x, h, z] of trees) {
    const s = spruce(5 + Math.floor(tr() * 6), tr);
    for (const [a, b, c] of s.logs) put('spruce_log', x + a, h + b, z + c);
    for (const [a, b, c] of s.leaves) put('spruce_leaves', x + a, h + b, z + c);
  }

  // ---- huts on the far shore, with torches ----
  const torches = [];
  for (const [x, z, w, d] of [[1, 41, 5, 4], [21, 47, 6, 5], [33, 26, 5, 4], [-10, 33, 4, 4]]) {
    const y = Math.max(H(x, z), H(x + w - 1, z + d - 1), 0);
    for (let a = 0; a < w; a++) for (let c = 0; c < d; c++) for (let b = H(x + a, z + c); b < y; b++) put('cobblestone', x + a, b, z + c);
    const hb = hut(w, d, 3);
    for (const k in hb) for (const [a, b, c] of hb[k]) put(k, x + a, y + b, z + c);
    torches.push([x - 0.5, y, z - 1], [x + w + 0.5, y, z - 1]);
  }

  // ---- far ridge, 4× blocks ----
  const ridge = [];
  for (let x = -160; x <= 200; x += 4) for (let z = 104; z <= 140; z += 4) {
    const h = Math.floor((8 + fbm(x * 0.012, z * 0.02) * 26 + (z - 104) * 0.25) / 4) * 4;
    for (let y = h - 4; y >= h - 8; y -= 4) ridge.push([x, y, z, y === h - 4 ? 'grass' : 'stone']);
  }

  // ---- clouds (mc1): loose bars of rounded blocks, one block tall, 2–6 long, sometimes a shorter bar stepped on top;
  // three layers at different heights and block sizes, each a tile P wide (bars wrap at the tile edge, so the tile
  // repeats seamlessly while it drifts). Blocks are a little smaller than their cell: the seams between them show. ----
  const CLOUD_LAYERS = [
    { y: 28, s: 5, n: 34, speed: 0.9, seed: 11 },
    { y: 38, s: 7, n: 26, speed: 0.55, seed: 37 },
    { y: 52, s: 9, n: 20, speed: 0.3, seed: 73 },
  ];
  const P = 288;                                                    // tile width (blocks), a multiple of every s
  // the z at which the sight line to the moon passes height y (the clouds drift along x, so a z band is the lane)
  const mc = L.cam.pos, md = L.moon.map((v, i) => v - mc[i]), mh = Math.hypot(md[0], md[2]);
  const moonLaneZ = y => mc[2] + (y - mc[1]) / md[1] * mh * (md[2] / mh);
  const cloudLayers = CLOUD_LAYERS.map(L => {
    const r = rng(L.seed), cells = P / L.s, pts = [];
    for (let b = 0; b < L.n; b++) {
      const cx = Math.floor(r() * cells), cz = Math.floor(70 / L.s + r() * (260 / L.s));   // mid-sky: from 70 out
      // where this layer crosses the line to the moon, keep it thin: bars drift across the moon now and then, not over it
      if (Math.abs(cz * L.s - moonLaneZ(L.y)) < 14 && r() < 0.8) continue;
      const len = 3 + Math.floor(r() * 5), dep = r() < 0.6 ? 1 : 2;
      for (let i = 0; i < len; i++) for (let k = 0; k < dep; k++) pts.push([((cx + i) % cells) * L.s, L.y, (cz + k) * L.s, 0]);
      if (len > 3 && r() < 0.45) {                                   // a shorter bar stepped on top
        const o = 1 + Math.floor(r() * (len - 3));
        for (let i = 0; i < len - 2; i++) pts.push([((cx + o + i - 1) % cells) * L.s, L.y + L.s * 0.6, cz * L.s, 1]);
      }
    }
    return { ...L, pts };
  });

  // ---- meshes ----
  // the layout above is written with +x = screen right; looking down +z that is world -x, so the root is mirrored
  // (three flips the face winding for a negative scale). Use mirror() for any point handed out.
  const root = new THREE.Group(), interior = new THREE.Group(), exterior = new THREE.Group();
  root.scale.x = -1;
  root.add(interior, exterior);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const M4 = new THREE.Matrix4();
  const isInside = (x, y, z) => z < W || (z === W && y >= -1 && x >= L.x0 && x <= L.x1);   // the cabin, wall included
  const wallGeo = sizedBox(1, 1, L.wallDepth);                   // the thin window wall keeps square texels on every face
  const addBlocks = (kind, pts, geo, group, name, place) => {
    if (!pts.length) return;
    const m = new THREE.InstancedMesh(geo, matFor(kind), pts.length);
    pts.forEach(([x, y, z], i) => { m.setMatrixAt(i, place(x, y, z)); m.setColorAt(i, tintColor(kind, x, y, z, group === interior)); });
    m.castShadow = m.receiveShadow = true; m.name = name; group.add(m);
  };
  for (const kind in blocks) {
    const list = blocks[kind];
    const inn = list.filter(p => isInside(...p)), out = list.filter(p => !isInside(...p));
    addBlocks(kind, inn.filter(p => p[2] === W), wallGeo, interior, kind + ':wall', (x, y) => M4.makeTranslation(x + 0.5, y + 0.5, W + L.wallDepth / 2));
    addBlocks(kind, inn.filter(p => p[2] !== W), cube, interior, kind + ':in', (x, y, z) => M4.makeTranslation(x + 0.5, y + 0.5, z + 0.5));
    addBlocks(kind, out, cube, exterior, kind + ':out', (x, y, z) => M4.makeTranslation(x + 0.5, y + 0.5, z + 0.5));
  }
  for (const kind of ['grass', 'stone']) {
    const sub = ridge.filter(p => p[3] === kind);
    const m = new THREE.InstancedMesh(cube, matFor(kind), sub.length);   // 4× blocks keep one texture per block: chunky far hills
    sub.forEach(([x, y, z], i) => { m.setMatrixAt(i, M4.makeScale(4, 4, 4).setPosition(x + 2, y + 2, z + 2));
      const k = 0.75 + hash3(x, y, z) * 0.2; m.setColorAt(i, _c.setRGB(k * 0.85, k * 0.95, k * 1.1)); });
    m.name = 'ridge:' + kind; exterior.add(m);
  }
  const clouds = cloudLayers.map((L, li) => {
    const n = L.pts.length * 2;                                     // the tile twice, side by side
    const geo = roundedBox(L.s * 0.94, L.s * 0.55, L.s * 0.94, L.s * 0.07);   // smaller than the cell: open seams
    const m = new THREE.InstancedMesh(geo, matFor('cloud'), n);
    let i = 0;
    for (const off of [-P, 0]) for (const [x, y, z, k] of L.pts) {
      m.setMatrixAt(i, M4.makeTranslation(x + off - P / 2, y, z));
      const v = (k ? 0.95 : 0.8) + (hash3(x, li, z) - 0.5) * 0.18;   // stepped-on bars a little lighter, every block its own shade
      m.setColorAt(i++, _c.setRGB(v * 0.92, v * 0.96, v * 1.08));
    }
    m.name = 'clouds' + li; m.frustumCulled = false; exterior.add(m);
    return { mesh: m, speed: L.speed, period: P };
  });

  // the table: a plank top on four log legs (scaled boxes, so not on the block grid)
  const sbox = (kind, w, h, d, tint) => {
    let mt = matFor(kind);
    if (tint) { const t = new THREE.Color(...tint); mt = Array.isArray(mt) ? mt.map(x => Object.assign(x.clone(), { color: t })) : Object.assign(mt.clone(), { color: t }); }
    return new THREE.Mesh(sizedBox(w, h, d), mt);
  };   // texture follows the world size
  const table = new THREE.Group(); table.name = 'table';
  const top = sbox('oak_planks', 2.6, 0.14, 1.65, [0.82, 0.68, 0.55]);  top.position.set(0.7, 1.77, -0.275);
  table.add(top);
  for (const [x, z] of [[-0.5, -1.0], [1.9, -1.0], [-0.5, 0.45], [1.9, 0.45]]) {
    const leg = sbox('oak_log', 0.16, 1.7, 0.16, [0.8, 0.72, 0.66]);  leg.position.set(x, 0.85, z); table.add(leg);
  }
  // a stool by the window (mc1's bottom edge, 31–39 %)
  const seat = sbox('oak_planks', 0.6, 0.12, 0.6, [0.7, 0.58, 0.46]);  seat.position.set(1.25, 0.94, 1.6); table.add(seat);
  for (const [x, z] of [[1.0, 1.35], [1.5, 1.35], [1.0, 1.85], [1.5, 1.85]]) {
    const leg = sbox('oak_log', 0.1, 0.88, 0.1, [0.8, 0.72, 0.66]);  leg.position.set(x, 0.44, z); table.add(leg);
  }
  table.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  interior.add(table);
  const mull = sbox('oak_log', L.mullion[1] - L.mullion[0], L.wallTop - 1, L.wallDepth, [0.8, 0.72, 0.66]);   // from y = 1 up: below it the wall's own planks
  mull.position.set((L.mullion[0] + L.mullion[1]) / 2, (L.wallTop + 1) / 2, W + L.wallDepth / 2);
  mull.castShadow = mull.receiveShadow = true; mull.name = 'mullion'; interior.add(mull);
  // between the thin wall and the porch: a stone sill under every opening, so looking down there is no gap
  const sillOut = sbox('stone_bricks', L.x1 - L.x0, 1, 1 - L.wallDepth, [0.3, 0.36, 0.46]);   // wet, dark
   sillOut.position.set((L.x0 + L.x1) / 2, 0.5, W + (1 + L.wallDepth) / 2);
  sillOut.receiveShadow = true; exterior.add(sillOut);
  const bar = sbox('oak_log', 1, 0.14, L.wallDepth, [0.8, 0.72, 0.66]);   // the small window's cross bar
  bar.position.set(-4.5, 3.4, W + L.wallDepth / 2); interior.add(bar);
  const lamp = lantern(); lamp.position.set(...L.lantern); lamp.scale.setScalar(0.85); interior.add(lamp);

  const torchMeshes = torches.map(p => { const t = torch(); t.position.set(...p); t.scale.setScalar(1.4); exterior.add(t); return t; });

  // water: one flat sheet over the whole lake area (stage 4 gives it reflections)
  const water = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0), matFor('water'));
  water.rotation.x = -Math.PI / 2; water.position.set((X0 + X1) / 2, WATER_Y, (Z0 + Z1) / 2); water.name = 'water';
  exterior.add(water);

  // glass panes (drawn later with rain drops; stage 2 only shows where they are)
  const glass = new THREE.Group(); glass.name = 'glass'; glass.scale.x = -1;
  for (const [a, b, c, d] of L.panes) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(b - a, d - c), matFor('glass'));
    g.position.set((a + b) / 2, (c + d) / 2, W + L.wallDepth / 2); g.rotation.y = Math.PI; glass.add(g);
  }

  const visitor = creeper(1); visitor.position.set(...L.creeper); visitor.rotation.y = Math.PI; visitor.scale.setScalar(L.creeperScale);   // faces the window (-z)
  exterior.add(visitor);

  const count = Object.values(blocks).reduce((s, l) => s + l.length, 0) + ridge.length + cloudLayers.reduce((s, L) => s + L.pts.length * 2, 0);
  return { root, interior, exterior, glass, water, clouds, creeper: visitor, lantern: lamp, torches: torchMeshes, table, count };
}
