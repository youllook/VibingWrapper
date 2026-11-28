// 鎖住騎士的 dolly zoom ＋輕魚眼（食譜 3：scroll-fisheye-dolly-zoom）。
// 桌布沒有滾輪：w（0–1）由 Claude 狀態給，外面用秒級的緩動送進來。
// 每格都從「正常鏡頭」重建，不累積誤差。
import * as THREE from './vendor/three.module.min.js';

const v = new THREE.Vector3();
// base：{ pos, quat, tanHalf }（正常鏡頭）；subject：主體世界座標；c0：主體在正常鏡頭下的 NDC；minY(x,z)：鏡頭最低高度
export function applyLens(cam, base, subject, c0, w, minY) {
  const spread = 1 + 0.72 * w, curve = 0.30 * w * w;
  cam.position.copy(base.pos).sub(subject).divideScalar(spread).add(subject);          // 主體→鏡頭向量 ÷ spread
  cam.position.y = Math.max(cam.position.y, minY(cam.position.x, cam.position.z));     // 先壓在地面之上，再重投影
  cam.quaternion.copy(base.quat);
  const tanHalf = base.tanHalf * spread * (1 + curve);                                 // tan(fov/2) × spread，再 ×(1+curve) 留給魚眼的外擴
  cam.fov = THREE.MathUtils.radToDeg(Math.atan(tanHalf)) * 2;
  cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
  // 調投影偏移，讓主體留在原本的螢幕位置（也就是魚眼的光學中心）
  v.copy(subject).applyMatrix4(cam.matrixWorldInverse);
  const m = cam.projectionMatrix.elements;
  m[8] = m[0] * v.x / -v.z - c0.x;
  m[9] = m[5] * v.y / -v.z - c0.y;
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  return { spread, curve };
}

// 最後一關：以主體螢幕位置為中心取樣 center + delta·(1+curve·r²)/(1+curve)，雲與霧也在這裡一起疊（同一個魚眼）
export function makeComposite() {
  const mat = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: {
      uScene: { value: null }, uDepth: { value: null }, uCloud: { value: null }, uCloudPx: { value: new THREE.Vector2() }, uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uCurve: { value: 0 }, uAspect: { value: 1.78 },
      uMaxR2: { value: 1 }, uNearFar: { value: new THREE.Vector2(0.3, 9000) }, uNearMask: { value: 15 }, uExposure: { value: 1 }, uGrade: { value: new THREE.Vector3(1, 1, 1) }, uSat: { value: 1 }, uFlash: { value: 0 },
    },
    vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uScene, uDepth, uCloud; uniform vec2 uCenter, uNearFar, uCloudPx; uniform vec3 uGrade;
      uniform float uCurve, uAspect, uMaxR2, uNearMask, uExposure, uSat, uFlash;
      varying vec2 vUv;
      vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0., 1.); }
      void main(){
        vec2 d = vUv - uCenter, da = d*vec2(uAspect, 1.);
        float r2 = dot(da, da)/uMaxR2;                                   // 最遠的角落 r2＝1 → 剛好取到畫面角
        vec2 uv = uCenter + d*(1. + uCurve*r2)/(1. + uCurve);
        vec3 col = texture2D(uScene, uv).rgb;
        vec2 px = uCloudPx*1.3;
        vec4 cl = 0.2*(texture2D(uCloud, uv) + texture2D(uCloud, uv + px) + texture2D(uCloud, uv - px) + texture2D(uCloud, uv + vec2(px.x,-px.y)) + texture2D(uCloud, uv + vec2(-px.x,px.y)));   // 抹掉雲的抖動顆粒
        float zN = texture2D(uDepth, uv).r*2.-1.;
        float lin = 2.*uNearFar.x*uNearFar.y/(uNearFar.y + uNearFar.x - zN*(uNearFar.y - uNearFar.x));
        float far = smoothstep(uNearMask*0.65, uNearMask, lin);          // 近物（騎士、近草）不吃低解析度的雲霧，邊緣才乾淨
        col = col*mix(1., cl.a, far) + cl.rgb*far;
        col += uFlash*vec3(0.7,0.8,1.0);
        col *= uExposure*uGrade;
        float l = dot(col, vec3(0.2126,0.7152,0.0722)); col = mix(vec3(l), col, uSat);
        col = aces(col);
        vec2 q = vUv - .5; col *= 1. - dot(q,q)*0.55;                    // 暗角
        col = pow(col, vec3(1./2.2));
        col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233)))*43758.5453) - .5)/255.;
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
  const scene = new THREE.Scene(); scene.add(quad);
  return { mat, scene };
}
