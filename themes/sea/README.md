# 天氣＋海

天氣桌布的下半部換成一片遠方的海：海面重新取樣同一片天空當倒影，加上波紋、碎光、等你星的光柱；每個 Claude session 是一艘船。

- 入口：`index.html`（單一 WebGL fragment shader）
- 測試介面：`window.weather`
- 預覽：`http://127.0.0.1:47321/themes/demo.html` → 樣式選「天氣＋海」

## 狀態 → 參數

每個狀態是一組「目標數值」，切換時從目前的實際數值平滑轉過去（可中斷，時間依變化量縮放）。
數值定義在 `index.html` 的 `PARAMS`（範圍）和 `STATES`（目標）；用 demo 頁調好後可以匯出貼回去。

| 狀態 | 意思 |
|---|---|
| `clear` | 晴：閒置 |
| `overcast` | 陰：Claude 在想 |
| `storm` | 雷雨：Claude 在跑工具 |
| `clearing` | 轉晴：剛做完 |
| `waiting` | 等你：Claude 在等你回答或批准 |

## 調整筆記

- 從 `../weather/` 複製出來後獨立維護；海預設開啟（`?sea=0` 可以關掉比較）。
- 海平線在畫面 28%（`SEA_LINE`），海面函式 `seaColor()`、`seaH()`；船隊在 `BOAT`、`HOMES`、`BOAT_STATES`。
- 測試多 session：`weather.setSessions(['storm','waiting',null,null,null])`，`null` 回到讀 state.json。
