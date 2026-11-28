// 隨風的花粉與種子（食譜 2 的粒子那一半）。
// 固定一池 instanced quad；z = mod(seedZ + travel + flutter, 34) − 24（相對鏡頭），兩端淡出；
// 高度＝粒子所在位置的地面高度＋自己的離地高；用「上一格」與「這一格」各自的鏡頭矩陣投影拉出動態殘影。
import * as THREE from './vendor/three.module.min.js';
import { U, TERRAIN_GLSL, LIGHT_GLSL } from './common.js';

export const CORRIDOR = 34, SIDE = 22;

export function makeParticles(count) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0]), 3));
  g.setIndex([0, 1, 2, 1, 3, 2]);
  let x = 4242; const rnd = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
  const s = new Float32Array(count * 4), r = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const seed = rnd() < 0.14;   // 大多是細粉，少數是看得出形狀的種子
    s.set([rnd() * SIDE, 0.15 + Math.pow(rnd(), 1.6) * 3.6, rnd() * CORRIDOR, seed ? 0.02 + rnd() * 0.022 : 0.008 + rnd() * 0.014], i * 4);
    r.set([rnd(), seed ? 1 : 0, i / count, rnd()], i * 4);
  }
  g.setAttribute('iS', new THREE.InstancedBufferAttribute(s, 4)); g.setAttribute('iR', new THREE.InstancedBufferAttribute(r, 4));
  g.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthTest: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: Object.assign({
      uTravel: { value: new THREE.Vector2() }, uDrift: { value: new THREE.Vector2() }, uTimeP: { value: new THREE.Vector2() },   // (這一格, 上一格)
      uPrevVP: { value: new THREE.Matrix4() }, uPrevD: { value: new THREE.Vector3() }, uCamZ: { value: 6 }, uActive: { value: 0.6 }, uStreak: { value: 1 }, uAspect: { value: 1.78 }, uPx: { value: 1 / 800 },
    }, U),
    vertexShader: /* glsl */`
      ${TERRAIN_GLSL}
      attribute vec4 iS, iR;
      uniform vec2 uTravel, uDrift, uTimeP; uniform mat4 uPrevVP; uniform vec3 uPrevD;
      uniform float uCamZ, uActive, uStreak, uAspect, uPx, uWind;
      varying vec2 vQ; varying float vA; varying float vKind; varying vec3 vDir;
      float pmod(float v, float m){ return mod(mod(v, m) + m, m); }
      vec3 ppos(float travel, float drift, float time, float d, float cd, float ed){
        float fl = sin(time*0.7 + iR.x*6.283)*0.6;
        float z = pmod(iS.z + travel + fl, ${CORRIDOR}.) - 24. + uCamZ;
        float x = pmod(iS.x + drift + sin(time*(0.5+iR.w) + iR.x*9.)*0.4, ${SIDE}.) - ${SIDE / 2}.;
        // 地面高度：用該格自己的里程（上一格用上一格的）
        float s = d - z, X = x + cd, lat = X - roadC(s);
        float gy = roadE(s) - ed + smoothstep(2.2,16.,abs(lat))*hillsF(X,s) + sideF(lat);
        return vec3(x, gy + iS.y + sin(time*1.3 + iR.x*20.)*0.18*(1.+uWind), z);
      }
      void main(){
        vec3 pc = ppos(uTravel.x, uDrift.x, uTimeP.x, uD, uCd, uEd);
        vec3 pp = ppos(uTravel.y, uDrift.y, uTimeP.y, uPrevD.x, uPrevD.y, uPrevD.z);
        if (abs(pc.z - pp.z) > 6. || abs(pc.x - pp.x) > 6.) pp = pc;          // 剛繞回：這一格不拉殘影
        vec4 cc = projectionMatrix*viewMatrix*vec4(pc,1.), cp = uPrevVP*vec4(pp,1.);
        float depth = cc.w;
        float vis = smoothstep(0.72, 2.15, depth)*(1. - smoothstep(15., 23., depth));
        vis *= smoothstep(${SIDE / 2}., ${SIDE / 2 - 2}., abs(pc.x))*step(iR.z, uActive);
        if (cp.w < 0.3) cp = cc;
        vec2 b = cc.xy/cc.w, a = cp.xy/cp.w;
        a = b + (a - b)*uStreak;
        vec2 dv = (b - a)*vec2(uAspect, 1.); float len = length(dv);
        vec2 dir = len > 1e-5 ? dv/len : vec2(1., 0.); vec2 nrm = vec2(-dir.y, dir.x);
        float size = max(iS.w*projectionMatrix[1][1]/depth, uPx*1.5);            // NDC 高度單位；不小於 1.5 像素
        float fadeSmall = min(1., iS.w*projectionMatrix[1][1]/depth/(uPx*1.5));
        vec2 off = dir*(position.x*(size + len) ) + nrm*position.y*size;
        vec2 mid = (a + b)*0.5;
        vQ = position.xy*2.; vKind = iR.y;
        vA = vis*fadeSmall*size/(size + len*0.7);
        vDir = normalize(pc - cameraPosition);
        if (vis < 0.002 || depth < 0.3) { gl_Position = vec4(2., 2., 2., 1.); return; }
        gl_Position = vec4((mid + off/vec2(uAspect, 1.))*cc.w, cc.z, cc.w);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSun, uSunCol, uAmbCol;
      varying vec2 vQ; varying float vA; varying float vKind; varying vec3 vDir;
      void main(){
        float r = length(vQ);
        float soft = smoothstep(1., 0.25, r);
        if (vKind > 0.5) soft = max(soft*0.55, smoothstep(0.5, 0.1, r));           // 種子：亮芯＋絨毛暈
        float back = pow(max(dot(vDir, uSun), 0.), 5.);
        vec3 col = vec3(1.0,0.96,0.82)*(uAmbCol*0.55 + uSunCol*(0.22 + 1.5*back));  // 跟雲吃同一顆太陽
        float a = soft*vA*0.9;
        gl_FragColor = vec4(col*a, a);
      }`,
  });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.matrixAutoUpdate = false; m.renderOrder = 10;
  return m;
}
