# 無限騎行（endless-ride）

高原草坡上，一台小機車沿著窄路一直往前騎。追焦鏡頭在車後；近處的草與路樁飛掠、遠山與瞭望塔慢慢移動、
頭上是 raymarch 的體積雲、身邊飄過花粉與種子。感覺參考 Meng To 的 Cloud Pass 示範，場景、造型全部原創。
機車與騎士都是 Tripo 生成的真模型（2026-11-28）：`models/bike.glb`、`models/rider.glb`；`?bike=box`、`?rider=box` 各自切回積木版。

## 機車模型（models/bike.glb）

- 來源：Codex 生成參考圖 `shots/tripo-input/bike.png`（prompt 在 `prompt_bike.md`）→ Tripo 網頁 H3.5、Ultra Mesh、30 萬面、4K PBR 貼圖 → 匯出 GLB 2K。
- 後處理（Blender，腳本存一份在 `shots/bike-build.py`）：以輪心＋半徑切出 `wheelF`／`wheelR`（原點在輪軸，`rotation.x` 轉動）、其餘為 `body`。
  Tripo 的輪胎被切成很多小網格島、上半圈又跟擋泥板內側黏在一起，所以：只有橫向寬度在輪胎內（|x|<0.042）的島才算輪子（前叉、鏈條、搖臂、輪轂側蓋留在車身不轉），
  輪子只取下半圈、轉 180° 複製補成整圈（保證正圓，量過兩輪外徑都在 0.31–0.32）；減面到約 15 萬三角、WebP 貼圖、6 MB；放大 1.958 倍讓軸距＝1.30、輪徑≈0.31，車頭朝 −Z，跟積木版同一套座標。
- `rider.js` 的 `attachBike()`：材質改不透明（Tripo 匯出一律半透明）、藏掉積木機車、尾燈／頭燈改成貼在模型燈罩前的發光圓片（頭燈白天透明，開燈才疊）、手移到握把 (±0.36, 1.07, −0.25)、腳移到腳踏。
- 效能：與積木版差異在量測雜訊內（全解析度約 4 ms／格）。

三招食譜在 `docs/素材庫/mengto_ride_skills/`（MIT）。對應實作：

| 招式 | 在哪裡 | 做法 |
|---|---|---|
| endless-riding-parallax | `scene.js` `tick()` 第 1 段、`common.js`、`terrain.js` | 一個 JS double 的 `sim.distance` 驅動路面、輪子、草、石頭、路樁、粒子；地形所有項都是 960 公尺的整數倍頻，GPU 只拿 `distance mod 960`；草／石／樁是有限的一池 instance，`z = mod(seedZ + 里程, L) − (L − 尾巴)`，跑到鏡頭後面才繞回最遠端；遠景（山稜＋塔）掛同一個 `land` transform，走 140 秒閉環 `x = k·1.2(1−cos a)、z = k·12 sin a`（k＝6，場景以公尺計所以放大），另外扣掉路的橫移與起伏當真實視差 |
| ride-particles-and-clouds | `particles.js`、`sky.js` `makeCloudPass()` | 920 顆（小螢幕 425）instanced quad，`z = mod(seedZ + travel + flutter, 34) − 24`，鏡頭深度兩端淡出、貼地形高度、用上一格與這一格各自的矩陣拉殘影；雲是 3D 密度逐步 `T *= exp(−密度×步長)`，半解析度、每 2 格算一次，在合成那關放大；雲、粒子、草、地形共用同一組太陽方向與顏色 uniform（`common.js` 的 `U`）；粒子 depthTest 開、depthWrite 關 |
| scroll-fisheye-dolly-zoom | `lens.js` | `spread = 1 + 0.72w`：主體→鏡頭向量 ÷ spread、`tan(fov/2)` × spread；`curve = 0.30w²`，視角再 ×(1+curve) 留外擴；調投影偏移把騎士釘在原本的螢幕位置；最後一關取樣 `center + delta·(1+curve·r²)/(1+curve)`。**不接滾輪**：`w` 由 Claude 狀態給、以秒級緩動 |

`node check.mjs` 跑這三招的數值自檢（用本主題實際的常數）。

## 騎士模型（models/rider.glb）

