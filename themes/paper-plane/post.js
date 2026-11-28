// 紙飛機穿城 · 動態模糊
// 鏡頭固定、整座城市等速往 +Z 流，所以每個像素的運動向量可以精確算：
// 由深度還原世界座標 → 沿 +Z 平移（速度 × 快門）→ 再投影回螢幕 → 沿向量取 10 個樣本平均。
// 紙飛機不在這一關：它畫在模糊之後（見 main.js）。
import * as THREE from 'three';

export function makeMotionBlur(renderer, camera) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  rt.depthTexture = new THREE.DepthTexture(size.x, size.y); rt.depthTexture.type = THREE.FloatType;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: rt.texture }, tDepth: { value: rt.depthTexture },
      uProjInv: { value: new THREE.Matrix4() }, uViewInv: { value: new THREE.Matrix4() }, uPV: { value: new THREE.Matrix4() },
      uDz: { value: 0 }, uMaxPx: { value: 28 }, uRes: { value: size.clone() },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform sampler2D tColor, tDepth; uniform mat4 uProjInv, uViewInv, uPV;
      uniform float uDz, uMaxPx; uniform vec2 uRes;
      void main(){
        float z = texture2D(tDepth, vUv).r;
        vec4 col = texture2D(tColor, vUv);
        if (z < 0.99999 && uDz > 1e-4) {
          vec4 vp = uProjInv * vec4(vUv * 2. - 1., z * 2. - 1., 1.); vp /= vp.w;
          vec3 w = (uViewInv * vp).xyz;
          vec4 q = uPV * vec4(w + vec3(0., 0., uDz), 1.);
          vec2 vel = vec2(0.);
          if (q.w > 0.1) { q /= q.w; vel = (q.xy * .5 + .5) - vUv; }
          float px = length(vel * uRes); if (px > uMaxPx) vel *= uMaxPx / px;
          if (px > .5) {
            float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
            vec4 acc = vec4(0.);
            for (int i = 0; i < 10; i++) { float t = (float(i) + n) / 10. - .5; acc += texture2D(tColor, vUv + vel * t); }
            col = acc / 10.;
          }
        }
        gl_FragColor = col;
        #include <colorspace_fragment>
      }`,
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
  const pscene = new THREE.Scene(); pscene.add(quad);
  const pcam = new THREE.Camera();
  return {
    resize() { const s = renderer.getDrawingBufferSize(new THREE.Vector2()); rt.setSize(s.x, s.y); rt.depthTexture.image.width = s.x; rt.depthTexture.image.height = s.y; mat.uniforms.uRes.value.copy(s); },
    // dz：快門時間內城市往 +Z 移動的距離（m）
    render(scene, dz) {
      camera.updateMatrixWorld();
      const u = mat.uniforms;
      u.uProjInv.value.copy(camera.projectionMatrixInverse); u.uViewInv.value.copy(camera.matrixWorld);
      u.uPV.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      u.uDz.value = dz;
      renderer.setRenderTarget(rt); renderer.render(scene, camera);
      renderer.setRenderTarget(null); renderer.render(pscene, pcam);
    },
  };
}
