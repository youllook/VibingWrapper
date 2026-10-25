/* =====================================================================================
 * 大海怪 fish schools — stage 2 boids prototype (docs/研究筆記/11_魚群逃散.md), 2026-10-26
 *
 * Plain JS, no three.js: index.html steps it and draws the result.
 *  - Schooling: Couzin's three zones (2002). Repulsion beats everything; otherwise turn toward the mean heading of
 *    the orientation zone plus the directions to the attraction zone. A blind cone behind. The width of the
 *    orientation zone gives the shape, one number per school: narrow = a milling ball, medium = a torus (ring),
 *    wide = a polarised band. Neighbours: a uniform grid, then the nearest ~7 (topological), so a school that
 *    stretches out doesn't snap apart.
 *  - Escape: a C-start — the heading jumps in one step to "away from the threat, turned 30° toward its rear"
 *    (Weihs & Webb 1984; Bartashevich 2024), speed ×4 falling back to ×1.5 over 1.5 s. Only fish within a couple of
 *    body lengths of the threat's edge react by themselves; the rest catch it from a neighbour that just bolted,
 *    2–4 frames later (Herbert-Read 2015): that is the startle wave. Fountain / flash-expansion shapes emerge from
 *    these rules; nothing scripts them.
 *  - The turn itself shows: a fish turning hard flashes its flank (`flash`), so the wave reads from above.
 * Units are the theme's world units (screen height at zoom 1 = 1).
 * ===================================================================================== */
export const BL = 0.014;                         // body length

// one school = one orientation-zone width (in body lengths). zr repulsion radius, dzo / dza the zone widths,
// speed cruise in BL/s, goal how hard it heads for its target, turn max turning rate rad/s, R how loose it sits
export const SHAPES = {
  ball:    { zr: 1.0, dzo: 0.5, dza: 6,  speed: 2.2, goal: 0.55, turn: 2.6, R: 0.5 },
  ring:    { zr: 1.0, dzo: 1.8, dza: 12, speed: 2.8, goal: 0.40, turn: 1.6, R: 0.75 },
  band:    { zr: 1.0, dzo: 9,   dza: 12, speed: 4.5, goal: 0.45, turn: 2.0, R: 0.9 },
  scatter: { zr: 2.4, dzo: 0.8, dza: 4,  speed: 1.8, goal: 0.55, turn: 2.6, R: 1.3 },
};
const BLIND = Math.cos(150 * Math.PI / 180);   // 60° blind cone behind
const K_NEAR = 7;
const ESC_ANGLE = 30 * Math.PI / 180;
const rnd = (a, b) => a + Math.random() * (b - a);

