// 夢境之門 · C 版：門平常關著，Claude 每做一步就開一扇門；開著的門通往下一個世界，穿過去四周就換成那個世界
// 座標：步道沿 −Z 往遠處，x＝0 是步道（門框）中線，y＝0 是步道面。鏡頭與女孩固定，門框往 +Z 移、過了鏡頭回收到最遠處。
// 網址參數：?freeze=1（停住、門照目標圖擺）&ids=1（分層遮罩）&ref=0.5（疊目標圖）；擺景參數見 P。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TILE, walkMaterial, worldUV, LEAVES, leafMaterial } from './materials.js';
import { createPost } from './post.js';

const Q = new URLSearchParams(location.search);
const num = (k, d) => (Q.has(k) ? parseFloat(Q.get(k)) : d);
const IDS = Q.has('ids'), FREEZE = Q.has('freeze');

// ── 擺景參數（公尺／度）──
const P = {
  fov: num('fov', 50), camX: num('camx', 0.64), camH: num('camh', 1.52), yaw: num('yaw', 5.5), pitch: num('pitch', -0.2),
  ow: num('ow', 3.25), ph: num('ph', 3.2), post: num('post', 0.3), beam: num('beam', 0.36), over: num('over', 0.35),
  z1: num('z1', 6.05), sp: num('sp', 10.4), n: 18,
  open: num('open', 80),                                    // 第一扇門的開門角度（往遠處開）
  wl: num('wl', -2.15), wr: num('wr', 2.15), nearR: num('nearr', 6.6), nearZ: num('nearz', 2.2), // 步道兩緣；近處右側平台
  gx: num('gx', -0.79), gz: num('gz', 4.78), gh: num('gh', 1.5),
};

const renderer = new THREE.WebGLRenderer({ antialias: !IDS, preserveDrawingBuffer: Q.has('shot') });
renderer.setPixelRatio(num('pr', 0.6));
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(IDS ? '#000' : '#a9c6ea');
if (!IDS) scene.fog = new THREE.Fog('#efe6e2', 30, 125);

const camera = new THREE.PerspectiveCamera(P.fov, 16 / 9, 0.05, 2000);
camera.rotation.order = 'YXZ';
camera.position.set(P.camX, P.camH, 0);
camera.rotation.set(THREE.MathUtils.degToRad(P.pitch), THREE.MathUtils.degToRad(-P.yaw), 0);

const hemi = new THREE.HemisphereLight('#e6def4', '#d6bea4', 1.75); scene.add(hemi);   // 天光偏淡紫：影子是淡紫色
// 太陽在走道盡頭偏右（逆光）：門框、女孩的影子往鏡頭這邊拉長；太偏側邊或太低的話開著的門板會把整條走道遮暗
const SUN_DIR = new THREE.Vector3(0.12, 0.42, -1).normalize();
const sun = new THREE.DirectionalLight('#ffd49a', 2.8);
sun.target.position.set(0.5, 0, -16); sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 60); scene.add(sun, sun.target);
const SHADOW = !IDS && !Q.has('noshadow');
if (SHADOW) {
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  Object.assign(sun.shadow.camera, { left: -7, right: 8, top: 9, bottom: -9, near: 15, far: 120 }); sun.shadow.camera.updateProjectionMatrix();
}

// 分層遮罩色：近景紅、女孩黃、門綠、步道藍、天空黑
const ID = { near: '#ff0000', girl: '#ffff00', door: '#00ff00', walk: '#0000ff' };
const mat = (c, layer) => IDS ? new THREE.MeshBasicMaterial({ color: ID[layer] }) : new THREE.MeshLambertMaterial({ color: c });
const M = {
  walk: mat('#c9c2b6', 'walk'), frame: mat('#9a8068', 'door'), leaf: mat('#b89a78', 'door'),
  girl: mat('#c06850', 'girl'), near: mat('#8a6a50', 'near'), portal: IDS ? mat(0, 'door') : new THREE.MeshBasicMaterial({ color: '#bfe3ff' }),
};

// ── 步道：一條長板＋近處右側平台（目標圖右下的步道比門框寬）。石板貼圖用世界座標 UV，走路時捲動 offset ──
const WALK = IDS ? null : walkMaterial();                          // 石板顏色＋法線＋粗糙度（materials.js）
const walkTop = IDS ? M.walk : WALK.mat;
const walkSide = IDS ? M.walk : new THREE.MeshLambertMaterial({ color: '#9c9389' });
// 步道頂面再加兩層：陽光的斑駁（只乘在太陽光上，跟步道一起捲）、夜裡兩側小燈照出的光暈
const LAMP_SP = 2.6;
const walkU = { uScroll: { value: 0 }, uNight: { value: 0 }, uLampX: { value: new THREE.Vector2(P.wl + 0.18, P.wr - 0.18) } };
if (!IDS) walkTop.onBeforeCompile = (s) => {
  Object.assign(s.uniforms, walkU);
  s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.)).xyz;');
  s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
    varying vec3 vWp; uniform float uScroll, uNight; uniform vec2 uLampX;
    float ch(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
    float cn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
      return mix(mix(ch(i), ch(i+vec2(1,0)), f.x), mix(ch(i+vec2(0,1)), ch(i+1.), f.x), f.y); }`)
    // 大尺度色差（幾十公尺一個起伏），打散 3.2 m 的貼圖重複
    .replace('#include <map_fragment>', `#include <map_fragment>
    vec2 mp = vec2(vWp.x, vWp.z - uScroll);
    diffuseColor.rgb *= .9 + .2 * (cn(mp * .045) * .65 + cn(mp * .17 + 3.) * .35);`)
    // 走道中線被踩亮（粗糙度降低），兩側邊緣較霧
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
    roughnessFactor *= mix(.62, 1.08, smoothstep(.35, 1.9, abs(vWp.x + .1)));`)
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
    vec2 cp = vec2(vWp.x + vWp.z * .22, vWp.z - uScroll);          // 斜向拉長的光斑（光從右後方斜射）
    float ck = cn(cp * vec2(1.1, .32)) * .62 + cn(cp * vec2(2.6, .9) + 7.) * .38;
    float cookie = mix(.42, 1.3, smoothstep(.36, .64, ck));
    float pink = smoothstep(.62, .82, cn(cp * vec2(.7, .22) + 11.)) * smoothstep(.9, 1.2, cookie);
    vec3 tint = mix(vec3(1.1, .96, .8), vec3(1.15, .72, .95), pink * 1.2);
    reflectedLight.directDiffuse *= cookie * tint; reflectedLight.directSpecular *= cookie * tint;
    float lz = mod(vWp.z - uScroll, ${LAMP_SP.toFixed(1)}) - ${(LAMP_SP / 2).toFixed(1)};
    float pool = exp(-(pow(vWp.x - uLampX.x, 2.) * 2.2 + lz * lz * 1.6)) + exp(-(pow(vWp.x - uLampX.y, 2.) * 2.2 + lz * lz * 1.6));
    reflectedLight.directDiffuse += vec3(1., .66, .36) * pool * uNight * 1.4 * diffuseColor.rgb;`);
};
{
  const L = P.z1 + P.sp * P.n + 20;
  const g = new THREE.BoxGeometry(P.wr - P.wl, 0.4, L); g.translate((P.wl + P.wr) / 2, -0.2, 2 - L / 2);
  const wm = new THREE.Mesh(worldUV(g), [walkSide, walkSide, walkTop, walkSide, walkSide, walkSide]); wm.receiveShadow = true; scene.add(wm);
  const s = new THREE.Shape(); // 右側平台：從門框右緣往外擴，越近越寬
  s.moveTo(P.wr, -P.z1); s.lineTo(P.wr, 3); s.lineTo(P.wr + P.nearR, 3); s.lineTo(P.wr + P.nearR * 0.15, -P.nearZ);
  const pg = new THREE.ExtrudeGeometry(s, { depth: 0.4, bevelEnabled: false }); pg.rotateX(Math.PI / 2); // 形狀平面 xy → xz（y 往下長）
  pg.computeVertexNormals(); const pm = new THREE.Mesh(worldUV(pg), [walkTop, walkSide]); pm.receiveShadow = true; scene.add(pm);
}
// 夜裡步道兩側的小燈（跟步道一起後退，位置和地上的光暈對齊）
const LAMP_N = 26, lamps = IDS ? null : new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.24, 0.12), new THREE.MeshBasicMaterial({ color: '#ffc27a' }), LAMP_N * 2);
const halos = IDS ? null : new THREE.InstancedMesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position,1.); }`,
  fragmentShader: `varying vec2 vUv; void main(){ float r = length(vUv - .5) * 2.; float a = exp(-r * r * 9.) * .9 + exp(-r * r * 60.) * .8;
    gl_FragColor = vec4(vec3(1., .7, .4) * a, 1.);
    #include <colorspace_fragment>
  }` }), LAMP_N * 2);
