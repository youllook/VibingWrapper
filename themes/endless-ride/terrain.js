// 地面、路、草、路邊物。全部由同一個里程驅動（食譜 1：endless-riding-parallax）。
// 路邊物是有限的一池 instance：z = mod(seedZ + 里程, L) − (L − 尾巴)，跑到鏡頭後面才繞回最遠端；
// GPU 只收「里程 mod L」（CPU 用 double 算餘數）。
import * as THREE from './vendor/three.module.min.js';
import { U, TERRAIN_GLSL, LIGHT_GLSL } from './common.js';

const rnd = (() => { let x = 987654321; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296); })();

// ── 地面（含路面）：一張跟著騎士的格網，高度在頂點算、顏色與法線在像素算（格網再粗也不會游動）──
export function makeTerrain() {
  const NI = 220, NJ = 230, pos = new Float32Array((NI + 1) * (NJ + 1) * 3), idx = [];
  for (let j = 0; j <= NJ; j++) for (let i = 0; i <= NI; i++) {
    const u = i / NI * 2 - 1, k = (j * (NI + 1) + i) * 3;
    pos[k] = Math.sign(u) * Math.pow(Math.abs(u), 1.9) * 520; pos[k + 1] = 0; pos[k + 2] = 14 - 720 * Math.pow(j / NJ, 2.3);
  }
  for (let j = 0; j < NJ; j++) for (let i = 0; i < NI; i++) { const a = j * (NI + 1) + i, b = a + 1, c = a + NI + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: Object.assign({ uShadow: { value: 1 }, uHead: { value: 0 }, uWet: { value: 0 } }, U),
    vertexShader: /* glsl */`
      ${TERRAIN_GLSL}
      varying vec3 vW;
      void main(){ vec3 p = position; p.y = groundY(p.xz); vW = p; gl_Position = projectionMatrix*viewMatrix*vec4(p,1.); }`,
    fragmentShader: /* glsl */`
      ${TERRAIN_GLSL}
      ${LIGHT_GLSL}
      uniform float uShadow, uHead, uWet;
      varying vec3 vW;
      float seg(vec2 p, vec2 a, vec2 b){ vec2 pa=p-a, ba=b-a; return length(pa - ba*clamp(dot(pa,ba)/dot(ba,ba),0.,1.)); }
      void main(){
        vec2 xz = vW.xz; float lat; float h = groundYL(xz, lat);
        float dist = length(vW - cameraPosition);
        float e = 0.3 + dist*0.004;
        vec3 n = normalize(vec3(h-groundY(xz+vec2(e,0.)), e, h-groundY(xz+vec2(0.,e))));
        float s = uD - xz.y, X = xz.x + uCd; vec2 gp = vec2(X, s);
        vec3 V = normalize(cameraPosition - vW);
        float gust; vec3 grass = grassColor(gp, gust);
        float fine = texture2D(uNoise, gp/4.).b, mid = texture2D(uNoise, gp/16.).a;
        grass *= 0.62 + 0.45*texture2D(uNoise, gp*vec2(1.3,0.25)).b;           // 草尖的細條紋，遠處沒有草葉時撐質感
        // 路：舊柏油＋褪色虛線＋土路肩
        float a = abs(lat);
        vec3 asph = vec3(0.105,0.10,0.098)*(0.7+0.6*fine)*(0.8+0.4*mid);
        asph = mix(asph, vec3(0.16,0.13,0.10), smoothstep(.55,.8,mid)*0.5);     // 補丁與塵土
        float dash = step(fract(s/12.), 0.38)*smoothstep(0.10,0.06,a)*(0.35+0.5*fine);
        asph = mix(asph, vec3(0.62,0.58,0.46), dash);
        float edge = a + (fine-.5)*0.5 + (mid-.5)*0.5;
        vec3 dirt = vec3(0.21,0.155,0.095)*(0.75+0.5*fine);
        vec3 alb = mix(asph, dirt, smoothstep(1.35,1.6,edge));
        float gMask = smoothstep(1.85,2.5,edge);
        alb = mix(alb, grass, gMask);
        float ndl = dot(n, uSun);
        float diff = mix(max(ndl,0.), ndl*0.5+0.5, gMask);                       // 草用包裹式漫射
        // 騎士的影子（太陽在前方，影子朝鏡頭拉長）
        vec2 L = -uSun.xz/max(uSun.y,0.12);
        float sd = min(seg(xz, vec2(0.,-.75), vec2(0.,.75)) - 0.08, seg(xz, vec2(0.,0.), L*1.45) - 0.12);
        float sh = 1. - uShadow*0.72*smoothstep(0.34, 0.02, sd)*smoothstep(7.,2.,length(xz));
        vec3 col = alb*(uSunCol*diff*sh + uAmbCol*(0.55+0.45*n.y)*(0.75+0.25*sh));
        col += grass*uSunCol*pow(max(dot(-V,uSun),0.),3.)*0.45*gMask*sh;          // 逆光透草
        vec3 Hh = normalize(uSun+V);
        col += uSunCol*pow(max(dot(n,Hh),0.),mix(60.,220.,uWet))*(0.22+1.1*uWet)*(1.-smoothstep(1.3,1.55,edge))*sh*(0.5+fine);   // 柏油反光
        // 車頭燈
        float cone = exp(-pow(xz.x/(0.5 - xz.y*0.2),2.))*smoothstep(-0.8,-2.5,xz.y)*exp(xz.y*0.06);
        col += alb*vec3(1.0,0.82,0.55)*cone*uHead*3.;
        gl_FragColor = vec4(applyFog(col, vW), 1.);
      }`,
  });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.matrixAutoUpdate = false;
  return m;
}

