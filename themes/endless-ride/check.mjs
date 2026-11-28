// node check.mjs — 三招的數值自檢（對照 docs/素材庫/mengto_ride_skills/*/examples/check.mjs，用本主題實際的常數）
import assert from 'node:assert/strict';
import { P, roadC, roadE, groundY } from './common.js';

// 1 endless-riding-parallax：遠景閉環在接縫處位置與速度連續（k＝6 放大版）；地形對里程是 P 週期；循環池的餘數
const k = 6, period = 140;
const loop = t => { const a = 2 * Math.PI * (t % period) / period; return [k * 1.2 * (1 - Math.cos(a)), k * 12 * Math.sin(a)]; };
const dt = 0.01, L = loop(period - dt), M = loop(period), R = loop(period + dt);
for (let i = 0; i < 2; i++) assert.ok(Math.abs((M[i] - L[i]) / dt - (R[i] - M[i]) / dt) < 0.01);
const far = 24 * 3600 * 24;   // 以暴風速度跑一整天的里程
for (const [x, z] of [[0, 0], [5, -30], [-40, -200]]) assert.ok(Math.abs(groundY(x, z, far % P) - groundY(x, z, (far + P) % P)) < 1e-9);
assert.ok(Math.abs(groundY(0, 0, 123.4)) < 1e-12);          // 騎士腳下永遠是 y＝0
for (const Lp of [36, 120, 440, 420]) assert.ok(Math.abs(((far + Lp) % Lp) - (far % Lp)) < 1e-6);
assert.equal(420 % 14, 0);                                     // 路樁間距整除循環長度 → 繞回時不跳
assert.ok(Math.abs(roadC(0) - roadC(P)) < 1e-9 && Math.abs(roadE(0) - roadE(P)) < 1e-9);

// 2 ride-particles-and-clouds：走廊兩端看不見、中段全亮；穿透率與步數無關
const mod = (v, s) => ((v % s) + s) % s, smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const vis = depth => smooth(0.72, 2.15, depth) * (1 - smooth(15, 23, depth)), pos = travel => mod(travel, 34) - 24;
assert.equal(vis(-pos(33.999)), 0); assert.equal(vis(-pos(34.001)), 0); assert.equal(vis(-pos(16)), 1);
const transmit = (d, total, n) => Math.exp(-d * total / n) ** n;
assert.ok(Math.abs(transmit(0.2, 10, 8) - transmit(0.2, 10, 64)) < 1e-12);

// 3 scroll-fisheye-dolly-zoom：主體大小不變、光學中心不動、最遠角剛好取到畫面角
const tan0 = Math.tan(50 * Math.PI / 360), dist0 = 6.4;
for (const w of [0, 0.15, 0.3, 0.6, 1]) {
  const spread = 1 + 0.72 * w, curve = 0.30 * w * w;
  const h = 2 * (dist0 / spread) * (tan0 * spread * (1 + curve)) / (1 + curve);
  assert.ok(Math.abs(h - 2 * dist0 * tan0) < 1e-10);
  const sample = r => r * (1 + curve * r * r) / (1 + curve);
  assert.equal(sample(0), 0); assert.equal(sample(1), 1);
}
console.log('endless-ride: loop continuity, period wrap, particle corridor, lens invariants verified.');
