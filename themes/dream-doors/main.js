// 夢境之門 · 步驟 5 燈光與狀態（逆光影子、步道光斑、雲頂金邊、消失點白光、六種狀態）
// 座標：步道沿 −Z 往遠處，x＝0 是步道（門框）中線，y＝0 是步道面。鏡頭與女孩固定，門框往 +Z 移、過了鏡頭回收到最遠處。
// 網址參數：?freeze=1（停住、門照目標圖擺）&ids=1（分層遮罩）&ref=0.5（疊目標圖）；擺景參數見 P。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const Q = new URLSearchParams(location.search);
const num = (k, d) => (Q.has(k) ? parseFloat(Q.get(k)) : d);
const IDS = Q.has('ids'), FREEZE = Q.has('freeze');

// ── 擺景參數（公尺／度）──
const P = {
  fov: num('fov', 50), camX: num('camx', 0.64), camH: num('camh', 1.52), yaw: num('yaw', 5.5), pitch: num('pitch', -0.2),
  ow: num('ow', 3.25), ph: num('ph', 3.2), post: num('post', 0.3), beam: num('beam', 0.36), over: num('over', 0.35),
  z1: num('z1', 6.05), sp: num('sp', 5.2), n: 18,
  open: num('open', 80),                                    // 第一扇門的開門角度（往遠處開）
  wl: num('wl', -2.15), wr: num('wr', 2.15), nearR: num('nearr', 6.6), nearZ: num('nearz', 2.2), // 步道兩緣；近處右側平台
  gx: num('gx', -0.79), gz: num('gz', 4.78), gh: num('gh', 1.5),
  nz: num('nz', 1.0), nl: num('nl', -0.51), nr: num('nr', 0.832), nw: num('nw', 1.0), // 近景滑門：深度、左右內緣（相對鏡頭）
  sx: num('sx', -1.55), sy: num('sy', 2.35), sz: num('sz', 2.6), ss: num('ss', 1.9),  // 櫻花枝貼片
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
const TILE = 3.2;                                                  // 貼圖一張＝4×4 塊 0.8 m 石板
function stoneTex() {
  const S = 1024, N = 4, cs = S / N, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  let seed = 11; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#a0968a'; g.fillRect(0, 0, S, S);                 // 石縫
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i * cs + (j % 2) * cs / 2) % S, y = j * cs, v = 196 + r() * 34, w = r() * 8 - 4;
    for (const xx of [x, x - S]) {
      g.fillStyle = `rgb(${v + 10 | 0},${v + 3 + w | 0},${v - 8 + w | 0})`; g.fillRect(xx + 3, y + 3, cs - 6, cs - 6);
      const gr = g.createLinearGradient(xx, y, xx + cs, y + cs); gr.addColorStop(0, 'rgba(255,250,240,0.10)'); gr.addColorStop(1, 'rgba(40,30,20,0.10)');
      g.fillStyle = gr; g.fillRect(xx + 3, y + 3, cs - 6, cs - 6);
    }
  }
  for (let k = 0; k < 60; k++) { g.fillStyle = `rgba(70,60,50,${0.015 + r() * 0.025})`; g.beginPath(); g.ellipse(r() * S, r() * S, 30 + r() * 90, 20 + r() * 60, r() * 3, 0, 7); g.fill(); }
  const id = g.getImageData(0, 0, S, S), d = id.data; for (let k = 0; k < d.length; k += 4) { const n = (r() - 0.5) * 16; d[k] += n; d[k + 1] += n; d[k + 2] += n; }
  g.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function worldUV(geo) {                                             // 網格放原點，頂點座標＝世界座標
  const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ny = Math.abs(n.getY(i)), nx = Math.abs(n.getX(i));
    if (ny > 0.5) { uv[i * 2] = x / TILE; uv[i * 2 + 1] = -z / TILE; } else if (nx > 0.5) { uv[i * 2] = -z / TILE; uv[i * 2 + 1] = y / TILE; } else { uv[i * 2] = x / TILE; uv[i * 2 + 1] = y / TILE; }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return geo;
}
const stone = IDS ? null : stoneTex();
const walkTop = IDS ? M.walk : new THREE.MeshStandardMaterial({ map: stone, roughness: 0.42, metalness: 0 });
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
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
    vec2 cp = vec2(vWp.x + vWp.z * .22, vWp.z - uScroll);          // 斜向拉長的光斑（光從右後方斜射）
    float ck = cn(cp * vec2(1.1, .32)) * .62 + cn(cp * vec2(2.6, .9) + 7.) * .38;
    float cookie = mix(.38, 1.3, smoothstep(.34, .66, ck));
    reflectedLight.directDiffuse *= cookie; reflectedLight.directSpecular *= cookie;
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

