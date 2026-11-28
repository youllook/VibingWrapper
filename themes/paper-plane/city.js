// 紙飛機穿城 · 程式城市（無限）
// 城市切成每段 SEG 公尺的街廓；每段長相只由「全域段號」決定（同段號＝同長相）。
// 座標：主街沿 −Z 往前，街心 x=0；段 i 涵蓋全域距離 [i*SEG, (i+1)*SEG)，段內 z 從 0 到 −SEG。
import * as THREE from 'three';

export const SEG = 60;          // 近城一段長度（m）
export const FAR_SEG = 240;     // 遠景天際線一段長度
export const STREET = 24;       // 街心到第一排建築線（m）

// 固定亂數：同一個種子永遠同一串
export function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// 兩側規則（對 n03a）：左側近街高樓貼鏡頭，右側第一排較矮、後排高
const SIDES = [
  { dir: -1, rows: [{ h: [24, 72], d: [18, 26] }, { h: [38, 105], d: [18, 26] }, { h: [45, 140], d: [18, 26] }] },
  { dir: 1, rows: [{ h: [14, 32], d: [14, 22] }, { h: [20, 50], d: [16, 24] }, { h: [30, 95], d: [18, 26] }] },
];
const ROW_GAP = 8;               // 排與排之間的巷子

// 高架單軌：全域距離 d 的函數（跨段連續）
export function railX(d) { return 6 + 9 * Math.sin(d / 260) + 3 * Math.sin(d / 97 + 1.3); }
export const RAIL_Y = 24;

const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);  // 原點在底面中心

