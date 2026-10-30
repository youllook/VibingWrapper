# flora（紫頌植物與黑曜石柱）

檔案：`themes/creeper-end/assets/flora.js`。截圖：`flora-p35.png`、`flora-p10.png`（全項目，俯角 35／10）、`flora-chorusL.png`（單株）。

## 產生器
- `makeChorus({seed, height, scale, thick})`：1 格寬主幹（thick:2 可變 2×2），高 ≥3 起中段直角分 0–3 根側枝（水平 1–2 格再往上），枝端與主幹頂各一顆粉紫花苞（獨立 mesh，slot chorusFlower；莖 slot chorusStem，深淺兩色斑駁）。原點底部中心。
- `makePillar({seed, height, width, scale})`：寬 2–4、高 15–40 方柱，頂兩層內縮，表面約 0.18×高 處凹凸一格，頂端 1 格 obsidianGlow（獨立 mesh）。
- `scatter(surface, {seed, density, minGap})` → `[{x,y,z,kind:'chorus'|'pillar',height}]`；約 1/25 為柱（間距加大），chorus 高 3–14（小 45%／中 40%／大 15%）。grove 的 density 0.2、minGap 2.2 取 32 株。

## 三角形／時間（實測）
chorusS 48、chorusM ~110、chorusL ~230（高 12）、pillarS ~400、pillarL ~900、grove ~8.6k（32 株＋2 柱＋地）；每項 build ≤ 30 ms。皆在預算內。

## 和目標圖還差什麼
- 目標圖的紫頌枝更長、更像 U 形雙臂，這裡只有 1–3 根直角枝，枝與主幹偶爾貼在一起；大株近景的粗壯顆粒感（近景 refs/near.png 的雜點）要等階段 4 貼圖。
- 柱子目標圖更光滑、更細高；這裡有零星凸起，寬度 3–4 偏粗，可用 width:2 補。
- 花苞目前是單格粉色方塊，發光／bloom 在階段 5。
- scatter 沒考慮島緣（要避開邊緣請在輸入的 surface 先過濾）。

## 第二輪修正
- 紫頌改燭台／U 形：每層成對（70% 對稱）水平伸 2–3 格（與主幹留 ≥1 格空隙）再往上 2–4 格，高 ≥9 有 2–3 層，枝上可再分一次；chorusL 總寬 6、約 536 tris，chorusM 寬 4。花苞在每個上端。
- 柱子凸起降到約 0.07×高，pillarS 寬 2、pillarL 寬 3 高 35（約 870 tris）。
- `scatter` 加 `edgeMargin`（預設 2）：四鄰（方形範圍）有缺格就不放。
- 仍差：高株的 U 形偶爾枝尖重疊、紫頌細部質感待階段 4。
