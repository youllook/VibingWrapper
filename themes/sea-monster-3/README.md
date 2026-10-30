# 大海怪3（sea-monster-3）

暴風雨裡的小木船，從船舷上方低角度看出去。構圖照用戶 2026-10-27 給的參考圖（巨魷頭與大眼在右邊破水、左上舉起一根腕；參考圖裡的漁夫 2026-10-30 依用戶要求移除）；演出照用戶同日的分鏡：

| Claude | 演出 |
|---|---|
| clear 待命 | 平靜的灰海，船輕輕晃 |
| overcast 思考 | 浪湧起來（`sea_k` 0.18 → 0.7）、天色壓暗 |
| storm 執行 | 0–2.5 秒海面被頂起一座水丘、船跟著歪；1.2–4.6 秒眼睛破水浮上來（白浪、水花、從頭頂流下的水）；4–8 秒三根腕捲出水面揮舞；之後頭和眼露出水面盯著鏡頭，腕持續捲動抽打 |
| waiting 等你 | 牠留在水面盯著你，腕沉到一半慢慢擺，瞳孔越張越大 |
| clearing 收尾 | 腕先甩下去、頭往後仰沉回海裡，海面向下塌陷再湧起環狀浪，接著狂浪（`sea_k` 1.15）十幾秒才平息 |

這個主題是 **Godot 4 網頁匯出**，原始碼在 [`godot/sea-monster-3/`](../../godot/sea-monster-3/)：`main.gd` 用程式組場景與狀態、`water.gdshader` 海、`boat.gdshader` 船、`post.gdshader` 鏡頭、`sky.gdshader` 天空、`shell.html` 網頁外殼。匯出檔（`index.*`）不進 git，在 repo 根目錄建：

```
godot --headless --path godot/sea-monster-3 --import
godot --headless --path godot/sea-monster-3 --export-release "Web" ../../themes/sea-monster-3/index.html
```

本機看單格：`godot/sea-monster-3/tools/shot.sh <輸出.png> state=clear then=storm warp=7`（`then` = 開場後切到另一個狀態、`warp` = 先跑幾秒）。`dbg=` 可加 `nowater`、`noboat`、`nopost`、`flat`（海面攤平）、`cam=x,y,z,lx,ly,lz`（另開一台相機）。

## 模型（2026-10-27 全部 Tripo H3.1 圖生，輸入圖由 Codex 生，見 `docs/大海怪3/Tripo需求單.md`）

- `head.glb` 巨魷頭（近景專用、4K 貼圖）：原點在底、兩眼在 ±X、腕根朝 +Z。用 +X 那顆眼，就是模型自己的眼睛（2026-10-30 用戶：外掛的活眼移除）。
- `tentacle.glb` 腕（4K）：Blender 沿中心線綁 16 節骨鏈（`/e/tmp/sea-monster-3/blender/rig_tentacle.py`），模型原點在腕的中段，程式把根部移到 `TENTS[].at`；三根各自的根、方向、長粗、仰角、捲曲。
- `boat.glb` 舊木漁船。Tripo 的 2K 貼圖是碎塊拼貼，近景船舷會糊，所以 `boat.gdshader` 保留它的顏色／粗糙度／法線，再沿船身疊程式木紋（木板與接縫、纖維、木節、磨損，凹凸打進法線讓濕亮反光抓得到；細纖維小於約 2 像素就淡出，不閃爍）。Tripo 材質一律是半透明混合，程式改成不透明（不然海會畫在上面）。

## 做法

- 海：投影網格（螢幕空間的格子打到海平面再位移）＋ 12 道 Gerstner 波，船在 CPU 上算同一片海來起伏。網格上下都鋪到 NDC ±3.5：Compatibility 畫進貼圖時投影的 Y 會翻（不鋪兩邊船邊會缺一塊海）。遠處網格稀，短浪依頂點間距淡出（不然會混疊成尖山）。船邊 4–16 m 浪低一點（`LEE`），浪峰才不會擋住牠。船殼範圍內不畫海。
- 牠浮起：牠頭上方的水丘（`heave`）、破水時的環狀浪（`ring_t`）、頭周圍的翻攪（`churn`，平滑雜訊）；泡沫＝浪峰摺疊（Gerstner Jacobian）＋接觸（深度差）＋翻攪圈，用沿風拉長、扭曲過的泡沫紋理打散。
- 水花：破水處的細水沫、低空薄霧、頭頂往下流的水條（CPUParticles3D）。
- 鏡頭（`post.gdshader`，全畫面後製）：鏡頭水滴（暴風最多，水滴後面糊）、冷灰低飽和但暖色保留、暗角、顆粒。近景船舷不再打景深，保持清楚。

## 效能（2026-10-27，`E:\tmp\sea-monster-2-bench\bench3.js`）

RTX 2060 SUPER（畫布 1440×810）：待命 3.0 ms、思考 3.0 ms、執行中 4.4 ms、等你 4.5 ms。內顯未量。

## 待辦

- `index.pck` 111 MB（頭和腕的 4K 貼圖），可在匯入設定縮。
- 內顯效能未量。