// 一個段：回傳 [{x,y,z,sx,sy,sz,kind}] 盒子清單（段內座標）
export function buildSegment(i) {
  const R = rng(i * 7919 + 17);
  const boxes = [];
  const r = (a, b) => a + (b - a) * R();
  const crossZ = -r(6, SEG - 20), CROSS = 13;     // 每段一條橫街（大樓端面才會露出來）
  for (const side of SIDES) {
    let x0 = STREET;
    side.rows.forEach((row, ri) => {
      const depth = r(row.d[0], row.d[1]);
      // 沿街切地塊
      let z = 0;
      while (z > -SEG + 0.01) {
        if (z <= crossZ && z > crossZ - CROSS) { z = crossZ - CROSS; continue; }
        let w = Math.min(r(12, 26), z + SEG);
        if (z > crossZ && z - w < crossZ) w = z - crossZ;
        if (w < 3) { z -= w; continue; }
        const gap = R() < 0.25 ? r(2, 5) : 0.6;      // 偶爾一條窄巷
        const bw = Math.max(w - gap, 4);
        let h = r(row.h[0], row.h[1]);
        if (R() < 0.07) h *= 1.6;                    // 偶爾一棟地標
        const fs = R(), style = fs < 0.38 ? 0 : fs < 0.62 ? 1 : fs < 0.9 ? 2 : 3, seed = R();   // 0 直槽三道、1 橫槽三道、2 素面、3 細溝
        const set = ri === 0 && R() < 0.5 ? r(1, 7) : 0;          // 第一排偶爾退縮，立面才不會像一道牆
        const cx = side.dir * (x0 + set + depth / 2), cz = z - bw / 2;
        const face = side.dir * (x0 + set);                       // 面向主街的立面 x
        const vis = ri === 0 || (ri === 1 && R() < 0.5);          // 看得到的才加細節（省實例）
        // 裙樓：比塔身寬一點、往街凸出 1.5 m
        if (vis && R() < 0.4) {
          const ph = r(5, 9);
          boxes.push({ x: cx - side.dir * 0.75, y: 0, z: cz, sx: depth + 1.5, sy: ph, sz: bw + 0.6, kind: 'body' });
          boxes.push({ x: cx - side.dir * 0.75, y: ph, z: cz, sx: depth + 2.1, sy: 0.5, sz: bw + 1.2, kind: 'trim' });
        }
        // 主體：可能分兩段退縮
        const split = R() < 0.55;
        const h1 = split ? h * r(0.45, 0.7) : h;
        const tiers = [{ x: cx, y: 0, z: cz, sx: depth, sy: h1, sz: bw }];
        // 中景階梯塔（對目標圖）：後排偶爾一棟拔高、往上一層層收，最後一根細頂。
        // 用自己的亂數（由 seed 導出），不動到其他建築的亂數序列。
        const TR = rng(Math.floor(seed * 1e6) + ri * 101);
        const tower = ri > 0 && bw > 10 && TR() < (ri === 1 ? 0.16 : 0.22);
        if (tower) {
          const H = Math.max(h, 70) * (1.35 + TR() * 0.6);
          const n = 3 + Math.floor(TR() * 2);                    // 3–4 段收頂
          let y = H * (0.42 + TR() * 0.12), sx = depth, sz = bw;
          tiers[0].sy = y;
          for (let k = 0; k < n; k++) {
            sx *= 0.72 + TR() * 0.1; sz *= 0.72 + TR() * 0.1;
            const last = k === n - 1;
            const sy = last ? H - y : (H - y) * (0.35 + TR() * 0.15);
            tiers.push({ x: cx, y, z: cz, sx, sy, sz });
            y += sy;
          }
          if (TR() < 0.6) tiers.push({ x: cx, y, z: cz, sx: Math.max(sx * 0.35, 1.6), sy: H * (0.06 + TR() * 0.06), sz: Math.max(sz * 0.35, 1.6) });
        } else if (split) {
          const k = r(0.6, 0.85);
          tiers.push({ x: cx + side.dir * depth * (1 - k) * 0.3, y: h1, z: cz, sx: depth * k, sy: h - h1, sz: bw * r(0.6, 0.9) });
          if (R() < 0.35) {
            const t = r(0.35, 0.55);
            tiers.push({ x: cx, y: h, z: cz, sx: depth * t, sy: h * r(0.12, 0.25), sz: bw * t });
          }
        }
        for (const b of tiers) {
          boxes.push({ ...b, kind: 'body', style, seed });
          // 簷口：每一段頂上一片略寬的薄板（紙板疊出來的厚邊）
          if (vis || tower) boxes.push({ x: b.x, y: b.y + b.sy, z: b.z, sx: b.sx + 0.9, sy: 0.55, sz: b.sz + 0.9, kind: 'trim' });
        }
        const base = tiers[0];
        if (vis) {
          const deco = R();
          if (deco < 0.3) {
            // 水平腰線：每 12–18 m 一條外凸薄板
            const step = r(12, 18);
            for (let y = step; y < base.sy - 4; y += step) boxes.push({ x: base.x, y, z: base.z, sx: base.sx + 0.6, sy: 0.35, sz: base.sz + 0.6, kind: 'trim' });
          } else if (deco < 0.58) {
            // 直向壁柱：面街立面上一排外凸的細柱
            const n = Math.max(2, Math.floor(base.sz / r(3, 4.5)));
            for (let k = 0; k <= n; k++) {
              const zz = base.z - base.sz / 2 + (k / n) * base.sz;
              boxes.push({ x: face - side.dir * 0.45, y: 0, z: zz, sx: 0.9, sy: base.sy, sz: 0.5, kind: 'trim' });
            }
          }
        }
        // 屋頂：女兒牆、水塔、機房
        const top = tiers[tiers.length - 1];
        const roofY = top.y + top.sy + (vis ? 0.55 : 0);
        if (vis && R() < 0.7) {
          const t = 0.3, hh = 1.1;
          boxes.push({ x: top.x - top.sx / 2 + t / 2, y: roofY, z: top.z, sx: t, sy: hh, sz: top.sz, kind: 'trim' });
          boxes.push({ x: top.x + top.sx / 2 - t / 2, y: roofY, z: top.z, sx: t, sy: hh, sz: top.sz, kind: 'trim' });
          boxes.push({ x: top.x, y: roofY, z: top.z - top.sz / 2 + t / 2, sx: top.sx, sy: hh, sz: t, kind: 'trim' });
          boxes.push({ x: top.x, y: roofY, z: top.z + top.sz / 2 - t / 2, sx: top.sx, sy: hh, sz: t, kind: 'trim' });
        }
        const n = Math.floor(r(0, vis ? 4.5 : 2.5));
        for (let k = 0; k < n; k++) {
          const s = r(2, 5);
          boxes.push({ x: top.x + r(-0.3, 0.3) * top.sx, y: roofY, z: top.z + r(-0.3, 0.3) * top.sz, sx: s, sy: r(1.5, 4), sz: s * r(0.8, 1.4), kind: 'roof' });
        }
        if (vis && R() < 0.3) {                                    // 水塔：四根腳＋桶身
          const wx = top.x + r(-0.25, 0.25) * top.sx, wz = top.z + r(-0.25, 0.25) * top.sz;
          for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) boxes.push({ x: wx + a * 1.1, y: roofY, z: wz + b * 1.1, sx: 0.25, sy: 2.5, sz: 0.25, kind: 'trim' });
          boxes.push({ x: wx, y: roofY + 2.5, z: wz, sx: 3, sy: 3.2, sz: 3, kind: 'roof' });
        }
        // 偶爾一根天線
        if (R() < 0.12) boxes.push({ x: top.x, y: roofY, z: top.z, sx: 0.5, sy: r(10, 25), sz: 0.5, kind: 'roof' });
        z -= w;
      }
      x0 += depth + ROW_GAP;
    });
  }
  // 空橋：六成的段有一座 —— 桁架：底板、頂板、兩側直桿與斜撐
  if (R() < 0.6) {
    const y = r(14, 38), z = -r(8, SEG - 8), L = STREET * 2, W = 4.5, H = 3.2;
    boxes.push({ x: 0, y, z, sx: L, sy: 0.6, sz: W, kind: 'bridge' });
    boxes.push({ x: 0, y: y + H - 0.5, z, sx: L, sy: 0.5, sz: W + 0.4, kind: 'bridge' });
    for (const e of [-1, 1]) {
      const zz = z + e * (W / 2 - 0.15);
      boxes.push({ x: 0, y: y + 1.1, z: zz, sx: L, sy: 0.18, sz: 0.2, kind: 'trim' });       // 扶手
      for (let x = -L / 2; x <= L / 2 + 0.01; x += 4) {
        boxes.push({ x, y: y + 0.6, z: zz, sx: 0.28, sy: H - 1.1, sz: 0.28, kind: 'trim' });
        if (x < L / 2 - 1) {                              // 斜撐：盒子以底面中心為軸轉，從一根直桿底斜到下一根頂（左右交替成 V）
          const a = Math.atan2(4, H - 1.1), odd = Math.round((x + L / 2) / 4) % 2;
          boxes.push({ x: odd ? x + 4 : x, y: y + 0.6, z: zz, sx: 0.2, sy: Math.hypot(4, H - 1.1), sz: 0.2, kind: 'trim', roll: odd ? a : -a });
        }
      }
    }
  }
  // 高架單軌：每 3 m 一節粗梁（外加兩側薄唇），每 30 m 一座 Y 形墩
  const d0 = i * SEG;
  for (let s = 0; s < SEG; s += 3) {
    const xa = railX(d0 + s), xb = railX(d0 + s + 3);
    const len = Math.hypot(xb - xa, 3);
    // 盒子的 z 軸轉 θ 後是 (sinθ, cosθ)；梁沿 (xb−xa, −3)，所以 θ = atan2(−(xb−xa), 3)
    const yaw = Math.atan2(-(xb - xa), 3), xm = (xa + xb) / 2, zm = -s - 1.5;
    boxes.push({ x: xm, y: RAIL_Y, z: zm, sx: 3.4, sy: 1.5, sz: len + 0.05, kind: 'rail', yaw });
    const cx = Math.cos(yaw), sz2 = -Math.sin(yaw);       // 梁的橫向（局部 x 軸）在世界的方向
    for (const e of [-1, 1]) boxes.push({ x: xm + e * 1.55 * cx, y: RAIL_Y + 1.5, z: zm + e * 1.55 * sz2, sx: 0.3, sy: 0.45, sz: len + 0.05, kind: 'trim', yaw });
    if (((d0 + s) % 30) < 3) {
      const ph = RAIL_Y - 4.5;
      boxes.push({ x: xa, y: 0, z: zm, sx: 1.6, sy: ph, sz: 1.6, kind: 'rail' });
      for (const e of [-1, 1]) {                         // 兩支斜臂撐到梁的兩側
        boxes.push({ x: xa + e * 0.95, y: ph - 0.4, z: zm, sx: 0.9, sy: 5.4, sz: 1.4, kind: 'rail', roll: -e * 0.5 });
      }
      boxes.push({ x: xa, y: RAIL_Y - 0.6, z: zm, sx: 4.2, sy: 0.6, sz: 1.8, kind: 'rail' });
    }
  }
  // 中央分隔島（兩條矮帶）
  boxes.push({ x: -0.9, y: 0, z: -SEG / 2, sx: 0.5, sy: 0.35, sz: SEG, kind: 'trim' });
  boxes.push({ x: 0.9, y: 0, z: -SEG / 2, sx: 0.5, sy: 0.35, sz: SEG, kind: 'trim' });
  // 路燈：兩側人行道每 20 m 一支（桿＋往街心伸的臂）
  for (const dir of [-1, 1]) {
    for (let s = (d0 % 20 === 0 ? 0 : 20 - (d0 % 20)); s < SEG; s += 20) {
      const x = dir * (STREET - 1.2);
      boxes.push({ x, y: 0, z: -s, sx: 0.25, sy: 7.5, sz: 0.25, kind: 'trim' });
      boxes.push({ x: x - dir * 1.2, y: 7.3, z: -s, sx: 2.4, sy: 0.2, sz: 0.3, kind: 'trim' });
    }
  }
  return boxes;
}

