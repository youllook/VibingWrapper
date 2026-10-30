// 導演：把 Claude 狀態（state.json）翻成這個主題的演出。對照 docs/紙片燈塔/PLAN.md。
//
//   const dir = createDirector({ peng, flyers, post })
//   dir.applyState('clear' | 'overcast' | 'storm' | 'clearing' | 'waiting' | 'none')
//   dir.setSessions(['clear', null, ...])   帆船數＝不是 null 的個數；全部 null＝沒有對話
//   dir.update(t)                           每格（t＝秒）；回傳 { waveGain, freeze }
//
// 打斷規則：執行中鎖到「抱魚」那格（peng.locked），之前的狀態變化排隊。

// 各狀態的浪幅倍率與天色灰暗度（平滑過渡）
const MOOD = {
  none:     { wave: 0.6, gloom: 0 },
  clear:    { wave: 1.0, gloom: 0 },
  overcast: { wave: 1.4, gloom: 0.35 },
  storm:    { wave: 2.0, gloom: 0.6 },
  clearing: { wave: 1.0, gloom: 0 },
  waiting:  { wave: 1.0, gloom: 0 },
};
const EVENTS = ['nibble', 'yawn', 'glance'];
const WAIT_LONG = 90;      // 等你久了開始打瞌睡（秒）
const CATCH_EVERY = 14;    // 執行中每輪秒數

export function createDirector({ peng, flyers, post }) {
  let state = 'none', shown = null, since = 0, pending = null, nextEvent = 0;
  let boats = 0, wave = MOOD.none.wave, gloom = 0, now = 0;

  function enter(s, from) {
    shown = s; since = now;
    if (!peng) return;
    if (s === 'none') peng.play('sleep');
    else if (s === 'clear') { peng.play('idle'); nextEvent = now + 20 + Math.random() * 40; }
    else if (s === 'overcast') peng.play('lookup');
    else if (s === 'storm') peng.play('catch');
    else if (s === 'clearing') peng.play(from === 'storm' ? 'done' : 'idle');
    else if (s === 'waiting') peng.play('sign');
  }

  return {
    get state() { return shown; },
    applyState(s) { state = s || 'none'; },
    setSessions(arr) {
      const n = (arr || []).filter(x => x != null).length;
      if (n !== boats) { boats = n; flyers?.setBoats(n); }
      if (!n) state = 'none';
    },
    update(t) {
      const dt = Math.min(0.2, Math.max(0, t - now));
      now = t;
      const want = boats ? state : 'none';
      if (want !== shown) {
        if (peng?.locked) pending = want;           // 執行中鎖定：演到抱魚再轉
        else { const from = shown; pending = null; enter(want, from); }
      }
      // 各狀態自己的節奏
      if (peng && shown === 'clear') {
        if (peng.act !== 'idle' && peng.finished) peng.play('idle');
        if (peng.act === 'idle' && now >= nextEvent) { peng.play(EVENTS[Math.floor(Math.random() * EVENTS.length)]); nextEvent = now + 20 + Math.random() * 40; }
      }
      if (peng && shown === 'storm' && now - since >= CATCH_EVERY) { since = now; peng.play('catch'); }
      if (peng && shown === 'clearing' && peng.act === 'done' && peng.finished) peng.play('idle');
      if (peng && shown === 'waiting' && peng.act === 'sign' && now - since >= WAIT_LONG) peng.play('waitlong');

      // 浪、天色往目標值靠（約 2 秒）
      const m = MOOD[shown] || MOOD.clear, k = 1 - Math.exp(-dt * 1.6);
      wave += (m.wave - wave) * k; gloom += (m.gloom - gloom) * k;
      if (post) post.uniforms.uGloom.value = gloom;
      return { waveGain: wave, freeze: !!peng?.freeze };
    },
  };
}