// ── 天空＋雲海：一顆跟著鏡頭的球，shader 算漸層天空、高空薄雲、腳下雲海（雲海用世界座標捲動，跟步道同速）──
const SUN = new THREE.Vector3(0.14, 0.06, -1).normalize();            // 天空裡的太陽：走道盡頭偏右、貼著地平線
const skyU = { uT: { value: 0 }, uScroll: { value: 0 }, uSun: { value: SUN }, uNight: { value: 0 }, uGold: { value: 0 } };
if (!IDS) {
  const m = new THREE.ShaderMaterial({ uniforms: skyU, side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `varying vec3 vDir; uniform float uT, uScroll, uNight, uGold; uniform vec3 uSun;
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
      void main(){
        vec3 d = normalize(vDir); float sd = max(dot(d, uSun), 0.);
        vec3 zen = mix(vec3(.26,.50,.90), vec3(.03,.06,.17), uNight);
        vec3 hor = mix(mix(vec3(1.,.89,.80), vec3(1.,.76,.52), uGold), vec3(.15,.18,.33), uNight);
        vec3 col = mix(hor, zen, pow(clamp(d.y,0.,1.), .5));
        col += mix(vec3(1.,.80,.56), vec3(1.,.62,.32), uGold) * (pow(sd, 6.) * .4 + pow(sd, 90.) * .9) * (1. - uNight);
        vec3 MD = normalize(vec3(.42,.26,-1.)); float md = max(dot(d, MD), 0.);   // 夜：月亮＋星星
        col += vec3(.80,.86,1.) * (smoothstep(.99955, .99975, md) * 1.1 + pow(md, 90.) * .22) * uNight;
        if (d.y > 0.) col += vec3(.85,.9,1.) * step(.997, h(floor(d.xz / (d.y + .25) * 260.))) * uNight * smoothstep(.05, .3, d.y);
        if (d.y > 0.) {
          vec2 p = d.xz / (d.y + .12) * 1.1 + vec2(uT*.003, 0.);
          float c = smoothstep(.52, .86, fbm(p));
          vec3 cl = mix(mix(vec3(1.,.97,.94), vec3(1.,.82,.62), pow(sd,2.) + uGold * .5), vec3(.22,.26,.40), uNight);
          col = mix(col, cl, c * .8 * smoothstep(0., .1, d.y));
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
          vec3 cc = mix(vec3(.60,.60,.84), vec3(1.,.96,.90), dif * (.5 + .5 * hc));
          cc += vec3(1.,.68,.38) * (rim * .6 + pow(sd, 1.5) * dif * 1.0 + hc * dif * .3) * (1. + uGold * .7);   // 雲頂金邊
          cc = mix(cc, cc * vec3(.26,.31,.52) + vec3(.02,.03,.07) + vec3(.35,.4,.55) * rim * .4, uNight);
          cc = mix(vec3(.46,.56,.84), cc, smoothstep(0., .15, hc));   // 雲縫露出更低、更藍的雲層
          float fog = 1. - exp(-t * .0015);
          cc = mix(cc, hor * vec3(1.,.98,.97), fog);
          col = mix(col, cc, smoothstep(.02, -.002, d.y));
        }
        gl_FragColor = vec4(col, 1.);
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
const LEAVES = ['shoji', 'plank', 'vault', 'stained', 'painted', 'red'];
const texL = new THREE.TextureLoader();
const leafMats = LEAVES.map((n) => {
  if (IDS) return M.leaf;
  const t = texL.load(`tex/leaf_${n}.webp`); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const face = new THREE.MeshLambertMaterial({ map: t }), edge = new THREE.MeshLambertMaterial({ color: '#6b5340' });
  return [edge, edge, edge, edge, face, face];                   // BoxGeometry 的六面：±x ±y ±z
});
const leafG = new THREE.BoxGeometry(P.ow / 2, P.ph - 0.05, 0.07);
// 門後世界：半邊門洞後面 PD 公尺放一片入口面，shader 用「鏡頭→該點」的方向讀全景（有視差）；地上加該世界顏色的光斑
const WORLDS = [ // 全景地平線在圖中的高度（由上往下比例）、地上光色
  { n: 'coast', hor: 0.5, c: '#bfe6ff' }, { n: 'lantern', hor: 0.55, c: '#ffae5c' }, { n: 'moonlake', hor: 0.45, c: '#7d98ff' },
  { n: 'snow', hor: 0.46, c: '#e6eeff' }, { n: 'wheat', hor: 0.53, c: '#ffc46a' },
];
const worldTex = WORLDS.map((w) => { if (IDS) return null; const t = texL.load(`tex/world_${w.n}.webp`); t.colorSpace = THREE.SRGBColorSpace; return t; });
const PD = 1.8;                                                    // 入口面在門框後幾公尺（開著的門板在它前面）
function portalMat() {
  if (IDS) return M.portal;
  return new THREE.ShaderMaterial({ transparent: true,
    uniforms: { map: { value: null }, cam: { value: camera.position }, hor: { value: 0.5 }, shift: { value: 0 }, op: { value: 1 } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 cam; uniform float hor, shift, op; varying vec3 vW;
      void main(){
        vec3 d = normalize(vW - cam);
        float az = atan(d.x, -d.z), el = asin(clamp(d.y, -1., 1.));
        vec2 uv = vec2(.5 + shift + az * 2.4 / 2.2, 1. - (hor - el * 2.4 / .943));
        gl_FragColor = vec4(texture2D(map, clamp(uv, .002, .998)).rgb * 1.05, op);
        #include <colorspace_fragment>
      }` });
}
function glowMat() {
  return new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { color: { value: new THREE.Color() }, op: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `uniform vec3 color; uniform float op; varying vec2 vUv;
      void main(){ float a = pow(vUv.y, 1.6) * smoothstep(1., .94, vUv.y) * smoothstep(0., .3, vUv.x) * smoothstep(1., .7, vUv.x);
        gl_FragColor = vec4(color * a * op * 1.1, 1.);
        #include <colorspace_fragment>
      }` });
}
const glowG = new THREE.PlaneGeometry(P.ow / 2, PD + 2.2).rotateX(-Math.PI / 2);
const litG = new THREE.PlaneGeometry(P.ow, P.ph);
function litMat() {
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
// 狀態給門的參數：思考亮度、等你、夜、多遠開始開門、時鐘、等你時停在哪扇門前、上次穿過門的時間
const AT = { think: 0, wait: 0, night: 0, openFar: 14, clock: 0, waitDoor: -1, lastPass: -99 };
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
  const portal = new THREE.Mesh(new THREE.PlaneGeometry(P.ow / 2 + 0.3, P.ph + 0.3), portalMat()); portal.position.set(0, (P.ph + 0.3) / 2 - 0.05, -PD);
  portal.visible = false; g.add(portal); g.userData.portal = portal;
  if (!IDS) { const gl = new THREE.Mesh(glowG, glowMat()); gl.position.set(0, 0.012, (2.2 - PD) / 2); gl.visible = false; g.add(gl); g.userData.glow = gl; }
  if (!IDS) { const lit = new THREE.Mesh(litG, litMat()); lit.position.set(0, P.ph / 2, 0.06); lit.visible = false; lit.renderOrder = 3; g.add(lit); g.userData.lit = lit; }
  return g;
}
function setOpen(door, deg) {
  for (const p of door.userData.leaves) p.rotation.y = -p.userData.s * THREE.MathUtils.degToRad(deg); // 往 −Z（遠處）開
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
  root.traverse((o) => { if (o.isMesh) { o.material = IDS ? M.frame : o.material; o.castShadow = true; if (!IDS) { o.material.transparent = false; o.material.depthWrite = true; } } });
  return g;
}
const doors = [];
for (let i = 0; i < P.n; i++) { const d = makeDoor(); doors.push(d); scene.add(d); }
// 第 i 扇門在第 k 輪的長相（freeze 時第 0、1 扇照目標圖：木框＋格子窗／櫻花木門、鐵框＋保險庫門）
function styleOf(i, k) {
  if (FREEZE && i === 0) return { frame: 0, l: 0, r: 1, world: -1 };
  if (FREEZE && i === 1) return { frame: 1, l: 2, r: 2, world: 0, side: -1, shift: 0.05 };
  if (FREEZE && i === 3) return { frame: 1, l: 3, r: 4, world: 2, side: 1, shift: -0.08 };
  const hasWorld = rnd(i, k + 21) < 0.5;                           // 約一半的門有一側通往別的世界
  return { frame: rnd(i, k + 5) < 0.6 ? 0 : 1, l: Math.floor(rnd(i, k + 9) * 6), r: Math.floor(rnd(i, k + 13) * 6),
    world: hasWorld ? (AT.night > 0.5 ? 1 + Math.floor(rnd(i, k + 27) * 2) : Math.floor(rnd(i, k + 27) * WORLDS.length)) : -1, side: rnd(i, k + 31) < 0.5 ? -1 : 1, shift: (rnd(i, k + 35) - 0.5) * 0.3 };
}
function dress(d, st) {
  if (frameModels.length && d.userData.frameType !== st.frame) {
    d.remove(d.userData.frame); d.userData.frame = frameModels[st.frame].clone(); d.add(d.userData.frame); d.userData.frameType = st.frame;
  }
  const [L, R] = d.userData.leaves; L.userData.mesh.material = leafMats[st.l]; R.userData.mesh.material = leafMats[st.r];
  const po = d.userData.portal, gl = d.userData.glow; d.userData.world = st.world;
  po.visible = st.world >= 0; if (gl) gl.visible = st.world >= 0;
  if (st.world >= 0) {
    po.position.x = st.side * (P.ow / 4 + 0.08); if (gl) gl.position.x = st.side * P.ow / 4;
    if (!IDS) { const u = po.material.uniforms; u.map.value = worldTex[st.world]; u.hor.value = WORLDS[st.world].hor; u.shift.value = st.shift; gl.material.uniforms.color.value.set(WORLDS[st.world].c); }
  }
}
function layoutDoors(offset) {
  doors.forEach((d, i) => {
    const L = P.sp * P.n, raw = -(P.z1 + i * P.sp) + offset;      // 過了鏡頭後方 2 m 就回收到最遠處
    d.position.z = (((raw - 2) % L) + L) % L - L + 2;
    d.visible = d.position.z < -1.2;                                 // 貼到鏡頭的那扇交給近景滑門演
    const k = Math.floor((raw - 2) / L);                            // 第幾輪（回收時換門的長相與開法）
    if (d.userData.k !== k || d.userData.frameType === undefined && frameModels.length) { dress(d, styleOf(i, k)); d.userData.k = k; }
    const w = d.userData.world >= 0, base = w ? 70 + 15 * rnd(i, k) : 25 + 60 * rnd(i, k);
    const near = 1 - THREE.MathUtils.smoothstep(-d.position.z, 8.5, AT.openFar); // 她走近時門整個打開（執行時提早整排彈開）
    let ang = i === 0 && FREEZE ? P.open : base + (84 + 4 * rnd(i, k + 1) - base) * near;
    if (i === AT.waitDoor) ang = THREE.MathUtils.lerp(ang, 0, AT.wait);           // 等你：她面前那扇門關著
    setOpen(d, ang);
    if (SHADOW) for (const p of d.userData.leaves) p.userData.mesh.castShadow = -d.position.z < 9; // 遠處半開的門板不投影（不然整條走道都在影子裡）
    const lit = d.userData.lit, dz = -d.position.z;
    if (lit) {                                                       // 思考：遠處的門由近到遠一扇扇亮起
      const ph = ((AT.clock * 0.3 - dz / 30) % 1 + 1) % 1, q = Math.min(ph, 1 - ph);
      const th = AT.think * Math.exp(-q * q * 45) * THREE.MathUtils.smoothstep(dz, 8, 14), wt = i === AT.waitDoor ? AT.wait : 0;
      lit.material.uniforms.op.value = th * 0.9 + wt * 0.8; lit.material.uniforms.seam.value = wt; lit.visible = th + wt > 0.01;
    }
    const pz = d.userData.pz;                                       // 剛穿過一扇門 → 近景滑門滑開一次
    if (pz !== undefined && pz < -1.2 && d.position.z >= -1.2 && d.position.z - pz < 1) AT.lastPass = AT.clock;
    d.userData.pz = d.position.z;
    const slide = FREEZE ? 0 : 1 - THREE.MathUtils.smoothstep(-d.position.z, 1.2, 4.5); // 快過鏡頭時門板往兩側滑出畫面
    for (const p of d.userData.leaves) p.position.x = p.userData.s * (P.ow / 2 + slide * 1.8);
    if (w && !IDS) {                                                // 門走近時門後世界淡掉（夢醒），人永遠穿過的是步道
      const op = THREE.MathUtils.smoothstep(-d.position.z, 7.5, 12); d.userData.portal.material.uniforms.op.value = op;
      d.userData.glow.material.uniforms.op.value = op; d.userData.portal.visible = op > 0.01;
    }
  });
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
    if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; if (IDS) o.material = M.girl; else { o.material.transparent = false; o.material.depthWrite = true; } }
    if (o.isBone && /Head$/.test(o.name)) head = o; if (o.isBone && /Neck$/.test(o.name)) neck = o;
  });
  scene.add(root);
  mixer = new THREE.AnimationMixer(root); act = mixer.clipAction(g.animations[0]); act.play();
  if (FREEZE) mixer.setTime(num('gt', 0.6));
});