// 遠景天際線：細高樓剪影，離街 70 m 以外
export function buildFarSegment(i) {
  const R = rng(i * 104729 + 3);
  const r = (a, b) => a + (b - a) * R();
  const boxes = [];
  for (let k = 0; k < 90; k++) {
    const dir = R() < 0.5 ? -1 : 1;
    const x = dir * r(140, 650), z = -r(0, FAR_SEG);
    const w = r(10, 26), h = r(60, 240) * (R() < 0.1 ? 1.5 : 1);
    boxes.push({ x, y: 0, z, sx: w, sy: h, sz: w * r(0.7, 1.4), kind: 'far' });
    if (R() < 0.4) boxes.push({ x, y: h, z, sx: w * 0.6, sy: h * r(0.1, 0.3), sz: w * 0.6, kind: 'far' });
  }
  return boxes;
}

const _e = new THREE.Euler(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

// 一個可重複使用的段槽：InstancedMesh 一顆，換段號時重填
export class SegmentSlot {
  constructor(material, cap, build, len) {
    this.mesh = new THREE.InstancedMesh(unitBox, material, cap);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.build = build; this.len = len; this.index = null;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
  }
  fill(i, colorOf) {
    this.index = i;
    const boxes = this.build(i);
    const n = Math.min(boxes.length, this.mesh.instanceMatrix.count);
    if (boxes.length > n) console.warn('段', i, '盒子超過容量', boxes.length);
    const c = new THREE.Color();
    for (let k = 0; k < n; k++) {
      const b = boxes[k];
      _q.setFromEuler(_e.set(0, b.yaw || 0, b.roll || 0, 'YXZ'));
      _m.compose(_p.set(b.x, b.y, b.z), _q, _s.set(b.sx, b.sy, b.sz));
      this.mesh.setMatrixAt(k, _m);
      this.mesh.setColorAt(k, colorOf(b, c));
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
  // 全域距離 s：段 i 的段內 z=0 對應世界 z = s − i*len（往 +Z 流過來）
  place(s) { this.mesh.position.z = s - this.index * this.len; }
}

// 一組段槽：維持 [s − behind, s + ahead] 範圍內的段
export class Strip {
  constructor(scene, material, { cap, build, len, behind, ahead }) {
    this.len = len; this.behind = behind;
    this.count = Math.ceil((behind + ahead) / len) + 1;
    this.slots = Array.from({ length: this.count }, () => new SegmentSlot(material, cap, build, len));
    this.slots.forEach((sl) => scene.add(sl.mesh));
    this.colorOf = (b, c) => c.set(0xffffff);
  }
  update(s) {
    const first = Math.floor((s - this.behind) / this.len);
    for (const sl of this.slots) {
      // 每個槽固定負責 index ≡ 槽號 (mod count)
      const k = this.slots.indexOf(sl);
      const want = first + ((k - first) % this.count + this.count) % this.count;
      if (sl.index !== want) sl.fill(want, this.colorOf);
      sl.place(s);
    }
  }
}
