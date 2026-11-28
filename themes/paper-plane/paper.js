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
  float fiber(vec3 p){ return (vnoise(p * vec3(2.2, 9., 2.2)) - .5) * .05 + (vnoise(p * 23.) - .5) * .035 + (vnoise(p * .35) - .5) * .04; }
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
        float shade = 1.;
        float win = 0.;                                      // 窗帶（夜裡發光的位置）
        if (side > .5 && style < 3.5) {
          // 0 垂直溝槽、1 水平窗帶、2 格子、3 素面
          if (style < .5 || style > 1.5) {
            float P = 3. + vPrm.b * 3.;
            float f = abs(fract(hz / P) - .5);
            shade -= .13 * smoothstep(.43, .47, f) * step(1.2, edge);
          }
          if (style > .5) {
            float f = fract(vLoc.y / 3.6);
            float band = smoothstep(.50, .53, f) * (1. - smoothstep(.80, .83, f)) * step(1.5, edge) * step(2.5, yb) * step(1.2, yt);
            shade -= (style > 1.5 ? .04 : .07) * band;
            win = band;
          }
        }
        // 切口亮邊：立面頂端一條薄薄的亮線（紙板切口吃光）
        shade += .05 * side * (1. - smoothstep(.06, .2, yt));
        // 盒子接地／接上一層的暗化＋街谷底部偏暗（假 AO）
        float ao = mix(.80, 1., smoothstep(0., 3.5, yb)) * mix(.80, 1., smoothstep(0., 40., vLoc.y));
        if (side < .5) ao *= 1.;
        float tint = .93 + .07 * vPrm.r;
        diffuseColor.rgb *= tint * shade * ao * (1. + fiber(vLoc));
        // 夜：窗帶裡少數格子亮暖燈
        float cell = h13(floor(vec3(hz / 2.4, vLoc.y / 3.6, vPrm.b * 97.)));
        vec3 winGlow = vec3(1., .78, .5) * win * step(.87, cell) * uNight * (.5 + .5 * cell);
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