// ── 近景：剛穿過的那扇門的滑門（往兩側滑開，貼著鏡頭）＋櫻花枝 ──
const NEAR = {};
{
  const H = 6;
  let nearM = M.near;
  if (!IDS) {                                                       // 格子窗門板貼圖先在 canvas 糊掉（離鏡頭 1 m、在動）
    const c = document.createElement('canvas'); c.width = 256; c.height = 614; const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, H / (P.nw / (512 / 1228))); t.offset.y = 0.5;   // 視線高度落在上半的格子窗
    const im = new Image(); im.onload = () => { const g = c.getContext('2d'); g.filter = 'blur(3.5px) brightness(0.95) saturate(1.15)'; g.drawImage(im, -24, -24, 304, 662); t.needsUpdate = true; };
    im.src = 'tex/leaf_shoji.webp';
    const face = new THREE.MeshLambertMaterial({ map: t, emissiveMap: t, emissive: '#ffc890', emissiveIntensity: 0.45 }), edge = new THREE.MeshLambertMaterial({ color: '#4a3424' });
    nearM = [edge, edge, edge, edge, face, face]; NEAR.face = face;
  }
  const l = new THREE.Mesh(new THREE.BoxGeometry(P.nw, H, 0.06), nearM); l.position.set(P.camX + P.nl * P.nz - P.nw / 2, P.camH, -P.nz);
  const r = new THREE.Mesh(new THREE.BoxGeometry(P.nw, H, 0.06), nearM); r.position.set(P.camX + P.nr * P.nz + P.nw / 2, P.camH, -P.nz);
  scene.add(l, r); NEAR.l = l; NEAR.r = r; NEAR.lx = l.position.x; NEAR.rx = r.position.x;
  const tex = new THREE.TextureLoader().load('tex/sakura_branch.webp');
  tex.colorSpace = THREE.SRGBColorSpace;
  const sm = IDS ? new THREE.MeshBasicMaterial({ color: ID.near, alphaMap: tex, alphaTest: 0.5 }) : new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.05, fog: false });
  if (IDS) { tex.colorSpace = THREE.NoColorSpace; } // alphaMap 讀綠色通道 → 用 onBeforeCompile 換成讀 alpha
  if (IDS) sm.onBeforeCompile = (s) => { s.fragmentShader = s.fragmentShader.replace('#include <alphamap_fragment>', 'diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).a;'); };
  const br = new THREE.Mesh(new THREE.PlaneGeometry(P.ss * 2, P.ss), sm);
  br.position.set(P.camX + P.sx, P.camH + P.sy - 1.52, -P.sz); scene.add(br); NEAR.br = br; NEAR.by = br.position.y;
}

