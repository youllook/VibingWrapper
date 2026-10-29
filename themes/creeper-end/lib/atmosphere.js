// 氛圍（階段 5）：紫霧、島底柔光、天空與太陽暈、發光點光暈、漂浮粒子。
// 霧與天空用同一個「視線方向 → 顏色」函式，遠處的島才會自然融進天空。
import * as THREE from '../vendor/three.module.min.js';

export const ATM = {
  // 霧：起點、密度（距離），高度霧（越低越濃：從 hTop 到 hBot 加到 hMax）
  fogStart: 40, fogDens: 0.0035, hTop: -30, hBot: -170, hMax: 0.5,
  // 天色（依視線仰角）：上方偏粉紫、地平偏紫、往下深紫；以及太陽方向的暖暈
  skyHigh: '#9a6a86', skyMid: '#7a5694', skyLow: '#45325f',   // 會經過曝光 1.25＋ACES，所以比目標圖暗
  sunDir: [0.35, 0.22, -1], sunCol: '#ffd9a8', sunGlow: 0.4, sunPow: 6,
  // 島底柔光（違反物理，目標圖 prompt 有寫）：島頂面以下越深越亮的粉紫自發光（鏡頭看不到朝下的面，所以按深度不按法線）
  underCol: '#b060d0', underI: 0.45,
  // 發光點光暈、漂浮粒子
  haloSize: 2.6, haloCol: '#ff8af0', haloI: 0.9, motes: 260, moteCol: '#f3c8ff',
};

const GLSL_SKY = `
uniform vec3 uSkyHigh, uSkyMid, uSkyLow, uSunDir, uSunCol;
uniform float uSunGlow, uSunPow;
vec3 skyColor(vec3 d) {
  float e = d.y;
  vec3 c = e > -0.08 ? mix(uSkyMid, uSkyHigh, smoothstep(-0.08, 0.35, e)) : mix(uSkyMid, uSkyLow, smoothstep(-0.08, -0.7, e));
  return c + uSunCol * uSunGlow * pow(max(dot(d, uSunDir), 0.0), uSunPow);
}`;

export function makeUniforms(a = ATM) {
  const col = c => new THREE.Color(c);
  return {
    uSkyHigh: { value: col(a.skyHigh) }, uSkyMid: { value: col(a.skyMid) }, uSkyLow: { value: col(a.skyLow) },
    uSunDir: { value: new THREE.Vector3(...a.sunDir).normalize() }, uSunCol: { value: col(a.sunCol) },
    uSunGlow: { value: a.sunGlow }, uSunPow: { value: a.sunPow },
    uFog: { value: new THREE.Vector4(a.fogStart, a.fogDens, a.hTop, a.hBot) }, uHMax: { value: a.hMax },
    uUnderCol: { value: col(a.underCol) }, uUnderI: { value: a.underI },
  };
}

// 把霧＋島底光注入一個 Lambert／Basic 材質（共用同一組 uniforms，改 ATM 後呼叫 syncUniforms 即時生效）
export function patchMaterial(mat, U, { under = false } = {}) {
  mat.fog = false;
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying float vWNy; varying float vLY;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWNy = normalize(mat3(modelMatrix) * normal).y; vLY = transformed.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWP; varying float vWNy; varying float vLY;
uniform vec4 uFog; uniform float uHMax; uniform vec3 uUnderCol; uniform float uUnderI;
${GLSL_SKY}`)
      .replace('#include <tonemapping_fragment>', `{
  vec3 d = vWP - cameraPosition; float dist = length(d); d /= dist;
  ${under ? 'gl_FragColor.rgb += uUnderCol * uUnderI * smoothstep(-1.5, -12.0, vLY) * (1.0 - max(vWNy, 0.0));' : ''}
  float f = 1.0 - exp(-max(0.0, dist - uFog.x) * uFog.y);
  float h = smoothstep(uFog.z, uFog.w, vWP.y) * uHMax;
  f = 1.0 - (1.0 - f) * (1.0 - h);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, skyColor(d), clamp(f, 0.0, 1.0));
}
#include <tonemapping_fragment>`);   // 在色調映射前混（線性空間），和天空球一致
  };
  mat.customProgramCacheKey = () => 'atm' + (under ? 'U' : '');
  mat.needsUpdate = true;
  return mat;
}

