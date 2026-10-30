// 背景件：吊扇（疊在看板吊扇位置上轉）、白板字（canvas 貼圖，比賽倒數＋今日正字）
import * as THREE from '../vendor/three.module.min.js';
import * as kit from '../lib/kit.js';

// ───────────────────────── 吊扇 ─────────────────────────

/**
 * 老式吊扇。原點＝吊桿頂端（天花板），往 -y 垂下。
 * 會動的部件：Group `blades`（繞自己的 y 軸轉，每幀 blades.rotation.y += ω·dt）。
 * @param {object} [o]
 * @param {number} [o.rod=0.32]      吊桿長（m，頂端到馬達殼頂）
 * @param {number} [o.diameter=1.3]  扇葉直徑（m，葉尖到葉尖）
 * @param {number} [o.blades=5]      扇葉數
 * @param {number} [o.pitch=12]      扇葉傾角（度）
 * @param {number} [o.droop=4]       扇葉下垂角（度，舊扇常見）
 * @param {number} [o.seed=3]        亂數種子（各片角度的小誤差）
 */
export function makeFan(o = {}) {
  const { rod = 0.32, diameter = 1.3, blades: nBlades = 5, pitch = 12, droop = 4, seed = 3 } = o;
  const R = kit.rng(seed);
  const g = new THREE.Group();
  g.name = 'fan';

  // 天花板吊碗
  const canopy = kit.mesh(new THREE.CylinderGeometry(0.045, 0.075, 0.07, 16, 1), 'fan', 'canopy');
  canopy.position.y = -0.035;
  g.add(canopy);
  // 吊桿
  const rodM = kit.mesh(new THREE.CylinderGeometry(0.012, 0.012, rod, 8, 1, true), 'steelDark', 'rod');
  rodM.position.y = -rod / 2;
  g.add(rodM);

  // 馬達殼：車床旋轉體（上小下大，中間一道腰線）
  const prof = [
    [0.0, 0.0], [0.03, 0.0], [0.035, -0.02], [0.09, -0.045], [0.115, -0.075], [0.118, -0.09],
    [0.11, -0.095], [0.115, -0.11], [0.105, -0.135], [0.06, -0.155], [0.03, -0.16], [0.0, -0.165],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const motor = kit.mesh(new THREE.LatheGeometry(prof, 20), 'fan', 'motor');
  motor.position.y = -rod;
  g.add(motor);

  // 扇葉樞紐
  const blades = new THREE.Group();
  blades.name = 'blades';
  blades.position.y = -rod - 0.11;
  g.add(blades);

  const tipR = diameter / 2, rootR = 0.17;           // 葉根距中心 0.17 m（中間是鐵臂）
  const len = tipR - rootR;
  // 扇葉平面形：葉根窄、葉尖寬、尖端圓弧（在 XZ 平面，沿 +X 長出去）
  const sh = new THREE.Shape();
  const w0 = 0.055, w1 = 0.075;
  sh.moveTo(0, -w0);
  sh.lineTo(len - w1, -w1);
  sh.absarc(len - w1, 0, w1, -Math.PI / 2, Math.PI / 2, false);
  sh.lineTo(0, w0);
  sh.lineTo(0, -w0);
  const bladeGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.008, bevelEnabled: false, curveSegments: 6 });
  bladeGeo.rotateX(-Math.PI / 2);                     // 平躺（厚度朝 +y）
  bladeGeo.translate(0, -0.004, 0);
  // 鐵臂：從馬達到葉根，一條扁鐵
  const armGeo = new THREE.BoxGeometry(rootR + 0.07, 0.01, 0.03);
  armGeo.translate((rootR + 0.07) / 2 + 0.06, 0.012, 0);

  for (let i = 0; i < nBlades; i++) {
    const arm = new THREE.Group();
    arm.rotation.y = (i / nBlades) * Math.PI * 2 + (R() - 0.5) * 0.03;
    const iron = kit.mesh(armGeo, 'steelDark', 'bladeIron' + i);
    arm.add(iron);
    const tilt = new THREE.Group();                    // 葉根位置：先下垂、再繞長軸扭傾角
    tilt.position.x = rootR;
    tilt.rotation.z = -THREE.MathUtils.degToRad(droop + (R() - 0.5) * 1.5);
    const b = kit.mesh(bladeGeo, 'wood', 'blade' + i);
    b.rotation.x = THREE.MathUtils.degToRad(pitch);
    tilt.add(b);
    arm.add(tilt);
    blades.add(arm);
  }
  // 底蓋（轉的那一節）
  const cap = kit.mesh(new THREE.CylinderGeometry(0.07, 0.04, 0.04, 16, 1), 'fan', 'cap');
  cap.position.y = -0.02;
  blades.add(cap);

  return g;
}

