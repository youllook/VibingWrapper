// 海鷗與帆船（素材家族 6、7）：吊線海鷗像鐘擺擺、拍翅換卡；5 艘帆船沿水平線停格滑行、輕搖，setBoats(n) 滑入／滑出。
//
//   const flyers = await createFlyers(scene, { loadImg, camera, boats: 5 });
//   每格：flyers.update(t[, tint])（t = 秒，跟浪同一個時鐘）；session 數變了：flyers.setBoats(n)
//   卡片放在 group 裡（擺動軸），uCam 由 update 自己用世界座標算 → 不要把 flyers.papers 丟進 updateLayers
//
// 卡片座標都是 1872×1053 出血畫布（layers-full 同一套）；每張卡先畫回整張畫布再交給 createPaperLayer，
// 所以鏡頭不動、t=0 時每張卡都投影回目標圖的原位。
// renderOrder 依深度自動插進場景裡既有的紙片之間（不管 index.html 先建還是後建）。
import * as THREE from '../vendor/three.module.min.js';
import { IMG_W, IMG_H, createPaperLayer, createShadow, frameSize, stepTime, boil } from './paper.js';

const BW = 1872, BH = 1053, BX = 100, BY = 56;   // 出血畫布、目標圖在畫布裡的位置

// 海鷗：深度、擺幅（度）、週期（秒）、拍翅節奏
const GULL_D = [27, 28, 25];
const GULL_SWING = [1.6, 2.2, 1.2];
const GULL_PERIOD = [3.3, 2.7, 4.1];
const GULL_PIVOT_Y = -10;                 // 吊點（畫布 y，畫面上緣外）
const STRING = { color: '#eef5fb', opacity: 0.8, px: 1.3 };   // 吊線（目標圖 px 寬）

// 帆船：深度、滑行速度（目標圖 px/秒，負 = 往左）、搖晃
const BOAT_D = [50, 54, 55, 57, 53];
const BOAT_SPEED = [-5, 3.2, -4, 2.6, 3.6];
const BOAT_ROCK = [1.4, 1.8, 2, 2.2, 1.7];   // 度
const BOAT_ROCK_P = [4.2, 3.6, 3.1, 2.8, 3.9];
const SLIDE = 3.2;                         // 滑入／滑出秒數

// 一張卡（畫布座標 x,y）→ 整張出血畫布
function onCanvas(img, x, y) {
  const c = document.createElement('canvas'); c.width = BW; c.height = BH;
  c.getContext('2d').drawImage(img, x, y);
  return c;
}

// 畫布座標 → 離鏡頭 d 的平面上的世界座標
function world(d, x, y) {
  const { w, h } = frameSize(d);
  return { x: ((x - BX) / IMG_W - 0.5) * w, y: -((y - BY) / IMG_H - 0.5) * h };
}

const ease = p => p <= 0 ? 0 : p >= 1 ? 1 : p * p * (3 - 2 * p);

