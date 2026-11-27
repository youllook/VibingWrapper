// 步驟 4 材質：把程式紋理注入 three.js 內建材質（保留它的光照與霧，跟 Tripo 模型一致）。
// 每個 patch 都拿「物件空間座標」vP 來算：地面／橋面的物件空間＝棲地座標，桁架是單節本地座標。
import * as THREE from 'three';
import { R } from './ring.js';
import { AXIAL, AXIAL_VERT, axialFrag } from './atmos.js';

const COMMON = /* glsl */`
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
// 抗鋸齒的「離格線多近」：回傳 1＝在線上
float gridLine(float v, float period, float width){ float d = abs(fract(v / period + 0.5) - 0.5) * period; float w = fwidth(v) * 1.2; return 1. - smoothstep(width * 0.5, width * 0.5 + w, d); }
`;

// 以 onBeforeCompile 改 diffuseColor；body 是 GLSL，能用 vP（物件空間）與 diffuseColor
// axial＝true 時加「軸光」（見 atmos.js），讓頭頂倒掛城市的地面也被照亮
function patch(mat, key, body, extra = '', axial = false) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uAxial = AXIAL;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vP; varying vec3 vAxW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = position;' + AXIAL_VERT);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vP; varying vec3 vAxW; uniform float uAxial;\n' + COMMON + extra)
      .replace('#include <color_fragment>', '#include <color_fragment>\n{\n' + body + '\n}');
    if (axial) sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + axialFrag(R));
  };
  mat.customProgramCacheKey = () => key;
  mat.needsUpdate = true;
}

export function applyMaterials(M) {
  // ── 地面：街廓。主幹道 240 m、巷道 80 m；街廓依亂數當公園／廣場／花園；道路淺石色、人行道更淺
  M.floor.color.set('#ffffff');
  patch(M.floor, 'rs-floor', /* glsl */`
    float th = atan(-vP.z, -vP.y), s = th * ${R.toFixed(1)}, x = vP.x;
    vec2 q = vec2(x, s);
    vec2 cell = floor(q / 240.), sub = floor(q / 80.);
    float kind = h21(sub * 1.7 + cell * 0.31);
    vec3 grass = mix(vec3(0.47, 0.60, 0.36), vec3(0.58, 0.68, 0.40), fbm(q / 35.));
    vec3 plaza = mix(vec3(0.83, 0.80, 0.72), vec3(0.90, 0.87, 0.80), fbm(q / 9.));
    vec3 garden = mix(grass, vec3(0.70, 0.62, 0.50), step(0.55, fbm(q / 6.)) * 0.6);   // 花圃／步道
    vec3 base = kind < 0.45 ? grass : kind < 0.75 ? plaza : garden;
    // 樹冠斑點（遠看是一點一點的綠）
    float tree = step(0.72, fbm(q / 7. + 13.)) * step(kind, 0.75);
    base = mix(base, vec3(0.30, 0.45, 0.27), tree * 0.8);
    float major = max(gridLine(x, 240., 16.), gridLine(s, 240., 16.));
    float minor = max(gridLine(x, 80., 7.), gridLine(s, 80., 7.));
    float walk = max(gridLine(x, 240., 22.), gridLine(s, 240., 22.)) - major;
    vec3 road = vec3(0.74, 0.72, 0.67), side = vec3(0.86, 0.84, 0.79);
    base = mix(base, side, clamp(walk, 0., 1.));
    base = mix(base, road, max(major, minor * 0.85));
    // 遠看時把街廓畫滿屋頂（象牙白、淺灰、偶爾綠屋頂），補足遠處城市的密度；近處（有真建築）不畫
    float far = smoothstep(0.6, 2.5, max(fwidth(q.x), fwidth(q.y)));
    vec2 lot = floor(q / 26.); float hr = h21(lot + 7.3);
    vec3 roof = hr < 0.5 ? vec3(0.88, 0.84, 0.76) : hr < 0.8 ? vec3(0.74, 0.72, 0.68) : vec3(0.52, 0.62, 0.42);
    float isRoof = step(0.55, h21(lot * 1.31)) * (1. - max(major, minor));
    base = mix(base, roof, isRoof * far);
    diffuseColor.rgb = base;
  `, '', true);

  // ── 護欄桁架：象牙白烤漆、每 2 m 一道接縫、下半部微微髒、零星鉚釘
  M.truss.color.set('#ffffff');
  patch(M.truss, 'rs-truss', /* glsl */`
    vec3 paint = vec3(0.90, 0.87, 0.80);
    float seam = gridLine(vP.z, 2.0, 0.03);
    float rivet = step(0.82, h21(floor(vP.zy * vec2(6., 6.)))) * gridLine(vP.y, 0.5, 0.05) * 0.5;
    float grime = smoothstep(1.4, 0.0, vP.y) * 0.18 + fbm(vP.zy * 3.) * 0.08;
    diffuseColor.rgb = paint * (1. - grime) * (1. - seam * 0.25) * (1. - rivet * 0.3);
  `);

  // ── 橋面：混凝土板（6 m 一道接縫）；兩組軌道之間是深色道碴；右側是格柵人行道
  M.deck.color.set('#ffffff');
  patch(M.deck, 'rs-deck', /* glsl */`
    float th = atan(-vP.z, -vP.y), s = th * ${(R - 22).toFixed(1)}, x = vP.x;
    vec3 conc = mix(vec3(0.66, 0.65, 0.61), vec3(0.75, 0.74, 0.70), fbm(vec2(x, s) * 0.6));
    conc *= 1. - gridLine(s, 6., 0.05) * 0.3;
    float ballast = max(1. - smoothstep(1.2, 1.5, abs(x - 0.)), 1. - smoothstep(1.2, 1.5, abs(x - 3.8)));
    vec3 gravel = mix(vec3(0.36, 0.34, 0.31), vec3(0.50, 0.47, 0.42), h21(floor(vec2(x, s) * 18.)));
    vec3 c = mix(conc, gravel, ballast);
    float walkway = step(6.2, x) * step(x, 8.3);
    float grate = max(gridLine(x, 0.12, 0.025), gridLine(s, 0.12, 0.025));
    float far = smoothstep(0.015, 0.05, max(fwidth(x), fwidth(s)));     // 遠處格柵糊成平均色，避免摩爾紋
    grate = mix(grate, 0.38, far);
    c = mix(c, mix(vec3(0.62, 0.62, 0.60), vec3(0.30, 0.30, 0.30), grate), walkway);
    diffuseColor.rgb = c;
  `);

  // ── 拱肋、縱肋：白色金屬，分段接縫
  M.rib.color.set('#ffffff');
  patch(M.rib, 'rs-rib', /* glsl */`
    float th = atan(-vP.z, -vP.y);
    diffuseColor.rgb = vec3(0.92, 0.93, 0.90) * (1. - gridLine(th * 2000., 40., 1.5) * 0.25);
  `);

  M.rail.color.set('#8d8a84');
  M.water.color.set('#7fb0bb');
}