// ───────────────────────── 白板字 ─────────────────────────

const INK = { black: '#1d1d22', blue: '#1f3f9a', red: '#b8231c' };
export const FONT = '"Segoe Print", "Comic Sans MS", "Bradley Hand", cursive';

/** 'YYYY-MM-DD' 或 Date → 當地日期的天數序號（只看年月日） */
function dayNum(d) {
  if (!d) return null;
  if (typeof d === 'string') {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(d);
    if (!m) return null;
    return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5;
  }
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5;
}

/** 倒數字串：D-43、比賽當天 MEET DAY!、比賽過了 D+3、沒日期 D-?? */
export function meetLabel(meetDate, today = new Date()) {
  const a = dayNum(meetDate), b = dayNum(today);
  if (a == null || b == null) return 'MEET D-??';
  const n = Math.round(a - b);
  if (n === 0) return 'MEET DAY!';
  return n > 0 ? `MEET D-${n}` : `MEET D+${-n}`;
}

// 一行手寫字：逐字抖動（旋轉、上下、大小），整行略歪
export function handText(ctx, R, text, x, y, size, color, o = {}) {
  const { slope = (R() - 0.5) * 0.05, jitter = 1 } = o;
  ctx.save();
  const a0 = ctx.globalAlpha;
  ctx.translate(x, y);
  ctx.rotate(slope);
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  let cx = 0;
  for (const ch of text) {
    const s = size * (1 + (R() - 0.5) * 0.1 * jitter);
    ctx.font = `bold ${s.toFixed(1)}px ${FONT}`;
    const w = ctx.measureText(ch).width;
    ctx.save();
    ctx.translate(cx + w / 2, (R() - 0.5) * size * 0.08 * jitter);
    ctx.rotate((R() - 0.5) * 0.12 * jitter);
    ctx.fillText(ch, -w / 2, 0);
    // 白板筆的筆鋒：同字偏一點再描一次，邊緣不會太乾淨
    ctx.globalAlpha = a0 * 0.35;
    ctx.fillText(ch, -w / 2 + 0.8, 0.6);
    ctx.globalAlpha = a0;
    ctx.restore();
    cx += w * (0.9 + R() * 0.06) + (ch === ' ' ? size * 0.1 : 0);
  }
  ctx.restore();
  return cx;
}

// 一筆：兩點之間抖動的折線，頭尾略粗（下筆、收筆）
function stroke(ctx, R, x0, y0, x1, y1, width, color) {
  const n = 6, pts = [];
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
  const bow = (R() - 0.5) * L * 0.06;               // 整筆微彎
  for (let i = 0; i <= n; i++) {
    const t = i / n, k = Math.sin(t * Math.PI) * bow + (R() - 0.5) * 1.6;
    pts.push([x0 + dx * t + nx * k, y0 + dy * t + ny * k]);
  }
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = width;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  ctx.fillStyle = color;                             // 下筆的墨點
  ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], width * 0.62, 0, 7); ctx.fill();
}

