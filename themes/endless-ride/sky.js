// 天空、遠景（山稜＋瞭望塔，掛在同一個 landscape transform）、體積雲與低霧（食譜 2 的雲那一半）。
import * as THREE from './vendor/three.module.min.js';
import { U, LIGHT_GLSL } from './common.js';

export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false,
    uniforms: Object.assign({ uSkyTop: { value: new THREE.Vector3() }, uSkyHor: { value: new THREE.Vector3() }, uSunVis: { value: 1 }, uStars: { value: 0 } }, U),
    vertexShader: /* glsl */`varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix*viewMatrix*vec4(position + cameraPosition, 1.); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */`
      ${LIGHT_GLSL}
      uniform vec3 uSkyTop, uSkyHor; uniform float uSunVis, uStars;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir); float h = max(d.y, 0.);
        vec3 col = mix(uSkyHor, uSkyTop, pow(h, 0.42));
        col = mix(col, uFogCol, smoothstep(0.06, -0.02, d.y));
        float sd = max(dot(d, uSun), 0.);
        col += uSunCol*uSunVis*(smoothstep(0.99955,0.9998,sd)*14. + pow(sd,220.)*0.9 + pow(sd,24.)*0.13 + pow(sd,4.)*0.03);
        if (uStars > 0.01) { vec2 g = d.xz/(d.y+0.4)*90.; vec2 c = floor(g); float r = fract(sin(dot(c, vec2(127.1,311.7)))*43758.5); col += uStars*step(0.985, r)*smoothstep(0.35,0.05,length(fract(g)-.5))*h*2.; }
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), mat); m.frustumCulled = false; m.renderOrder = -10;
  return m;
}