if (lamps) { lamps.frustumCulled = halos.frustumCulled = false; lamps.visible = halos.visible = false; scene.add(lamps, halos); }

// ── 世界：0＝雲海（程式畫），1–5＝Codex 全景（拼成一張圖集，一列一張）──
const WORLDS = [ // 全景地平線在圖中的高度（由上往下比例）、門口灑出的光色
  { n: 'coast', hor: 0.5, c: '#bfe6ff' }, { n: 'lantern', hor: 0.55, c: '#ffae5c' }, { n: 'moonlake', hor: 0.45, c: '#7d98ff' },
  { n: 'snow', hor: 0.46, c: '#e6eeff' }, { n: 'wheat', hor: 0.53, c: '#ffc46a' },
];
const WORLD_C = ['#ffe8cc', ...WORLDS.map((w) => w.c)].map((c) => new THREE.Color(c));
const PANOS = [...WORLDS.map((w) => w.n), 'clouds'];                // 圖集各列；最後一列＝雲海世界（2026-11-28 Codex 畫，比程式畫的雲更像畫）
const SKY_PROC = Q.get('sky') === 'proc';                         // ?sky=proc：雲海世界改回程式畫的天空與雲海
const ATLAS = IDS ? null : (() => {
  const W = 2048, H = 878, c = document.createElement('canvas'); c.width = W; c.height = H * PANOS.length;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; // 天空 shader 直接輸出 sRGB
  PANOS.forEach((n, r) => { const im = new Image(); im.onload = () => { c.getContext('2d').drawImage(im, 0, r * H, W, H); t.needsUpdate = true; }; im.src = `tex/world_${n}.webp`; });
  return t;
})();
// 每個世界的光：太陽色、太陽強度倍率、天光、地面反光、天光強度、霧色、nn＝本身就是夜景（不再套夜色）
const PAL = [
  { sun: '#ffd49a', k: 1,    sky: '#e6def4', gnd: '#d6bea4', h: 1.75, fog: '#efe6e2', nn: 0 }, // 雲海
  { sun: '#fff0d8', k: 1,    sky: '#d8ecff', gnd: '#c8d4dc', h: 1.8,  fog: '#d4e8f4', nn: 0 }, // 燈塔海岸
  { sun: '#ffaa66', k: 0.45, sky: '#6a5a8a', gnd: '#5a4030', h: 1.1,  fog: '#3a2a40', nn: 1 }, // 燈籠街
  { sun: '#a8baff', k: 0.4,  sky: '#4c5c8c', gnd: '#2c3040', h: 1.0,  fog: '#1e2850', nn: 1 }, // 月夜湖
  { sun: '#fff4ea', k: 0.95, sky: '#e6eeff', gnd: '#e0e6f0', h: 1.9,  fog: '#e4ecf6', nn: 0 }, // 雪地
  { sun: '#ffb860', k: 1.1,  sky: '#ffe2bc', gnd: '#d8b080', h: 1.7,  fog: '#f4d6a8', nn: 0 }, // 麥田
].map((q) => ({ ...q, sun: new THREE.Color(q.sun), sky: new THREE.Color(q.sky), gnd: new THREE.Color(q.gnd), fog: new THREE.Color(q.fog) }));
const ENV = { cur: 0, next: 0, blend: 0 };
// 每個世界的全景轉成環境貼圖（PMREM），石板、門框、門板、女孩的反光與環境光跟著世界走；世界 0 用雲海全景
const ENVMAP = [];
if (!IDS && Q.get('envmap') !== '0') {
  const pm = new THREE.PMREMGenerator(renderer), ldr = new THREE.TextureLoader();
  ['clouds', ...WORLDS.map((w) => w.n)].forEach((n, i) => ldr.load(`tex/world_${n}.webp`, (t) => {
    t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
    ENVMAP[i] = pm.fromEquirectangular(t).texture; t.dispose();
  }));
}                         // 鏡頭所在的世界、前方下一個世界、光線過渡比例

