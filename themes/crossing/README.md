# 平交道（crossing）

屏東鄉間的台鐵平交道。這個主題是 **Godot 4 網頁匯出**，原始碼在 [`godot/crossing/`](../../godot/crossing/)：
`main.gd` 用程式組出整個場景，`shell.html` 是網頁外殼（讀 `state.json`、時鐘、30 fps 上限、暫停、載入中百分比），貼圖在 `textures/`（Codex 繪製）。

匯出檔（`index.html`、`index.wasm`、`index.pck`… 約 60 MB）不進 git，要自己建：

1. 安裝 Godot 4.7（含網頁匯出模板，只需要 `web_*`）
2. 在 repo 根目錄執行：
   ```
   godot --headless --path godot/crossing --import
   godot --headless --path godot/crossing --export-release "Web" ../../themes/crossing/index.html
   ```

## 狀態對照

| Claude | 平交道 |
|---|---|
| clear 閒置 | 燈不亮、柵欄升起 |
| overcast 思考 | 警報響、柵欄放下，列車從遠方開來，停在平交道前等 |
| storm 工作 | 列車通過，工作多久就開多久（無限列車） |
| clearing 做完 | 最後一節開過，警報停、柵欄升起 |
| waiting 等你 | 列車停在平交道上 |

多個 session 同時工作：每個 session 一列 6 節短列車，各自顏色（1 青橘、2 藍黃、3 紅白、4 綠、5 紫橘），頭尾接力；只剩一個就變回一列無限列車。

## 其他

- 時間跟著真實時鐘（太陽、真實月相、星星、西方光害、雲）；`?day=1`／`?night=1` 固定在 10:30／22:00。
- 全解析度渲染（`?scale=0.5` 可降）；網頁版 Godot 的 `max_fps` 會空轉燒 CPU，所以由外殼節流 rAF。
- 測試參數：`?state=storm&hours=17.5&warp=40&sessions=storm,,storm&moon=0.1`。