// 一個「正」字的前 k 筆（1–5），s＝字框邊長，左上角 (x, y)
// 筆順：上橫、中豎、右短橫、左短豎、下橫
function zheng(ctx, R, x, y, s, k, width, color) {
  const j = () => (R() - 0.5) * s * 0.08;
  const top = y + s * 0.08, mid = y + s * 0.5, bot = y + s * 0.92;
  const cx = x + s * 0.5;
  const S = [
    () => stroke(ctx, R, x + s * 0.12 + j(), top + j(), x + s * 0.88 + j(), top + j() - s * 0.03, width, color),
    () => stroke(ctx, R, cx + j(), top + j(), cx + j(), bot + j() * 0.5, width, color),
    () => stroke(ctx, R, cx + j() * 0.5, mid + j(), x + s * 0.76 + j(), mid + j() - s * 0.02, width, color),
    () => stroke(ctx, R, x + s * 0.24 + j(), mid - s * 0.06 + j(), x + s * 0.24 + j() * 0.5, bot + j() * 0.5, width, color),
    () => stroke(ctx, R, x + s * 0.04 + j(), bot + j() * 0.5, x + s * 0.96 + j(), bot + j() * 0.5 - s * 0.02, width, color),
  ];
  for (let i = 0; i < k; i++) S[i]();
}

/**
 * 在 canvas 上畫白板內容（會先清掉）。
 * @param {HTMLCanvasElement} cv
 * @param {object} data
 * @param {string|Date} [data.meetDate]  比賽日 'YYYY-MM-DD'；沒給 → MEET D-??
 * @param {string|Date} [data.today]     今天（預設現在）
 * @param {number} [data.tally=0]        今日完成次數（正字筆數）
 * @param {string[]} [data.lines=[]]     右欄幾行，如 'SQ 200'
 * @param {boolean} [data.board=false]   true＝畫白板底色（單獨示範用）；false＝只畫墨水、透明底（疊在看板白板上）
 * @param {number} [data.seed=7]         筆跡亂數種子（同資料同筆跡）
 */
function paint(cv, data = {}) {
  const { meetDate, today = new Date(), tally = 0, lines = [], board = false, seed = 7 } = data;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, u = W / 1024;    // 以 1024 寬為基準
  const R = kit.rng(seed);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.scale(u, u);
  const H0 = H / u;

  if (board) {
    const gr = ctx.createLinearGradient(0, 0, 1024, H0);
    gr.addColorStop(0, '#efece6'); gr.addColorStop(1, '#ddd8cf');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, 1024, H0);
  }
  // 擦痕：沒擦乾淨的舊字（很淡）＋板擦抹過的灰帶
  ctx.save();
  ctx.globalAlpha = board ? 0.1 : 0.07;
  handText(ctx, R, 'SQ 190', 600, 520, 70, '#555');
  handText(ctx, R, 'D-50', 120, 600, 60, '#555');
  ctx.restore();
  for (let i = 0; i < 6; i++) {
    ctx.save();
    ctx.globalAlpha = 0.035 + R() * 0.03;
    ctx.translate(R() * 1024, 40 + R() * (H0 - 80));
    ctx.rotate((R() - 0.5) * 0.5);
    ctx.fillStyle = '#6a6460';
    ctx.beginPath(); ctx.ellipse(0, 0, 90 + R() * 120, 10 + R() * 14, 0, 0, 7); ctx.fill();
    ctx.restore();
  }

  // 墨水畫在另一層，再刮出白板筆快沒水的乾擦紋
  const ink = document.createElement('canvas');
  ink.width = 1024; ink.height = Math.ceil(H0);
  const k = ink.getContext('2d');

  // 第一行：MEET D-xx（紅）
  handText(k, R, meetLabel(meetDate, today), 48, 128, 104, INK.red, { slope: -0.025 });
  stroke(k, R, 52, 160, 560, 150, 6, INK.red);       // 底線

  // 今日正字（黑）
  handText(k, R, 'TODAY', 56, 250, 46, INK.black, { slope: -0.01 });
  const n = Math.max(0, Math.floor(tally)), groups = Math.ceil(n / 5);
  // 8 個正字（40 筆）以內用大字一排 4 個；更多就縮小一排 6 個（最多 3 排＝90 筆，再多就疊著寫）
  const big = groups <= 8;
  const s = big ? 118 : 78, gap = big ? 30 : 22, perRow = big ? 4 : 6, rowH = big ? 150 : 104, ox = 60, oy = 280;
  for (let i = 0; i < groups; i++) {
    const row = Math.floor(i / perRow) % (big ? 2 : 3), col = i % perRow;
    zheng(k, R, ox + col * (s + gap) + (R() - 0.5) * 8, oy + row * rowH + (R() - 0.5) * 8 + col * 3,
      s, Math.min(5, n - i * 5), big ? 11 : 8, INK.black);
  }
  if (n === 0) handText(k, R, '—', ox + 10, oy + 70, 70, INK.black);

  // 右欄（藍）
  lines.slice(0, 5).forEach((t, i) => {
    handText(k, R, t, 700 + (R() - 0.5) * 14, 250 + i * 82, 64, INK.blue, { slope: (R() - 0.5) * 0.06 });
  });

  // 乾擦紋：水平細線挖掉一點墨
  k.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 260; i++) {
    k.globalAlpha = 0.15 + R() * 0.3;
    k.fillRect(R() * 1024, R() * H0, 8 + R() * 40, 1 + R() * 1.2);
  }
  k.globalCompositeOperation = 'source-over';
  k.globalAlpha = 1;

  ctx.globalAlpha = 0.93;
  ctx.drawImage(ink, 0, 0);
  ctx.restore();
}