// ── 天空＋雲海：一顆跟著鏡頭的球，shader 算漸層天空、高空薄雲、腳下雲海（雲海用世界座標捲動，跟步道同速）──
const SUN = new THREE.Vector3(0.14, 0.06, -1).normalize();            // 天空裡的太陽：走道盡頭偏右、貼著地平線
const skyU = { uT: { value: 0 }, uScroll: { value: 0 }, uSun: { value: SUN }, uNight: { value: 0 }, uGold: { value: 0 },
  uAtlas: { value: ATLAS }, uEnv0: { value: 0 }, uCam: { value: camera.position }, uDN: { value: 0 },
  uDZ: { value: new Float32Array(8) }, uDW: { value: new Float32Array(8).fill(-1) },
  uHor: { value: [...WORLDS.map((w) => w.hor), 0.51] }, uNN: { value: PAL.map((q) => q.nn) } };
if (!IDS) {
  const m = new THREE.ShaderMaterial({ uniforms: skyU, side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `varying vec3 vDir; uniform float uT, uScroll, uNight, uGold; uniform vec3 uSun;
      uniform sampler2D uAtlas; uniform float uEnv0, uDN; uniform vec3 uCam; uniform float uDZ[8]; uniform float uDW[8]; uniform float uHor[6]; uniform float uNN[6];
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+1.), f.x), f.y); }
      float fbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 6; i++){ s += a*n(p); p = p*2.03 + vec2(1.7,9.2); a *= .5; } return s; }
      float fbm4(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 4; i++){ s += a*n(p); p = p*2.03 + vec2(1.7,9.2); a *= .5; } return s; }
      float cloudH(vec2 p){                                         // 0–1 的雲頂高度；p 是公尺
        vec2 q = p * .0075 + vec2(uT * .01, 0.);
        float b = fbm4(q * .45) * .75 + fbm4(q * 1.3) * .4;
        return smoothstep(.42, 1.0, b);
      }
      vec3 cloudWorld(vec3 d){                                      // 世界 0：天空＋雲海
        float sd = max(dot(d, uSun), 0.);
        vec3 zen = mix(vec3(.17,.40,.86), vec3(.03,.06,.17), uNight);             // 天頂：飽和的藍（目標圖）
        vec3 hor = mix(mix(vec3(1.,.85,.72), vec3(1.,.72,.48), uGold), vec3(.15,.18,.33), uNight); // 地平線：暖桃色
        vec3 col = mix(hor, zen, pow(clamp(d.y,0.,1.), .38));
        col += mix(vec3(1.,.80,.56), vec3(1.,.62,.32), uGold) * (pow(sd, 10.) * .35 + pow(sd, 120.) * 1.6) * (1. - uNight);
        vec3 MD = normalize(vec3(.42,.26,-1.)); float md = max(dot(d, MD), 0.);   // 夜：月亮＋星星
        col += vec3(.80,.86,1.) * (smoothstep(.99955, .99975, md) * 1.1 + pow(md, 90.) * .22) * uNight;
        if (d.y > 0.) col += vec3(.85,.9,1.) * step(.997, h(floor(d.xz / (d.y + .25) * 260.))) * uNight * smoothstep(.05, .3, d.y);
        if (d.y > 0.) {                                             // 積雲：一團團、迎光面金邊、背光面藍灰
          vec2 p = d.xz / (d.y + .10) * .9 + vec2(uT*.003, 0.);
          float raw = fbm(p) * .7 + fbm(p * .35 + 4.) * .5;
          float c = smoothstep(.58, .82, raw);
          float l2 = fbm(p + uSun.xz * .12) * .7 + fbm((p + uSun.xz * .12) * .35 + 4.) * .5;
          float lit = clamp(.55 + (raw - l2) * 3.5, 0., 1.);
          vec3 cl = mix(vec3(.66,.70,.86), vec3(1.,.98,.95), lit);
          cl += vec3(1.,.72,.42) * (pow(sd, 3.) * .55 + uGold * .35) * lit;
          cl = mix(cl, vec3(.22,.26,.40) * (.6 + .4 * lit), uNight);
          col = mix(col, cl, c * .92 * smoothstep(.0, .07, d.y) * (1. - smoothstep(.55, .9, d.y) * .5));
        }
        // 雲海：鏡頭下方的高度場（雲底 −46 m、雲頂最高 −8 m），沿視線步進找交點，用高度場梯度當法線打光 → 一團團隆起的積雲
        if (d.y < .02) {
          const float BOT = -46., A = 38.;
          float dy = min(d.y, -.004), t0 = (BOT + A) / dy, t1 = BOT / dy, t = t0, tp = t0;
          float hit = 0.;
          for (int i = 0; i < 40; i++) {
            tp = t; t = t0 * pow(t1 / t0, float(i + 1) / 40.);
            vec2 p = vec2(d.x * t, d.z * t - uScroll);
            if (dy * t < BOT + cloudH(p) * A) { hit = 1.; break; }
          }
          float a = tp, b = t;                                     // 二分法細修交點
          for (int i = 0; i < 5; i++) { float m = (a + b) * .5; vec2 p = vec2(d.x * m, d.z * m - uScroll); if (dy * m < BOT + cloudH(p) * A) b = m; else a = m; }
          t = hit > .5 ? b : t1;
          vec2 p = vec2(d.x * t, d.z * t - uScroll);
          float hc = cloudH(p), e = 3.;
          vec3 nn = normalize(vec3(-(cloudH(p + vec2(e, 0.)) - cloudH(p - vec2(e, 0.))) * A, 2. * e, -(cloudH(p + vec2(0., e)) - cloudH(p - vec2(0., e))) * A));
          vec3 L = normalize(vec3(uSun.x, .55, uSun.z));
          float dif = clamp(dot(nn, L) * .6 + .45, 0., 1.), rim = pow(1. - clamp(dot(nn, -d), 0., 1.), 3.);
          vec3 cc = mix(vec3(.56,.56,.82), vec3(1.,.97,.92), dif * (.45 + .55 * hc));
          cc += vec3(1.,.68,.38) * (rim * .6 + pow(sd, 1.5) * dif * 1.0 + hc * dif * .3) * (1. + uGold * .7);   // 雲頂金邊
          cc = mix(cc, cc * vec3(.26,.31,.52) + vec3(.02,.03,.07) + vec3(.35,.4,.55) * rim * .4, uNight);
          cc = mix(vec3(.46,.56,.84), cc, smoothstep(0., .15, hc));   // 雲縫露出更低、更藍的雲層
          float fog = 1. - exp(-t * .0010);
          cc = mix(cc, hor * vec3(1.,.98,.97), fog);
          col = mix(col, cc, smoothstep(.02, -.002, d.y));
        }
        return col;
      }
      vec3 pano(int r, vec3 d){                                     // 世界 1–5：全景（水平約 126°、垂直約 54°）
        float az = atan(d.x, -d.z), el = asin(clamp(d.y, -1., 1.));
        float vl = clamp(1. - (uHor[r] - el / .943), .004, .996), u = clamp(.5 + az / 2.2, .002, .998);
        return texture2D(uAtlas, vec2(u, (float(5 - r) + vl) / 6.)).rgb;
      }
      void main(){
        vec3 d = normalize(vDir);
        // 這條視線依序穿過哪幾扇開著的門洞：看到的是最後一扇門後的世界（門一扇套一扇，世界也一層套一層）
        float w = uEnv0;
        if (d.z < -1e-3) for (int i = 0; i < 8; i++) {
          if (float(i) >= uDN) break;
          vec3 q = uCam + d * ((uDZ[i] - uCam.z) / d.z);
          if (abs(q.x) > ${(P.ow / 2).toFixed(3)} || q.y < 0. || q.y > ${P.ph.toFixed(3)} || uDW[i] < -.5) break;
          w = uDW[i];
        }
        vec3 col;
        if (w < .5 && ${SKY_PROC}) col = cloudWorld(d);
        else {
          int r = w < .5 ? 5 : int(w + .5) - 1; col = pano(r, d);
          float lum = dot(col, vec3(.3, .55, .15));                   // 夜：先降飽和再壓暗偏藍，免得藍到發亮
          col = mix(col, mix(vec3(lum), col, .45) * vec3(.32,.38,.58) + vec3(.01,.015,.035), uNight * (1. - uNN[r == 5 ? 0 : r + 1]));
          col = mix(col, col * vec3(1.1,.94,.78), uGold * .5);
        }
        vec3 lin = pow(max(col, 0.), vec3(2.2));
        lin *= 1. + 3. * smoothstep(.95, 1., max(lin.r, max(lin.g, lin.b))) * pow(max(dot(d, uSun), 0.), 400.);   // 只有太陽核心推過 1，後製才會發光
        gl_FragColor = vec4(lin, 1.);
        #include <colorspace_fragment>
      }` });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), m); sky.position.copy(camera.position); sky.renderOrder = -1; scene.add(sky);
}
const vpU = { op: { value: 1 }, color: { value: new THREE.Color('#fff1dc') } };
if (!IDS) {
  const vp = new THREE.Mesh(new THREE.PlaneGeometry(26, 14), new THREE.ShaderMaterial({ uniforms: vpU, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `uniform float op; uniform vec3 color; varying vec2 vUv;
      void main(){ vec2 q = (vUv - vec2(.5, .38)) * vec2(1., 1.9); float r = length(q);
        float a = exp(-r * r * 60.) * .9 + exp(-r * r * 9.) * .35;
        gl_FragColor = vec4(color * a * op, 1.);
        #include <colorspace_fragment>
      }` }));
  vp.position.set(0.2, 3.2, -104); vp.renderOrder = 5; scene.add(vp);
}

