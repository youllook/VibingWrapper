# terrain.js（子代理 B：地形）

檔案：`themes/creeper-end/assets/terrain.js`。全部 `Voxels.set` + `merged({slot:'endstone'})`，只填外露格（內部不填）。
顏色：末地石每格 ±6% 亮度，往下漸暗（endstoneShade → endstoneDark）。

## 產生器
- `makeIsland({seed, radius, terraces 1–3, depth, scale})`：橢圓＋噪聲邊緣；頂面中心 y=0、外圈一階階降；外緣有一圈厚度，往中心倒錐，低頻噪聲成簇垂墜；最底有 2–5 顆單獨吊著的方塊。`userData.surface`＝頂面格 `[x,y,z]`（已乘 scale）。
- `makeForeCliff({seed, size=22})`：台階（1 格高 ×3 塊）、3 個一格深凹洞、+x/+z 斷崖、8–10 格厚往中心加深成倒錐、左/後緣參差。`userData.surface`、`userData.heroSpot=[16,0,13]`（靠斷崖的平格，苦力怕站位建議）。
- `makeBridge({seed, points, width=3.2, gap=0})`：沿折線鋪帶，邊緣缺塊、厚 1–3、底下 1–3 格垂墜。`userData.surface/endPoint/endDir/length`。item 版折線約 44 格，尾端空 1 格後放 islandSmall 示意。

## 數據（countTris / build ms）
| 項目 | tris | build |
|---|---|---|
| foreCliff | 11,668 | ~32 ms |
| bridge（含示意小島） | 3,664 | ~8 ms |
| islandSmall r5 | 1,572 | 2 ms |
| islandMid r12 | 8,048 | 9 ms |
| islandBig r28 depth36 | 57,160 | ~55 ms |

截圖：`terrain-<項目>-p35.png`（俯視）、`-p-10.png`（仰看）、`terrain-all.png`（全家福）。

## 和目標圖還差什麼
- 島底垂墜偏「整齊的柱狀」，目標圖是更大塊、更參差的塊狀鐘乳石；可再加粗（2×2 柱）與橫向凸塊。
- 橋偏薄偏細，目標圖橋身更厚、底下掛的團塊更大（可 width 3.5、thick 2–3、增加垂墜）。
- foreCliff 倒錐大半在畫外，目前簡化；左後邊緣的台階輪廓還可再多點變化。
- 沒有貼圖（階段 4 做）；平光下台階輪廓靠明暗，已有每格亮度隨機。
