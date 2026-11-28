// 紙飛機穿城 · 步驟 4 紙質材質
// 城市盒子：instanceColor 不當顏色用，當參數用 —— r＝紙色深淺、g＝立面樣式、b＝亂數種子。
// 立面的溝槽、窗帶、切口亮邊、接地暗化、紙纖維全部在 shader 依「段內座標」刻，所以跟著城市一起流、不會滑動。
import * as THREE from 'three';

export const NIGHT = { value: 0 };          // 0 白天 → 1 夜晚（窗燈）
export const TRAVEL = { value: 0 };         // 全域行進距離 s（地面花紋用）

const NOISE = /* glsl */`
  float h13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float vnoise(vec3 p){
    vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  // 紙纖維：細長的纖維（一個方向拉長的噪聲）＋細顆粒
  float fiber(vec3 p){ return (vnoise(p * 4.) - .5) * .022 + (vnoise(p * 23.) - .5) * .03 + (vnoise(p * .3) - .5) * .02; }
`;

export function makeCityMaterial() {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: false });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = NIGHT;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vLoc; varying vec3 vNl; varying vec3 vUnit; varying vec3 vScl; varying vec3 vPrm;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vUnit = position;
        vLoc = (instanceMatrix * vec4(position, 1.)).xyz;
        vNl = normalize(mat3(instanceMatrix) * normal);
        vScl = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vPrm = instanceColor;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uNight;
        varying vec3 vLoc; varying vec3 vNl; varying vec3 vUnit; varying vec3 vScl; varying vec3 vPrm;
        ${NOISE}`)
      // instanceColor 是參數，不乘進顏色
      .replace('#include <color_fragment>', `
        vec3 n = normalize(vNl);
        float side = 1. - step(.5, abs(n.y));
        bool alongZ = abs(n.x) > .5;                         // 面朝 ±X → 立面沿 z 展開
        float hz = alongZ ? vLoc.z : vLoc.x;
        float u = alongZ ? vUnit.z : vUnit.x;                // 盒子單位座標 −0.5..0.5
        float faceW = alongZ ? vScl.z : vScl.x;
        float edge = (.5 - abs(u)) * faceW;                  // 到立面左右邊的距離（m）
        float yb = vUnit.y * vScl.y;                         // 這個盒子自己的離底高度
        float yt = (1. - vUnit.y) * vScl.y;                  // 到頂的距離
        float style = floor(vPrm.g * 4.);
        bool body = fract(vPrm.g * 4.) > .4;                 // 大樓本體（簷口、柱、橋等配件是 .2）
        float H = vScl.y, um = u * faceW;                    // um：離立面中線的距離（m）
        float shade = 1.;
        float slot = 0.;                                     // 凹槽（白天陰影、夜裡窗燈）
        if (side > .5 && body) {
          if (style < .5 && faceW > 7. && H > 14.) {
            // 0：立面中間三道直槽（凹進去：槽內暗、一側再暗一條當內壁陰影）
            float sp = clamp(faceW * .1, 1.3, 2.6);
            for (int k = -1; k <= 1; k++) {
              float d = um - float(k) * sp;
              float inV = step(abs(d), .32) * step(H * .16, yb) * step(H * .14, yt);
              slot = max(slot, inV);
              shade -= inV * (.16 + .14 * step(d, -.18));
            }
          } else if (style < 1.5 && faceW > 9. && H > 10.) {
            // 1：上半部三道橫槽
            for (int k = 0; k < 3; k++) {
              float c = H - 3.2 - float(k) * 2.4;
              float d = yb - c;
              float inH = step(abs(d), .38) * step(abs(um), faceW * .36);
              slot = max(slot, inH);
              shade -= inH * (.16 + .14 * step(.2, d));
            }
          } else if (style > 2.5) {
            // 3：細溝（舊的垂直溝槽，淡）
            float P = 2.5 + vPrm.b * 2.;
            float f = abs(fract(hz / P) - .5);
            shade -= .07 * smoothstep(.44, .47, f) * step(1.2, edge);
          }
        }
        // 倒角亮邊：立面左右邊緣一條細亮線（紙板摺角吃光）
        shade += .045 * side * (1. - smoothstep(.05, .22, edge));
        // 切口亮邊：立面頂端一條薄薄的亮線（紙板切口吃光）
        shade += .05 * side * (1. - smoothstep(.06, .2, yt));
        // 盒子接地／接上一層的暗化＋街谷底部偏暗（假 AO）
        float ao = mix(.84, 1., smoothstep(0., 3.5, yb)) * mix(.86, 1., smoothstep(0., 40., vLoc.y));
        if (side < .5) ao *= 1.;
        float tint = .955 + .045 * vPrm.r;
        diffuseColor.rgb *= tint * shade * ao * (1. + fiber(vLoc));
        // 夜：窗帶裡少數格子亮暖燈
        // 夜：凹槽整條亮；其他立面藏一層 2.4×3.6 m 的窗格，少數亮燈
        float fy = fract(vLoc.y / 3.6), fz = fract(hz / 2.4);
        float grid = (body && side > .5) ? step(.25, fz) * step(fz, .75) * step(.3, fy) * step(fy, .75) * step(1.5, edge) * step(2.5, yb) : 0.;
        float cell = h13(floor(vec3(hz / 2.4, vLoc.y / 3.6, vPrm.b * 97.)));
        vec3 winGlow = vec3(1., .78, .5) * uNight * (slot * .8 + grid * step(.88, cell) * (.5 + .5 * cell));
      `)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += winGlow * 0.9;`);
  };
  return m;
}

// 地面：紙色＋跟著行進距離流動的人行道邊、車道虛線，讓速度讀得出來
export function makeGroundMaterial(street) {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uS = TRAVEL;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n varying vec3 vW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vW = (modelMatrix * vec4(position, 1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uS; varying vec3 vW; ${NOISE}`)
      .replace('#include <color_fragment>', `
        float d = uS - vW.z;                                  // 全域距離：同一點的花紋跟著城市流
        vec3 p = vec3(vW.x, 0., d);
        float ax = abs(vW.x);
        float s = 1.;
        s -= .06 * (1. - smoothstep(.0, .25, abs(ax - ${(street - 4.5).toFixed(1)})));                 // 人行道邊
        float dash = step(.5, fract(d / 9.)) * (1. - smoothstep(.08, .2, abs(ax - 6.)));
        s -= .05 * dash;
        s *= mix(.84, 1., smoothstep(0., 5., ${street.toFixed(1)} - ax));                              // 靠牆腳偏暗（假 AO）
        diffuseColor.rgb *= s * (1. + fiber(p));
      `);
  };
  return m;
}

// 紙飛機：淡藍紙，摺面明暗分明＋纖維
export function makePlaneMaterial() {
  const m = new THREE.MeshLambertMaterial({ color: '#a8c7e8', side: THREE.DoubleSide, flatShading: true });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n varying vec3 vP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n varying vec3 vP; ${NOISE}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= (1. + fiber(vP * 4.) * 1.2) * (1. - .22 * (1. - smoothstep(.004, .02, abs(vP.x))));');   // 中線摺痕
  };
  return m;
}
