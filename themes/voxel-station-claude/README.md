# 體素雨夜加油站・Claude（voxel-station-claude）

風格競稿 `voxel-worlds`（Teardown 風）的 Claude 版。需求單：`studio/briefs/voxel-worlds/brief.md`。

固定鏡頭作弊（`studio/notes/08_固定鏡頭作弊.md`）：場景是真的 0.1 m 體素（方塊對齊體素格、樹與碎石由體素佔位生成、每個面的顏色依所在體素抖動），
在 Blender Cycles 烘一次；執行時只畫會動、會跟著 AI 狀態變的東西。

## 燈光分組（light groups）
光是線性可加的，所以每組燈各自一張圖，執行時重新加權：

| 圖 | 內容 | 執行時 |
|---|---|---|
| static.png | 橋上路燈、雨棚後排燈、招牌打光、販賣部 | 常亮 |
| sky.png | 天空與霧的自發光 | overcast 加亮、閃電時 ×6 |
| windows.png | 城市窗戶 | 依 masks.G 的窗戶編號逐窗開關（overcast 變少，每 40 秒有幾扇換） |
| bays.png＋bayw／bayw2 | 五盞加油格燈的總和＋各格占比 | 有 session 全亮、空格 0.3；waiting 整排依序呼吸 |
| masks.png | R 水窪、G 窗戶編號、B 深度 | 水窪內的倒影隨雨圈與風紋晃動；依深度加霧 |

全部存成 e = sqrt(x / (1 + x))（可逆、不爆亮、暗部保有精度），在半浮點緩衝裡相加後才做一次色調映射（ACES）＋夜色調色。

## 車
每款車在每一格各算一張 sprite（3 款 × 5 格，`car<款>_<格>.png`），另有車燈遮罩（R 頭燈、G 尾燈、B 方向燈、白＝車窗）。
新 session 從右邊開進來，結束時往左開走；倒影是同一張 sprite 以著地線鏡射，只在濕地／水窪上，跟著雨圈晃。

| session | 車 |
|---|---|
| clear | 停著、燈關 |
| overcast | 車窗起霧、燈微亮 |
| storm | 加油中：排氣冒煙 |
| clearing | 頭燈打開、準備離開 |
| waiting | 雙黃燈閃 |

## 雨
不畫雨絲，畫雨打到的東西：水窪雨圈（鋪在真實地面座標上，近大遠小）、雨棚前緣滴水（落 4.6 m、著地有小水花）。storm 偶爾閃電照亮天際線與霧。

## 重烘
```
blender -b --factory-startup -P studio/blender/voxel_station_scene.py -- <out>/full --scale 1 --samples 384
blender -b --factory-startup -P studio/blender/voxel_station_scene.py -- <out>/cars --scale 1 --samples 64 --cars
python studio/blender/pack_station.py <out>/full <out>/cars themes/voxel-station-claude
```
RTX 2060 SUPER：場景約 2 分鐘、車約 5 分鐘。

打包時的兩個修正（都因為體積霧）：Cycles 的 Z 通道會落在霧裡的散射點上 → 深度取 5×5 最小值；窗戶編號 AOV 被霧稀釋 → 取 15×15 最大值。
