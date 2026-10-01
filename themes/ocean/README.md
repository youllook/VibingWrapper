# 海

貼近海面的立體海：10 道 Gerstner 波＋逐像素光線步進，浪頭白沫、太陽碎光、月光；每個 Claude session 是一艘船，跟著同一片浪起伏。

- 入口：`index.html`（單一 WebGL fragment shader，由 Claude（Fable）設計）
- 測試介面：`window.ocean`
- 預覽：`http://127.0.0.1:47321/themes/demo.html` → 樣式選「海」

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

- 浪的組成在 `WAVES`；船的五種造型在 shader 的 `boatSprite()`／`boatLamps()`，可調參數在 `ocean.BOAT`。
- 測試多 session：`ocean.setSessions([...])`；`[]` = 沒有 session，只留一艘跟著天空的船。
- 白沫亮度 ×1.22 是刻意的（物理上在暗天下偏灰，看起來不像白浪）。