// ── 門：門框（Tripo 兩款，載入前先用方塊）＋兩片往遠處開的門板（方塊＋正面貼圖，樞紐在門柱內緣）＋門後世界的入口面 ──
const rnd = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
const FRAME_H = P.ph + P.beam;                                   // 門框總高
const texL = new THREE.TextureLoader();
// 輪廓光：逆光時物體邊緣的金邊（菲涅耳），顏色跟太陽走
const RIM = { value: new THREE.Color(0, 0, 0) };
function addRim(m, k) {
  if (!m || IDS || m.userData.rim) return; m.userData.rim = true;
  m.onBeforeCompile = (s) => {
    s.uniforms.uRim = RIM;
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
uniform vec3 uRim;`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      { float fr = pow(clamp(1. - abs(dot(normal, normalize(vViewPosition))), 0., 1.), 3.); reflectedLight.directDiffuse += uRim * fr * ${k.toFixed(2)}; }`);
  };
  m.customProgramCacheKey = () => 'rim' + k; m.needsUpdate = true;
}
const leafMats = LEAVES.map((n) => IDS ? M.leaf : leafMaterial(n, texL));
leafMats.forEach((a) => Array.isArray(a) && addRim(a[4], 0.5));
const leafG = new THREE.BoxGeometry(P.ow / 2, P.ph - 0.05, 0.07);
function glowMat() {                                               // 開著的門往鏡頭這邊灑出那個世界的光
  return new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { color: { value: new THREE.Color() }, op: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `uniform vec3 color; uniform float op; varying vec2 vUv;
      void main(){ float a = pow(clamp(vUv.y, 0., 1.), 2.2) * smoothstep(0., .25, vUv.x) * smoothstep(1., .75, vUv.x);
        gl_FragColor = vec4(color * a * op * .28, 1.);
        #include <colorspace_fragment>
      }` });
}
const glowG = new THREE.PlaneGeometry(P.ow, 3.2).rotateX(-Math.PI / 2); // uv.y＝1 在門那一側
const litG = new THREE.PlaneGeometry(P.ow, P.ph);
function litMat() {                                                  // 門縫光（關著）／開門瞬間湧出的光
  return new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { op: { value: 0 }, seam: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `uniform float op, seam; varying vec2 vUv;
      void main(){
        float fill = smoothstep(0., .22, vUv.x) * smoothstep(1., .78, vUv.x) * (.35 + .65 * (1. - vUv.y)) * smoothstep(1., .85, vUv.y);
        float line = exp(-pow((vUv.x - .5) * 50., 2.)) * smoothstep(1., .9, vUv.y) * 2.2 + exp(-pow((vUv.x - .5) * 9., 2.)) * .18;
        gl_FragColor = vec4(vec3(1., .82, .55) * mix(fill, line, seam) * op, 1.);
        #include <colorspace_fragment>
      }` });
}
// 給門用的狀態：夜、時鐘、她面前那扇關著的門（第幾扇）與門縫光亮度、等你
const AT = { night: 0, clock: 0, gate: -1, gateGlow: 0, wait: 0 };
function makeDoor() {
  const g = new THREE.Group(), half = P.ow / 2;
  const box = new THREE.Group();                                  // 模型載入前的方塊門框
  const post = new THREE.BoxGeometry(P.post, P.ph, P.post);
  for (const s of [-1, 1]) { const m = new THREE.Mesh(post, M.frame); m.position.set(s * (half + P.post / 2), P.ph / 2, 0); m.castShadow = true; box.add(m); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(P.ow + 2 * P.post + 2 * P.over, P.beam, P.post * 1.3), M.frame);
  beam.position.y = P.ph + P.beam / 2; box.add(beam); g.add(box); g.userData.frame = box;
  g.userData.leaves = [-1, 1].map((s) => {
    const pivot = new THREE.Group(); pivot.position.set(s * half, 0, 0);
    const m = new THREE.Mesh(leafG, M.leaf); m.position.set(-s * P.ow / 4, (P.ph - 0.05) / 2, 0); m.castShadow = true; pivot.add(m); g.add(pivot);
    pivot.userData.s = s; pivot.userData.mesh = m; return pivot;
  });
  if (!IDS) { const gl = new THREE.Mesh(glowG, glowMat()); gl.position.set(0, 0.012, 1.6); gl.visible = false; g.add(gl); g.userData.glow = gl; }
  if (!IDS) { const lit = new THREE.Mesh(litG, litMat()); lit.position.set(0, P.ph / 2, 0.06); lit.visible = false; lit.renderOrder = 3; g.add(lit); g.userData.lit = lit; }
  g.userData.opened = false; g.userData.open = 0; g.userData.world = -1;
  return g;
}
function setOpen(door, deg) {                                       // 門板永遠掛在門柱上，往遠處（−Z）開；全開約 115°，翻過門框外
  for (const p of door.userData.leaves) p.rotation.y = -p.userData.s * THREE.MathUtils.degToRad(deg);
}
// 門框模型：量出兩根門柱的內緣距離，x 方向縮放到開口＝P.ow、高度＝FRAME_H
const frameModels = [];
function fitFrame(root) {
  root.updateMatrixWorld(true);
  const xs = [], v = new THREE.Vector3(), box = new THREE.Box3().setFromObject(root);
  root.traverse((o) => { if (!o.isMesh) return; const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); if (Math.abs(v.y - box.max.y * 0.45) < box.max.y * 0.2) xs.push(v.x); } });
  const inner = Math.min(...xs.filter((x) => x > 0)) - Math.max(...xs.filter((x) => x < 0));
  const sy = FRAME_H / (box.max.y - box.min.y), sx = P.ow / inner;
  const g = new THREE.Group(); root.scale.set(sx, sy, sy); g.add(root);
  root.traverse((o) => { if (o.isMesh) { o.material = IDS ? M.frame : o.material; o.castShadow = true; if (!IDS) { o.material.transparent = false; o.material.depthWrite = true; addRim(o.material, 0.6); } } });
  return g;
}
const doors = [];
for (let i = 0; i < P.n; i++) { const d = makeDoor(); doors.push(d); scene.add(d); }
const GATE_Z = -P.gz - 1.4;                                          // 關著的門會停在她面前 1.4 m
// 第 i 扇門在第 k 輪的長相（freeze 時第 0、1 扇照目標圖：木框＋格子窗／櫻花木門、鐵框＋保險庫門）
function styleOf(i, k) {
  if (FREEZE && i === 0) return { frame: 0, l: 0, r: 1 };
  if (FREEZE && i === 1) return { frame: 1, l: 2, r: 2 };
  return { frame: rnd(i, k + 5) < 0.6 ? 0 : 1, l: Math.floor(rnd(i, k + 9) * 6), r: Math.floor(rnd(i, k + 13) * 6) };
}
function openDoor(d, w) {
  d.userData.opened = true; d.userData.world = w;
  if (d.userData.glow) d.userData.glow.material.uniforms.color.value.copy(WORLD_C[w]);
}
function dress(d, st) {                                              // 回收到最遠處：換長相、關上、還沒決定通往哪裡
  if (frameModels.length && d.userData.frameType !== st.frame) {
    d.remove(d.userData.frame); d.userData.frame = frameModels[st.frame].clone(); d.add(d.userData.frame); d.userData.frameType = st.frame;
  }
  const [L, R] = d.userData.leaves; L.userData.mesh.material = leafMats[st.l]; R.userData.mesh.material = leafMats[st.r];
  d.userData.opened = false; d.userData.open = 0; d.userData.world = -1;
}
const _ah = [];
function layoutDoors(offset, dt = 0) {
  doors.forEach((d, i) => {
    const L = P.sp * P.n, raw = -(P.z1 + i * P.sp) + offset;      // 過了鏡頭後方 2 m 就回收到最遠處
    d.position.z = (((raw - 2) % L) + L) % L - L + 2;
    d.visible = d.position.z < 1.5;                                  // 門框從她和鏡頭頭上、兩側掠過
    const k = Math.floor((raw - 2) / L);
    if (d.userData.k !== k || d.userData.frameType === undefined && frameModels.length) {
      const was = d.userData.k; dress(d, styleOf(i, k)); d.userData.k = k;
      if (FREEZE && i <= 1) { openDoor(d, i); d.userData.open = 1; }          // freeze：第 0 扇開著（還是雲海），第 1 扇通往燈塔海岸
      else if (was == null && d.position.z > GATE_Z + 0.3) { openDoor(d, ENV.cur); d.userData.open = 1; } // 開場時她身後的門本來就開著
    }
    const u = d.userData;
    if (!FREEZE) u.open = THREE.MathUtils.clamp(u.open + (u.opened ? 1 : -1) * dt / 1.1, 0, 1);
    const e = u.open * u.open * (3 - 2 * u.open);
    setOpen(d, e * (FREEZE ? P.open : 112 + 6 * rnd(i, k + 1)));
    if (SHADOW) for (const p of u.leaves) p.userData.mesh.castShadow = -d.position.z < 9; // 遠處的門板不投影（不然整條走道都在影子裡）
    if (u.lit) {
      const opening = u.opened && u.open > 0 && u.open < 1 ? Math.sin(Math.PI * u.open) : 0; // 開門那一下湧出光
      const seam = i === AT.gate && !u.opened ? AT.gateGlow : 0;                              // 關著的門：門縫光
      u.lit.material.uniforms.op.value = opening * 0.35 + seam; u.lit.material.uniforms.seam.value = opening > seam ? 0 : 1;
      u.lit.visible = opening + seam > 0.01;
    }
    if (u.glow) { const op = e * (u.world !== ENV.cur ? 1 : 0.3); u.glow.material.uniforms.op.value = op; u.glow.visible = op > 0.01; }
    const pz = u.pz;                                                 // 門過了鏡頭：鏡頭也進到那個世界
    if (pz !== undefined && pz < 0 && d.position.z >= 0 && d.position.z - pz < 1) {
      if (u.opened && u.world >= 0) ENV.cur = u.world;
    }
    u.pz = d.position.z;
  });
  // 天空 shader：鏡頭前方的門由近到遠，開著的門通往哪個世界
  _ah.length = 0; for (const d of doors) if (d.position.z < -0.02) _ah.push(d);
  _ah.sort((a, b) => b.position.z - a.position.z);
  const n = Math.min(8, _ah.length); skyU.uDN.value = n;
  for (let j = 0; j < n; j++) { const u = _ah[j].userData; skyU.uDZ.value[j] = _ah[j].position.z; skyU.uDW.value[j] = u.opened && u.world >= 0 ? u.world : -1; }
  skyU.uEnv0.value = ENV.cur;
  // 光線：前方第一扇通往別的世界、開著的門越近，燈光越接近那個世界
  const nx = _ah.find((d) => d.userData.opened && d.userData.world >= 0 && d.userData.world !== ENV.cur);
  ENV.next = nx ? nx.userData.world : ENV.cur; ENV.blend = nx ? THREE.MathUtils.smoothstep(nx.position.z, -9, 0) : 0;
}
const loader = new GLTFLoader();
const ready = Promise.all(['frame_wood', 'frame_iron'].map((n) => loader.loadAsync(`models/${n}.glb`))).then((gl) => {
  gl.forEach((g) => frameModels.push(fitFrame(g.scene)));
  doors.forEach((d) => { d.userData.k = null; d.userData.frameType = undefined; });
});

