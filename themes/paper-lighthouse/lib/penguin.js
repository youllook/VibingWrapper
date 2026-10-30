// 企鵝釣魚：一張卡＝一個姿勢，換卡不補間（停格）；釣線由程式畫，從竿尖垂到浮標，浮標跟著所在的浪條起伏。
//
//   const peng = await createPenguin(scene, { loadImg, paperLayers, waveDy })
//   peng.play(act)    換一段動作（ACTS 的鍵）；peng.finished：不循環的段落演完了；peng.locked：catch 還沒到抱魚那格
//   peng.update(t)                                              每格呼叫
//
// 卡片都是 1872×1053 補完畫布座標（原圖在 (100,56)），所以每張卡疊在同一個位置，換卡不會跳。
import * as THREE from '../vendor/three.module.min.js';
import { IMG_W, IMG_H, createPaperLayer, createShadow, frameSize, stepTime, boil } from './paper.js';

const CW = 1872, CH = 1053;            // 補完畫布
const PENG_D = 8.8;                    // 企鵝站在前景岩台（d9）前緣
const BOBBER = [1275, 811];            // 浮標（畫布座標），落在第 3 條浪
const BOBBER_WAVE = 3, BOBBER_D = 16;
const FISH_D = 12;                     // 躍出的大魚：在近浪前面
const POSES = ['base', 'nod', 'sleep', 'lookup', 'pull1', 'pull2', 'fish', 'sign'];

// 一段動作＝[姿勢, 秒] 的序列；loop 的段落播完重來，不循環的停在最後一張。
// sink：浮標往下沉 [起, 迄, 深度 px, 次數]；fish：大魚在半空的時段（高潮停住）
const ACTS = {
  idle:     { loop: true,  seq: [['base', 2.6], ['nod', 0.5], ['base', 3.2], ['nod', 0.5]] },
  sleep:    { loop: true,  seq: [['sleep', 3.0], ['nod', 0.6]] },
  lookup:   { loop: true,  seq: [['lookup', 2.4], ['base', 0.6]] },
  catch:    { loop: false, seq: [['base', 0.6], ['lookup', 0.3], ['pull1', 0.35], ['pull2', 0.35], ['pull1', 0.35], ['pull2', 0.35], ['pull1', 0.3], ['pull2', 1.6], ['fish', 9.8]],
              sink: [0.3, 0.9, 6, 1], fish: [2.7, 4.2], lock: 4.2 },
  done:     { loop: false, seq: [['fish', 2.5], ['base', 0.1]] },
  sign:     { loop: true,  seq: [['sign', 99]] },
  waitlong: { loop: true,  seq: [['sign', 3.0], ['nod', 0.4], ['sleep', 4.0], ['nod', 0.4]] },
  // 待命偶發事件（演完 finished，回 idle）
  nibble:   { loop: false, seq: [['base', 0.3], ['nod', 0.3], ['base', 0.3], ['nod', 0.3], ['base', 0.3]], sink: [0.2, 1.4, 2.5, 2] },
  yawn:     { loop: false, seq: [['nod', 0.4], ['sleep', 2.5], ['nod', 0.4], ['base', 0.2]] },
  glance:   { loop: false, seq: [['lookup', 2.2], ['base', 0.1]] },
};

// 畫布座標 → 離鏡頭 d 那層的世界座標（鏡頭不動時投影回原位）
function toWorld([x, y], d) {
  const { w, h } = frameSize(d);
  return new THREE.Vector3(((x - 100) / IMG_W - 0.5) * w, -((y - 56) / IMG_H - 0.5) * h, -d);
}

