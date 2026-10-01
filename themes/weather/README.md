# 天氣

只有天空的桌布：體積感的雲、逐滴的雨、閃電、陽光光束，日夜跟著台北的真實日出日落。

- 入口：`index.html`（單一 WebGL fragment shader）
- 測試介面：`window.weather`
- 預覽：`http://127.0.0.1:47321/themes/demo.html` → 樣式選「天氣」

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

- 雲的畫法參考 power418/skygl（MIT），壓成單一 2D pass。
- 每場雨開始時隨機擲強度與風向（`rainMood`），雲跟著同一陣風飄。
- 這份程式碼和 `../sea/` 一開始是同一份複製出來的；海的程式還在裡面但預設關閉（`?sea=1` 可以打開比較）。