// ── 女孩：Tripo 生成＋Mixamo 骨架、Tripo 內建 walk（原地）；背對鏡頭往 −Z 走 ──
let mixer = null, act = null, head = null, neck = null;
const girlReady = loader.loadAsync('models/girl.glb').then((g) => {
  const root = g.scene; root.rotation.y = Math.PI; root.position.set(P.gx, 0, -P.gz); root.scale.setScalar(P.gh / 1.5);
  root.traverse((o) => {
    if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; if (IDS) o.material = M.girl; else { o.material.transparent = false; o.material.depthWrite = true; addRim(o.material, 1.4); } }
    if (o.isBone && /Head$/.test(o.name)) head = o; if (o.isBone && /Neck$/.test(o.name)) neck = o;
  });
  scene.add(root);
  mixer = new THREE.AnimationMixer(root); act = mixer.clipAction(g.animations[0]); act.play();
  if (FREEZE) mixer.setTime(num('gt', 0.6));
});

// ── 花瓣：地上一層（跟步道一起後退）＋空中飄落；分層遮罩模式不畫 ──
const PET_G = 220, PET_A = 140, petals = [];
let petalMesh = null;
if (!IDS) {
  const pg = new THREE.PlaneGeometry(0.085, 0.06);
  petalMesh = new THREE.InstancedMesh(pg, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, emissive: '#ffb0c4', emissiveIntensity: 0.1 }), PET_G + PET_A);
  const col = new THREE.Color();
  for (let i = 0; i < PET_G + PET_A; i++) {
    const air = i >= PET_G, nearDoor = rnd(i, 3) < 0.55;             // 一半聚在門口（從門縫掉出來的）
    petals.push({ air, x: P.wl + 0.2 + rnd(i, 1) * (P.wr - P.wl - 0.4), z: nearDoor ? -(P.z1 + Math.floor(rnd(i, 4) * 8) * P.sp) + 0.3 + rnd(i, 5) * 1.6 : 2 - rnd(i, 2) ** 1.6 * 60,
      y: 0.3 + rnd(i, 6) * 3, rot: rnd(i, 7) * 6.3, spin: 0.5 + rnd(i, 8) * 2, ph: rnd(i, 9) * 6.3 });
    petalMesh.setColorAt(i, col.setHSL(0.95 + rnd(i, 10) * 0.04, 0.75, 0.82 + rnd(i, 11) * 0.1));
  }
  petalMesh.frustumCulled = false; scene.add(petalMesh);
}
const dummy = new THREE.Object3D(), LOOP = P.sp * P.n;
function updatePetals(off, t) {
  if (!petalMesh) return;
  petals.forEach((p, i) => {
    const z = (((p.z + off - 3) % LOOP) + LOOP) % LOOP - LOOP + 3;  // 包在 [3−LOOP, 3)
    if (p.air) {
      const y = ((p.y - t * 0.35) % 3.4 + 3.4) % 3.4 + 0.05;
      dummy.position.set(p.x + Math.sin(t * 0.8 + p.ph) * 0.4, y, z + Math.cos(t * 0.6 + p.ph) * 0.3);
      dummy.rotation.set(t * p.spin + p.ph, t * p.spin * 0.7, p.rot);
    } else { dummy.position.set(p.x, 0.008, z); dummy.rotation.set(-Math.PI / 2, 0, p.rot); }
    dummy.updateMatrix(); petalMesh.setMatrixAt(i, dummy.matrix);
  });
  petalMesh.instanceMatrix.needsUpdate = true;
}