- 來源：Codex 生成 A-pose 參考圖 `shots/tripo-input/rider_apose.png`（prompt 在 `prompt_rider_apose.md`）→ Tripo H3.5（4K PBR）→ 重拓撲三角 2 萬面 → 自動綁骨架 Humanoid／Mixamo（含手指）→ 匯出 GLB 2K。
- `rider-rig.js` 的 `makeRiderRig()`（改寫自 skate-ride 的 skater.js）：不做動畫片段，積木騎士照算骨盆、上身、頭的轉動與手、腳落點，
  軀幹分攤到 Hips／Spine×3／Neck／Head，手臂、腿用兩節骨 IK；手指依「握把」程度一起彎；積木騎士藏起來，黃圍巾飄帶保留。
- 落點在 `rider.js` 的 `RT`：髖 (0, 0.92, 0.22)、手腕 (±0.31, 1.085, −0.2)、腳踝在腳踏上方；停車時左腳放地上、回頭時左手搭大腿。

## 狀態對照

| Claude | 狀態 | 畫面 |
|---|---|---|
| 不在 | `absent` | 停車、左腳撐地、引擎怠速微震；黃昏色、車燈亮；w＝0 |
| 待命 | `clear` | 巡航 13 m/s；積雲、藍天；w＝0.15 |
| 思考 | `overcast` | 10 m/s；雲量上來、霧變厚、飽和度降；w＝0.3 |
| 執行 | `storm` | 24 m/s；強風、粒子全開＋長殘影、暗雲、偶爾雲內閃電；w＝0.6（dolly zoom 的時刻） |
| 收尾 | `clearing` | 減速到 8 m/s；太陽破雲、路面還有點反光；w＝0.2 |
| 等你 | `waiting` | 慢慢停下，回頭越過肩膀看鏡頭、尾燈呼吸；w＝0 |

數值都在 `states.js` 的 `PARAMS`，趨近速率在 `RATE`。

## 網址參數與測試介面

- `?state=<名稱>` 固定狀態；數字鍵 0–5 切換（不在／待命／思考／執行／收尾／等你）
- `?hour=0–24`（或 `?day=1`、`?night=1`）：時段。**預設固定在傍晚前的斜陽（16:30），不跟電腦時鐘**
- `?full=1` 場景全解析度（預設 0.75）；`?cloudEvery=1` 雲每格都算；`?w=0–1` 固定鏡頭寬度；`?still=1` 關閃電
- `window.theme`：`applyState(name)`、`setSessions([...])`、`STATES`、`PARAMS`、`CONFIG`、`frameMs`、
  `step(dt, n, snap)`（手動推進，隱藏視窗截圖用）、`bench(n)`（每格毫秒，含 GPU）、`measure()`（胸口到座墊的像素距離）、`strike()`
- `window.wpPause(on)`、分頁隱藏時停；30 fps 上限

## 效能（RTX 2060 SUPER，1904×1041 視窗）

`theme.bench(150)`：預設設定約 2.8 ms／格（雲每格都算 3.8 ms、再加全解析度 4.7 ms）。
估算約 52 萬個三角形（地面 10 萬、草 14 萬片葉 × 3）。

## 已知的弱點

- 騎士的姿勢仍是積木版那套簡單插值（回頭、撐腳），沒有真的動作資料；身體不會隨過彎或顛簸做細微反應。
- 機車只有輪子會動：前叉不轉向、避震不壓縮、鏈條不走。
- 草是寬葉片，鏡頭旁邊那幾排看得出三角形；80 公尺外沒有草葉，只靠地面著色。
- 山稜是 CPU 高度場，稜線偏尖、沒有侵蝕感；塔是基本形狀堆的剪影。
- 雲是半解析度 26 步，雲緣偏糊，沒有真正的「體積光柱」；低霧只有 12 步。
- 遠景閉環放大 6 倍（食譜原值在公尺尺度下看不出來），仍然很慢：要看視差主要靠路的彎曲與起伏。
- 路樁、石頭的排列每 420／440 公尺重複一次；草每 36／120 公尺重複一次（看不太出來）。
- 夜晚色盤只是粗調（星星會透過雲）。