// ── 花瓣：地上一層（跟步道一起後退）＋空中飄落；分層遮罩模式不畫 ──
const PET_G = 220, PET_A = 140, petals = [];
let petalMesh = null;
if (!IDS) {
  const pg = new THREE.PlaneGeometry(0.085, 0.06);
  petalMesh = new THREE.InstancedMesh(pg, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, emissive: '#5a2a35', emissiveIntensity: 0.5 }), PET_G + PET_A);
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

function resize() {
  renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ── 狀態 → 氛圍目標值（每秒讀 state.json；?state= 可固定一種）──
// speed m/s、sun 陽光、gold 天色轉金、glow 消失點白光、think 遠門亮起、petals 空中花瓣數、openFar 幾公尺外開始開門、night 夜
const STATES = {
  idle:      { speed: 1.3, sun: 2.8, gold: 0,    glow: 1.0, think: 0, petals: 40,  openFar: 14, night: 0 },
  thinking:  { speed: 1.0, sun: 2.2, gold: 0,    glow: 0.8, think: 1, petals: 30,  openFar: 14, night: 0 },
  working:   { speed: 2.6, sun: 2.9, gold: 0,    glow: 1.3, think: 0, petals: 140, openFar: 26, night: 0 },
  finishing: { speed: 0.8, sun: 2.9, gold: 1,    glow: 1.6, think: 0, petals: 60,  openFar: 14, night: 0 },
  waiting:   { speed: 0,   sun: 2.4, gold: 0.25, glow: 1.0, think: 0, petals: 25,  openFar: 14, night: 0 },
  absent:    { speed: 0.9, sun: 0.5, gold: 0,    glow: 0.3, think: 0, petals: 20,  openFar: 14, night: 1 },
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

const C = { sunDay: new THREE.Color('#ffd49a'), sunGold: new THREE.Color('#ffa055'), sunNight: new THREE.Color('#9fb2ff'),
  skyDay: new THREE.Color('#e6def4'), skyNight: new THREE.Color('#3e4c78'), gndDay: new THREE.Color('#d6bea4'), gndNight: new THREE.Color('#2b2a36'),
  fogDay: new THREE.Color('#efe6e2'), fogGold: new THREE.Color('#f4d6b4'), fogNight: new THREE.Color('#1c2340') };
const cur = { ...STATES.idle };
let nightWorlds = false;
function applyAtmos(dt) {
  const tgt = STATES[stateName] || STATES.idle;
  const h = clockHours(), clockNight = (h >= 19 || h < 6) ? 1 : h >= 18 ? h - 18 : h < 7 ? 7 - h : 0;
  const k = 1 - Math.exp(-dt / 2.5);
  for (const key of ['sun', 'gold', 'glow', 'think', 'petals', 'openFar']) cur[key] += (tgt[key] - cur[key]) * k;
  cur.night += (Math.max(tgt.night, clockNight) - cur.night) * k;
  const n = cur.night, g = cur.gold * (1 - n);
  AT.night = n; AT.think = cur.think; AT.openFar = cur.openFar;
  if ((n > 0.5) !== nightWorlds) {                                   // 入夜／天亮：遠處的門重新抽門後世界（近的等回收再換，不會當面跳）
    nightWorlds = n > 0.5; doors.forEach((d) => { if (-d.position.z > 12) d.userData.k = null; });
  }
  sun.intensity = THREE.MathUtils.lerp(cur.sun, 0.9, n);
  sun.color.lerpColors(C.sunDay, C.sunGold, g).lerp(C.sunNight, n);
  hemi.intensity = THREE.MathUtils.lerp(1.75, 0.9, n); hemi.color.lerpColors(C.skyDay, C.skyNight, n); hemi.groundColor.lerpColors(C.gndDay, C.gndNight, n);
  if (scene.fog) scene.fog.color.lerpColors(C.fogDay, C.fogGold, g).lerp(C.fogNight, n);
  skyU.uNight.value = n; skyU.uGold.value = g; walkU.uNight.value = n;
  vpU.op.value = cur.glow * (1 - 0.85 * n);
  if (petalMesh) petalMesh.count = PET_G + Math.round(cur.petals);
  if (lamps) lamps.visible = halos.visible = n > 0.02;
  if (NEAR.br) NEAR.br.material.color.setRGB(1 - 0.6 * n, 1 - 0.58 * n, 1 - 0.45 * n);   // 櫻花枝（不受光的貼片）夜裡壓暗偏藍
  if (NEAR.face) NEAR.face.emissiveIntensity = 0.45 - 0.15 * n;
}

// 等你：挑前方一扇門，讓它剛好停在她面前 1.4 m（門關上、門縫透光，她回頭看）
const WAIT_Z = -P.gz - 1.4;
function stopAhead() {
  let best = { d: Infinity, i: -1 };
  doors.forEach((d, i) => { const dd = WAIT_Z - d.position.z; if (dd >= 2.2 && dd < best.d) best = { d: dd, i }; });
  return best;
}
// 走路動作裡兩腳併攏的時間點（秒），停下時把動作走到最近的一個
const PASS = [0.015, 0.627, 1.19, 1.79];                         // 這段 walk 是 2.33 秒兩個循環（四步）
function toPass(t, dur) {
  let m = Infinity; for (const p of PASS) for (const q of [p, p + dur]) { const d = q - t; if (d >= -1e-3 && d < m) m = d; }
  return Math.max(0, m);
}

let offset = 0, last = performance.now(), lastDraw = 0, paused = false, speed = STATES.idle.speed, waitOff = null, look = 0, turned = 0;
const LOOK = num('look', -0.9);                                      // 回頭角度（弧度，頭；脖子再加 45%）
const SPEED_MUL = num('speed', 1.3) / 1.3;
window.wpPause = (on) => { paused = !!on; };
document.addEventListener('visibilitychange', () => { last = performance.now(); });
function step(dt, t) {
  if (!IDS && !FREEZE) applyAtmos(dt);
  AT.clock = FREEZE ? 0 : t;
  let dOff = 0;
  if (!FREEZE) {
    if (stateName === 'waiting') {
      if (waitOff === null) { const b = stopAhead(); waitOff = offset + b.d; AT.waitDoor = b.i; }
      dOff = Math.max(0, Math.min(speed * dt, (waitOff - offset) * (1 - Math.exp(-dt / 1.1))));
      speed = dt > 0 ? dOff / dt : speed;
    } else {
      waitOff = null;
      speed += ((STATES[stateName] || STATES.idle).speed * SPEED_MUL - speed) * (1 - Math.exp(-dt / 1.5)); dOff = speed * dt;
    }
    offset += dOff;
  }
  const stopped = stateName === 'waiting' && waitOff !== null && waitOff - offset < 0.4;
  AT.wait += ((stopped ? 1 : 0) - AT.wait) * (1 - Math.exp(-dt / 0.7));
  if (stateName !== 'waiting' && AT.wait < 0.01) AT.waitDoor = -1;
  layoutDoors(FREEZE ? 0 : offset);
  if (mixer) {
    let da = FREEZE ? 0 : dOff / 1.3;
    if (stopped && act && da < dt * 0.4) da = Math.min(dt * 0.4, toPass(act.time % act.getClip().duration, act.getClip().duration)); // 收腳站好
    // 回頭：先撤掉上一格加的角度（動作停住時 mixer 不會重寫骨頭，直接加會一直累積）
    if (head) { head.rotation.y -= turned; if (neck) neck.rotation.y -= turned * 0.45; }
    mixer.update(da);
    look += ((stopped && AT.wait > 0.6 ? 1 : 0) - look) * (1 - Math.exp(-dt / 0.9));
    turned = look * LOOK;
    if (head) { head.rotation.y += turned; if (neck) neck.rotation.y += turned * 0.45; }
  }
  // 剛穿過一扇門：近景滑門從靠內滑回原位；櫻花枝微微擺動
  if (NEAR.l && !FREEZE) {
    const since = AT.clock - AT.lastPass, e = since < 0 ? 1 : Math.min(1, since / 1.8), sl = 0.12 * (1 - e) ** 3;
    NEAR.l.position.x = NEAR.lx + sl; NEAR.r.position.x = NEAR.rx - sl;
  }
  if (NEAR.br && !FREEZE) { NEAR.br.rotation.z = Math.sin(t * 0.6) * 0.014 + Math.sin(t * 1.7 + 1) * 0.005; NEAR.br.position.y = NEAR.by + Math.sin(t * 0.9) * 0.012; }
  surfaces(t);
}
function frame(now) {
  requestAnimationFrame(frame);
  if (paused || document.hidden) { last = now; return; }
  if (now - lastDraw < 1000 / 30 - 2) return; lastDraw = now;          // 規格：30 fps 上限
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  step(dt, now / 1000);
  renderer.render(scene, camera);
}
const _m = new THREE.Matrix4();
function surfaces(t) {                                              // 石板、雲海、花瓣、小燈跟著走路距離捲動
  const off = FREEZE ? 0 : offset;
  if (stone) stone.offset.y = (off / TILE) % 1;
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

window.theme = { P, camera, scene, renderer, doors, STATES, PARAMS: STATES, CONFIG, AT, get mixer() { return mixer; }, get act() { return act; }, ready: Promise.all([ready, girlReady]),
  applyState, setSessions: (a) => { sessions = a || []; }, requestState: () => stateName, setState: (n) => { stateName = n; },
  draw: () => { step(0, performance.now() / 1000); renderer.render(scene, camera); },
  tick: (sec = 1, fps = 30) => { for (let i = 0; i < sec * fps; i++) { simT += 1 / fps; step(1 / fps, simT); } renderer.render(scene, camera); } }; // 測試：手動推進時間（分頁在背景時 rAF 不跑）
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
