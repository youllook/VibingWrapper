// 霓虹隧道 · 車內：方向盤、儀表台、A 柱。都在陰影裡，只看得到輪廓和邊緣反光。
// 掛在鏡頭底下（鏡頭座標），畫在擋風玻璃那一關之後，所以不會被雨珠折射。
// 輸出已經是顯示用的顏色（不經過色調映射）。
import * as THREE from 'three';

export function makeCabin(camera) {
  const U = {
    uFlash: { value: 0 },          // 頭頂燈掠過時打在車內的橘光（0–1）
    uBlinkL: { value: 0 }, uBlinkR: { value: 0 },   // 方向燈／雙黃燈
    uAmb: { value: new THREE.Color(0.05, 0.03, 0.016) },
    uKey: { value: new THREE.Color(1.0, 0.55, 0.22) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); vP = mv.xyz;
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`
      uniform float uFlash, uBlinkL, uBlinkR; uniform vec3 uAmb, uKey;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){
        vec3 n = normalize(vN);
        // 光從擋風玻璃外面來：前上方（燈）＋前方（隧道的反光）
        float top = max(dot(n, normalize(vec3(-0.3, 0.8, -0.5))), 0.);
        float rim = pow(1. - max(dot(n, vV), 0.), 6.);
        vec3 c = vec3(0.0016, 0.0014, 0.0012);
        c += uAmb * 0.1 * (0.3 + 0.7 * top);
        c += uKey * (0.004 + 0.06 * uFlash) * (top * 0.08 + rim * 0.6);
        float bl = uBlinkL * smoothstep(0.3, -0.6, vP.x) + uBlinkR * smoothstep(-0.3, 0.6, vP.x);
        c += vec3(1., 0.45, 0.08) * 0.35 * bl * (0.3 + top + rim);
        gl_FragColor = vec4(pow(c, vec3(1. / 2.2)), 1.);
      }`,
  });
  const g = new THREE.Group();
  // 方向盤：鏡頭左下，往後仰 25°
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.024, 12, 64), mat);
  wheel.position.set(-0.27, -0.37, -0.46); wheel.rotation.set(-0.42, 0.1, 0);
  const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.03), mat);
  spoke.position.set(0, -0.05, 0.01); wheel.add(spoke);
  // 儀表台：一大塊往前斜下的板子，前緣接擋風玻璃底
  const dash = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.35, 0.7), mat);
  dash.position.set(0.1, -0.53, -0.88); dash.rotation.x = 0.08;
  const lip = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.03, 0.05), mat);
  lip.position.set(0.1, -0.348, -0.57);
  // 儀表罩：方向盤後面的拱
  const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 24, 1, false, -Math.PI / 2, Math.PI), mat);
  hood.rotation.set(Math.PI / 2, 0, Math.PI / 2); hood.position.set(-0.28, -0.33, -0.72); hood.scale.set(1, 1, 0.45);
  // A 柱：左邊一條往上斜的粗柱
  const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1.5, 0.08), mat);
  pillar.position.set(-0.86, 0.1, -0.8); pillar.rotation.set(-0.45, 0, -0.2);
  g.add(wheel, dash, lip, hood, pillar);
  camera.add(g);
  const scene = new THREE.Scene();
  scene.add(camera);    // 只為了讓 render(scene, camera) 畫到掛在鏡頭底下的車內
  return { U, group: g, scene, mat };
}
