// 紙飛機：經典紙鏢（dart），機頭朝 −Z，長約 1 單位。摺紙本來就是平面，用幾片三角形組成。
import * as THREE from 'three';

export function makePaperPlane(material) {
  // 頂點：N 機頭、T 機尾中線、L/R 翼尖（機尾兩側）、K 機腹龍骨（機尾下方）
  // 翼面上反（dihedral）：翼尖抬高；每邊主翼在 ML／MR 再摺一道，平面著色會分出兩片明暗
  const N = [0, 0, -1], T = [0, 0, 0.42], L = [-0.62, 0.15, 0.42], Rr = [0.62, 0.15, 0.42];
  const ML = [-0.25, 0.035, 0.42], MR = [0.25, 0.035, 0.42];
  const K = [0, -0.17, 0.42], KN = [0, -0.02, -0.55];
  const tri = [
    N, ML, T, N, L, ML,                // 左主翼（內片、外片）
    N, T, MR, N, MR, Rr,               // 右主翼
    KN, T, K, N, T, KN,                // 龍骨（兩片貼合，DoubleSide 會看到兩面）
    // 翼尖往上摺的小立片（winglet）
    L, [-0.6, 0.28, 0.42], [-0.52, 0.13, 0.2],
    Rr, [0.52, 0.13, 0.2], [0.6, 0.28, 0.42],
  ];
  const pos = new Float32Array(tri.flat());
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  m.castShadow = true;
  return m;
}
