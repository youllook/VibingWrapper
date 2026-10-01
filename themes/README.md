# 主題資料夾（themes/）

每種桌布是一個資料夾。主程式啟動時、以及每次打開齒輪選單時，會掃描 `themes/*/theme.json`，
把啟用中的主題依 `order` 排進「桌布」選單。要調哪一種，就只動那個資料夾。

## 一個主題資料夾放什麼

| 檔案 | 必要 | 內容 |
|---|---|---|
| `theme.json` | ✅ | 名稱、排序、入口頁、是否啟用 |
| `index.html` | ✅ | 桌布頁面本體（單一檔案；可以再放圖片、js 等，全部用相對路徑引用） |
| `README.md` | | 這個主題的參數、狀態對照、調整筆記 |

資料夾名稱就是主題 ID（存在 settings.json 的 `wallpaperStyle`）。以 `_` 或 `.` 開頭的資料夾不會被掃描。

## theme.json

```json
{
  "name": "天氣＋海",
  "order": 2,
  "entry": "index.html",
  "enabled": true,
  "description": "一句話說明"
}
```

- `name`：選單上顯示的名字
- `order`：選單順序，小的在前
- `entry`：入口頁，預設 `index.html`；可以帶查詢參數，例如 `index.html?sea=1`
- `enabled`：`false` 就不出現在選單（資料夾保留，隨時可以打開）

## 頁面要遵守的約定

1. **讀狀態**：每秒 `fetch('state.json')`（相對路徑；由 bridge 統一提供，所有主題讀到的是同一份）：
   `{"state":"storm","sessions":["storm","waiting",null,null,null]}`
   - `state`：合成後的天空，`clear` / `overcast` / `storm` / `clearing` / `waiting`
   - `sessions`：5 個固定位置，每個是一個 Claude session 自己的狀態（`null` = 沒有）
2. **暫停**：提供 `window.wpPause(on)`。桌面被最大化／全螢幕視窗蓋住、或一鍵隱藏時會呼叫；`document.hidden` 時也要停止渲染。
3. **效能**：30 fps 上限、半解析度渲染，GPU 每格最好在 12 ms 以內。
4. **測試介面（選配）**：把 `requestState`、`applyState`、`STATES`、`PARAMS`、`CONFIG`（含 `clockHours`、`polling`）掛在 `window` 上
   （現有主題用 `window.weather` / `window.ocean` / `window.network`，新主題可以用 `window.theme`），
   [demo.html](demo.html) 就能切狀態、調參數、拉時間軸。

## 新增一個主題

1. 複製一個現有的資料夾，改名（例如 `themes/forest/`）
2. 改 `theme.json` 的 `name` 和 `order`
3. 改 `index.html`
4. 打開齒輪選單，「桌布」就會多一個選項

預覽與調參數：`http://127.0.0.1:47321/themes/demo.html`（VibingWrapper 執行中時）。