// 對照：疊目標圖
if (Q.has('ref')) {
  const im = document.createElement('img'); im.src = '../../docs/dream-doors/target.png';
  Object.assign(im.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', opacity: Q.get('ref') || '0.5', pointerEvents: 'none' });
  document.body.appendChild(im);
}

// 最後一道畫面處理（post.js）：光暈、光束、柔和高光、調色、暗角、顆粒；?post=0 關掉
const POST = !IDS && Q.get('post') !== '0' ? createPost(renderer, scene, camera, SUN) : null;
const _ds = new THREE.Vector2();
function render(t = performance.now() / 1000) { if (POST) POST.render(t); else { renderer.setRenderTarget(null); renderer.render(scene, camera); } }
function resize() {
  renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  if (POST) { renderer.getDrawingBufferSize(_ds); POST.setSize(_ds.x, _ds.y); }
}
addEventListener('resize', resize); resize();

// ── 狀態 → 氛圍目標值（每秒讀 state.json；?state= 可固定一種）──
// speed m/s（走到關著的門前會自己停）、sun 陽光、gold 天色轉金、glow 消失點白光、petals 空中花瓣數、night 夜
const STATES = {
  idle:      { speed: 1.3, sun: 2.4, gold: 0,    glow: 1.0, petals: 40,  night: 0 },
  thinking:  { speed: 1.0, sun: 2.2, gold: 0,    glow: 0.8, petals: 30,  night: 0 },
  working:   { speed: 2.6, sun: 2.5, gold: 0,    glow: 1.3, petals: 140, night: 0 },
  finishing: { speed: 0.8, sun: 2.6, gold: 1,    glow: 1.6, petals: 60,  night: 0 },
  waiting:   { speed: 1.0, sun: 2.2, gold: 0.25, glow: 1.0, petals: 25,  night: 0 },
  absent:    { speed: 0.9, sun: 0.5, gold: 0,    glow: 0.3, petals: 20,  night: 1 },
};
const SKY2STATE = { clear: 'idle', overcast: 'thinking', storm: 'working', clearing: 'finishing', waiting: 'waiting' };
// 時鐘：19–6 點是夜（18–19、6–7 點漸變；?day=1／?night=1 固定；freeze 固定白天）
const CONFIG = { polling: !Q.has('state') && !FREEZE, clockHours: Q.has('day') || FREEZE ? 10.5 : Q.has('night') ? 22 : null };
const clockHours = () => CONFIG.clockHours != null ? CONFIG.clockHours : new Date().getHours() + new Date().getMinutes() / 60;
let stateName = Q.get('state') || 'idle', sessions = [null];
function applyState(sky, sess) {                                    // bridge 的天空狀態＋各 session → 本主題的狀態名
  if (sess !== undefined) sessions = sess || [];
  const any = (sessions || []).some((x) => x);
  stateName = !any || sky === 'none' ? 'absent' : SKY2STATE[sky] || 'idle';
}
async function poll() {
  if (!CONFIG.polling) return;
  try { const j = await (await fetch('state.json', { cache: 'no-store' })).json(); applyState(j.state, j.sessions); }
  catch { /* 開發時沒有 bridge：維持目前狀態 */ }
}
setInterval(poll, 1000); poll();
// events.json：每一次工具呼叫（PreToolUse）＝開一扇門
let pending = 0, lastTool = -1e9, lastEvT = null;
async function pollEvents() {
  if (!CONFIG.polling) return;
  try {
    const j = await (await fetch('events.json', { cache: 'no-store' })).json(), rec = j.recent || [];
    if (lastEvT === null) { lastEvT = rec.length ? rec[rec.length - 1].t : 0; return; }   // 第一次只記位置，不補開舊的
    for (const e of rec) if (e.t > lastEvT) { if (e.kind === 'tool' && e.event !== 'PostToolUse') { pending++; lastTool = AT.clock; } lastEvT = e.t; }
  } catch { /* 沒有 bridge：執行時改用計時開門 */ }
}
setInterval(pollEvents, 1000);

const C = { sunGold: new THREE.Color('#ffa055'), sunNight: new THREE.Color('#9fb2ff'),
  skyNight: new THREE.Color('#3e4c78'), gndNight: new THREE.Color('#2b2a36'), fogGold: new THREE.Color('#f4d6b4'), fogNight: new THREE.Color('#1c2340') };
const _c = new THREE.Color(), lerp = THREE.MathUtils.lerp;
const cur = { ...STATES.idle };
function applyAtmos(dt) {
  const tgt = STATES[stateName] || STATES.idle;
  const h = clockHours(), clockNight = (h >= 19 || h < 6) ? 1 : h >= 18 ? h - 18 : h < 7 ? 7 - h : 0;
  const k = 1 - Math.exp(-dt / 2.5);
  for (const key of ['sun', 'gold', 'glow', 'petals']) cur[key] += (tgt[key] - cur[key]) * k;
  cur.night += (Math.max(tgt.night, clockNight) - cur.night) * k;
  const n = cur.night, g = cur.gold * (1 - n), pa = PAL[ENV.cur], pb = PAL[ENV.next], b = ENV.blend;
  const nEff = n * (1 - lerp(pa.nn, pb.nn, b));                     // 燈籠街、月夜湖本身就是夜景
  AT.night = n;
  sun.intensity = lerp(cur.sun * lerp(pa.k, pb.k, b), 0.9, nEff);
  sun.color.lerpColors(pa.sun, pb.sun, b).lerp(C.sunGold, g * 0.7).lerp(C.sunNight, nEff);
  RIM.value.copy(sun.color).multiplyScalar(sun.intensity * 0.32);
  const em = ENVMAP[b > 0.5 ? ENV.next : ENV.cur];
  if (em && scene.environment !== em) scene.environment = em;
  scene.environmentIntensity = 0.55 * (1 - 0.75 * nEff);
  hemi.intensity = lerp(lerp(pa.h, pb.h, b), 0.9, nEff);
  hemi.color.lerpColors(pa.sky, pb.sky, b).lerp(C.skyNight, nEff); hemi.groundColor.lerpColors(pa.gnd, pb.gnd, b).lerp(C.gndNight, nEff);
  if (scene.fog) scene.fog.color.lerpColors(pa.fog, pb.fog, b).lerp(C.fogGold, g).lerp(C.fogNight, nEff);
  skyU.uNight.value = n; skyU.uGold.value = g; walkU.uNight.value = n;
  vpU.op.value = cur.glow * (1 - 0.85 * n);
  if (petalMesh) petalMesh.count = PET_G + Math.round(cur.petals);
  if (lamps) lamps.visible = halos.visible = n > 0.02;
}

// 她面前那扇還沒開（或還沒開夠）的門
function gateDoor() {
  let g = null;
  for (const d of doors) if (d.position.z < GATE_Z + 0.3 && !(d.userData.opened && d.userData.open > 0.35) && (!g || d.position.z > g.position.z)) g = d;
  return g;
}
function pickWorld(prev) {
  if (stateName === 'finishing') return prev === 5 ? 0 : 5;                  // 收尾：走進金色麥田
  if (stateName !== 'working') return prev;                                  // 換世界只在 Claude 做事時；待命時在同一個夢裡閒逛
  const pool = (AT.night > 0.5 ? [0, 2, 3] : [0, 1, 2, 3, 4, 5]).filter((w) => w !== prev);
  return pool[Math.floor(Math.random() * pool.length)];
}
function openNext() {                                                // 打開前方最近一扇關著的門（前方最多 3 扇開著等她）
  let t = null, ahead = 0;
  for (const d of doors) {
    if (d.position.z >= GATE_Z + 0.3) continue;
    if (d.userData.opened) ahead++; else if (d.position.z > -60 && (!t || d.position.z > t.position.z)) t = d;
  }
  if (!t || ahead >= 3) return false;
  let prev = null;                                                   // 上一扇開著的門通往哪裡（新世界不重複）
  for (const d of doors) if (d.userData.opened && d.position.z > t.position.z && d.position.z < 0 && (!prev || d.position.z < prev.position.z)) prev = d;
  openDoor(t, pickWorld(prev ? prev.userData.world : ENV.cur));
  return true;
}
function holdDoors() {                                               // 思考／等你／不在：前方還遠的門關回去，她會停在下一扇門前
  for (const d of doors) if (d.userData.opened && d.position.z < GATE_Z - 2.2) d.userData.opened = false;
}
// 走路動作裡兩腳併攏的時間點（秒），停下時把動作走到最近的一個
const PASS = [0.015, 0.627, 1.19, 1.79];                         // 這段 walk 是 2.33 秒兩個循環（四步）
function toPass(t, dur) {
  let m = Infinity; for (const p of PASS) for (const q of [p, p + dur]) { const d = q - t; if (d >= -1e-3 && d < m) m = d; }
  return Math.max(0, m);
}

let offset = 0, last = performance.now(), lastDraw = 0, paused = false, speed = STATES.idle.speed, look = 0, turned = 0, autoT = 0, stopT = 0;
const LOOK = num('look', -0.9);                                      // 回頭角度（弧度，頭；脖子再加 45%）
const SPEED_MUL = num('speed', 1.3) / 1.3;
window.wpPause = (on) => { paused = !!on; };
document.addEventListener('visibilitychange', () => { last = performance.now(); });
function step(dt, t) {
  if (!IDS && !FREEZE) applyAtmos(dt);
  AT.clock = FREEZE ? 0 : t;
  const st = stateName;
  let dOff = 0, rem = Infinity;
  if (!FREEZE) {
    if (st === 'thinking' || st === 'waiting' || st === 'absent') { pending = 0; holdDoors(); }
    if (st === 'working') {                                          // 執行：每次工具呼叫開一扇；沒有事件時每 2.4 秒開一扇
      autoT += dt; if (AT.clock - lastTool > 3.5 && autoT > 2.4) { pending++; autoT = 0; }
    } else autoT = 0;
    let g = gateDoor(); rem = g ? GATE_Z - g.position.z : Infinity;
    stopT = rem < 0.4 ? stopT + dt : 0;
    if (g && !g.userData.opened && pending === 0 && ((st === 'idle' && stopT > 2.5) || (st === 'finishing' && rem < 2.5))) pending = 1; // 待命：在門前站一下，門自己開（同一個世界）
    pending = Math.min(pending, 4);
    while (pending > 0 && openNext()) pending--;
    g = gateDoor(); rem = g ? Math.max(0, GATE_Z - g.position.z) : Infinity; AT.gate = g ? doors.indexOf(g) : -1;
    speed += ((STATES[st] || STATES.idle).speed * SPEED_MUL - speed) * (1 - Math.exp(-dt / 1.5));
    dOff = Math.max(0, Math.min(speed * dt, rem * (1 - Math.exp(-dt / 1.0))));
    if (dt > 0) speed = Math.min(speed, dOff / dt + 0.02);           // 被門擋住時真的慢下來，門開了再慢慢加速
    offset += dOff;
  }
  const stopped = rem < 0.4;
  AT.wait += ((st === 'waiting' && stopped ? 1 : 0) - AT.wait) * (1 - Math.exp(-dt / 0.7));
  const gg = st === 'waiting' ? 0.85 : st === 'thinking' ? 0.35 + 0.3 * Math.sin(t * 2.2) : st === 'absent' ? 0.3 : 0; // 門縫光：思考時一明一暗
  AT.gateGlow += (gg - AT.gateGlow) * (1 - Math.exp(-dt / 0.6));
  layoutDoors(FREEZE ? 0 : offset, dt);
  if (mixer) {
    let da = FREEZE ? 0 : dOff / 1.3;
    if (stopped && act && da < dt * 0.4) da = Math.min(dt * 0.4, toPass(act.time % act.getClip().duration, act.getClip().duration)); // 收腳站好
    // 回頭：先撤掉上一格加的角度（動作停住時 mixer 不會重寫骨頭，直接加會一直累積）
    if (head) { head.rotation.y -= turned; if (neck) neck.rotation.y -= turned * 0.45; }
    mixer.update(da);
    look += ((AT.wait > 0.6 ? 1 : 0) - look) * (1 - Math.exp(-dt / 0.9));
    turned = look * LOOK;
    if (head) { head.rotation.y += turned; if (neck) neck.rotation.y += turned * 0.45; }
  }
  surfaces(t);
}
function frame(now) {
  requestAnimationFrame(frame);
  if (paused || document.hidden) { last = now; return; }
  if (now - lastDraw < 1000 / 30 - 2) return; lastDraw = now;          // 規格：30 fps 上限
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  step(dt, now / 1000);
  render(now / 1000);
}
const _m = new THREE.Matrix4();
function surfaces(t) {                                              // 石板、雲海、花瓣、小燈跟著走路距離捲動
  const off = FREEZE ? 0 : offset;
  if (WALK) for (const t of WALK.maps) t.offset.y = (off / TILE) % 1;
  walkU.uScroll.value = off % (LAMP_SP * 20000);
  skyU.uScroll.value = off % 5000; skyU.uT.value = FREEZE ? 0 : t;
  updatePetals(off % LOOP, FREEZE ? 2 : t);
  if (lamps && lamps.visible) {
    const s = Math.min(1, cur.night * 1.5);
    for (let j = 0; j < LAMP_N; j++) {
      const z = ((1.3 + off - 2) % LAMP_SP + LAMP_SP) % LAMP_SP + 2 - LAMP_SP - j * LAMP_SP;
      for (let side = 0; side < 2; side++) {
        const x = side ? P.wr - 0.08 : P.wl + 0.08;
        _m.makeScale(s, s, s).setPosition(x, 0.1 * s, z); lamps.setMatrixAt(j * 2 + side, _m);
        _m.makeScale(s, s, s).setPosition(x, 0.12, z + 0.05); halos.setMatrixAt(j * 2 + side, _m);
      }
    }
    lamps.instanceMatrix.needsUpdate = halos.instanceMatrix.needsUpdate = true;
  }
}
layoutDoors(0); surfaces(0);
requestAnimationFrame(frame);

window.theme = { P, camera, scene, renderer, doors, ENV, STATES, PARAMS: STATES, CONFIG, AT, get mixer() { return mixer; }, get act() { return act; }, ready: Promise.all([ready, girlReady]),
  applyState, setSessions: (a) => { sessions = a || []; }, tool: () => { pending++; lastTool = AT.clock; }, requestState: () => stateName, setState: (n) => { stateName = n; },
  draw: () => { step(0, performance.now() / 1000); render(); }, POST, resize,
  tick: (sec = 1, fps = 30) => { for (let i = 0; i < sec * fps; i++) { simT += 1 / fps; step(1 / fps, simT); } render(simT); } }; // 測試：手動推進時間（分頁在背景時 rAF 不跑）
let simT = 100;
window.theme.mask = (w = 480, h = 270) => {
  const rt = new THREE.WebGLRenderTarget(w, h); const a = camera.aspect; camera.aspect = 16 / 9; camera.updateProjectionMatrix();
  renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null);
  const px = new Uint8Array(w * h * 4); renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
  camera.aspect = a; camera.updateProjectionMatrix();
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'), im = g.createImageData(w, h);
  for (let y = 0; y < h; y++) im.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  g.putImageData(im, 0, 0); return cv.toDataURL('image/png');
};
