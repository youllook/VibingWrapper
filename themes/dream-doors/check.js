// 步驟 3 驗收（只在開發時用）：灰模分層遮罩 vs Codex 拆的五層標準答案，逐層 IoU。
// 用法：開 index.html?freeze=1&ids=1，主控台 await (await import('./check.js')).score()
const W = 480, H = 270, DIR = '../../docs/dream-doors/_codex/layers/';
const NAMES = ['near', 'girl', 'door', 'walk', 'sky'];
const GT = [[3, 'L3_walk'], [2, 'L2_doors'], [1, 'L1_girl'], [0, 'L0_near']]; // 後畫的蓋前面（近的優先）
const PAL = [[230, 60, 60], [240, 220, 40], [60, 200, 90], [70, 110, 230], [25, 25, 30]];
const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
const pixels = (img) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.drawImage(img, 0, 0, W, H); return g.getImageData(0, 0, W, H).data; };
let gtCache = null;
async function target() {
  if (gtCache) return gtCache;
  const gt = new Uint8Array(W * H).fill(4);
  for (const [i, n] of GT) { const d = pixels(await load(DIR + n + '.png')); for (let k = 0; k < W * H; k++) if (d[k * 4 + 3] > 127) gt[k] = i; }
  return (gtCache = gt);
}
function classify(d) {
  const m = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) {
    const r = d[k * 4] > 127, g = d[k * 4 + 1] > 127, b = d[k * 4 + 2] > 127;
    m[k] = r && !g && !b ? 0 : r && g && !b ? 1 : g && !r && !b ? 2 : b && !r && !g ? 3 : 4;
  }
  return m;
}
export async function score(theme = window.theme) {
  if (theme.ready) { await theme.ready; theme.draw(); }
  const gt = await target(), mine = classify(pixels(await load(theme.mask(W, H))));
  const out = {}; let agree = 0, sum = 0;
  for (let k = 0; k < W * H; k++) agree += mine[k] === gt[k];
  NAMES.forEach((n, i) => {
    let inter = 0, uni = 0, a = 0, b = 0;
    for (let k = 0; k < W * H; k++) { const x = mine[k] === i, y = gt[k] === i; inter += x && y; uni += x || y; a += x; b += y; }
    out[n] = { iou: +(inter / uni).toFixed(3), ours: +(a / W / H).toFixed(3), target: +(b / W / H).toFixed(3) }; sum += inter / uni;
  });
  out.meanIoU = +(sum / NAMES.length).toFixed(3); out.agree = +(agree / W / H).toFixed(3);
  return out;
}
export async function sweep(list, wait = 1500) {
  const res = [];
  for (const q of list) {
    const f = document.createElement('iframe');
    Object.assign(f.style, { position: 'fixed', left: '0', top: '0', width: '480px', height: '270px', opacity: '0.01' });
    f.src = 'index.html?freeze=1&ids=1&' + q; document.body.appendChild(f);
    await new Promise((ok) => f.onload = ok); await new Promise((ok) => setTimeout(ok, wait));
    try { const s = await score(f.contentWindow.theme); res.push({ q, agree: s.agree, miou: s.meanIoU, s }); } catch (e) { res.push({ q, err: String(e) }); }
    f.remove();
  }
  return res.sort((a, b) => (b.agree || 0) - (a.agree || 0));
}
export async function compare(theme = window.theme) {
  if (theme.ready) { await theme.ready; theme.draw(); }
  const gt = await target(), m = classify(pixels(await load(theme.mask(W, H))));
  const c = document.createElement('canvas'); c.width = W; c.height = H * 3; const g = c.getContext('2d'), im = g.createImageData(W, H * 3);
  for (let k = 0; k < W * H; k++) {
    const put = (row, col) => { const o = (row * W * H + k) * 4; im.data[o] = col[0]; im.data[o + 1] = col[1]; im.data[o + 2] = col[2]; im.data[o + 3] = 255; };
    put(0, PAL[m[k]]); put(1, PAL[gt[k]]); put(2, m[k] === gt[k] ? PAL[gt[k]].map((v) => v / 4) : PAL[m[k]]);
  }
  g.putImageData(im, 0, 0);
  Object.assign(c.style, { position: 'fixed', left: '0', top: '0', height: '100vh', zIndex: 9 }); document.body.appendChild(c);
}
// 座標下降：P＝{名稱: [起始值, 步長]}，進度存在 window.__opt
export async function optimize(P, fixed = '', rounds = 4, wait = 1200) {
  const q = (v) => fixed + Object.entries(v).map(([k, x]) => `&${k}=${+x.toFixed(4)}`).join('');
  const cur = Object.fromEntries(Object.entries(P).map(([k, [v]]) => [k, v]));
  const step = Object.fromEntries(Object.entries(P).map(([k, [, s]]) => [k, s]));
  const st = window.__opt = { best: null, cur, log: [], done: false };
  const ev = async (v) => (await sweep([q(v)], wait))[0];
  st.best = await ev(cur);
  for (let r = 0; r < rounds; r++) for (const k of Object.keys(P)) {
    let improved = false;
    for (const dir of [1, -1]) {
      const v = { ...cur, [k]: cur[k] + dir * step[k] }, res = await ev(v);
      st.log.push([k, v[k], res.agree]);
      if (res.agree > st.best.agree) { st.best = res; Object.assign(cur, v); improved = true; break; }
    }
    if (!improved) step[k] /= 2;
  }
  st.done = true; return st.best;
}
