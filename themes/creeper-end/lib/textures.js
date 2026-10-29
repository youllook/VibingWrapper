// 方塊貼圖（16×16 像素，程式畫）。貼圖乘在頂點色上 → 接近白的底＋灰階／微帶色明暗，平均亮度約 0.85–0.92。
// makeTextures() → { endstone, obsidian, chorusStem, chorusFlower }，每張 THREE.CanvasTexture
import * as THREE from '../vendor/three.module.min.js';
import { rng, VARIANTS } from './voxel.js';

// n > 1：畫成橫排 n 格的貼圖集（變體），每格用不同 seed；格數要和 lib/voxel.js 的 VARIANTS 一致
function tex(draw, seed, n = 1) {
  const c = document.createElement('canvas'); c.width = 16 * n; c.height = 16;
  const g = c.getContext('2d');
  for (let i = 0; i < n; i++) { g.save(); g.translate(16 * i, 0); draw(g, rng(seed + i * 101), i); g.restore(); }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// 以 16×16 灰階／RGB 陣列作畫：px(x,y,v) 或 px(x,y,[r,g,b])（0–255），x/y 環繞
function grid(g, fill) {
  const a = new Array(256).fill(0).map(() => fill.slice());
  const px = (x, y, v) => { a[((y & 15) << 4) | (x & 15)] = typeof v === 'number' ? [v, v, v] : v; };
  const get = (x, y) => a[((y & 15) << 4) | (x & 15)];
  const flush = () => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const [R, G, B] = a[y * 16 + x]; g.fillStyle = `rgb(${R | 0},${G | 0},${B | 0})`; g.fillRect(x, y, 1, 1); } };
  return { px, get, flush };
}

// 末地石（2026-10-29 重畫，對目標圖近看）：暖色底上一團團淡褐暈斑，斑的尺度約 2–3 像素（等於每面 8×8 的斑紋），
// 斑心較深、邊緣過渡一階；每面外圈一像素略暗（方塊稜線），左上一像素略亮。variant 3 斑多（較舊的石頭）。
function endstone(g, r, variant = 0) {
  const G = grid(g, [238, 236, 232]);
  // 8×8 粗格的值噪聲 → 門檻成斑，再放大成 2×2 像素並抖動邊緣
  const N = [];
  for (let i = 0; i < 81; i++) N.push(r());
  const nz = (x, y) => {   // 雙線性插值的 9×9 格點噪聲（座標 0–8）
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, at = (i, j) => N[Math.min(8, j) * 9 + Math.min(8, i)];
    return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
  };
  const th = variant === 3 ? 0.42 : 0.48 + variant * 0.02;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = nz(x / 2 + (r() - 0.5) * 0.6, y / 2 + (r() - 0.5) * 0.6) + (r() - 0.5) * 0.06;
    let c = [238, 236, 232];                          // 斑偏灰褐（不要橘）：乘上暖金頂點色後才是目標圖的褐斑
    if (v > th + 0.18) c = [168, 160, 156];           // 斑心
    else if (v > th + 0.08) c = [190, 183, 178];      // 斑
    else if (v > th) c = [214, 209, 204];             // 斑緣
    else if (v < 0.25) c = [252, 250, 246];           // 亮處
    G.px(x, y, c);
  }
  // 稜線：外圈略暗、左上略亮
  for (let i = 0; i < 16; i++) for (const [x, y, k] of [[i, 15, 0.86], [15, i, 0.88], [i, 0, 1.03], [0, i, 1.02]]) {
    const c = G.get(x, y); G.px(x, y, c.map(v => Math.min(255, v * k)));
  }
  G.flush();
}

// 黑曜石：細碎亮紫斑點＋較暗區塊
function obsidian(g, r, variant = 0) {
  const G = grid(g, [226, 222, 236]);
  for (let i = 0; i < 6; i++) {                       // 較暗區塊 2×2、2×1
    const x = r() * 16 | 0, y = r() * 16 | 0, v = 170 + r() * 20, w = 1 + (r() * 2 | 0), h = 1 + (r() * 2 | 0);
    for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) G.px(x + k, y + j, [v, v - 6, v + 8]);
  }
  for (let i = 0; i < 60; i++) { const v = 205 + r() * 40; G.px(r() * 16 | 0, r() * 16 | 0, [v, v - 8, v + 8]); }
  for (let i = 0; i < 28; i++) G.px(r() * 16 | 0, r() * 16 | 0, [255, 214 + r() * 30, 255]);   // 亮紫斑
  for (let i = 0; i < 5; i++) G.px(r() * 16 | 0, r() * 16 | 0, [255, 255, 255]);
  G.flush();
}