// ── 遠景：幾層真的有厚度的山稜（CPU 高度場）＋一座石塔與殘拱。全部掛在 landscape 底下 ──
const RIDGE_MAT = () => new THREE.ShaderMaterial({
  uniforms: Object.assign({ uSnow: { value: 0 }, uStone: { value: 0 } }, U),
  vertexShader: /* glsl */`varying vec3 vW, vN; varying float vH; attribute float aH;
    void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal); vH = aH; gl_Position = projectionMatrix*viewMatrix*w; }`,
  fragmentShader: /* glsl */`
    ${LIGHT_GLSL}
    uniform float uSnow, uStone; varying vec3 vW, vN; varying float vH;
    void main(){
      vec3 n = normalize(vN);
      float tx = texture2D(uNoise, vW.xz/90.).r, tx2 = texture2D(uNoise, vec2(vW.x+vW.z, vW.y*2.)/40.).b;
      vec3 rock = mix(vec3(0.16,0.15,0.15), vec3(0.30,0.27,0.24), tx);
      vec3 grass = mix(vec3(0.07,0.13,0.04), vec3(0.17,0.22,0.06), tx);
      float slope = smoothstep(0.55, 0.8, n.y + (tx-.5)*0.25);
      vec3 alb = mix(rock, grass, slope*smoothstep(0.75,0.25,vH)*(1.-uStone));
      alb = mix(alb, vec3(0.86,0.88,0.92), uSnow*smoothstep(0.52,0.72, vH + (tx-.5)*0.3 + (n.y-.6)*0.3));
      if (uStone > 0.5) alb = mix(vec3(0.20,0.185,0.17), vec3(0.36,0.33,0.29), tx2)*(0.9+0.2*step(0.5,fract(vW.y/3.2 + tx*0.3)));
      vec3 col = alb*(uSunCol*max(dot(n,uSun),0.)*1.1 + uAmbCol*(0.55+0.45*n.y));
      gl_FragColor = vec4(applyFog(col, vW), 1.);
    }`,
});
export function makeLandscape(noise) {
  const land = new THREE.Group();
  const ridged = (u, v) => { let s = 0, a = 1, f = 1, tot = 0; for (let o = 0; o < 4; o++) { const n = noise.sample(o % 2, u * f + o * 0.31, v * f + o * 0.17); s += (1 - Math.abs(2 * n - 1)) * a; tot += a; a *= 0.5; f *= 2.1; } return s / tot; };
  function ridge({ x, z, w, depth, h, seed, snow = 0, yaw = 0, base = -140 }) {
    const g = new THREE.PlaneGeometry(w, depth, 150, 30); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, aH = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / w + 0.5, v = p.getZ(i) / depth + 0.5;
      const env = Math.pow(Math.sin(Math.PI * v), 0.8) * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, u))), 0.35);
      const r = ridged(u * w / 2600 + seed, v * depth / 2600 + seed * 1.7), big = noise.sample(1, u * w / 5200 + seed * 0.7, 0.5);
      const k = env * (0.25 + 0.75 * big) * Math.pow(r, 1.6);
      p.setY(i, k * h); aH[i] = k;
    }
    g.setAttribute('aH', new THREE.BufferAttribute(aH, 1)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, RIDGE_MAT()); m.material.uniforms.uSnow.value = snow; m.position.set(x, base, z); m.rotation.y = yaw; m.frustumCulled = false;
    land.add(m); return m;
  }
  // 由近到遠：綠丘 → 岩稜 → 帶雪高峰。深度差就是視差差。
  ridge({ x: -420, z: -560, w: 1500, depth: 420, h: 520, seed: 0.13 });
  ridge({ x: 700, z: -900, w: 1700, depth: 520, h: 760, seed: 0.57, yaw: 0.25 });
  ridge({ x: -200, z: -1300, w: 3600, depth: 700, h: 1050, seed: 0.91, snow: 0.6 });
  ridge({ x: 300, z: -2300, w: 6400, depth: 1000, h: 1750, seed: 0.37, snow: 1 });
  ridge({ x: -1500, z: -700, w: 1300, depth: 1500, h: 900, seed: 0.74, snow: 0.4, yaw: 1.2 });

  // 地標：獨立石丘上的瞭望塔＋殘拱（原創造型）
  const stone = RIDGE_MAT(); stone.uniforms.uStone.value = 1;
  const tower = new THREE.Group(); tower.position.set(-135, 0, -500); land.add(tower);
  const add = (geo, x, y, z, ry = 0) => { geo.setAttribute('aH', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count), 1)); const m = new THREE.Mesh(geo, stone); m.position.set(x, y, z); m.rotation.y = ry; m.frustumCulled = false; tower.add(m); return m; };
  const knoll = new THREE.Mesh(new THREE.ConeGeometry(120, 150, 18, 6), RIDGE_MAT()); knoll.geometry.setAttribute('aH', new THREE.BufferAttribute(new Float32Array(knoll.geometry.attributes.position.count).fill(0.3), 1));
  { const p = knoll.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const k = 0.82 + 0.36 * noise.sample(0, p.getX(i) / 300 + 0.3, p.getZ(i) / 300 + 0.8); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k * 1.3); } knoll.geometry.computeVertexNormals(); }
  knoll.position.set(0, -45, 10); knoll.frustumCulled = false; tower.add(knoll);
  const TH = 78, by = 22;
  add(new THREE.CylinderGeometry(8.2, 11, TH, 12, 1), 0, by + TH / 2, 0);
  add(new THREE.CylinderGeometry(10.4, 8.4, 5, 12, 1), 0, by + TH + 2.5, 0);                     // 外挑的塔冠
  add(new THREE.CylinderGeometry(10.4, 10.4, 7, 12, 1, true, 0.6, 3.9), 0, by + TH + 8, 0);      // 殘缺的女牆（缺一段）
  for (let i = 0; i < 7; i++) { const a = 0.6 + i * 0.6; add(new THREE.BoxGeometry(3, 4, 2.2), Math.sin(a) * 10.2, by + TH + 13.5, Math.cos(a) * 10.2, a); }
  add(new THREE.CylinderGeometry(4.6, 5.2, 16, 8, 1), 3, by + TH + 12, -2);                      // 塔頂小哨樓
  add(new THREE.ConeGeometry(6, 9, 8), 3, by + TH + 24.5, -2);
  add(new THREE.BoxGeometry(15, 20, 12), 12, by + 4, 4, 0.3);                                    // 塔腳附屬屋
  // 殘拱：兩根墩柱＋半截拱圈
  add(new THREE.BoxGeometry(7, 40, 8), 36, by + 6, 6); add(new THREE.BoxGeometry(7, 28, 8), 66, by - 2, 10);
  const arch = add(new THREE.TorusGeometry(15, 3.4, 6, 14, Math.PI * 0.72), 51, by + 24, 8); arch.rotation.z = Math.PI * 0.28;
  add(new THREE.BoxGeometry(22, 9, 9), 26, by - 6, 6, 0.1);                                      // 連牆殘段
  return land;
}

