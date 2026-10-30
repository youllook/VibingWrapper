// 白板字（直式）：gym4 的白板只露出左邊一條（右緣被畫面切掉），照目標圖的寫法——
// 比賽倒數一行、三項＋總和四行、底下是今天完成次數的劃記（卌：四直一斜）
import * as THREE from '../vendor/three.module.min.js';
import { handText, meetLabel } from './fx.js';
import { rng } from '../lib/kit.js';

const INK = { black: '#1d1d22', red: '#b8231c' };

function tallyGroup(k, R, x, y, h, n) {
  k.strokeStyle = INK.black; k.lineCap = 'round'; k.lineWidth = 7;
  const gap = h * 0.22;
  for (let i = 0; i < Math.min(n, 4); i++) {
    const xi = x + i * gap + (R() - 0.5) * 4;
    k.beginPath(); k.moveTo(xi, y + (R() - 0.5) * 6); k.lineTo(xi + (R() - 0.5) * 6, y + h + (R() - 0.5) * 6); k.stroke();
  }
  if (n >= 5) { k.beginPath(); k.moveTo(x - gap * 0.6, y + h * 0.75); k.lineTo(x + gap * 3.6, y + h * 0.25); k.stroke(); }
}

function paint(cv, { meetDate, today = new Date(), tally = 0, lines = [], seed = 7 }) {
  const k = cv.getContext('2d'), R = rng(seed), W = cv.width;
  k.clearRect(0, 0, cv.width, cv.height);
  handText(k, R, meetLabel(meetDate, today), 40, 120, 70, INK.red, { slope: -0.03 });
  lines.slice(0, 4).forEach((t, i) => handText(k, R, t, 40, 250 + i * 118, 64, INK.black, { slope: -0.05 + (R() - 0.5) * 0.03 }));
  // 劃記：一排 3 組，最多 3 排（45 筆）
  const n = Math.max(0, Math.floor(tally)), groups = Math.ceil(n / 5), h = 90, gw = 128;
  for (let i = 0; i < Math.min(groups, 9); i++) {
    const row = Math.floor(i / 3), col = i % 3;
    tallyGroup(k, R, 50 + col * gw, 770 + row * 120 + col * -4, h, Math.min(5, n - i * 5));
  }
  if (!n) handText(k, R, '—', 50, 840, 70, INK.black);
}

/** 白板墨水貼圖（透明底）。data：meetDate、tally、lines */
export function makeBoardInk(data, w = 512, h = 1100) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return drawBoard(tex, data);
}
export function drawBoard(tex, data = {}) {
  const d = { ...(tex.userData.data || {}), ...data };
  paint(tex.image, d); tex.userData.data = d; tex.needsUpdate = true;
  return tex;
}