// 紫頌莖：斑駁、略帶直條紋（明暗兩三階）
function chorusStem(g, r) {
  const G = grid(g, [225, 215, 232]);
  for (let x = 0; x < 16; x++) {
    const col = 195 + ((x * 37 + 11) % 5) * 9 + (r() * 10);
    for (let y = 0; y < 16; y++) { const v = col + (r() < 0.45 ? (r() < 0.5 ? -30 : 22) : 0); G.px(x, y, [v, v - 8, v + 4]); }
  }
  for (let i = 0; i < 18; i++) { const x = r() * 16 | 0, y = r() * 16 | 0, v = 255; G.px(x, y, [v, v - 6, v]); }
  for (let i = 0; i < 14; i++) { const x = r() * 16 | 0, y = r() * 16 | 0, h = 2 + (r() * 3 | 0); for (let j = 0; j < h; j++) G.px(x, y + j, [160, 150, 170]); }
  G.flush();
}

// 頌花花苞：粉紫格紋，中心亮、四周一圈暗，會發光
function chorusFlower(g, r) {
  const G = grid(g, [255, 240, 255]);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));          // 方形環
    let v = d > 6.5 ? 175 : d > 4.5 ? 225 : 255;
    v += (r() - 0.5) * 22;
    if (((x >> 1) + (y >> 1)) & 1) v -= 16;                              // 2×2 棋盤格
    G.px(x, y, [Math.min(255, v + 4), Math.min(255, v - 6), Math.min(255, v + 6)]);
  }
  for (let i = 0; i < 4; i++) G.px(5 + (r() * 6 | 0), 5 + (r() * 6 | 0), [255, 255, 255]);
  G.flush();
}

// ── Pixel Perfection CE（CC BY-SA 4.0，見 textures/pp/README.md）：只借亮度圖案 ─────────────
// 讀圖 → 灰階 → 正規化成平均 mean、對比 k（乘法貼圖，色相仍由頂點色＝色票決定）；變體＝旋轉／翻轉
export function loadImage(url) {
  return new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = url; });
}
export async function loadPP(base = 'textures/pp/') {
  const names = ['creeper', 'end_stone', 'chorus_plant', 'chorus_flower', 'obsidian'];
  const ims = await Promise.all(names.map(n => loadImage(base + n + '.png')));
  return Object.fromEntries(names.map((n, i) => [n, ims[i]]));
}
function lumaPattern(im, { mean = 0.88, k = 1 } = {}) {
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const g = c.getContext('2d'); g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), L = [];
  for (let i = 0; i < d.data.length; i += 4) L.push(0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2]);
  const avg = L.reduce((a, b) => a + b, 0) / L.length;
  L.forEach((l, j) => { const v = Math.max(0, Math.min(255, 255 * (mean + (l - avg) / 255 * k))); d.data[j * 4] = d.data[j * 4 + 1] = d.data[j * 4 + 2] = v; });
  g.putImageData(d, 0, 0);
  return c;
}
const ppDraw = src => (g, r, i) => {   // 第 i 個變體：轉 90°×i，奇數再水平翻
  g.translate(8, 8); g.rotate(i * Math.PI / 2); if (i & 1) g.scale(-1, 1); g.translate(-8, -8);
  g.drawImage(src, 0, 0);
};

/** makeTextures({ pp }) — 給 loadPP() 的結果就用 Pixel Perfection 圖案，不給就用自畫版 */
export function makeTextures({ pp } = {}) {
  if (pp) return {
    endstone: tex(ppDraw(lumaPattern(pp.end_stone, { mean: 0.86, k: 2.6 })), 0, VARIANTS.endstone),
    obsidian: tex(ppDraw(lumaPattern(pp.obsidian, { mean: 0.85, k: 1.4 })), 0, VARIANTS.obsidian),
    chorusStem: tex(ppDraw(lumaPattern(pp.chorus_plant, { mean: 0.85, k: 1.8 })), 0),
    chorusFlower: tex(ppDraw(lumaPattern(pp.chorus_flower, { mean: 0.9, k: 1.2 })), 0),
  };
  return {
    endstone: tex(endstone, 11, VARIANTS.endstone),
    obsidian: tex(obsidian, 22, VARIANTS.obsidian),
    chorusStem: tex(chorusStem, 33),
    chorusFlower: tex(chorusFlower, 44),
  };
}
