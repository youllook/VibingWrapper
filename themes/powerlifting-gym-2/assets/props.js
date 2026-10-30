// 道具：長凳、粉桶、毛巾、水壺、木箱、裁判燈（子代理 B）
// 單位公尺、y 向上；原點＝底面中心（毛巾例外：原點是它掛住的那條邊，見 makeTowel）
import * as THREE from '../vendor/three.module.min.js';
import * as kit from '../lib/kit.js';

const box = (w, h, d, slot, x = 0, y = 0, z = 0, name) => {
  const m = kit.mesh(new THREE.BoxGeometry(w, h, d), slot, name);
  m.position.set(x, y, z);
  return m;
};

// 圓角矩形（在 z-y 平面）的周長點，角度遞增；每點帶外法線 [z, y, nz, ny]
function roundedRect(w, h, r, seg) {
  const pts = [], cz = w / 2 - r, cy = h / 2 - r;
  const corners = [[cz, cy], [-cz, cy], [-cz, -cy], [cz, -cy]];
  corners.forEach(([oz, oy], k) => {
    for (let i = 0; i <= seg; i++) {
      const a = (k + i / seg) * Math.PI / 2;
      pts.push([oz + r * Math.cos(a), oy + r * Math.sin(a), Math.cos(a), Math.sin(a)]);
    }
  });
  return pts;
}