// ── 草：兩池 instance（近密細、遠疏寬），依里程循環 ──
function grassPool({ count, L, tail, latMax, latPow, width, height, flower }) {
  const g = new THREE.InstancedBufferGeometry();
  // 一片葉：5 頂點。position.x＝左右(-1..1)、position.y＝高度比例
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, -0.62, 0.5, 0, 0.62, 0.5, 0, 0, 1, 0]), 3));
  g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
  const a = new Float32Array(count * 4), b = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const lat = (1.9 + Math.pow(rnd(), latPow) * latMax) * (rnd() < 0.5 ? -1 : 1);
    a.set([lat, rnd() * L, rnd() * 6.283, 0.55 + rnd() * 0.75], i * 4);
    b.set([rnd(), rnd(), rnd(), rnd()], i * 4);
  }
  g.setAttribute('iA', new THREE.InstancedBufferAttribute(a, 4));
  g.setAttribute('iB', new THREE.InstancedBufferAttribute(b, 4));
  g.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: Object.assign({ uDl: { value: 0 }, uL: { value: L }, uTail: { value: tail }, uW: { value: width }, uH: { value: height }, uShadow: { value: 1 }, uFlower: { value: flower } }, U),
    vertexShader: /* glsl */`
      ${TERRAIN_GLSL}
      ${LIGHT_GLSL}
      attribute vec4 iA, iB;
      uniform float uDl, uL, uTail, uW, uH, uShadow, uFlower;
      varying vec3 vCol; varying vec3 vW;
      void main(){
        float z = mod(iA.y + uDl, uL) - (uL - uTail);
        float s = uD - z, lat = iA.x, x = lat + roadC(s) - uCd;
        float y0 = groundY(vec2(x, z));
        vec2 gp = vec2(x + uCd, s);
        float gust; vec3 base = grassColor(gp, gust);
        float n1 = texture2D(uNoise, gp/32.).r;
        float flower = step(1. - uFlower, iB.y);
        float t = position.y;
        float grow = smoothstep(0., 8., z + (uL - uTail)) * (0.45 + 0.55*smoothstep(1.9, 4.5, abs(lat)));
        float hgt = uH*iA.w*(0.45+0.8*n1)*grow*(1.+flower*0.15);
        float wid = uW*(0.7+0.6*iB.x);
        float tt = t, side = position.x;
        if (flower > 0.5) { if (t > 0.4 && t < 0.6) { tt = 0.88; side *= 1.7; } if (t < 0.4) side *= 0.45; }
        // 風：陣風＋各自的抖動，沿風向彎（越高彎越多）
        vec2 wd = normalize(vec2(0.85, 0.5));
        float sway = ((0.12 + 0.75*gust)*uWind + sin(uTime*(2.2+iB.z*2.5) + iB.z*40. + gp.x*0.6)*0.09*(0.4+uWind));
        vec2 ax = vec2(cos(iA.z), sin(iA.z)*0.35);
        vec3 p = vec3(x, y0, z);
        p.xz += ax*side*wid + wd*sway*hgt*tt*tt;
        p.y += hgt*tt*(1. - 0.35*sway*sway*tt);
        vW = p;
        // 騎士影子（跟地面同一條）
        vec2 Ls = -uSun.xz/max(uSun.y,0.12)*1.45; vec2 pa = p.xz, ba = Ls;
        float sd = length(pa - ba*clamp(dot(pa,ba)/dot(ba,ba),0.,1.)) - 0.12;
        float sh = 1. - uShadow*0.6*smoothstep(0.34,0.02,sd)*smoothstep(7.,2.,length(p.xz));
        vec3 V = normalize(cameraPosition - p);
        float back = pow(max(dot(-V,uSun),0.),3.);
        vec3 c = base*(0.45 + 0.95*tt)*(0.8+0.4*iB.w);
        vec3 lit = c*(uSunCol*(0.34+0.22*gust)*sh + uAmbCol*0.95) + c*uSunCol*back*0.8*tt*sh;
        if (flower > 0.5 && t > 0.4) {
          vec3 fc = iB.x < 0.4 ? vec3(0.95,0.92,0.8) : (iB.x < 0.75 ? vec3(0.95,0.72,0.12) : vec3(0.62,0.42,0.85));
          lit = fc*(uSunCol*0.5*sh + uAmbCol*0.8);
        }
        vCol = lit;
        gl_Position = projectionMatrix*viewMatrix*vec4(p,1.);
      }`,
    fragmentShader: /* glsl */`
      ${LIGHT_GLSL}
      varying vec3 vCol; varying vec3 vW;
      void main(){ gl_FragColor = vec4(applyFog(vCol, vW), 1.); }`,
  });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.matrixAutoUpdate = false;
  m.userData.L = L;
  return m;
}
export function makeGrass(small) {
  const k = small ? 0.5 : 1;
  return [
    grassPool({ count: Math.round(80000 * k), L: 36, tail: 9, latMax: 14, latPow: 1.45, width: 0.022, height: 0.5, flower: 0.012 }),
    grassPool({ count: Math.round(60000 * k), L: 120, tail: 9, latMax: 48, latPow: 1.25, width: 0.07, height: 0.62, flower: 0 }),
  ];
}

