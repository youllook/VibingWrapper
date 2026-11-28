// 紙飛機穿城 · 紙摺單軌電車
// 跨坐在高架單軌梁上：3–4 節白紙車廂，斜切的車頭、凹進去的車窗帶、一條細藍紙帶（呼應紙飛機）。
// 車用「全域距離 d」定位（世界 z＝s−d），沿 railX(d) 的曲線擺車廂、算偏轉角，所以永遠貼著軌道。
// 兩種出場：從鏡頭後面追上來超過紙飛機（同向），或從遠方迎面開來擦身而過（對向）。
import * as THREE from 'three';
import { railX, RAIL_Y } from './city.js';

const L = 11, GAP = 0.8, W = 2.8, H = 2.7;                // 車廂長、車廂間距、寬、高（m）
const BASE = RAIL_Y + 1.95;                               // 車身底：梁頂 25.5＋兩側唇 0.45
const S = 1.7;                                            // 紙模型的誇張比例：照實際尺寸在大樓間太小讀不出來；車頂約 31 m

// 每種狀態的發車間隔（秒）與車速（對地 m/s）
const EVERY = { idle: [18, 30], thinking: [30, 45], working: [8, 14], finishing: [16, 24], waiting: [40, 60], absent: [25, 40] };
const SPEED = { idle: 22, thinking: 14, working: 34, finishing: 20, waiting: 10, absent: 18 };

export function makeTrain(scene, NIGHT) {
  const paper = new THREE.MeshLambertMaterial({ color: 0xe8eef6, flatShading: true });        // 淡藍灰紙：跟暖白城市分得開
  const shade = new THREE.MeshLambertMaterial({ color: 0xb9bcc2, flatShading: true });        // 車窗帶（凹進去的暗面）
  const glass = new THREE.MeshLambertMaterial({ color: 0xa9b1bc, emissive: 0x000000 });       // 窗格：夜裡亮暖燈
  const blue = new THREE.MeshLambertMaterial({ color: 0x8fb6e0 });

  // 車頭：箱子的前上緣往後拉 2.2 m，變成斜擋風面
  const noseGeo = new THREE.BoxGeometry(W, H, 3).translate(0, H / 2, 0);
  const pa = noseGeo.attributes.position;
  for (let i = 0; i < pa.count; i++) if (pa.getY(i) > H * 0.6 && pa.getZ(i) < 0) pa.setZ(i, pa.getZ(i) + 2.2);
  noseGeo.computeVertexNormals();

  const box = (sx, sy, sz, x, y, z, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
  };
  // 一節車廂（局部座標：車頭朝 −Z，原點在車身底面中心）；nose: 0 無、1 前、−1 後
  function makeCar(nose) {
    const g = new THREE.Group();
    const bodyLen = L - (nose ? 3 : 0), bz = nose === 1 ? 1.5 : nose === -1 ? -1.5 : 0;
    g.add(box(W, H, bodyLen, 0, H / 2, bz, paper));
    g.add(box(W + 0.3, 0.22, bodyLen - 0.3, 0, H + 0.11, bz, paper));                       // 車頂疊一層紙板
    g.add(box(W + 0.9, 0.95, L, 0, -0.47, 0, paper));                                       // 裙板：包住軌道梁
    for (const e of [-1, 1]) {
      g.add(box(0.06, 0.95, bodyLen - 1.2, e * (W / 2 + 0.01), H * 0.62, bz, shade));      // 車窗帶
      for (let k = 0; k < 4; k++) g.add(box(0.07, 0.6, 1.3, e * (W / 2 + 0.02), H * 0.62, bz - (bodyLen - 1.2) / 2 + 0.9 + k * ((bodyLen - 3) / 3), glass));
      g.add(box(0.07, 0.42, L - 0.2, e * (W / 2 + 0.03), H * 0.26, 0, blue));                // 藍紙帶（要遠看讀得到）
    }
    if (nose) {
      const n = new THREE.Mesh(noseGeo, paper); n.castShadow = true; n.receiveShadow = true;
      n.position.z = nose === 1 ? -(L / 2 - 1.5) : L / 2 - 1.5;
      if (nose === -1) n.rotation.y = Math.PI;
      g.add(n);
      const st = box(W + 0.06, 0.42, 2.6, 0, H * 0.26, n.position.z, blue); g.add(st);
    }
    return g;
  }

  const MAXC = 4;
  const cars = [makeCar(1), makeCar(0), makeCar(0), makeCar(-1)];
  const root = new THREE.Group(); cars.forEach((c) => root.add(c)); scene.add(root);
  const tailCar = makeCar(-1); root.add(tailCar);               // 3 節編組時用的車尾

  let run = null, next = 6;
  function spawn(s, state, planeSpeed) {
    const dir = Math.random() < 0.5 ? 1 : -1;               // 1＝同向追上、−1＝迎面
    const v = SPEED[state] ?? 22;
    const n = Math.random() < 0.5 ? 3 : 4;
    run = dir > 0 ? { dir, n, d: s - 160, v: Math.max(v, planeSpeed + 12) } : { dir, n, d: s + 1100, v };
  }
  return {
    trigger() { next = 0; },
    get run() { return run; },
    update(dt, s, clk, state, planeSpeed) {
      if (!run && clk > next) spawn(s, state, planeSpeed);
      root.visible = !!run;
      if (!run) return;
      run.d += run.dir * run.v * dt;
      const done = run.dir > 0 ? run.d > s + 1300 : run.d < s - 200;
      if (done) { run = null; const e = EVERY[state] || EVERY.idle; next = clk + e[0] + Math.random() * (e[1] - e[0]); root.visible = false; return; }
      // 編組：前 n−1 節用 cars[0..n−2]，最後一節用帶車尾的
      const list = run.n === 4 ? cars : [cars[0], cars[1], tailCar];
      cars[2].visible = run.n === 4; cars[3].visible = run.n === 4; tailCar.visible = run.n === 3;
      list.forEach((car, k) => {
        const dc = run.d - run.dir * S * (L / 2 + k * (L + GAP));
        const g = (railX(dc + 0.5) - railX(dc - 0.5));      // dx/dd
        car.position.set(railX(dc), BASE, s - dc); car.scale.setScalar(S);
        car.rotation.y = Math.atan2(-g, 1) + (run.dir > 0 ? 0 : Math.PI);
      });
      glass.emissive.setRGB(1, 0.78, 0.5).multiplyScalar(NIGHT.value * 0.9);
    },
  };
}
