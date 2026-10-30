// 雲：從遠景拆出來的紙雲卡，停格（12 fps）慢慢往右飄，整朵飄出畫面右邊再從左邊回來。
//
//   const clouds = await createClouds(scene, { loadImg, paperLayers })
//   clouds.update(t)
//
// 素材（assets/clouds/，Codex 拆）：sky.png 沒有雲的天空（取代 far）、full/cloud*.png 完整雲（含畫外、山後補畫），
// animation.json 給每朵在 1872×1053 補完畫布上的原點（可為負）；front.png＝遠山＋遠海，蓋在雲前面，雲才會從山後經過。
// t=0 時每朵都在原圖位置。
import { createPaperLayer, createShadow, frameSize, stepTime, IMG_W } from './paper.js';

const CLOUD_D = 57, FRONT_D = 56.5;   // 天空底 d60 → 雲 → 遠山遠海 → 帆船 d52
const CW = 1872, CH = 1053, PAD = 1000;   // 雲卡畫到加寬畫布上（左右各 PAD），投影位置才跟分層一致
const SPEED = [6, 9, 11, 13, 8];          // 每秒幾 px（畫布）；大朵慢一點

export async function createClouds(scene, { loadImg, paperLayers, dir = 'assets/clouds' }) {
  let anim;
  try { anim = await (await fetch(`${dir}/animation.json`)).json(); } catch { return null; }
  const px = frameSize(CLOUD_D).w / IMG_W;   // 畫布 1px 的世界寬
  const clouds = [];
  for (const [i, L] of anim.layers.entries()) {
    const img = await loadImg(`${dir}/${L.file}`);
    const c = document.createElement('canvas'); c.width = CW + 2 * PAD; c.height = CH;
    c.getContext('2d').drawImage(img, L.origin[0] + PAD, L.origin[1]);
    const shadow = createShadow(c, { d: CLOUD_D, gap: 0.8, strength: 0.4 });
    const m = createPaperLayer(c, { d: CLOUD_D, thick: 0.003 });
    scene.add(shadow); scene.add(m); paperLayers.push(m);
    clouds.push({ m, shadow, x0: m.position.x, s0: shadow.position.x, left: L.origin[0], w: L.size[0], speed: SPEED[i % SPEED.length] });
  }
  // 遠山遠海蓋在雲前面（不加厚度：它本來就是遠景那張紙）
  try { scene.add(createPaperLayer(await loadImg(`${dir}/front.png`), { d: FRONT_D, thick: 0 })); } catch {}

  return {
    clouds,
    update(t) {
      const ts = stepTime(t, 12);
      for (const c of clouds) {
        // 雲左緣在畫布上的位置；整朵出了右邊就繞到左邊外面
        const span = CW + c.w;
        const dx = ((c.left + c.speed * ts + c.w) % span + span) % span - c.w - c.left;
        c.m.position.x = c.x0 + dx * px;
        c.shadow.position.x = c.s0 + dx * px;
      }
    },
  };
}