/**
 * 白板字貼圖。
 * @param {object} data  同 drawWhiteboard 的 data（meetDate, today, tally, lines, board, seed）
 * @param {number} [w=1024] canvas 寬
 * @param {number} [h=640]  canvas 高
 * @returns {THREE.CanvasTexture}  texture.userData.data 存最後一次畫的資料
 */
export function makeWhiteboardTexture(data = {}, w = 1024, h = 640) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  drawWhiteboard(tex, data);
  return tex;
}

/**
 * 重畫白板（收尾加一筆正字、隔天歸零、倒數換日時呼叫）。
 * @param {THREE.CanvasTexture} texture  makeWhiteboardTexture 回傳的貼圖
 * @param {object} data  新資料；沒給的欄位沿用上一次
 */
export function drawWhiteboard(texture, data = {}) {
  const d = { ...(texture.userData.data || {}), ...data };
  paint(texture.image, d);
  texture.userData.data = d;
  texture.needsUpdate = true;
  return texture;
}

// ───────────────────────── 檢視項目 ─────────────────────────

const DEMO = { meetDate: '2026-12-12', today: '2026-10-30', tally: 13, lines: ['SQ 200', 'BP 130', 'DL 240'] };

function whiteboardDemo() {
  const g = new THREE.Group();
  g.name = 'whiteboard';
  const W = 1.6, H = 1.0, y0 = 0.9;                  // 掛在牆上的高度（示範用）
  const tex = makeWhiteboardTexture({ ...DEMO, board: true });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex }));
  board.name = 'board';
  board.userData.slot = 'whiteboardInk';             // 階段 4：發光／不受光的貼圖槽
  board.position.y = y0 + H / 2;
  g.add(board);
  // 鋁框＋筆槽
  const f = 0.025;
  for (const [w, h, x, y] of [[W + 2 * f, f, 0, y0 + H + f / 2], [W + 2 * f, f, 0, y0 - f / 2], [f, H, -W / 2 - f / 2, y0 + H / 2], [f, H, W / 2 + f / 2, y0 + H / 2]]) {
    const m = kit.mesh(new THREE.BoxGeometry(w, h, 0.02), 'steel');
    m.position.set(x, y, 0);
    g.add(m);
  }
  const tray = kit.mesh(new THREE.BoxGeometry(W * 0.9, 0.012, 0.06), 'steel', 'tray');
  tray.position.set(0, y0 - f - 0.006, 0.03);
  g.add(tray);
  // 牆腳標記（讓格線看得出離地高度）
  const post = kit.mesh(new THREE.BoxGeometry(0.02, y0 - f, 0.02), 'steelDark');
  post.position.set(-W / 2, (y0 - f) / 2, -0.02);
  g.add(post);
  return g;
}

export const items = {
  fan: { build: () => makeFan(), note: '吊扇：原點在吊桿頂端；Group blades 繞 y 轉' },
  whiteboard: { build: whiteboardDemo, note: 'canvas 白板字示範（MEET D-43、正字 13 筆）' },
};