// ── 體積雲＋低霧：低解析度 raymarch，每步 T *= exp(−密度×步長)，最後在合成那一關放大 ──
export function makeCloudPass(noise) {
  const mat = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: Object.assign({
      uDepth: { value: null }, uNoise3: { value: noise.tex3 }, uProjInv: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
      uNearFar: { value: new THREE.Vector2(0.3, 9000) }, uCover: { value: 0.45 }, uDark: { value: 0 }, uCloudOff: { value: new THREE.Vector2() }, uMistOff: { value: new THREE.Vector2() },
      uSkyHor: { value: new THREE.Vector3() }, uNearMask: { value: 15 }, uMistTop: { value: 4 }, uFlash: { value: 0 }, uFrame: { value: 0 },
    }, U),
    vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: /* glsl */`
      precision highp sampler3D;
      ${LIGHT_GLSL}
      uniform sampler2D uDepth; uniform sampler3D uNoise3;
      uniform mat4 uProjInv, uCamWorld; uniform vec2 uNearFar, uCloudOff, uMistOff;
      uniform float uCover, uDark, uNearMask, uMistTop, uFrame, uD, uCd, uFlash;
      uniform vec3 uSkyHor;
      varying vec2 vUv;
      const float BASE = 300., TOP = 1150.;
      float cloudD(vec3 p){
        float hN = (p.y - BASE)/(TOP - BASE);
        vec2 w = p.xz + uCloudOff;
        float cov = texture2D(uNoise, w/7200.).r*0.62 + texture2D(uNoise, w/2600. + .31).g*0.38;
        float topH = mix(0.28, 1.0, smoothstep(0.38, 0.72, cov));                 // 厚的地方長得高（積雲塔）
        float prof = smoothstep(0., 0.07, hN)*smoothstep(topH, topH*0.35, hN);
        vec4 n = texture(uNoise3, vec3(w.x, p.y*1.25, w.y)/1300.);
        float shape = (cov*0.58 + n.r*0.42)*prof;
        float th = mix(0.74, 0.30, uCover);
        float d = smoothstep(th, th + 0.13, shape);
        float det = texture(uNoise3, vec3(w.x, p.y, w.y)/330. + .5).g;
        return clamp(d - (1.-det)*0.42*(1.-d*0.7), 0., 1.);
      }
      float mistD(vec3 p){
        vec2 g = vec2(p.x + uCd, uD - p.z) + uMistOff;
        float n = texture2D(uNoise, g/240.).r*0.6 + texture2D(uNoise, g/60. + p.y*0.03).a*0.4;
        float sea = smoothstep(-6., -55., p.y)*(0.5+0.8*n);                        // 高原邊緣外的雲海
        float wisp = smoothstep(uMistTop*(0.4+1.2*n), -6., p.y)*smoothstep(0.42, 0.7, n)*uMist;   // 貼地飄過的霧帶
        return sea*1.1 + wisp*0.3;
      }
      float ign(vec2 p){ return fract(52.9829189*fract(dot(p, vec2(0.06711056, 0.00583715)))); }
      void main(){
        vec4 v4 = uProjInv*vec4(vUv*2.-1., -1., 1.); vec3 vd = normalize(v4.xyz/v4.w);
        vec3 rd = normalize(mat3(uCamWorld)*vd), ro = cameraPosition;
        float dep = texture2D(uDepth, vUv).r;
        float zN = dep*2.-1.;
        float lin = 2.*uNearFar.x*uNearFar.y/(uNearFar.y + uNearFar.x - zN*(uNearFar.y - uNearFar.x));
        float tGeo = dep > 0.99999 ? 1e9 : lin/max(-vd.z, 1e-4);
        float jit = 0.2 + 0.6*ign(gl_FragCoord.xy + uFrame*5.3);
        float sd = max(dot(rd, uSun), 0.);
        vec3 col = vec3(0.); float T = 1.;
        // 低霧（在雲的前面，先走）
        {
          float yTop = uMistTop*1.7 + 1.;
          float tA = 5., tB = min(tGeo, 1500.);
          if (rd.y > 1e-4) tB = min(tB, (yTop - ro.y)/rd.y);
          if (rd.y < -1e-4 && ro.y > yTop) tA = max(tA, (yTop - ro.y)/rd.y);
          if (tB > tA) {
            const int M = 12; float t = tA, lt = log(tB/tA);
            vec3 mc = mix(uFogCol, uFogSun, pow(sd, 5.)*0.8)*1.05;
            for (int i = 0; i < M; i++) {
              float t2 = tA*exp(lt*(float(i)+1.)/float(M)), st = t2 - t;      // 指數步長：近處細、遠處粗
              vec3 p = ro + rd*(t + st*jit);
              float a = 1. - exp(-mistD(p)*st*0.012);
              col += T*a*mc; T *= 1.-a; t = t2;
            }
          }
        }
        // 雲
        float tg = tGeo < uNearMask ? 1e9 : tGeo;                                 // uNearMask＝15 公尺                                  // 近物不擋雲（合成時再用全解析深度蓋掉）
        if (rd.y > 0.004 && T > 0.02) {
          float t0 = (BASE - ro.y)/rd.y, t1 = min(min((TOP - ro.y)/rd.y, tg), 16000.);
          if (t1 > t0) {
            const int N = 26; float st = (t1 - t0)/float(N), t = t0 + st*jit;
            float phase = 0.55 + 2.4*pow(sd, 9.) + 0.5*pow(sd, 2.);
            vec3 sunC = uSunCol*phase*(1.-uDark*0.55), ambTop = (uAmbCol*0.95 + uSkyHor*0.35)*(1.-uDark*0.55), ambBot = ambTop*mix(0.36, 0.15, uDark);
            ambTop += uFlash*vec3(0.9,0.95,1.2)*2.2; ambBot += uFlash*vec3(0.9,0.95,1.2)*3.;
            for (int i = 0; i < N; i++) {
              vec3 p = ro + rd*t; float d = cloudD(p);
              if (d > 0.003) {
                float dl = cloudD(p + uSun*110.)*110. + cloudD(p + uSun*320.)*210.;
                float sh = exp(-dl*0.0065)*0.92 + 0.08;
                float hN = (p.y - BASE)/(TOP - BASE);
                vec3 Lc = sunC*sh*(0.55 + 0.45*(1.-exp(-d*3.))) + mix(ambBot, ambTop, smoothstep(0., 0.6, hN));
                Lc = mix(Lc, uFogCol*1.02, 1.-exp(-t*0.00011*(1.+uMist)));        // 遠處的雲融進天際
                float a = 1. - exp(-d*st*0.011);
                col += T*a*Lc; T *= 1.-a;
                if (T < 0.02) break;
              }
              t += st;
            }
          }
        }
        gl_FragColor = vec4(col, T);
      }`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
  const scene = new THREE.Scene(); scene.add(quad);
  return { mat, scene };
}
