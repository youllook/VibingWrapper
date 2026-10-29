# 派工單：麥塊世界 階段 3「上細節、貼圖」（給 Sonnet）

## 背景（先讀懂，再動手）
- 這是 VibingWrapper 的動態桌布主題 `themes/creeper-window/`：雨夜木屋裡望向窗外，一隻苦力怕站在窗外門廊上。
- 目標圖：`docs/codex-brainstorm/minecraft/mc1.png`（1672×941）。前景結構線：`docs/麥塊世界/codex-fg/fg_lines.png`。
- 製作流程分四階段：① 素材 ② 擺放（**已完成並驗收**）③ 細節貼圖（**你的工作**）④ 燈光特效氛圍（之後才做）。
- 先讀：`docs/麥塊世界/01-素材盤點.md`、`02-場景擺放.md`、`themes/creeper-window/assets.js`、`scene.js`、`index.html`。
- 一律用繁體中文寫文件與回報。程式註解照現有檔案的英文風格與密度。

## 要做的事
1. **把灰模換成貼圖**：`index.html` 的 `matFor(kind)` 目前回傳純色；改成用 `assets.js` 的 `blockMaterial(kind)`（像素貼圖、Nearest 取樣）。
   - `water`、`glass`、`cloud` 先保留簡單材質（水、玻璃屬階段 4；雲維持純色方塊即可，可微調顏色）。
2. **非整格的盒子貼圖不能被拉伸**：桌面、桌腳、凳子、中柱（0.42 寬）、窗牆（0.45 厚，scene.js 用 instance 矩陣縮放）、石窗台填塊、小窗橫木，
   貼圖要依世界尺寸重複（1 格＝一張 16 px 貼圖），不要被縮放壓扁或拉長。遠山是 4 倍方塊，貼圖可以照 4 倍密度重複或保持大像素，你判斷哪個看起來對，寫下理由。
3. **細節**（對照 mc1，只加「方塊世界合理」的東西）：
   - 方塊之間的明暗變化：每個 instance 用 `setColorAt` 給輕微亮度／色相變化，避免大面積同一張貼圖重複感。
   - mc1 左上有天花板斜梁、左側兩根暗色木柱；屋內木頭有新舊差異。
   - 窗外石台是濕的深色石磚（mc1 右下）；湖岸、草地、樹的貼圖密度看起來要跟 mc1 的方塊尺度一致。
   - 苦力怕維持現有貼圖，臉要清楚。
4. 可以修改 `assets.js` 的貼圖產生器（調色、加變化），但**全部要程式自製、原創**，不可用任何遊戲原版貼圖或從網路下載的貼圖。

## 不能動
- `scene.js` 的 `LAYOUT`、`index.html` 的 `CAM`：構圖已驗收，**不要改位置、大小、鏡頭**。若某個細節非得改幾何，先在回報裡說明，不要直接改。
- 燈光、霧、雨、反射、景深、泛光：都是階段 4，**這次不做**。維持現在的半球光＋一盞平行光（可以微調強度讓貼圖看得清楚）。
- 不要 commit、不要動其他主題資料夾。

## 怎麼看畫面、怎麼驗收
- 預覽伺服器已開：`http://localhost:5191/themes/creeper-window/index.html`（repo 根目錄當網站根）。素材總覽：`.../assets.html`。
- 用內建瀏覽器（`mcp__Claude_Browser__*`）：先 `resize_window` 1672×941，再 navigate。改了 js 後模組可能被快取，用 ctrl+shift+r 或確認改動有生效。
- 存全解析度截圖：本機 `http://127.0.0.1:5192/<檔名>.png` 收 POST（body＝canvas 的 dataURL），存到 scratchpad
  `C:\Users\user\AppData\Local\Temp\claude\E--DesktopPet--claude-worktrees-codex-machine-project-setup-0ff44f\09e5d18e-4c35-47d2-b785-badaf6d73dbd\scratchpad\`。
  在頁面執行：`const T = window.theme; T.renderer.render(T.scene, T.cam); await fetch('http://127.0.0.1:5192/s3.png', {method:'POST', body: T.renderer.domElement.toDataURL('image/png')})`
- 疊圖檢查：網址加 `?ref=/docs/codex-brainstorm/minecraft/mc1.png&a=0.5`。
- 要跑 python 處理圖片：先把腳本寫成檔案再執行（不要 `python -c` 長字串）。PIL 已安裝；中文字型 `C:/Windows/Fonts/msjh.ttc`。

## 交件
1. 改好的程式（`index.html`、`assets.js`、必要時 `scene.js` 的材質相關部分）。
2. `docs/麥塊世界/03-貼圖.png`：目前畫面全解析度截圖。
3. `docs/麥塊世界/03-貼圖對照.jpg`：左 mc1、右目前畫面並排。
4. `docs/麥塊世界/03-細節貼圖.md`：做了什麼、各貼圖密度怎麼處理、還沒做到的、你覺得跟 mc1 差在哪（誠實寫）。
5. 最後回報：上面四項的路徑＋三到五句總結＋任何你沒照派工單做的地方與原因。
