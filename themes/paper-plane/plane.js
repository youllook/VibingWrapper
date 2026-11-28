// 紙飛機：經典紙鏢（dart），機頭朝 −Z，長約 1 單位。摺紙本來就是平面，用幾片三角形組成。
import * as THREE from 'three';

export function makePaperPlane(material) {
  // 頂點：N 機頭、T 機尾中線、L/R 翼尖（機尾兩側）、K 機腹龍骨（機尾下方）
  const N = [0, 0, -1], T = [0, 0, 0.42], L = [-0.62, 0.07, 0.42], Rr = [0.62, 0.07, 0.42];
  const K = [0, -0.17, 0.42], KN = [0, -0.02, -0.55];
  const tri = [
    N, L, T, N, T, Rr,                 // 左右主翼
    KN, T, K, N, T, KN,                // 龍骨（兩片貼合，DoubleSide 會看到兩面）
    // 翼尖往上摺的小立片（winglet）
    L, [-0.6, 0.2, 0.42], [-0.52, 0.065, 0.2],
    Rr, [0.52, 0.065, 0.2], [0.6, 0.2, 0.42],
  ];
  const pos = new Float32Array(tri.flat());
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  m.castShadow = true;
  return m;
}
