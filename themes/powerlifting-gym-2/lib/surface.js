// 階段 4 材質：每個 palette 槽 → PBR 材質＋世界座標三向投影的做舊（程式產生的模型 UV 不一致，所以不用 UV）
// 重複數 k 要低（約每公尺 1 次）：顆粒很細，k 太高會被 mipmap 平均成一片均勻色
// 做舊紋理 textures/micro_grime.jpg（素材庫 ambientcg_micro，CC0）：R 髒污顆粒、G 鏽的明暗、B 刮痕；平均約 0.5
// 木紋是 canvas 畫的（素材庫沒有木頭），一樣用三向投影貼
import * as THREE from '../vendor/three.module.min.js';
import { PALETTE } from './palette.js';

const grime = new THREE.Texture();
grime.wrapS = grime.wrapT = THREE.RepeatWrapping;
/** 做舊紋理載完才 resolve；場景頁要等它再宣告 ready（不然第一格是沒做舊的） */
export const surfaceReady = new THREE.TextureLoader().loadAsync(new URL('../textures/micro_grime.jpg', import.meta.url).href)
  .then(t => { grime.image = t.image; grime.needsUpdate = true; });

// 夾板木紋：一條條板子，板內年輪細紋＋板間深縫；灰階（乘在固有色上）
function woodTexture(size = 512, boards = 6, seed = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const bw = size / boards;
  for (let b = 0; b < boards; b++) {
    const base = 150 + rnd() * 70;
    g.fillStyle = `rgb(${base},${base},${base})`; g.fillRect(b * bw, 0, bw, size);
    for (let i = 0; i < 70; i++) {     // 年輪：沿板長方向的細線，微微彎
      const x0 = b * bw + rnd() * bw, k = 0.3 + rnd() * 0.5, w = 0.5 + rnd() * 2, a = 0.05 + rnd() * 0.12;
      g.strokeStyle = `rgba(40,25,10,${a})`; g.lineWidth = w; g.beginPath();
      for (let y = 0; y <= size; y += 8) g.lineTo(x0 + Math.sin(y / size * Math.PI * (1 + rnd() * 0.2) * k * 4 + b) * bw * 0.08, y);
      g.stroke();
    }
    for (let i = 0; i < 2; i++) {      // 節疤
      const x = b * bw + bw * (0.2 + rnd() * 0.6), y = rnd() * size, r = 3 + rnd() * 6;
      const gr = g.createRadialGradient(x, y, 0, x, y, r * 3); gr.addColorStop(0, 'rgba(30,15,5,0.6)'); gr.addColorStop(1, 'rgba(30,15,5,0)');
      g.fillStyle = gr; g.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
    }
    g.fillStyle = 'rgba(20,12,6,0.85)'; g.fillRect(b * bw, 0, 2, size);     // 板縫
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const wood = woodTexture();

// 每槽：r 粗糙、m 金屬、dirt 髒污壓暗、rust 鏽色變化、scr 刮痕（改粗糙度）、k 做舊紋理每公尺重複數、wood 木紋每公尺重複數、
// chip 掉漆斑點（露出鏽與底材的小亮點，gym1 的槓片、架子滿是這種）
const SPEC = {
  iron:       { r: 0.85, m: 0.12, dirt: 0.55, rust: 0.45, scr: 0.35, k: 1.0, chip: 0.9 },
  ironWorn:   { r: 0.45, m: 0.70, dirt: 0.35, rust: 0.20, scr: 0.40, k: 1.2, chip: 0.6 },
  steel:      { r: 0.32, m: 0.90, dirt: 0.25, rust: 0.10, scr: 0.50, k: 1.5 },
  steelDark:  { r: 0.50, m: 0.80, dirt: 0.40, rust: 0.20, scr: 0.40, k: 1.5, chip: 0.3 },
  rack:       { r: 0.65, m: 0.30, dirt: 0.45, rust: 0.30, scr: 0.45, k: 0.9, chip: 0.7 },
  rackWorn:   { r: 0.40, m: 0.65, dirt: 0.35, rust: 0.30, scr: 0.40, k: 1.0, chip: 0.6 },
  wood:       { r: 0.70, m: 0.00, dirt: 0.55, rust: 0.20, scr: 0.30, k: 0.6, wood: 0.4 },
  rubber:     { r: 0.92, m: 0.00, dirt: 0.40, rust: 0.00, scr: 0.20, k: 0.8 },
  benchRed:   { r: 0.55, m: 0.00, dirt: 0.45, rust: 0.10, scr: 0.30, k: 1.5 },
  benchWhite: { r: 0.60, m: 0.00, dirt: 0.80, rust: 0.30, scr: 0.30, k: 1.5 },
  benchBlack: { r: 0.50, m: 0.00, dirt: 0.35, rust: 0.05, scr: 0.30, k: 1.5 },
  tapeSilver: { r: 0.40, m: 0.50, dirt: 0.40, rust: 0.10, scr: 0.40, k: 1.5 },
  chalk:      { r: 1.00, m: 0.00, dirt: 0.15, rust: 0.00, scr: 0.00, k: 2 },
  bucket:     { r: 0.55, m: 0.60, dirt: 0.60, rust: 0.55, scr: 0.40, k: 1.2, chip: 0.8 },
  towel:      { r: 1.00, m: 0.00, dirt: 0.45, rust: 0.10, scr: 0.00, k: 2 },
  bottle:     { r: 0.35, m: 0.30, dirt: 0.25, rust: 0.00, scr: 0.30, k: 5 },
  crate:      { r: 0.80, m: 0.00, dirt: 0.65, rust: 0.30, scr: 0.30, k: 0.8, wood: 1.2 },
  lampOff:    { r: 0.30, m: 0.10, dirt: 0.20, rust: 0.00, scr: 0.20, k: 6 },
  lampBox:    { r: 0.60, m: 0.30, dirt: 0.40, rust: 0.20, scr: 0.30, k: 4 },
  fan:        { r: 0.60, m: 0.20, dirt: 0.50, rust: 0.20, scr: 0.20, k: 1 },
};
const DEFAULT = { r: 0.7, m: 0.0, dirt: 0.3, rust: 0.1, scr: 0.2, k: 3 };

const TRI = /* glsl */`
uniform sampler2D uGrime; uniform sampler2D uWood;
uniform float uK, uDirt, uRust, uScr, uWoodK, uChip;
varying vec3 vWP; varying vec3 vWN;
vec3 triW() { vec3 w = pow(abs(normalize(vWN)), vec3(4.0)); return w / (w.x + w.y + w.z); }
vec4 tri(sampler2D t, float k) {
  vec3 w = triW();
  return texture2D(t, vWP.zy * k) * w.x + texture2D(t, vWP.xz * k) * w.y + texture2D(t, vWP.xy * k) * w.z;
}
// 木紋：板子沿長軸（取最平的那個面的投影，紋路方向固定沿 X）
vec4 triWood(float k) {
  vec3 w = triW();
  return texture2D(uWood, vWP.zx * k) * w.y + texture2D(uWood, vWP.yx * k) * w.z + texture2D(uWood, vWP.yz * k) * w.x;
}
`;

function patch(mat, spec) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, {
      uGrime: { value: grime }, uWood: { value: wood }, uK: { value: spec.k },
      uDirt: { value: spec.dirt }, uRust: { value: spec.rust }, uScr: { value: spec.scr }, uWoodK: { value: spec.wood || 0 }, uChip: { value: spec.chip || 0 },
    });
    sh.vertexShader = 'varying vec3 vWP; varying vec3 vWN;\n' + sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = TRI + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec4 gm = tri(uGrime, uK);
        if (uWoodK > 0.0) diffuseColor.rgb *= triWood(uWoodK).rgb * 1.1;
        diffuseColor.rgb *= 1.0 - uDirt * clamp((gm.r - 0.35) * 1.6, 0.0, 1.0);          // 髒污壓暗
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.25, 0.85, 0.6), uRust * clamp((gm.g - 0.45) * 2.5, 0.0, 1.0));   // 鏽斑偏紅褐
        // 掉漆斑點：另一個尺度的髒污顆粒取最亮處 → 稀疏的鏽點
        vec4 gc = tri(uGrime, uK * 1.7 + 0.37);   // 跟 gm 錯開尺度，斑點才不會和髒污重疊
        float chip = uChip * smoothstep(0.76, 0.86, gc.r);                                   // 約 15% 面積
        vec3 chipCol = mix(vec3(0.16, 0.07, 0.03), vec3(0.50, 0.27, 0.11), smoothstep(0.3, 0.8, gc.g));   // 深鏽褐 → 亮鏽橘
        diffuseColor.rgb = mix(diffuseColor.rgb, chipCol, chip);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (gm.b - 0.5) * uScr + uDirt * (gm.r - 0.5) * 0.4 + chip * 0.25, 0.04, 1.0);`);
  };
  mat.customProgramCacheKey = () => 'surface';
  return mat;
}

/** 依 palette 槽建 PBR 材質（同槽共用由 kit.material 快取） */
export function surfaceMaterial(slot) {
  const spec = SPEC[slot] || DEFAULT;
  return patch(new THREE.MeshStandardMaterial({ color: PALETTE[slot] || PALETTE.debug, roughness: spec.r, metalness: spec.m }), spec);
}
