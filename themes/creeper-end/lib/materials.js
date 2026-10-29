// 依 mesh 的 userData.slot 換材質（階段 4）。貼圖乘在頂點色上：頂點色管每格明暗斑駁，貼圖管格內紋理。
// 貼圖是白底灰點（乘法用），所以固有色仍由 lib/palette.js 決定。
import * as THREE from '../vendor/three.module.min.js';
import { makeTextures } from './textures.js';

export function makeMaterials(opts = {}) {
  const T = makeTextures(opts);
  const lambert = (map, extra = {}) => new THREE.MeshLambertMaterial({ map, vertexColors: true, ...extra });
  return {
    endstone: lambert(T.endstone),
    obsidian: lambert(T.obsidian),
    chorusStem: lambert(T.chorusStem),
    // 會發光的：不吃光，顏色直接亮（bloom 在階段 5）
    chorusFlower: new THREE.MeshBasicMaterial({ map: T.chorusFlower, vertexColors: true, color: '#ff8af0' }),   // color 乘上去拉飽和，免得被色調映射曝成白
    obsidianGlow: new THREE.MeshBasicMaterial({ vertexColors: true, color: '#ff8af0' }),
    creeper: lambert(null),
    creeperFace: lambert(null),
  };
}

// 掃整個場景，有對應 slot 的 mesh 換材質；回傳各 slot 換了幾個（除錯用）
export function applyMaterials(root, mats = makeMaterials()) {   // mats 可傳 makeMaterials({ pp })
  const n = {};
  root.traverse(o => {
    const s = o.isMesh && o.userData && o.userData.slot;
    if (s && mats[s]) { o.material = mats[s]; n[s] = (n[s] || 0) + 1; }
  });
  return n;
}