export async function createFlyers(scene, { loadImg, camera, base = 'assets', boats: nBoats = 5, shadow = 0.6, thick = 0.004 } = {}) {
  const mine = [];          // { obj, d }：要插 renderOrder 的
  const papers = [];        // 自己更新 uCam 的紙片
  const card = (img, d) => { const m = createPaperLayer(img, { d, thick }); papers.push(m); return m; };
  const shade = (img, d) => shadow > 0 ? createShadow(img, { d, strength: shadow }) : null;

  // ---------- 海鷗 ----------
  const gdefs = await (await fetch(`${base}/gulls/gulls.json`)).json();
  const gulls = [];
  for (const [k, G] of gdefs.entries()) {
    const d = GULL_D[k];
    const [ia, ib] = await Promise.all([loadImg(`${base}/gulls/${G.a}`), loadImg(`${base}/gulls/${G.b}`)]);
    const ca = onCanvas(ia, G.ax, G.ay), cb = onCanvas(ib, G.bx, G.by);
    const pivot = world(d, G.hook[0], GULL_PIVOT_Y);
    const grp = new THREE.Group(); grp.position.set(pivot.x, pivot.y, 0);
    const add = o => { if (o) { o.position.x -= pivot.x; o.position.y -= pivot.y; grp.add(o); } return o; };
    const sa = add(shade(ca, d)), sb = add(shade(cb, d));
    const ma = add(card(ca, d)), mb = add(card(cb, d));
    if (sb) sb.visible = false; mb.visible = false;
    // 吊線：吊點 → 背上，跟著整組擺
    const hook = world(d, G.hook[0], G.hook[1]);
    const len = pivot.y - hook.y, wpx = frameSize(d).h / IMG_H;
    const line = new THREE.Mesh(new THREE.PlaneGeometry(STRING.px * wpx, len),
      new THREE.MeshBasicMaterial({ color: new THREE.Color().setStyle(STRING.color, THREE.LinearSRGBColorSpace), transparent: true, opacity: STRING.opacity, depthWrite: false }));
    line.position.set(hook.x - pivot.x, -len / 2, -d - 0.05);   // 線在卡片後面一點：背上那端被鳥蓋住
    grp.add(line);
    scene.add(grp);
    mine.push({ obj: line, d: d + 0.05 }, { obj: ma, d }, { obj: mb, d });
    if (sa) mine.push({ obj: sa, d: d + 0.6 }, { obj: sb, d: d + 0.6 });
    gulls.push({ k, grp, ma, mb, sa, sb });
  }

  // ---------- 帆船 ----------
  const bdefs = await (await fetch(`${base}/boats/boats.json`)).json();
  const boats = [];
  for (const [k, B] of bdefs.entries()) {
    const d = BOAT_D[k];
    const img = await loadImg(`${base}/boats/${B.file}`);
    const c = onCanvas(img, B.x, B.y);
    const keel = world(d, B.x + B.w / 2, B.y + B.h - 6);   // 搖晃軸：船底中央
    const grp = new THREE.Group(); grp.position.set(keel.x, keel.y, 0);
    const s = shade(c, d), m = card(c, d);
    for (const o of [s, m]) if (o) { o.position.x -= keel.x; o.position.y -= keel.y; grp.add(o); }
    scene.add(grp);
    mine.push({ obj: m, d }); if (s) mine.push({ obj: s, d: d + 0.6 });
    const { w } = frameSize(d), px = w / IMG_W;
    const span = w * BW / IMG_W + 2 * B.w * px;   // 出血畫布寬＋船寬：繞一圈的長度
    boats.push({ k, grp, x0: keel.x, y0: keel.y, px, span, half: span / 2, on: k < nBoats, t0: -1e9 });
  }

  // ---------- renderOrder：依深度插進既有紙片之間 ----------
  let nChildren = -1;
  const mineSet = new Set(mine.map(o => o.obj));
  function sortIn() {
    const others = [];
    scene.traverse(o => { if (o.isMesh && !mineSet.has(o)) others.push({ z: o.getWorldPosition(new THREE.Vector3()).z, r: o.renderOrder }); });
    const sorted = [...mine].sort((a, b) => b.d - a.d);
    sorted.forEach((o, i) => {
      // 比我遠（z 更小）的裡面最大的 renderOrder；同一區間內再依深度微調
      let base = -1;
      for (const q of others) if (q.z < -o.d && q.r > base) base = q.r;
      o.obj.renderOrder = base + 0.1 + i * 0.001;
    });
    nChildren = scene.children.length;
  }
  sortIn();

  // ---------- 每格 ----------
  let lastT = 0;
  const v = new THREE.Vector3();
  function update(t, tint) {   // tint：跟 updateLayers 的第三個參數一樣（日夜色調），可省
    lastT = t;
    if (scene.children.length !== nChildren) sortIn();
    const ts = stepTime(t, 12);
    for (const g of gulls) {
      // 鐘擺：以吊點為軸
      g.grp.rotation.z = GULL_SWING[g.k] * Math.PI / 180 * Math.sin(ts * Math.PI * 2 / GULL_PERIOD[g.k]);
      // 拍翅：一陣（約 1.5 秒，每 3 格換一次卡）＋滑翔；每 6 秒一輪，各隻錯開、陣長每輪不同
      const cyc = 6, ph = ts + g.k * 2.1, n = Math.floor(ph / cyc), u = ph - n * cyc;
      const burst = 1.0 + 0.6 * (boil(g.k * 7 + 1, n, 1) * 0.5 + 0.5);
      const up = t > 0 && u < burst && Math.floor(u * 4) % 2 === 1;
      g.ma.visible = !up; g.mb.visible = up;
      if (g.sa) { g.sa.visible = !up; g.sb.visible = up; }
    }
    for (const b of boats) {
      // 沿水平線滑：繞著出血畫布外一圈（被岬角擋住是對的）
      let x = b.x0 + BOAT_SPEED[b.k] * b.px * ts;
      x = ((x + b.half) % b.span + b.span) % b.span - b.half;
      // 進出場：從最近的一側滑入、往最近的一側滑出
      const p = ease((ts - b.t0) / SLIDE), vis = b.on ? p : 1 - p;
      const side = x >= 0 ? 1 : -1;
      const off = (1 - vis) * (b.half - Math.abs(x) + 0.5 * b.px * 120);
      b.grp.visible = vis > 0;
      b.grp.position.x = x + side * Math.max(0, off);
      b.grp.position.y = b.y0 + Math.sin(ts * Math.PI * 2 / BOAT_ROCK_P[b.k] + 1.3) * 0.5 * b.px - Math.sin(1.3) * 0.5 * b.px;
      b.grp.rotation.z = BOAT_ROCK[b.k] * Math.PI / 180 * Math.sin(ts * Math.PI * 2 / BOAT_ROCK_P[b.k]);
    }
    // 紙片厚度要的「鏡頭在這層的位置」（卡在 group 裡，用世界座標）
    if (camera) for (const m of papers) {
      m.getWorldPosition(v);
      m.material.uniforms.uCam.value.set(camera.position.x - v.x, camera.position.y - v.y);
    }
    if (tint) for (const m of papers) m.material.uniforms.uTint.value.copy(tint);
  }

  // n 艘（0–5）：多的滑入、少的滑出；at = 從哪一秒開始（預設上一次 update 的 t）
  function setBoats(n, { at } = {}) {
    const t = stepTime(at ?? lastT, 12);
    for (const b of boats) {
      const on = b.k < n;
      if (on === b.on) continue;
      // 滑到一半被反向：從目前的位置接著走
      const p = ease((t - b.t0) / SLIDE);
      b.t0 = p < 1 ? t - (1 - invEase(p)) * SLIDE : t;
      b.on = on;
    }
  }
  const invEase = y => { let lo = 0, hi = 1; for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2; ease(m) < y ? lo = m : hi = m; } return lo; };

  update(0);
  return { update, setBoats, gulls, boats, papers };
}
