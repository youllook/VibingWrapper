# 麥塊世界・末地（creeper-end）

末地浮島上，一隊苦力怕過窄橋，近處那隻回頭望你。Three.js 體素場景（`vendor/three.module.min.js`）：只有近景（平台、主角、紫頌）與中近景（橋＋六隻）是 3D，中景遠景是背景圖（`docs/麥塊世界mc3/tools/backdrop.py` 從 Codex 扣圖合成）。

背景（`lib/backdrop.js`，參數在 `BG`）：
- **兩層視差**：`textures/backdrop-mid.webp`（中景，帶 alpha）、`backdrop-far.webp`（遠景）兩片看板，鏡頭慢慢微晃，前景、中景、遠景各滑不同距離。
- **重打光**：`backdrop-aux.png` 存從原圖推的法線、受光面、晶塊遮罩；主光慢慢左右擺（±8°），前景影子和背景島的亮面一起轉。
- **跟著狀態**：主光倍率、色偏、飽和度、晶塊亮度各狀態不同（見下表），前景的燈也一起乘。
製作過程與對照圖在 `docs/麥塊世界mc3/`（01 拆景 → 05 燈光特效氛圍）。

## 狀態（`states.js`）

| state.json | 演出 | 背景 | 按鍵 |
|---|---|---|---|
| sessions 全空 | 不在：全隊靜止，主角看正前方 | 變暗、褪色 | 0 |
| clear | 待命：站定、輕晃，主角回望鏡頭 | 原色，晶塊各自呼吸 | 1 |
| overcast | 思考：主角轉頭，綠光由近到遠接力 | 偏紫，晶塊由橋頭往遠方接力亮 | 2 |
| storm | 執行：隊伍原地踏步 | 主光加強、偏暖，鏡頭晃大一點 | 3 |
| clearing | 收尾：由近到遠依序停步 | 暖色退回 | 4 |
| waiting | 等你：主角回望、柔和閃白 | 跟主角同拍微微泛白 | 5 |

## 網址參數

| 參數 | 作用 |
|---|---|
| `?state=<名稱>` | 固定某個狀態（六態名或 state.json 的值） |
| `?full=1` | 全解析度（預設半解析度） |
| `?noatm=1` / `?atm={…}` | 關掉／臨時調整霧與光（`lib/atmosphere.js` 的 `ATM`） |
| `?env={…}` | 臨時調整環境光（`scene.js` 的 `ENV`） |
| `?still=1` | 鏡頭與主光不動（截圖對照用） |
| `?bg={…}` / `?sway=x,y` / `?keyyaw=度` | 臨時調整背景參數 `BG`；把鏡頭晃動、主光角度固定在某個值（檢查露邊、重打光） |
| `?tex=pp` | 方塊與苦力怕改用 Pixel Perfection CE 圖案（見下） |
| `?flat=1` / `?layers=1` / `?top=1` / `?ref=ref-mc3.png&a=0.5` | 製作用：灰模、分層上色、俯視結構圖、疊目標圖 |
| `?tune={…}` / `?cam=…` | 製作用：臨時覆寫擺位 `LAYOUT`、鏡頭 |

測試介面：`window.theme`（`states`、`actors`、`ATM`、`syncAtm()`、`LAYOUT`、`ENV`）。

## 授權

- 程式與自畫貼圖：本 repo 授權。
- `textures/pp/`（只在 `?tex=pp` 時載入）：Textures based on Pixel Perfection CE by XSSheep and contributors, CC BY-SA 4.0 — https://github.com/Athemis/PixelPerfectionCE
- `ref-mc3.png`：製作用目標圖（Codex 生成），發布前移除。
- `textures/backdrop-*`：由同一張 Codex 生成目標圖的中景＋遠景扣圖合成。
