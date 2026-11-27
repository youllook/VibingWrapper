// 步驟 6 動態模糊：鏡頭固定、棲地繞軸等速轉，所以每個像素的運動向量可以「精確」算出來：
// 由深度還原世界座標 → 繞軸轉（角速度 × 快門）→ 再投影回螢幕 → 沿這個向量取 8 個樣本平均。
// 前提：main.js 把色調映射改成在每個材質裡強制做（畫到 render target 時 three.js 預設會跳過）。
// 車窗框、座椅、太陽不隨棲地轉 → 視距 2.5 m 以內不模糊（太陽另外由 depth＝1 跳過）。
import * as THREE from 'three';

export function makeMotionBlur(renderer, camera, R) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  // 材質照舊把「最終顯示值」寫進來（色調映射→sRGB→霧，跟直接畫到螢幕同一條管線），這一關只做模糊
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  rt.depthTexture = new THREE.DepthTexture(size.x, size.y); rt.depthTexture.type = THREE.FloatType;

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: rt.texture }, tDepth: { value: rt.depthTexture },
      uProjInv: { value: new THREE.Matrix4() }, uViewInv: { value: new THREE.Matrix4() },
      uProj: { value: new THREE.Matrix4() }, uView: { value: new THREE.Matrix4() },
      uAng: { value: 0 }, uR: { value: R }, uMaxPx: { value: 48 }, uRes: { value: size.clone() },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform sampler2D tColor, tDepth; uniform mat4 uProjInv, uViewInv, uProj, uView;
      uniform float uAng, uR, uMaxPx; uniform vec2 uRes;
      void main(){
        float z = texture2D(tDepth, vUv).r;
        vec4 col = texture2D(tColor, vUv);
        vec2 vel = vec2(0.);
        if (z < 0.99999 && abs(uAng) > 1e-7) {
          vec4 vp = uProjInv * vec4(vUv * 2. - 1., z * 2. - 1., 1.); vp /= vp.w;
          if (-vp.z > 2.5) {
            vec3 w = (uViewInv * vp).xyz;
            float c = cos(uAng), s = sin(uAng), y = w.y - uR;
            vec3 w2 = vec3(w.x, y * c - w.z * s + uR, y * s + w.z * c);
            vec4 q = uProj * uView * vec4(w2, 1.); q /= q.w;
            vel = (q.xy * 0.5 + 0.5) - vUv;
            float px = length(vel * uRes); if (px > uMaxPx) vel *= uMaxPx / px;
          }
        }
        if (dot(vel, vel) > 1e-8) {
          vec4 acc = vec4(0.);
          for (int i = 0; i < 8; i++) { float t = (float(i) + 0.5) / 8. - 0.5; acc += texture2D(tColor, vUv + vel * t); }
          col = acc / 8.;
        }
        gl_FragColor = col;
      }`,
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
  const pscene = new THREE.Scene(); pscene.add(quad);
  const pcam = new THREE.Camera();

  return {
    resize() { const s = renderer.getDrawingBufferSize(new THREE.Vector2()); rt.setSize(s.x, s.y); mat.uniforms.uRes.value.copy(s); },
    // ang：這一格的快門時間內棲地轉過的角度（rad）
    render(scene, ang) {
      camera.updateMatrixWorld();
      const u = mat.uniforms;
      u.uProj.value.copy(camera.projectionMatrix); u.uProjInv.value.copy(camera.projectionMatrixInverse);
      u.uView.value.copy(camera.matrixWorldInverse); u.uViewInv.value.copy(camera.matrixWorld);
      u.uAng.value = ang;
      renderer.setRenderTarget(rt); renderer.render(scene, camera);
      renderer.setRenderTarget(null); renderer.render(pscene, pcam);
    },
  };
}