export async function createPenguin(scene, { loadImg, paperLayers, waveDy = () => 0, jitter = 1, dir = 'assets/penguin' }) {
  const tips = await (await fetch(`${dir}/cards.json`)).json();
  const cards = {};
  for (const p of POSES) {
    const img = await loadImg(`${dir}/penguin_${p}.png`);
    const m = createPaperLayer(img, { d: PENG_D });
    const s = createShadow(img, { d: PENG_D, gap: 0.25 });
    m.visible = s.visible = false;
    scene.add(s); scene.add(m); paperLayers.push(m);
    cards[p] = { m, s, tip: tips[`penguin_${p}`], x0: m.position.x, y0: m.position.y, sx0: s.position.x, sy0: s.position.y };
  }
  const pengPx = frameSize(PENG_D).w / IMG_W;   // 企鵝那層 1 目標圖 px 的世界寬

  const bobImg = await loadImg(`${dir}/bobber.png`);
  const bobber = createPaperLayer(bobImg, { d: BOBBER_D - 0.3, thick: 0.003 });
  bobber.renderOrder = cards.base.m.renderOrder - 0.5;   // 浪條之後、企鵝之前
  scene.add(bobber); paperLayers.push(bobber);
  const bobY0 = bobber.position.y, bobPx = frameSize(BOBBER_D).h / IMG_H;

  const fishImg = await loadImg(`${dir}/fish_big.png`);
  const fish = createPaperLayer(fishImg, { d: FISH_D });
  fish.visible = false; scene.add(fish); paperLayers.push(fish);
  fish.userData.x0 = fish.position.x; fish.userData.y0 = fish.position.y;

  // 釣線：細長三角帶，竿尖 → 微微下垂 → 浮標
  const SEG = 12;
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 2 * 3), 3));
  const idx = [];
  for (let i = 0; i < SEG; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  lineGeo.setIndex(idx);
  const line = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ color: 0xf4f0e6, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
  line.frustumCulled = false;
  line.renderOrder = cards.base.m.renderOrder - 0.25;
  scene.add(line);
  const tipW = new THREE.Vector3(), bobW = new THREE.Vector3(), pt = new THREE.Vector3();

  function drawLine(tip, end, sag, width) {
    const pos = lineGeo.attributes.position.array;
    for (let i = 0; i <= SEG; i++) {
      const u = i / SEG;
      pt.lerpVectors(tip, end, u); pt.y -= sag * 4 * u * (1 - u);
      const w = width * (1 - 0.4 * u);
      pos.set([pt.x - w, pt.y, pt.z, pt.x + w, pt.y, pt.z], i * 6);
    }
    lineGeo.attributes.position.needsUpdate = true;
  }

  let act = 'idle', actT0 = 0, lastT = 0;
  const total = name => ACTS[name].seq.reduce((s, [, d]) => s + d, 0);
  function poseAt(name, tt) {
    const A = ACTS[name], total = A.seq.reduce((s, [, d]) => s + d, 0);
    let u = A.loop ? tt % total : Math.min(tt, total - 1e-3);
    for (const [p, d] of A.seq) { if (u < d) return p; u -= d; }
    return A.seq.at(-1)[0];
  }

  return {
    cards, bobber, fish, line,
    get act() { return act; },
    get elapsed() { return lastT - actT0; },
    get finished() { return !ACTS[act].loop && lastT - actT0 >= total(act); },
    get locked() { return !!ACTS[act].lock && lastT - actT0 < ACTS[act].lock; },
    get freeze() { const f = ACTS[act].fish, e = lastT - actT0; return !!f && e >= f[0] && e < f[1]; },   // 高潮停住：浪也停
    play(name) { if (ACTS[name]) { act = name; actT0 = lastT; } },
    update(t) {
      lastT = t;
      const ts = stepTime(t, 12), tt = stepTime(t - actT0, 12);
      const pose = poseAt(act, tt);
      for (const p of POSES) cards[p].m.visible = cards[p].s.visible = p === pose;
      // 停格微抖：像每一格都是手重新擺卡，位置差個半像素（卡和影子一起動）
      const jx = jitter * 0.45 * boil(11, t) * pengPx, jy = jitter * 0.35 * boil(23, t) * pengPx;
      for (const p of POSES) { const c = cards[p]; c.m.position.set(c.x0 + jx, c.y0 + jy, c.m.position.z); c.s.position.set(c.sx0 + jx, c.sy0 + jy, c.s.position.z); }
      fish.position.set(fish.userData.x0 + jitter * 0.6 * boil(31, t) * pengPx, fish.userData.y0 + jitter * 0.5 * boil(37, t) * pengPx, fish.position.z);

      // 浮標：跟著第 3 條浪＋自己輕點；有 sink 的段落往下沉（catch 猛沉一次、nibble 輕點兩下）
      const A = ACTS[act];
      let dy = waveDy(BOBBER_WAVE) + Math.sin(ts * 5.1) * 1.2 * bobPx;
      if (A.sink && tt >= A.sink[0] && tt < A.sink[1]) {
        const [a, b, depth, n] = A.sink, u = (tt - a) / (b - a);
        dy -= (depth + depth * 0.5 * boil(7, t)) * Math.abs(Math.sin(u * Math.PI * n)) * bobPx;
      }
      const hooked = act === 'catch' && tt >= A.sink[1];
      bobber.position.y = bobY0 + dy;
      bobber.visible = pose !== 'sign' && pose !== 'fish' && !(hooked && pose === 'fish');

      // 大魚：catch 高潮停在半空
      fish.visible = !!A.fish && tt >= A.fish[0] && tt < A.fish[1];

      // 釣線：竿尖 → 浮標（上鉤後拉到魚嘴）；sign 卡不拿竿
      const tip = cards[pose].tip;
      line.visible = !!tip && bobber.visible;
      if (line.visible) {
        tipW.copy(toWorld(tip, PENG_D)); tipW.x += jx; tipW.y += jy;   // 竿尖跟著卡一起抖
        bobW.copy(toWorld([BOBBER[0], BOBBER[1] - 10], BOBBER_D)); bobW.y += dy;
        // 釣線兩端不在同一深度：把浮標端換算到企鵝那層的平面，線就畫在同一層（投影一樣）
        bobW.multiplyScalar(PENG_D / BOBBER_D);
        const taut = pose === 'pull1' || pose === 'pull2';
        drawLine(tipW, bobW, taut ? 0 : 0.012 * PENG_D / 9, 0.0016 * PENG_D / 9);
      }
    },
  };
}