// ── 石頭與路樁：同一套循環 ──
function propPool({ geo, count, L, tail, seed, pole }) {
  const g = new THREE.InstancedBufferGeometry(); g.index = geo.index; g.attributes.position = geo.attributes.position; g.attributes.normal = geo.attributes.normal;
  const a = new Float32Array(count * 4), b = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) { const v = seed(i); a.set(v[0], i * 4); b.set(v[1], i * 4); }
  g.setAttribute('iA', new THREE.InstancedBufferAttribute(a, 4)); g.setAttribute('iB', new THREE.InstancedBufferAttribute(b, 4)); g.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    uniforms: Object.assign({ uDl: { value: 0 }, uL: { value: L }, uTail: { value: tail }, uPole: { value: pole ? 1 : 0 } }, U),
    vertexShader: /* glsl */`
      ${TERRAIN_GLSL}
      attribute vec4 iA, iB;
      uniform float uDl, uL, uTail, uPole;
      varying vec3 vW, vN, vC;
      void main(){
        float z = mod(iA.y + uDl, uL) - (uL - uTail);
        float s = uD - z, x = iA.x + roadC(s) - uCd;
        float c = cos(iA.w), sn = sin(iA.w);
        vec3 q = position*vec3(iA.z, iA.z*iB.w, iA.z);
        q = vec3(c*q.x + sn*q.z, q.y, -sn*q.x + c*q.z);
        vec3 nn = normalize(normal/vec3(1., iB.w, 1.)); nn = vec3(c*nn.x + sn*nn.z, nn.y, -sn*nn.x + c*nn.z);
        float grow = smoothstep(0., 30., z + (uL - uTail));
        vec3 p = vec3(x, groundY(vec2(x,z)) - (1.-uPole)*iA.z*iB.w*0.35, z) + q*grow;
        vW = p; vN = nn;
        vC = uPole > 0.5 ? (position.y > 0.86 ? vec3(0.75,0.12,0.08) : (position.y > 0.76 ? vec3(0.8,0.8,0.76) : vec3(0.13,0.105,0.085))) : iB.rgb;
        gl_Position = projectionMatrix*viewMatrix*vec4(p,1.);
      }`,
    fragmentShader: /* glsl */`
      ${LIGHT_GLSL}
      varying vec3 vW, vN, vC;
      void main(){
        vec3 n = normalize(vN);
        vec3 col = vC*(uSunCol*max(dot(n,uSun),0.) + uAmbCol*(0.5+0.5*n.y));
        gl_FragColor = vec4(applyFog(col, vW), 1.);
      }`,
  });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.matrixAutoUpdate = false; m.userData.L = L;
  return m;
}
export function makeProps() {
  // 石頭：頂點抖過的二十面體，平面著色
  let rock = new THREE.IcosahedronGeometry(1, 1);
  { const p = rock.attributes.position, seen = new Map();
    for (let i = 0; i < p.count; i++) {
      const key = [p.getX(i), p.getY(i), p.getZ(i)].map(v => v.toFixed(3)).join(',');
      if (!seen.has(key)) seen.set(key, 0.72 + rnd() * 0.5);
      const k = seen.get(key); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
    }
    rock.computeVertexNormals(); }
  const rocks = propPool({ geo: rock, count: 170, L: 440, tail: 20, seed: () => {
    const big = rnd() < 0.12, lat = (3.4 + Math.pow(rnd(), 1.5) * (big ? 110 : 70)) * (rnd() < 0.42 ? -1 : 1), sc = big ? 1.2 + rnd() * 2.6 : 0.18 + rnd() * 0.6;
    const g = 0.16 + rnd() * 0.1; return [[lat, rnd() * 440, sc, rnd() * 6.28], [g * 1.02, g, g * 0.95, 0.55 + rnd() * 0.5]];
  } });
  const pole = new THREE.BoxGeometry(0.06, 0.95, 0.06, 1, 19, 1).translate(0, 0.475, 0);
  const poles = propPool({ geo: pole, count: 60, L: 420, tail: 20, pole: true, seed: i => [[(i % 2 ? 2.9 : -2.9), Math.floor(i / 2) * 14 + (i % 2) * 7, 1, 0.05 * i], [0, 0, 0, 1]] });
  return [rocks, poles];
}
