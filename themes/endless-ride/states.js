// 狀態 → 騎行參數。對應規則照其他主題：state.json 的 sessions 全空 → 不在；否則看 state（sky）。
// 每個數值都是目標值，場景那邊以秒級的指數趨近過去（鏡頭寬度 w 也是：桌布不接滾輪）。
export const STATES = ['absent', 'clear', 'overcast', 'storm', 'clearing', 'waiting'];
const SKY = { none: 'absent', clear: 'clear', overcast: 'overcast', storm: 'storm', clearing: 'clearing', waiting: 'waiting',
  idle: 'clear', thinking: 'overcast', executing: 'storm', finishing: 'clearing' };
const KEYS = { 0: 'absent', 1: 'clear', 2: 'overcast', 3: 'storm', 4: 'clearing', 5: 'waiting' };

// speed 公尺/秒；w 鏡頭寬度；cover 雲量；dark 雲變暗；mist 低霧；wind 風；part 粒子比例；streak 殘影倍率；
// sun 主光倍率；dusk 往黃昏色偏；look 回頭；exposure 曝光；sat 飽和度；wet 路面反光
export const PARAMS = {
  absent:   { speed: 0,  w: 0,    cover: 0.40, dark: 0.05, mist: 0.50, wind: 0.25, part: 0.35, streak: 1.0, sun: 0.9,  dusk: 1, look: 0, exposure: 0.95, sat: 0.95, wet: 0 },
  clear:    { speed: 13, w: 0.15, cover: 0.50, dark: 0,    mist: 0.25, wind: 0.5,  part: 0.55, streak: 1.2, sun: 1.0,  dusk: 0, look: 0, exposure: 1.0,  sat: 1.05, wet: 0 },
  overcast: { speed: 10, w: 0.30, cover: 0.74, dark: 0.35, mist: 0.85, wind: 0.65, part: 0.6,  streak: 1.2, sun: 0.42, dusk: 0, look: 0, exposure: 1.0,  sat: 0.85, wet: 0.15 },
  storm:    { speed: 24, w: 0.60, cover: 0.95, dark: 0.85, mist: 0.65, wind: 1.6,  part: 1.0,  streak: 2.4, sun: 0.24, dusk: 0, look: 0, exposure: 0.95, sat: 0.72, wet: 0.7 },
  clearing: { speed: 8,  w: 0.20, cover: 0.52, dark: 0.12, mist: 0.40, wind: 0.5,  part: 0.6,  streak: 1.2, sun: 1.35, dusk: 0, look: 0, exposure: 1.05, sat: 1.1,  wet: 0.5 },
  waiting:  { speed: 0,  w: 0,    cover: 0.50, dark: 0,    mist: 0.25, wind: 0.35, part: 0.45, streak: 1.0, sun: 1.0,  dusk: 0, look: 1, exposure: 1.0,  sat: 1.05, wet: 0 },
};
// 趨近速率（1/秒）：速度要有加減速的感覺，天氣慢慢變，鏡頭寬度約 6–7 秒到位
const RATE = { speed: 0.55, w: 0.35, cover: 0.3, dark: 0.3, mist: 0.3, wind: 0.5, part: 0.6, streak: 0.8, sun: 0.35, dusk: 0.25, look: 9, exposure: 0.4, sat: 0.4, wet: 0.2 };

export function createStates(q) {
  const fix = q.get('state'), start = SKY[fix] || (STATES.includes(fix) ? fix : null);
  const S = { state: start || 'clear', tState: 0, STATES, PARAMS, cur: {}, CONFIG: { polling: !start, clockHours: null } };
  Object.assign(S.cur, PARAMS[S.state]);
  S.set = name => { const n = SKY[name] || name; if (!STATES.includes(n) || n === S.state) return; S.state = n; S.tState = 0; };
  S.snap = () => Object.assign(S.cur, PARAMS[S.state]);   // 直接跳到目標值（截圖用）
  S.update = dt => {
    S.tState += dt; const T = PARAMS[S.state];
    for (const k in T) {
      let r = RATE[k];
      if (k === 'speed' && T.speed < S.cur.speed) r = 0.75;   // 煞車比加速快一點
      S.cur[k] += (T[k] - S.cur[k]) * (1 - Math.exp(-r * dt));
    }
  };
  let lastPolled = null, sess = null;
  async function poll() {
    if (S.CONFIG.polling === false) return;
    try {
      const r = await fetch('state.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return;
      const j = await r.json(), sessions = Array.isArray(j.sessions) ? j.sessions : [];
      const sky = sessions.some(x => x) ? j.state : 'none';
      if (SKY[sky] && sky !== lastPolled) { lastPolled = sky; S.set(sky); }
    } catch (e) { /* 失敗就維持原狀 */ }
  }
  if (!start) { poll(); setInterval(poll, 1000); }
  addEventListener('keydown', e => { const k = KEYS[e.key]; if (k) { S.CONFIG.polling = false; S.set(k); } });
  // 錄影／demo 測試介面（themes/README.md）
  S.applyState = sky => { lastPolled = sky; S.set(sess && !sess.some(x => x) ? 'absent' : sky); };
  S.setSessions = a => { sess = Array.isArray(a) ? a : null; if (sess && !sess.some(x => x)) S.set('absent'); };
  return S;
}
