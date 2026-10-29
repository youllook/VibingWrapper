// 狀態機與角色動作（階段 5）。
// createStates({ hero, walkers, scene, q }) → { update(dt, t), set(name), state, STATES }
// 狀態對應規則照 sea-monster：state.json 的 sessions 全空 → 不在；否則看 state（sky）。
//   none→absent  clear→idle  overcast→thinking  storm→executing  clearing→finishing  waiting→waiting
// 所有數值都是「目標值」，每格以指數趨近（平滑過渡）；動作刻意小、慢，桌布不搶戲。
import * as THREE from './vendor/three.module.min.js';

export const STATES = ['absent', 'idle', 'thinking', 'executing', 'finishing', 'waiting'];
const SKY = { none: 'absent', clear: 'idle', overcast: 'thinking', storm: 'executing', clearing: 'finishing', waiting: 'waiting' };
const KEYS = { 0: 'absent', 1: 'idle', 2: 'thinking', 3: 'executing', 4: 'finishing', 5: 'waiting' };

export const PARAMS = {
  walkAmp: 0.42,        // 腳樞紐最大擺角（弧度）
  walkHz: 1.05,         // 執行：每秒步數（一個完整擺動週期）
  finishHz: 0.8,        // 收尾：停下前的節奏
  stopGap: 0.65,        // 收尾：相鄰兩隻停步間隔（秒），由前（近）到後
  thinkLight: '#35e86a', thinkMax: 0.34, thinkPeriod: 4.2, thinkLag: 0.55,   // 思考：綠光強度上限、一輪秒數、相鄰相位差（週期的比例）
  flashPeriod: 2.6, flashMax: 0.08, flashSwell: 0.025,   // 等你：閃白週期、強度上限、主角微脹
  heroSway: 11,         // 思考：主角頭左右轉（度）
  idleSway: 3,          // 待命：晃頭（度）
  rate: { head: 3.2, walk: 4, glow: 5 },   // 趨近速率（1/秒）
};