// 布膠帶：繞著長凳墊截面的一圈帶子（略凸起、可歪斜）
// pts＝截面周長點；cx＝中心 x；w＝寬；lift＝離墊面高度；skewZ/skewY＝隨 z/y 的 x 偏移（歪斜）；keep(pt)＝只包住哪些點（部分包覆）
function tapeBand(pts, { cx, w, lift, thick = 0.0022, skewZ = 0, skewY = 0, cy = 0, wob = 0, rand, keep, closed = true }) {
  const P = keep ? pts.filter(keep) : pts;
  const pos = [];
  const v = (p, side, off) => {
    const [z, y, nz, ny] = p;
    const x = cx + side * w / 2 + skewZ * z + skewY * (y - cy) + p.j * wob;
    return [x, y + ny * off, z + nz * off];
  };
  P.forEach(p => { p.j = rand() - 0.5; });
  const n = closed ? P.length : P.length - 1;
  const tri = (a, b, c) => pos.push(...a, ...b, ...c);
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    const oLa = v(a, -1, lift + thick), oRa = v(a, 1, lift + thick), oLb = v(b, -1, lift + thick), oRb = v(b, 1, lift + thick);
    const iLa = v(a, -1, lift), iRa = v(a, 1, lift), iLb = v(b, -1, lift), iRb = v(b, 1, lift);
    tri(oLa, oRa, oRb); tri(oLa, oRb, oLb);            // 外表面
    tri(iRa, iRb, oRb); tri(iRa, oRb, oRa);            // 右側邊
    tri(iLa, oLa, oLb); tri(iLa, oLb, iLb);            // 左側邊
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * 平板凳：黑墊＋一圈圈紅白黑銀布膠帶，T 字鋼腳。長軸沿 X。
 * @param {object} [o]
 * @param {number} [o.seed=7]     膠帶的亂數種子（位置、寬度、歪斜、顏色）
 * @param {number} [o.length=1.2] 墊長（m）
 * @param {number} [o.width=0.30] 墊寬（m）
 * @param {number} [o.height=0.43] 墊面高（m）
 * @param {number} [o.tapes=18]   膠帶圈數
 */
export function makeBench({ seed = 7, length = 1.2, width = 0.30, height = 0.43, tapes = 18 } = {}) {
  const g = new THREE.Group(); g.name = 'bench';
  const rand = kit.rng(seed);
  const padH = 0.075, padY = height - padH / 2, r = 0.022;

  // 墊子：圓角矩形截面沿 X 擠出
  const sh = new THREE.Shape(), hw = width / 2, hh = padH / 2;
  sh.moveTo(-hw + r, -hh); sh.lineTo(hw - r, -hh); sh.absarc(hw - r, -hh + r, r, -Math.PI / 2, 0);
  sh.lineTo(hw, hh - r); sh.absarc(hw - r, hh - r, r, 0, Math.PI / 2);
  sh.lineTo(-hw + r, hh); sh.absarc(-hw + r, hh - r, r, Math.PI / 2, Math.PI);
  sh.lineTo(-hw, -hh + r); sh.absarc(-hw + r, -hh + r, r, Math.PI, Math.PI * 1.5);
  const pg = new THREE.ExtrudeGeometry(sh, { depth: length, bevelEnabled: false, curveSegments: 3 });
  pg.translate(0, 0, -length / 2); pg.rotateY(Math.PI / 2);
  const pad = kit.mesh(pg, 'benchBlack', 'pad'); pad.position.y = padY; g.add(pad);

  // 膠帶
  const pts = roundedRect(width, padH, r, 3).map(p => [p[0], p[1] + padY, p[2], p[3]]);
  const COLORS = [['benchBlack', 0.25], ['tapeSilver', 0.3], ['benchWhite', 0.2], ['benchRed', 0.25]];
  const pick = () => { let t = rand(); for (const [c, wgt] of COLORS) { if ((t -= wgt) < 0) return c; } return 'tapeSilver'; };
  const tapeG = new THREE.Group(); tapeG.name = 'tape'; g.add(tapeG);
  for (let i = 0; i < tapes; i++) {
    const w = 0.035 + rand() * 0.05;
    const skewZ = (rand() - 0.5) * (rand() < 0.3 ? 0.9 : 0.35), skewY = (rand() - 0.5) * 0.4;
    const lim = length / 2 - w / 2 - Math.abs(skewZ) * width / 2 - Math.abs(skewY) * padH / 2 - 0.012;   // 不超出墊子兩端
    const cx = THREE.MathUtils.clamp((-0.5 + (i + 0.2 + rand() * 0.6) / tapes) * length, -lim, lim);
    const partial = rand() < 0.3;    // 三成只貼上面兩側（沒繞到底）
    const geo = tapeBand(pts, {
      cx, w, lift: 0.0008 + (i % 4) * 0.0009, skewZ, skewY, cy: padY, wob: 0.006, rand,
      keep: partial ? p => p[3] > -0.2 : null, closed: !partial,
    });
    tapeG.add(kit.mesh(geo, pick(), 'tape_' + i));
  }
  // 頂面補丁（大片紅、銀）
  for (let i = 0; i < 5; i++) {
    const slot = ['benchRed', 'tapeSilver', 'benchRed', 'benchWhite', 'tapeSilver'][i];
    const p = box(0.10 + rand() * 0.12, 0.002, 0.06 + rand() * 0.12, slot, (rand() - 0.5) * (length - 0.3), height + 0.0045 + i * 0.0006, (rand() - 0.5) * 0.08, 'patch_' + i);
    p.rotation.y = (rand() - 0.5) * 0.6; tapeG.add(p);
  }

  // 鋼架：墊下底板、中樑、兩支 T 腳（立柱＋落地橫腳）、低橫撐
  const top = height - padH;
  g.add(box(length - 0.12, 0.012, width - 0.06, 'rack', 0, top - 0.006, 0, 'board'));
  g.add(box(length - 0.3, 0.05, 0.06, 'rack', 0, top - 0.037, 0, 'spine'));
  for (const s of [-1, 1]) {
    const x = s * (length / 2 - 0.2);
    const post = box(0.06, top - 0.06, 0.06, 'rack', x, (top - 0.06) / 2 + 0.03, 0, 'post');
    post.rotation.z = s * 0.06;      // 稍微外八，像梯形腳
    g.add(post);
    g.add(box(0.07, 0.05, 0.44, 'rack', x + s * 0.012, 0.03, 0, 'foot'));
    for (const z of [-0.2, 0.2]) g.add(box(0.075, 0.012, 0.05, 'rubber', x + s * 0.012, 0.006, z, 'cap'));
    g.add(box(0.05, 0.004, 0.03, 'rackWorn', x + s * 0.02, 0.15, 0.031, 'scuff'));   // 立柱上磨掉漆
  }
  g.add(box(length - 0.44, 0.04, 0.04, 'rack', 0, 0.16, 0, 'stretcher'));
  return g;
}

/**
 * 舊鐵粉桶，裡面一團鎂粉，桶緣沾白。
 * userData.chalkTop＝手伸進去的點（群組區域座標；群組放好後用 chalkTopWorld(group) 拿世界座標），
 * 也有一個名為 'chalkTop' 的空物件跟著群組走。
 * @param {object} [o]
 * @param {number} [o.seed=3]   凹痕、粉堆起伏的亂數種子
 * @param {number} [o.fill=0.62] 粉面高度占桶高比例
 */
export function makeChalkBucket({ seed = 3, fill = 0.62 } = {}) {
  const g = new THREE.Group(); g.name = 'chalkBucket';
  const rand = kit.rng(seed);
  const H = 0.27, R0 = 0.165, R1 = 0.215, t = 0.008, SEG = 20;
  const rAt = y => R0 + (R1 - R0) * y / H;
  const prof = [[0, 0], [R0 - 0.01, 0], [R0, 0.012], [rAt(H * 0.5), H * 0.5], [R1, H], [R1 - t, H], [rAt(H * 0.5) - t, H * 0.5], [R0 - t, 0.014], [0, 0.014]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const lg = new THREE.LatheGeometry(prof, SEG);
  // 凹痕：依角度的徑向擾動（舊桶）
  const dent = [...Array(SEG + 1)].map(() => 1 + (rand() - 0.5) * 0.04);
  dent[SEG] = dent[0];
  const p = lg.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
    const a = (Math.atan2(x, z) + Math.PI * 2) % (Math.PI * 2), k = dent[Math.round(a / (Math.PI * 2) * SEG)] ;
    const kk = 1 + (k - 1) * Math.min(1, y / H * 1.5);
    p.setX(i, x * kk); p.setZ(i, z * kk);
  }
  lg.computeVertexNormals();
  g.add(kit.mesh(lg, 'bucket', 'bucket'));
  const rim = kit.mesh(new THREE.TorusGeometry(R1 - t / 2, 0.009, 4, SEG), 'bucket', 'rim');
  rim.rotation.x = Math.PI / 2; rim.position.y = H; g.add(rim);

  // 粉堆：極座標網格，中間隆起、有一個手挖過的凹
  const yS = H * fill, rIn = rAt(yS) - t - 0.002, RINGS = 4, AS = 16;
  const pos = [], idx = [];
  const dig = [0.05, 0.03];   // 挖凹的位置（x, z）
  const hAt = (x, z, ring) => {
    const d = Math.hypot(x - dig[0], z - dig[1]);
    return yS + (1 - ring / RINGS) * 0.03 - Math.max(0, 0.025 - d * 0.35) * (d < 0.07 ? 1 : 0) + (ring ? (rand() - 0.5) * 0.012 : 0);
  };
  pos.push(0, hAt(0, 0, 0), 0);
  for (let ri = 1; ri <= RINGS; ri++) for (let a = 0; a < AS; a++) {
    const ang = a / AS * Math.PI * 2, rr = rIn * ri / RINGS, x = Math.sin(ang) * rr, z = Math.cos(ang) * rr;
    pos.push(x, ri === RINGS ? yS + (rand() - 0.3) * 0.01 : hAt(x, z, ri), z);
  }
  const id = (ri, a) => ri === 0 ? 0 : 1 + (ri - 1) * AS + (a % AS);
  for (let a = 0; a < AS; a++) idx.push(0, id(1, a), id(1, a + 1));
  for (let ri = 1; ri < RINGS; ri++) for (let a = 0; a < AS; a++) {
    idx.push(id(ri, a), id(ri + 1, a), id(ri + 1, a + 1), id(ri, a), id(ri + 1, a + 1), id(ri, a + 1));
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cg.setIndex(idx); cg.computeVertexNormals();
  g.add(kit.mesh(cg, 'chalk', 'chalkPile'));
  // 粉塊
  for (let i = 0; i < 5; i++) {
    const a = rand() * Math.PI * 2, rr = rand() * rIn * 0.7;
    const lump = kit.mesh(new THREE.IcosahedronGeometry(0.018 + rand() * 0.015, 0), 'chalk', 'lump');
    lump.position.set(Math.sin(a) * rr, yS + 0.02, Math.cos(a) * rr);
    lump.scale.y = 0.6; lump.rotation.set(rand() * 3, rand() * 3, 0); g.add(lump);
  }
  // 桶緣、桶外沾白
  for (let i = 0; i < 4; i++) {
    const arc = kit.mesh(new THREE.TorusGeometry(R1 - t / 2, 0.0105, 4, 5, 0.3 + rand() * 0.7), 'chalk', 'rimChalk');
    arc.rotation.set(Math.PI / 2, 0, rand() * Math.PI * 2); arc.position.y = H; g.add(arc);
  }
  for (let i = 0; i < 7; i++) {
    const a = rand() * Math.PI * 2, y = H * (0.45 + rand() * 0.5), rr = rAt(y) + 0.001;
    const s = kit.mesh(new THREE.CircleGeometry(0.012 + rand() * 0.02, 6), 'chalk', 'smear');
    const slope = (R1 - R0) / H;   // 桶壁外法線（錐面）
    s.position.set(Math.sin(a) * (rr + 0.0015), y, Math.cos(a) * (rr + 0.0015));
    s.lookAt(s.position.x + Math.sin(a), y - slope, s.position.z + Math.cos(a));
    s.scale.set(0.5 + rand() * 0.4, 1.0 + rand() * 1.0, 1);   // 往下流的痕
    g.add(s);
  }
  const top = new THREE.Vector3(dig[0], yS + 0.01, dig[1]);
  g.userData.chalkTop = top.clone();
  const anchor = new THREE.Object3D(); anchor.name = 'chalkTop'; anchor.position.copy(top); g.add(anchor);
  return g;
}

/** 粉桶的「手伸進去的點」世界座標（群組已放進場景、矩陣已更新） */
export function chalkTopWorld(bucket, target = new THREE.Vector3()) {
  bucket.updateWorldMatrix(true, false);
  return target.copy(bucket.userData.chalkTop).applyMatrix4(bucket.matrixWorld);
}

/**
 * 皺毛巾：搭在一條水平邊上（邊沿 X），前面垂下、上面平躺、後面可再垂一段。
 * 原點＝掛住的那條邊的頂點（放到箱角或桶緣上即可）；前面朝 +Z。
 * @param {object} [o]
 * @param {number} [o.seed=5]     皺褶亂數種子
 * @param {number} [o.width=0.34] 毛巾寬（m）
 * @param {number} [o.top=0.18]   平躺在面上的長度（m）
 * @param {number} [o.drop=0.32]  前面垂下的長度（m）
 * @param {number} [o.back=0]     後面垂下的長度（掛在桶緣時用，m）
 */
export function makeTowel({ seed = 5, width = 0.34, top = 0.18, drop = 0.32, back = 0 } = {}) {
  const rand = kit.rng(seed);
  // 截面路徑（z, y）：後垂 → 平躺 → 過邊 → 前垂
  const c = [];
  if (back > 0) c.push([-top - 0.03, -back], [-top - 0.02, -back * 0.5], [-top - 0.012, -0.01]);
  c.push([-top, 0.006], [-top * 0.5, 0.009], [-0.03, 0.008], [0, 0.004], [0.015, -0.02], [0.022, -drop * 0.4], [0.03, -drop * 0.75], [0.05, -drop]);
  const curve = new THREE.CatmullRomCurve3(c.map(([z, y]) => new THREE.Vector3(0, y, z)), false, 'centripetal');
  const NV = 26, NU = 10, L = curve.getSpacedPoints(NV);
  // 皺褶：沿長度的幾道波，各有相位
  const waves = [...Array(3)].map(() => [3 + rand() * 6, rand() * 6, 0.004 + rand() * 0.008]);
  const pos = [], idx = [];
  const T = 0.004;   // 厚度
  for (let layer = 0; layer < 2; layer++) {
    for (let v = 0; v <= NV; v++) {
      const P = L[v], Pn = L[Math.min(NV, v + 1)], Pp = L[Math.max(0, v - 1)];
      const tan = Pn.clone().sub(Pp).normalize(), nrm = new THREE.Vector3(0, tan.z, -tan.y);   // 截面法線（朝外）
      const hang = Math.max(0, -P.y) / (drop + 0.001);   // 越往下越亂
      for (let u = 0; u <= NU; u++) {
        const s = u / NU - 0.5;
        let off = 0;
        for (const [f, ph, a] of waves) off += Math.sin(s * f * Math.PI + ph + v * 0.25) * a * (0.5 + hang * 1.6);
        off += (rand() - 0.5) * 0.003;
        const flare = 1 + hang * 0.12 * Math.abs(s) * 2;
        const x = s * width * flare + Math.sin(v * 0.4 + waves[0][1]) * 0.008 * hang;
        const lo = layer ? -T : 0;
        pos.push(x, P.y + nrm.y * (off + lo), P.z + nrm.z * (off + lo));
      }
    }
  }
  const row = NU + 1, half = row * (NV + 1);
  for (let v = 0; v < NV; v++) for (let u = 0; u < NU; u++) {
    const a = v * row + u, b = a + 1, cc = a + row, d = cc + 1;
    idx.push(a, cc, b, b, cc, d);                                  // 外層
    idx.push(half + a, half + b, half + cc, half + b, half + d, half + cc);   // 內層（反向）
  }
  for (let v = 0; v < NV; v++) {   // 兩側收邊
    for (const u of [0, NU]) {
      const a = v * row + u, cc = a + row, flip = u === 0;
      const q = [a, cc, half + cc, a, half + cc, half + a];
      if (flip) idx.push(q[0], q[2], q[1], q[3], q[5], q[4]); else idx.push(...q);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const g = new THREE.Group(); g.name = 'towel';
  g.add(kit.mesh(geo, 'towel', 'towelCloth'));
  return g;
}

/**
 * 運動水壺（不鏽鋼身＋黑蓋提把）。原點＝底部中心，選手拿起時直接拿這個群組。
 * @param {object} [o]
 * @param {number} [o.height=0.26] 總高（m）
 * @param {number} [o.radius=0.037] 瓶身半徑（m）
 */
export function makeBottle({ height = 0.26, radius = 0.037 } = {}) {
  const g = new THREE.Group(); g.name = 'bottle';
  const bh = height - 0.045, r = radius;
  const prof = [[0, 0], [r - 0.004, 0], [r, 0.005], [r, bh * 0.82], [r * 0.82, bh * 0.94], [r * 0.62, bh], [0, bh]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  g.add(kit.mesh(new THREE.LatheGeometry(prof, 16), 'bottle', 'bottle_body'));
  const cap = kit.mesh(new THREE.CylinderGeometry(r * 0.66, r * 0.68, 0.032, 16), 'rack', 'bottle_cap');
  cap.position.y = bh + 0.016; g.add(cap);
  const spout = kit.mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.014, 8), 'rack', 'bottle_spout');
  spout.position.set(0, bh + 0.039, -0.008); g.add(spout);
  const loop = kit.mesh(new THREE.TorusGeometry(0.014, 0.0035, 4, 8, Math.PI), 'rack', 'bottle_loop');
  loop.position.set(0, bh + 0.03, 0.012); g.add(loop);
  const band = kit.mesh(new THREE.CylinderGeometry(r + 0.0012, r + 0.0012, 0.025, 16, 1, true), 'steelDark', 'bottle_band');
  band.position.y = bh * 0.55; g.add(band);
  return g;
}

/**
 * 舊木箱：板條拼的箱子，四角鐵包角。寬 0.5（X）×高 0.45（Y）×深 0.4（Z）。
 * @param {object} [o]
 * @param {number} [o.seed=11]  板條歪斜的亂數種子
 * @param {number} [o.w=0.5]  寬（m）
 * @param {number} [o.h=0.45] 高（m）
 * @param {number} [o.d=0.4]  深（m）
 */
export function makeCrate({ seed = 11, w = 0.5, h = 0.45, d = 0.4 } = {}) {
  const g = new THREE.Group(); g.name = 'crate';
  const rand = kit.rng(seed), post = 0.045, th = 0.018, N = 3, gap = 0.012;
  const sl = (h - gap * (N - 1)) / N;
  for (const s of [-1, 1]) for (let i = 0; i < N; i++) {
    const y = sl / 2 + i * (sl + gap);
    const a = box(w - 0.004, sl, th, 'crate', 0, y, s * (d / 2 - th / 2), 'slat');
    a.rotation.z = (rand() - 0.5) * 0.012; g.add(a);
    const b = box(th, sl, d - 2 * th, 'crate', s * (w / 2 - th / 2), y, 0, 'slat');
    b.rotation.x = (rand() - 0.5) * 0.012; g.add(b);
  }
  const tl = (d - gap * 3) / 4;
  for (let i = 0; i < 4; i++) {    // 蓋板
    const a = box(w + 0.01, th, tl, 'crate', (rand() - 0.5) * 0.01, h + th / 2, -d / 2 + tl / 2 + i * (tl + gap), 'lid');
    a.rotation.y = (rand() - 0.5) * 0.02; g.add(a);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(box(post, h, post, 'crate', sx * (w / 2 - post / 2 - th), h / 2, sz * (d / 2 - post / 2 - th), 'post'));
    // 包角鐵（上下兩片 L 形，用兩片薄板拼）
    for (const y of [0.04, h - 0.03]) {
      g.add(box(0.07, 0.06, 0.003, 'steelDark', sx * (w / 2 - 0.035), y, sz * (d / 2 + 0.0015), 'corner'));
      g.add(box(0.003, 0.06, 0.07, 'steelDark', sx * (w / 2 + 0.0015), y, sz * (d / 2 - 0.035), 'corner'));
    }
  }
  return g;
}

const LAMP_SLOT = { white: 'lampWhite', red: 'lampRed' };

/**
 * 比賽裁判燈：三個小燈箱並排在橫桿上、立在矮架上，燈面朝 +Z。
 * 燈面 mesh 名稱 lamp_0..2（左到右，從正面看），用 setLights() 切換。
 * @param {object} [o]
 * @param {number} [o.lampR=0.06]  燈面半徑（m）
 * @param {number} [o.height=0.72] 燈心離地高（m）
 * @param {Array}  [o.lights=[null,null,null]] 初始狀態
 */
export function makeJudgeLights({ lampR = 0.06, height = 0.72, lights = [null, null, null] } = {}) {
  const g = new THREE.Group(); g.name = 'judgeLights';
  const bw = 0.17, bh = 0.17, bd = 0.11, pitch = 0.185;
  const barY = height - bh / 2 - 0.015;
  // 矮架：底座、兩支立柱、上橫桿
  g.add(box(0.62, 0.025, 0.28, 'lampBox', 0, 0.0125, 0, 'base'));
  for (const s of [-1, 1]) g.add(box(0.035, barY - 0.025, 0.035, 'lampBox', s * 0.24, (barY + 0.025) / 2, 0, 'leg'));
  g.add(box(0.6, 0.03, 0.06, 'lampBox', 0, barY, 0, 'bar'));
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * pitch;
    g.add(box(bw, bh, bd, 'lampBox', x, height, 0, 'housing_' + i));
    // 遮光罩（上半圈）＋燈圈
    const hg = new THREE.CylinderGeometry(lampR + 0.012, lampR + 0.012, 0.035, 12, 1, true, Math.PI / 2, Math.PI);
    const hi = hg.clone().scale(0.97, -1, 0.97); hi.computeVertexNormals();   // 內壁（翻面）
    for (const geo of [hg, hi]) {
      geo.rotateX(Math.PI / 2);
      const hood = kit.mesh(geo, 'lampBox', 'hood_' + i);
      hood.position.set(x, height, bd / 2 + 0.0175); g.add(hood);
    }
    const ring = kit.mesh(new THREE.TorusGeometry(lampR + 0.004, 0.005, 4, 20), 'steelDark', 'bezel_' + i);
    ring.position.set(x, height, bd / 2 + 0.003); g.add(ring);
    const lamp = kit.mesh(new THREE.CircleGeometry(lampR, 20), 'lampOff', 'lamp_' + i);
    lamp.position.set(x, height, bd / 2 + 0.002); g.add(lamp);
  }
  // 背後的電線盒
  g.add(box(0.12, 0.05, 0.05, 'lampBox', 0, barY - 0.04, -0.01, 'junction'));
  setLights(g, lights);
  return g;
}

/**
 * 切換裁判燈：states＝三格，各為 'white' | 'red' | null（暗）。
 * 換燈面 mesh 的材質槽（lampWhite／lampRed／lampOff），同步 userData.slot。
 */
export function setLights(group, states) {
  for (let i = 0; i < 3; i++) {
    const m = group.getObjectByName('lamp_' + i);
    if (!m) continue;
    const slot = LAMP_SLOT[states[i]] || 'lampOff';
    m.material = kit.material(slot); m.userData.slot = slot;
  }
  group.userData.lights = states.slice();
}

export const items = {
  bench:       { build: () => makeBench({ seed: 7 }), note: '平板凳 1.2×0.30、高 0.43，布膠帶' },
  chalkBucket: { build: () => makeChalkBucket(), note: '舊鐵粉桶＋鎂粉；userData.chalkTop' },
  towel:       { build: () => { const t = makeTowel({ seed: 5 }); t.position.y = 0.32; return t; }, note: '搭邊皺毛巾（示範抬高到地面）' },
  bottle:      { build: () => makeBottle(), note: '運動水壺，原點底部' },
  crate:       { build: () => makeCrate(), note: '舊木箱 0.5×0.45×0.4' },
  judgeLights: { build: () => makeJudgeLights({ lights: ['white', 'white', 'red'] }), note: '裁判燈 白白紅' },
};
