// 步驟 5 大氣：全場共用的霧（含往太陽方向發亮的大氣散射）、太陽光暈、建築窗燈。
// 鏡頭永遠不動，所以太陽在「視線空間」的方向是常數，直接烘進 shader。
// three.js 只會把內建霧的 uniform 傳給每個材質（含 Tripo 模型），所以借用線性霧的兩個欄位：
//   fogNear＝霧密度（指數平方霧）、fogFar＝太陽散射強度。
import * as THREE from 'three';

export function installHaze(sunViewDir, sunHaze) {
  const v = sunViewDir.clone().normalize(), f = (x) => x.toFixed(5);
  const SUNV = `vec3(${f(v.x)}, ${f(v.y)}, ${f(v.z)})`, HAZE = `vec3(${f(sunHaze.r)}, ${f(sunHaze.g)}, ${f(sunHaze.b)})`;
  THREE.ShaderChunk.fog_pars_vertex = '#ifdef USE_FOG\n varying vec3 vFogView;\n#endif';
  THREE.ShaderChunk.fog_vertex = '#ifdef USE_FOG\n vFogView = mvPosition.xyz;\n#endif';
  THREE.ShaderChunk.fog_pars_fragment = '#ifdef USE_FOG\n uniform vec3 fogColor; varying vec3 vFogView;\n uniform float fogNear; uniform float fogFar;\n#endif';
  THREE.ShaderChunk.fog_fragment = /* glsl */`
#ifdef USE_FOG
  float fDist = length(vFogView);
  // 氛圍優先：往上看（頭頂的倒掛城市）霧淡一些，沿軸往地平線看霧最濃
  float fUp = smoothstep(0.15, 0.75, vFogView.y / fDist);
  float fDen = fogNear * mix(1.0, 0.55, fUp);
  float fogFactor = 1.0 - exp(-fDen * fDen * fDist * fDist);
  float sg = max(dot(vFogView / fDist, ${SUNV}), 0.);
  vec3 fCol = fogColor + ${HAZE} * fogFar * (pow(sg, 5.) * 0.22 + pow(sg, 40.) * 0.45);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fCol, clamp(fogFactor, 0., 1.));
#endif`;
}

// 太陽：小亮盤＋大片柔光（加法混色，不吃霧）
export function makeSun(pos, size) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,250,235,1)'); gr.addColorStop(0.08, 'rgba(255,246,220,0.95)'); gr.addColorStop(0.16, 'rgba(255,236,190,0.35)');
  gr.addColorStop(0.45, 'rgba(255,226,170,0.10)'); gr.addColorStop(1, 'rgba(255,220,160,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true });
  const s = new THREE.Sprite(mat); s.position.copy(pos); s.scale.setScalar(size); s.renderOrder = 2;
  return s;
}

// Tripo 建築的窗燈：貼圖裡偏暖、偏亮的像素就是窗；夜裡依每棟（instance）亂數陸續點亮
export const NIGHT = { value: 0 };
export function addWindowGlow(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = NIGHT;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vSeed;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\n vSeed = fract(sin(float(gl_InstanceID) * 12.9898) * 43758.5453);\n#else\n vSeed = 0.5;\n#endif');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight; varying float vSeed;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        // 只抓明顯偏黃橘、夠亮的像素（窗）。這裡是線性色：象牙白牆 r−b≈0.24、暖窗≈0.7
        float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        float warm = smoothstep(0.42, 0.58, diffuseColor.r - diffuseColor.b) * smoothstep(0.35, 0.55, lum);
        float on = smoothstep(vSeed - 0.05, vSeed + 0.05, uNight * 1.1);      // 每棟在不同時刻亮
        totalEmissiveRadiance += vec3(1.0, 0.78, 0.45) * warm * on * 1.6;
      }`);
  };
  mat.customProgramCacheKey = () => 'rs-winglow';
  mat.needsUpdate = true;
}

// 軸光：圓筒裡的光其實從轉軸來——面向軸的面（含頭頂倒掛城市的地面與屋頂）都該被照亮。
// 只在遠處加（近處保留目標圖的太陽方向）。給我自己控制的材質（地面、遠景代理）用。
export const AXIAL = { value: 1 };
export const AXIAL_VERT = `
vec4 axW = modelMatrix * vec4(transformed, 1.);
#ifdef USE_INSTANCING
 axW = modelMatrix * instanceMatrix * vec4(transformed, 1.);
#endif
vAxW = axW.xyz;`;
export function axialFrag(R) {
  return `{
    vec3 nW = normalize((vec4(normal, 0.) * viewMatrix).xyz);
    vec3 toAx = normalize(vec3(0., ${R.toFixed(1)} - vAxW.y, -vAxW.z));
    float axFar = smoothstep(1200., 3200., length(vAxW - cameraPosition));
    totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.9, 0.75) * max(dot(nW, toAx), 0.) * uAxial * axFar;
  }`;
}

// 遠景代理形狀的夜燈：沒有貼圖，就在物件空間撒一格一格的窗點，每棟在不同時刻亮；白天加軸光
export function addProxyGlow(mat, R) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = NIGHT; sh.uniforms.uAxial = AXIAL;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vSeed; varying vec3 vOP; varying vec3 vAxW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position;' + AXIAL_VERT + '\n#ifdef USE_INSTANCING\n vSeed = fract(sin(float(gl_InstanceID) * 12.9898) * 43758.5453);\n#else\n vSeed = 0.5;\n#endif');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight, uAxial; varying float vSeed; varying vec3 vOP; varying vec3 vAxW;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      ${axialFrag(R)}
      {
        vec3 q = floor(vOP / vec3(4., 3.5, 4.));
        float h = fract(sin(dot(q, vec3(12.9898, 78.233, 37.719)) + vSeed * 91.7) * 43758.5453);
        float on = smoothstep(vSeed - 0.05, vSeed + 0.05, uNight * 1.1);
        totalEmissiveRadiance += vec3(1.0, 0.78, 0.45) * step(0.72, h) * on * 0.9;
      }`);
  };
  mat.customProgramCacheKey = () => 'rs-proxyglow';
  mat.needsUpdate = true;
}