// 天空球：和霧同一個顏色函式
export function makeSky(U, radius = 3000) {
  const m = new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = (modelMatrix*vec4(position,1.)).xyz - cameraPosition; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    // 走和材質一樣的色調映射＋sRGB 轉換，霧色和天空才接得上
    fragmentShader: `${GLSL_SKY}\nvarying vec3 vD; void main(){ gl_FragColor = vec4(skyColor(normalize(vD)), 1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`,
  });
  const s = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), m);
  s.frustumCulled = false; s.renderOrder = -1;
  s.onBeforeRender = (r, sc, cam) => s.position.copy(cam.position);
  return s;
}

// 發光點：掃 slot 為 chorusFlower / obsidianGlow 的 mesh，每個朝上的面中心放一顆加亮光暈（世界座標、大小依物件縮放）
export function makeHalos(root, a = ATM) {
  root.updateMatrixWorld(true);
  const pos = [], size = [], p = new THREE.Vector3(), s = new THREE.Vector3();
  root.traverse(o => {
    if (!o.isMesh || !['chorusFlower', 'obsidianGlow'].includes(o.userData.slot)) return;
    const P = o.geometry.attributes.position, N = o.geometry.attributes.normal;
    o.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
    for (let i = 0; i + 3 < P.count; i += 4) {
      if (N.getY(i) < 0.9) continue;
      p.set(0, 0, 0); for (let k = 0; k < 4; k++) p.add(new THREE.Vector3().fromBufferAttribute(P, i + k));
      p.multiplyScalar(0.25).applyMatrix4(o.matrixWorld);
      pos.push(p.x, p.y, p.z); size.push(s.x * a.haloSize);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('size', new THREE.Float32BufferAttribute(size, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(a.haloCol) }, uI: { value: a.haloI }, uScale: { value: 1 }, uT: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float size; uniform float uScale; uniform float uT; varying float vF;
      void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*mv;
        float tw = 0.85 + 0.15*sin(uT*1.3 + position.x*0.7 + position.z*0.3);
        gl_PointSize = size * uScale / -mv.z * tw; vF = exp(-max(0., -mv.z - 40.) * 0.003); }`,
    fragmentShader: `uniform vec3 uCol; uniform float uI; varying float vF;
      void main(){ float r = length(gl_PointCoord - .5) * 2.; float a = exp(-r*r*4.) ; gl_FragColor = vec4(uCol * a * uI * vF, 1.); }`,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  return pts;
}

// 漂浮粒子：鏡頭前方一個大盒子裡慢慢飄的小光點
export function makeMotes(cam, a = ATM) {
  const n = a.motes, pos = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 160; pos[i * 3 + 1] = -60 + Math.random() * 90; pos[i * 3 + 2] = -20 - Math.random() * 180;
    seed[i] = Math.random() * 100;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uCol: { value: new THREE.Color(a.moteCol) }, uScale: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float seed; uniform float uT; uniform float uScale; varying float vA;
      void main(){ float rise = mod(uT*0.6 + seed*3.0, 30.0);   // 慢慢往上飄 30 單位後回到原處重來
        vec3 p = position + vec3(sin(uT*0.11+seed)*3., rise, cos(uT*0.09+seed*1.7)*3.);
        vec4 mv = modelViewMatrix*vec4(p,1.); gl_Position = projectionMatrix*mv;
        gl_PointSize = 0.5 * uScale / -mv.z; vA = (0.35 + 0.35*sin(uT*0.8+seed)) * smoothstep(0., 6., rise) * smoothstep(30., 24., rise); }`,
    fragmentShader: `uniform vec3 uCol; varying float vA;
      void main(){ float r = length(gl_PointCoord-.5)*2.; gl_FragColor = vec4(uCol * exp(-r*r*5.) * vA, 1.); }`,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  return pts;
}

export function syncUniforms(U, a = ATM) {
  U.uSkyHigh.value.set(a.skyHigh); U.uSkyMid.value.set(a.skyMid); U.uSkyLow.value.set(a.skyLow);
  U.uSunDir.value.set(...a.sunDir).normalize(); U.uSunCol.value.set(a.sunCol);
  U.uSunGlow.value = a.sunGlow; U.uSunPow.value = a.sunPow;
  U.uFog.value.set(a.fogStart, a.fogDens, a.hTop, a.hBot); U.uHMax.value = a.hMax;
  U.uUnderCol.value.set(a.underCol); U.uUnderI.value = a.underI;
}