export function createFishSim() {
  const fish = [], schools = [];
  let id = 0;

  // a school enters from just outside the view and heads for a point (view-relative, so it stays on stage while
  // the camera rides the boat); after `life` seconds it is sent off the far side
  function spawn({ n = 60, shape = 'ball', view, from = null, rel = null, life = rnd(30, 50), cx = null, cy = null }) {
    const S = SHAPES[shape];
    const side = from ?? ['l', 'r', 't', 'b'][Math.floor(Math.random() * 4)];
    const m = 0.12;
    let x, y;
    if (cx != null) { x = cx; y = cy; }
    else if (side === 'l') { x = view.x0 - m; y = rnd(view.y0 + 0.1 * view.h, view.y1 - 0.1 * view.h); }
    else if (side === 'r') { x = view.x1 + m; y = rnd(view.y0 + 0.1 * view.h, view.y1 - 0.1 * view.h); }
    else if (side === 't') { y = view.y1 + m; x = rnd(view.x0 + 0.1 * view.w, view.x1 - 0.1 * view.w); }
    else { y = view.y0 - m; x = rnd(view.x0 + 0.1 * view.w, view.x1 - 0.1 * view.w); }
    // where to go, relative to the view centre (fractions of the view size): a band crosses, the rest settle
    const r = rel ?? (shape === 'band'
      ? { x: side === 'l' ? 0.75 : side === 'r' ? -0.75 : rnd(-0.3, 0.3), y: side === 't' ? -0.75 : side === 'b' ? 0.75 : rnd(-0.25, 0.25) }
      : { x: rnd(-0.35, 0.1), y: rnd(-0.25, 0.25) });
    const sc = { id: id++, shape, S, rel: r, life, age: 0, leaving: false, through: shape === 'band' };
    schools.push(sc);
    const hx0 = Math.sign(r.x * view.w + view.cx - x) || 1, a0 = Math.atan2((r.y * view.h + view.cy) - y, (r.x * view.w + view.cx) - x);
    for (let i = 0; i < n; i++) {
      const rr = Math.sqrt(Math.random()) * Math.sqrt(n) * BL * 0.9, a = Math.random() * 2 * Math.PI;
      const h = a0 + rnd(-0.3, 0.3);
      fish.push({ x: x + rr * Math.cos(a), y: y + rr * Math.sin(a), hx: Math.cos(h), hy: Math.sin(h), sp: S.speed * BL,
        sc, k: shape === 'band' ? rnd(0.85, 1.18) : rnd(0.95, 1.05), fear: 0, esc: 99, pend: -1, jt: false, flash: 0, alpha: 0, ph: Math.random() * 6.28, ring: false });
    }
    void hx0;
    return sc;
  }

  // nearest point of the threat to p: { kind:'circle', x, y, r } or { kind:'capsule', ax, ay, bx, by, r }
  function threatNear(t, x, y) {
    if (t.kind === 'circle') { const dx = x - t.x, dy = y - t.y, d = Math.hypot(dx, dy) || 1e-6; return { px: t.x, py: t.y, d: d - t.r, ux: dx / d, uy: dy / d }; }
    const vx = t.bx - t.ax, vy = t.by - t.ay, L2 = vx * vx + vy * vy;
    const k = Math.max(0, Math.min(1, ((x - t.ax) * vx + (y - t.ay) * vy) / L2));
    const px = t.ax + vx * k, py = t.ay + vy * k, dx = x - px, dy = y - py, d = Math.hypot(dx, dy) || 1e-6;
    return { px, py, d: d - t.r, ux: dx / d, uy: dy / d };
  }

  function cstart(f, t) {
    const n = threatNear(t, f.x, f.y);
    // away, turned 30° — toward the threat's rear (its tail side), the side the fountain splits to
    const c = Math.cos(ESC_ANGLE), s = Math.sin(ESC_ANGLE);
    const a1 = { x: n.ux * c - n.uy * s, y: n.ux * s + n.uy * c }, a2 = { x: n.ux * c + n.uy * s, y: -n.ux * s + n.uy * c };
    const rear = t.rear ?? { x: 0, y: -1 };
    const a = (a1.x * rear.x + a1.y * rear.y) > (a2.x * rear.x + a2.y * rear.y) ? a1 : a2;
    const turn = Math.acos(Math.max(-1, Math.min(1, f.hx * a.x + f.hy * a.y)));
    f.hx = a.x; f.hy = a.y;                     // ballistic: one step, no easing
    f.esc = 0; f.fear = 1; f.jt = true; f.pend = -1; f.ring = false;
    f.flash = Math.min(1, turn / 1.2 + 0.3);
  }

  // grid for neighbour queries
  const grid = new Map();
  let cell = 0.2;
  const key = (ix, iy) => ix * 73856093 ^ iy * 19349663;
  function build() {
    grid.clear();
    for (const f of fish) {
      const k = key(Math.floor(f.x / cell), Math.floor(f.y / cell));
      let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(f);
    }
  }
  // one pass over the grid cells around f: repulsion from anyone inside zr, and the K nearest visible schoolmates
  // kept in a small sorted buffer (no per-neighbour objects, no sort: this ran 4 ms a frame for 270 fish)
  const kd = new Float64Array(K_NEAR), kg = new Array(K_NEAR);
  const res = { rx: 0, ry: 0, k: 0, startled: false };
  function scan(f, zr, za) {
    res.rx = 0; res.ry = 0; res.k = 0; res.startled = false;
    const ix = Math.floor(f.x / cell), iy = Math.floor(f.y / cell), n = Math.ceil(za / cell), za2 = za * za, zr2 = zr * zr;
    for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
      const a = grid.get(key(ix + i, iy + j)); if (!a) continue;
      for (let q = 0; q < a.length; q++) {
        const g = a[q];
        if (g === f) continue;
        const dx = g.x - f.x, dy = g.y - f.y, d2 = dx * dx + dy * dy;
        if (d2 >= za2) continue;
        const d = Math.sqrt(d2) || 1e-6;
        if (d2 < zr2) { res.rx -= dx / d; res.ry -= dy / d; continue; }   // any school: no collisions
        if (g.sc !== f.sc) continue;
        if (f.hx * dx + f.hy * dy < BLIND * d) continue;               // behind: can't see it
        if (g.jt && !f.jt && f.esc > 2) res.startled = true;           // a neighbour just bolted
        if (res.k === K_NEAR && d >= kd[K_NEAR - 1]) continue;
        let m = res.k < K_NEAR ? res.k++ : K_NEAR - 1;
        while (m > 0 && kd[m - 1] > d) { kd[m] = kd[m - 1]; kg[m] = kg[m - 1]; m--; }
        kd[m] = d; kg[m] = g;
      }
    }
  }

  /* env: { view {x0,x1,y0,y1,cx,cy,w,h}, boat {x,y,hx,hy,len,beam}|null, threat|null, ring {x,y,r,w}|null } */
  function step(dt, env) {
    const { view, boat, threat, ring } = env;
    cell = Math.max(0.12, ...schools.map(s => (s.S.zr + s.S.dzo + s.S.dza) * BL), 0.12);
    build();
    for (const sc of schools) { sc.n = 0; sc.cx = 0; sc.cy = 0; sc.hx = 0; sc.hy = 0; }
    for (const f of fish) if (!f.fear) { f.sc.n++; f.sc.cx += f.x; f.sc.cy += f.y; f.sc.hx += f.hx; f.sc.hy += f.hy; }
    for (const sc of schools) {
      if (sc.n) { sc.cx /= sc.n; sc.cy /= sc.n; }
      const hl = Math.hypot(sc.hx, sc.hy) || 1; sc.hx /= hl; sc.hy /= hl;
      sc.R = Math.sqrt(Math.max(sc.n, 1)) * BL * sc.S.R;              // the school's natural radius
      sc.age += dt;
      if (!sc.leaving && sc.age > sc.life) {   // time to go: head off the far side
        sc.leaving = true;
        const mx = sc.rel.x, my = sc.rel.y;
        sc.rel = Math.abs(mx) > Math.abs(my) ? { x: Math.sign(mx || 1) * 0.9, y: my } : { x: mx, y: Math.sign(my || 1) * 0.9 };
        if (Math.abs(sc.rel.x) < 0.8 && Math.abs(sc.rel.y) < 0.8) sc.rel = { x: -0.9, y: sc.rel.y };
      }
    }
    for (const f of fish) {
      const S = f.sc.S, zr = S.zr * BL, zo = zr + S.dzo * BL, za = zo + S.dza * BL;
      scan(f, zr, za);
      const rx = res.rx, ry = res.ry, startled = res.startled;
      let ox = 0, oy = 0, ax = 0, ay = 0;
      for (let q = 0; q < res.k; q++) {
        const g = kg[q], d = kd[q];
        if (d < zo) { ox += g.hx; oy += g.hy; }
        else { ax += (g.x - f.x) / d; ay += (g.y - f.y) / d; }
      }
      let dx, dy;
      if (rx || ry) { dx = rx; dy = ry; }
      else {
        dx = ox + ax; dy = oy + ay;
        const l = Math.hypot(dx, dy);
        if (l < 1e-6) { dx = f.hx; dy = f.hy; } else { dx /= l; dy /= l; }
        dx = f.hx * 0.6 + dx; dy = f.hy * 0.6 + dy;                 // a little inertia
      }
      let l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      // outside forces, added to the social direction
      const sc = f.sc;
      const tx = view.cx + sc.rel.x * view.w, ty = view.cy + sc.rel.y * view.h;
      const gx = tx - f.x, gy = ty - f.y, gd = Math.hypot(gx, gy) || 1;
      const gw = (sc.leaving || sc.through ? 1 : Math.min(1, gd / 0.25)) * S.goal * Math.max(1 - f.fear, sc.fled ? 0.7 : 0);
      dx += gx / gd * gw; dy += gy / gd * gw;
      // the seven nearest only see a patch; a stray beyond the school's edge also feels the whole school
      // (keeps 60–120 fish one school instead of a scatter of clumps) — the ring shape also mills round its centre
      if (!f.fear && sc.n > 3) {
        const cx = sc.cx - f.x, cy = sc.cy - f.y, cd = Math.hypot(cx, cy) || 1e-6;
        if (sc.shape === 'band') {                                  // a band: pulled onto the school's axis, free along it
          const lat = -cx * sc.hy + cy * sc.hx, lon = cx * sc.hx + cy * sc.hy, W = 3 * BL;
          const pl = 0.9 * Math.max(-1, Math.min(1, lat / W)) * (Math.abs(lat) > W ? 1 : Math.abs(lat) / W);
          dx += -sc.hy * pl; dy += sc.hx * pl;
          const plo = 0.5 * Math.max(0, Math.abs(lon) - sc.R * 4) / sc.R * Math.sign(lon);
          dx += sc.hx * plo; dy += sc.hy * plo;
        } else {
          const pull = (sc.shape === 'scatter' ? 0.25 : 0.6) * Math.max(0, Math.min(1, (cd - sc.R) / sc.R));
          dx += cx / cd * pull; dy += cy / cd * pull;
        }
        if (sc.shape === 'ring' && !f.ring) {
          const Rr = sc.R * 1.4, e = (cd - Rr) / Rr;
          dx += -cy / cd * 0.9 + cx / cd * e * 1.2; dy += cx / cd * 0.9 + cy / cd * e * 1.2;
        }
      }
      if (boat) {                                                    // swim round the hull
        const bx = f.x - boat.x, by = f.y - boat.y, along = bx * boat.hx + by * boat.hy;
        const k = Math.max(-boat.len / 2, Math.min(boat.len / 2, along));
        const px = f.x - (boat.x + boat.hx * k), py = f.y - (boat.y + boat.hy * k), pd = Math.hypot(px, py) || 1e-6;
        const R = boat.beam * 0.5 + 4 * BL;
        if (pd < R) { const w = 2.5 * (1 - pd / R); dx += px / pd * w; dy += py / pd * w; }
      }
      if (ring && !f.fear && f.ring) {                              // waiting: circle the boat
        const qx = f.x - ring.x, qy = f.y - ring.y, qd = Math.hypot(qx, qy) || 1e-6;
        const tnx = -qy / qd * ring.w, tny = qx / qd * ring.w, e = (ring.r - qd) / ring.r;
        f.far = Math.abs(qd - ring.r) > 0.12;                        // still on the way: hurry
        dx += tnx * 1.2 + qx / qd * e * 2.5; dy += tny * 1.2 + qy / qd * e * 2.5;
      }
      if (threat && f.fear > 0) {                                    // keep running away while it's close
        const n = threatNear(threat, f.x, f.y);
        const w = f.fear * 1.5 * Math.max(0, 1 - n.d / 0.6);
        dx += n.ux * w; dy += n.uy * w;
      }
      l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;

      // startle: by itself near the threat's edge, or caught from a neighbour 2–4 frames later
      if (f.pend > 0) { f.pend -= dt; if (f.pend <= 0 && threat) { cstart(f, threat); continue; } }
      else if (threat && f.esc > 2) {
        const n = threatNear(threat, f.x, f.y);
        if (n.d < 2 * BL) { cstart(f, threat); continue; }
        if (startled) f.pend = rnd(2, 4) / 30;
      }

      // turn, rate-limited (a hard turn while escaping is faster)
      const cross = f.hx * dy - f.hy * dx, dot = f.hx * dx + f.hy * dy;
      const want = Math.atan2(cross, dot), maxT = S.turn * (f.esc < 1.5 ? 2.5 : 1) * dt;
      const turn = Math.max(-maxT, Math.min(maxT, want)), c = Math.cos(turn), s = Math.sin(turn);
      const hx = f.hx * c - f.hy * s, hy = f.hx * s + f.hy * c;
      f.hx = hx; f.hy = hy;
      f.flash = Math.max(f.flash - dt * 2.5, Math.min(1, Math.abs(turn) / dt / 6));
    }
    for (const f of fish) {
      const cruise = f.sc.S.speed * BL * f.k * (f.ring && f.far ? 3 : 1);                        // each fish a little faster or slower: a band strings out
      const burst = f.esc < 1.5 ? 1.5 + 2.5 * Math.pow(1 - f.esc / 1.5, 2) : 1 + 0.5 * f.fear;
      f.sp += (cruise * burst - f.sp) * Math.min(1, (f.esc < 0.1 ? 30 : 2) * dt);
      if (f.esc < 0.1) f.sp = cruise * burst;
      f.x += f.hx * f.sp * dt; f.y += f.hy * f.sp * dt;
      f.esc += dt;
      f.jt = f.esc < dt * 1.01;
      const near = threat ? threatNear(threat, f.x, f.y).d : 9;
      if (!threat || near > 0.5) f.fear = Math.max(0, f.fear - dt * 0.15);
      f.alpha = Math.min(1, f.alpha + dt * 1.5);
    }
    // a school that took fright doesn't come back: it heads out of the frame, away from where the fright was
    for (const sc of schools) {
      if (sc.fled || !threat || sc.shape === 'ring' && sc.life > 1e8) continue;
      let k = 0, x = 0, y = 0;
      for (const f of fish) if (f.sc === sc && f.fear > 0) { k++; x += f.x; y += f.y; }
      if (k < 3) continue;
      const n = threatNear(threat, x / k, y / k), ox = n.ux, oy = n.uy;
      const t = Math.min(Math.abs(0.75 / (ox || 1e-6)), Math.abs(0.75 / (oy || 1e-6)));   // a point past the frame edge
      sc.rel = { x: (x / k - view.cx) / view.w + ox * t, y: (y / k - view.cy) / view.h + oy * t };
      sc.fled = sc.leaving = true;
    }
    // gone: off the view and done with it (fleeing, leaving or just passing through)
    const m = 0.35;
    for (let i = fish.length - 1; i >= 0; i--) {
      const f = fish[i];
      const out = f.x < view.x0 - m || f.x > view.x1 + m || f.y < view.y0 - m || f.y > view.y1 + m;
      if (out && (f.fear > 0 || f.sc.leaving || f.sc.through || f.sc.age > 8)) fish.splice(i, 1);
    }
    for (let i = schools.length - 1; i >= 0; i--) if (!fish.some(f => f.sc === schools[i])) schools.splice(i, 1);
  }

  function claimRing(n, view, ringAt) {          // waiting: whoever is calm joins the ring; bring a school if too few
    let k = 0;
    for (const f of fish) if (f.fear < 0.3) { f.ring = true; k++; }
    if (k < n * 0.6) {
      const sc = spawn({ n: n - k, shape: 'ring', view, rel: { x: (ringAt.x - view.cx) / view.w, y: (ringAt.y - view.cy) / view.h }, life: 1e9 });
      for (const f of fish) if (f.sc === sc) f.ring = true;
    }
    for (const sc of schools) sc.life = 1e9;
  }
  function releaseRing() {
    for (const f of fish) f.ring = false;
    for (const sc of schools) { sc.leaving = false; sc.life = sc.age + rnd(6, 14); }
  }
  function scare() { for (const sc of schools) sc.life = Math.min(sc.life, sc.age); }

  return { fish, schools, spawn, step, claimRing, releaseRing, scare };
}