export function createStates({ hero, walkers, scene, q }) {
  const P = PARAMS;
  const actors = [hero, ...walkers].map((g, i) => {
    const parts = g.userData.parts, own = new Set(), meshes = [];
    g.traverse(o => { if (o.isMesh) meshes.push(o); });
    return {
      g, parts, meshes, own, isHero: i === 0, idx: i,
      baseYaw: parts.head.rotation.y, basePitch: parts.head.rotation.x,
      baseScale: g.scale.clone(),
      yaw: parts.head.rotation.y, pitch: parts.head.rotation.x,
      amp: 0, phase: i * 1.7, glow: 0, white: 0,
      seed: i * 2.399,
    };
  });
  const ease = (cur, tgt, k, dt) => cur + (tgt - cur) * (1 - Math.exp(-k * dt));

  // 每隻自己 clone 一份材質（共用材質不能動）；材質若被場景重新套過就再 clone
  function ownMats(a) {
    for (const m of a.meshes) if (!a.own.has(m.material)) {
      // clone 不會帶 onBeforeCompile（lib/atmosphere.js 注入的霧），手動接回去
      const src = m.material, c = src.clone();
      c.onBeforeCompile = src.onBeforeCompile; c.customProgramCacheKey = src.customProgramCacheKey;
      m.material = c; a.own.add(c);
    }
  }
  const glowCol = new THREE.Color(), white = new THREE.Color('#ffffff'), green = new THREE.Color(P.thinkLight);
  function setGlow(a, gGreen, gWhite) {
    if (gGreen < 0.002 && gWhite < 0.002) {
      if (a.lit) { ownMats(a); for (const m of a.meshes) if (m.material.emissive) m.material.emissive.setScalar(0); a.lit = false; }
      return;
    }
    ownMats(a); a.lit = true;
    glowCol.setRGB(green.r * gGreen + gWhite, green.g * gGreen + gWhite, green.b * gGreen + gWhite);
    for (const m of a.meshes) if (m.material.emissive) m.material.emissive.copy(glowCol);
  }

  const S = { state: 'idle', STATES, PARAMS, set, update, tState: 0 };
  let T = 0, fixed = false, lastPolled = null;

  function set(name) {
    const n = SKY[name] || name;
    if (!STATES.includes(n) || n === S.state) return;
    S.state = n; S.tState = 0;
  }

  function update(dt, t) {
    T += dt; S.tState += dt;
    const st = S.state, ts = S.tState;
    const n = walkers.length;
    for (const a of actors) {
      const { parts } = a;
      // ── 頭 ──
      let ty = 0, tp = 0;
      const lookBack = a.isHero && (st === 'idle' || st === 'thinking' || st === 'waiting');
      if (lookBack) { ty = a.baseYaw; tp = a.basePitch; }
      if (a.isHero && st === 'thinking') ty += THREE.MathUtils.degToRad(P.heroSway) * Math.sin(T * 0.9);
      if (st === 'idle') {   // 待命：偶爾輕晃頭（兩個頻率疊起來，不規律）
        const w = Math.sin(T * 0.37 + a.seed) * Math.sin(T * 0.23 + a.seed * 2);
        ty += THREE.MathUtils.degToRad(P.idleSway) * w;
        tp += THREE.MathUtils.degToRad(P.idleSway * 0.5) * Math.sin(T * 0.31 + a.seed);
      }
      a.yaw = ease(a.yaw, ty, P.rate.head, dt); a.pitch = ease(a.pitch, tp, P.rate.head, dt);
      parts.head.rotation.y = a.yaw; parts.head.rotation.x = a.pitch;

      // ── 腳（只有隊伍踏步，主角站著） ──
      let ampT = 0, hz = P.walkHz;
      if (!a.isHero) {
        const wi = a.idx - 1;
        if (st === 'executing') ampT = P.walkAmp;
        else if (st === 'finishing') { ampT = ts >= wi * P.stopGap ? 0 : P.walkAmp * 0.85; hz = P.finishHz; }
      }
      a.amp = ease(a.amp, ampT, P.rate.walk, dt);
      if (a.amp > 0.003) {
        a.phase += dt * hz * Math.PI * 2;
        const s = Math.sin(a.phase) * a.amp, L = parts.legs;
        L[0].rotation.x = s; L[3].rotation.x = s;       // 對角同相
        L[1].rotation.x = -s; L[2].rotation.x = -s;
      } else if (a.amp !== 0) {
        for (const l of parts.legs) l.rotation.x = 0;
        a.amp = 0;
      }

      // ── 身體：待命呼吸（極輕） ──
      const breath = (st === 'idle' ? 1 : 0.35) * 0.012 * Math.sin(T * 1.3 + a.seed);
      parts.body.scale.y = 1 + breath;

      // ── 光：思考綠輪廓（由近到遠接力）、等你閃白 ──
      let gT = 0, wT = 0, swell = 0;
      if (st === 'thinking') {
        const ph = (T / P.thinkPeriod - a.idx * P.thinkLag / (n + 1)) * Math.PI * 2;
        gT = P.thinkMax * Math.pow(Math.max(0, Math.sin(ph)), 2);
      } else if (st === 'waiting' && a.isHero) {
        const ph = (ts / P.flashPeriod) % 1;   // 0..1：前 0.25 漸亮、之後漸暗；其餘靜止
        const f = ph < 0.5 ? Math.sin(ph / 0.5 * Math.PI) : 0;
        wT = P.flashMax * f * f; swell = P.flashSwell * f;
      }
      a.glow = ease(a.glow, gT, P.rate.glow, dt); a.white = ease(a.white, wT, 9, dt);
      setGlow(a, a.glow, a.white);
      if (a.isHero) {
        a.swell = ease(a.swell || 0, swell, 6, dt);
        a.g.scale.set(a.baseScale.x * (1 + a.swell), a.baseScale.y * (1 + a.swell), a.baseScale.z * (1 + a.swell));
      }
    }
  }

  // ── 讀 state.json ──
  async function poll() {
    try {
      const r = await fetch('state.json?t=' + Date.now(), { cache: 'no-store' });
      const j = await r.json();
      const sessions = Array.isArray(j.sessions) ? j.sessions : [];
      const sky = sessions.some(x => x) ? j.state : 'none';
      if (SKY[sky] && sky !== lastPolled) { lastPolled = sky; set(sky); }
    } catch (e) { /* 失敗就維持原狀 */ }
  }
  const fix = q && q.get && q.get('state');
  if (fix && (SKY[fix] || STATES.includes(fix))) { fixed = true; S.state = SKY[fix] || fix; }
  else { poll(); setInterval(poll, 1000); }
  addEventListener('keydown', e => { const k = KEYS[e.key]; if (k) set(k); });

  return S;
}
