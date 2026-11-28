// 夢境之門 · 步道石板與門板的材質（主題 main.js 與審材質頁 _lookdev.html 共用）
// 2026-11-28 審材質後重做：石板與門板都補上法線、粗糙度（見 docs/dream-doors/08-審材質.md）
import * as THREE from 'three';

export const TILE = 3.2;                                             // 石板貼圖一張＝3.2 m 見方（4 排，每排石板長短不一）

// ── 小工具 ──
function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }
function valueNoise(seed, cells) {                                   // 可左右上下無縫的值雜訊，回傳 f(u, v)，u v 在 0–1
  const r = rng(seed), g = new Float32Array(cells * cells).map(() => r());
  return (u, v) => {
    const x = u * cells, y = v * cells, xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const at = (i, j) => g[((j % cells + cells) % cells) * cells + ((i % cells + cells) % cells)];
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return (at(xi, yi) * (1 - sx) + at(xi + 1, yi) * sx) * (1 - sy) + (at(xi, yi + 1) * (1 - sx) + at(xi + 1, yi + 1) * sx) * sy;
  };
}
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
function blur(src, w, h, wrap) {                                     // 3×3 方框模糊
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      let xx = x + dx, yy = y + dy;
      if (wrap) { xx = (xx + w) % w; yy = (yy + h) % h; } else if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      s += src[yy * w + xx]; n++;
    }
    out[y * w + x] = s / n;
  }
  return out;
}
// 高度場 → 法線貼圖（OpenGL 慣例：綠色＝往上）。canvas 的 y 往下，所以上方的高度差要反過來
function normalCanvas(H, w, h, strength, wrap) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'), im = g.createImageData(w, h), d = im.data;
  const at = (x, y) => { if (wrap) { x = (x + w) % w; y = (y + h) % h; } else { x = Math.min(w - 1, Math.max(0, x)); y = Math.min(h - 1, Math.max(0, y)); } return H[y * w + x]; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = -(at(x + 1, y) - at(x - 1, y)) * 0.5 * strength, ny = -(at(x, y - 1) - at(x, y + 1)) * 0.5 * strength, l = Math.hypot(nx, ny, 1), k = (y * w + x) * 4;
    d[k] = (nx / l * 0.5 + 0.5) * 255; d[k + 1] = (ny / l * 0.5 + 0.5) * 255; d[k + 2] = (1 / l * 0.5 + 0.5) * 255; d[k + 3] = 255;
  }
  g.putImageData(im, 0, 0); return c;
}
function grayCanvas(R, w, h) {                                       // 粗糙度：three.js 讀綠色通道
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'), im = g.createImageData(w, h), d = im.data;
  for (let i = 0; i < w * h; i++) { const v = clamp01(R[i]) * 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  g.putImageData(im, 0, 0); return c;
}
function tex(c, srgb, wrap) {
  const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

// ── 步道石板：4 排、每排石板長短不一（0.45–0.85 m）、倒角邊、表面起伏、坑洞、石縫積灰 ──
// 回傳 { map, normalMap, roughnessMap }，三張同一個排列、上下左右無縫
export function stoneMaps() {
  const S = 1024, ROWS = 4, rh = S / ROWS, G = 3, BEV = 9, r = rng(11);
  const A = new Float32Array(S * S * 3), H = new Float32Array(S * S), R = new Float32Array(S * S);
  const big = valueNoise(5, 5), mid = valueNoise(7, 22), fine = valueNoise(9, 160);
  // 石縫：深一點、霧面
  for (let i = 0; i < S * S; i++) { A[i * 3] = 0.62; A[i * 3 + 1] = 0.57; A[i * 3 + 2] = 0.52; H[i] = 0; R[i] = 0.95; }
  for (let j = 0; j < ROWS; j++) {
    const cuts = []; let x = Math.floor(r() * S), left = S;
    while (left > 0) { let w = Math.round((0.56 + r() * 0.5) * rh); if (left - w < 0.5 * rh) w = left; cuts.push([x, w]); x += w; left -= w; }
    const y0 = j * rh, y1 = y0 + rh;
    for (const [x0, w] of cuts) {
      const tone = 0.76 + r() * 0.13, warm = 0.035 + (r() - 0.5) * 0.05, rb = 0.5 + r() * 0.2, tx = (r() - 0.5) * 0.25, ty = (r() - 0.5) * 0.25;
      for (let py = y0; py < y1; py++) for (let k = 0; k < w; k++) {
        const px = (x0 + k) % S, i = py * S + px;
        const dEdge = Math.min(k, w - 1 - k, py - y0, y1 - 1 - py) - G;
        if (dEdge < 0) continue;                                     // 石縫
        const b = Math.min(1, dEdge / BEV), bev = b * b * (3 - 2 * b);
        const u = px / S, v = py / S, n1 = mid(u, v), n2 = fine(u, v);
        // 高度：倒角 × (平面＋微微傾斜＋起伏)
        H[i] = bev * (0.8 + 0.12 * n1 + 0.04 * n2 + tx * (k / w - 0.5) + ty * ((py - y0) / rh - 0.5));
        const shade = (0.9 + 0.1 * bev) * (0.95 + 0.1 * n1) * (0.97 + 0.06 * n2) * (0.94 + 0.12 * big(u, v));
        A[i * 3] = tone * shade * (1 + warm); A[i * 3 + 1] = tone * shade; A[i * 3 + 2] = tone * shade * (1 - warm * 1.4) * 0.97;
        R[i] = rb + (1 - bev) * 0.25 + (n2 - 0.5) * 0.08;
      }
    }
  }
  // 坑洞：小凹點，較暗、較粗
  for (let k = 0; k < 900; k++) {
    const cx = r() * S, cy = r() * S, rad = 1 + r() * 2.6;
    for (let y = Math.floor(cy - rad); y <= cy + rad; y++) for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
      const dd = Math.hypot(x - cx, y - cy) / rad; if (dd > 1) continue;
      const i = ((y + S) % S) * S + ((x + S) % S); if (H[i] <= 0.01) continue;
      const f = 1 - dd * dd; H[i] -= 0.22 * f; R[i] = Math.max(R[i], 0.85); for (let c = 0; c < 3; c++) A[i * 3 + c] *= 1 - 0.18 * f;
    }
  }
  // 大片淡污漬（影響顏色和粗糙度）
  for (let k = 0; k < 45; k++) {
    const cx = r() * S, cy = r() * S, rx = 30 + r() * 90, ry = 20 + r() * 60, a = 0.04 + r() * 0.05;
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const dd = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2; if (dd > 1) continue;
      const i = ((y + S) % S) * S + ((x + S) % S), f = a * (1 - dd);
      for (let c = 0; c < 3; c++) A[i * 3 + c] *= 1 - f; R[i] += f * 1.2;
    }
  }
  // 石縫旁的積灰（AO）：高度低的地方往周圍暗一點
  const Hb = blur(blur(H, S, S, true), S, S, true);
  const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), im = g.createImageData(S, S), d = im.data;
  for (let i = 0; i < S * S; i++) {
    const ao = 0.8 + 0.2 * clamp01(Hb[i] / 0.7);
    for (let ch = 0; ch < 3; ch++) d[i * 4 + ch] = clamp01(A[i * 3 + ch] * ao) * 255;
    d[i * 4 + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  return { map: tex(c, true, true), normalMap: tex(normalCanvas(blur(H, S, S, true), S, S, 9, true), false, true), roughnessMap: tex(grayCanvas(R, S, S), false, true) };
}
export function worldUV(geo) {                                       // 網格放原點，頂點座標＝世界座標
  const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ny = Math.abs(n.getY(i)), nx = Math.abs(n.getX(i));
    if (ny > 0.5) { uv[i * 2] = x / TILE; uv[i * 2 + 1] = -z / TILE; } else if (nx > 0.5) { uv[i * 2] = -z / TILE; uv[i * 2 + 1] = y / TILE; } else { uv[i * 2] = x / TILE; uv[i * 2 + 1] = y / TILE; }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return geo;
}
export function walkMaterial() {                                     // 步道頂面（粗糙度、法線都走貼圖）
  const m = stoneMaps();
  return { mat: new THREE.MeshStandardMaterial({ map: m.map, normalMap: m.normalMap, roughnessMap: m.roughnessMap, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(1, 1) }), maps: [m.map, m.normalMap, m.roughnessMap] };
}

// ── 門板：Codex 圖當顏色；載入後從圖算出法線（亮度當高度）和粗糙度，各款參數不同 ──
export const LEAVES = ['shoji', 'plank', 'vault', 'stained', 'painted', 'red'];
const KIND = {
  shoji:   { rough: 0.78, k: 0.2,  metal: 0,    ns: 1.0 },          // 格子窗：木格＋紙
  plank:   { rough: 0.72, k: 0.35, metal: 0,    ns: 2.2 },          // 舊木板：板縫、木紋
  vault:   { rough: 0.45, k: 0.35, metal: 0.35, ns: 2.4 },          // 保險庫鐵門：鉚釘、轉盤
  stained: { glass: true, metal: 0, ns: 1.2 },                       // 彩繪玻璃：玻璃亮滑、鉛條粗
  painted: { rough: 0.6,  k: 0.25, metal: 0,    ns: 1.5 },          // 彩繪木門
  red:     { rough: 0.48, k: 0.3,  metal: 0,    ns: 1.6 },          // 紅漆門：漆面較亮
};
function deriveLeafMaps(img, q) {
  const w = img.width, h = img.height, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, w, h).data;
  const L = new Float32Array(w * h), R = new Float32Array(w * h), rn = rng(3);
  for (let i = 0; i < w * h; i++) {
    const r = d[i * 4] / 255, gg = d[i * 4 + 1] / 255, b = d[i * 4 + 2] / 255, lum = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
    L[i] = lum;
    if (q.glass) R[i] = lum > 0.3 ? 0.14 + rn() * 0.05 : 0.72;         // 玻璃片很滑，鉛條、框粗
    else R[i] = q.rough + (0.5 - lum) * q.k + (rn() - 0.5) * 0.06;    // 暗處（縫、髒污）較粗
  }
  const Hh = blur(blur(L, w, h, false), w, h, false);                 // 亮度當高度：板縫、鉚釘邊、雕紋
  return { normal: tex(normalCanvas(Hh, w, h, q.ns * 6, false), false, false), rough: tex(grayCanvas(R, w, h), false, false) };
}
export function leafMaterial(n, texL = new THREE.TextureLoader()) {  // BoxGeometry 六面：±x ±y ±z，正反面用圖、四邊用木色
  const q = KIND[n];
  const face = new THREE.MeshStandardMaterial({ roughness: q.glass ? 0.4 : q.rough, metalness: q.metal });
  face.map = texL.load(`tex/leaf_${n}.webp`, (t) => {
    const m = deriveLeafMaps(t.image, q);
    face.normalMap = m.normal; face.roughnessMap = m.rough; face.roughness = 1; face.normalScale.set(1, 1); face.needsUpdate = true;
  });
  face.map.colorSpace = THREE.SRGBColorSpace; face.map.anisotropy = 4;
  const edge = new THREE.MeshStandardMaterial({ color: '#6b5340', roughness: 0.8 });
  return [edge, edge, edge, edge, face, face];
}
