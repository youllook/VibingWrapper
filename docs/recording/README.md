# 錄製

用腳本驅動桌布錄出影片：README 動態圖、Demo、Shorts／Reels 的素材都從這裡來。

| 檔案 | 用途 |
|---|---|
| `shots.json` | 分鏡設定：要錄哪些鏡頭、每段什麼天氣、幾秒 |
| `record.js` | 照 `shots.json` 把每個鏡頭直接錄成 MP4 |
| `virtual-clock.js` | 錄製時注入頁面的虛擬時鐘（不用動它） |
| `states.js` | 舊的 README GIF 錄製腳本（輸出 PNG 畫格，見文末） |

## 錄影片

在 repo 根目錄（要有 ffmpeg 在 PATH 上）：

```bash
node_modules/electron/dist/electron.exe docs/recording/record.js "$(pwd -W)" out
```

- 不指定名字：錄 `shots.json` 裡的每一個鏡頭；在最後加鏡頭名稱就只錄那幾個，例如 `... out sea-storm-to-star jellyfish-night`。
- 換一份分鏡檔：`--shots 我的分鏡.json`。
- 輸出 `out/<鏡頭名>.mp4`，H.264、CRF 16。預設直式 1080×1920、30fps，一段 13 秒大約 40 秒錄完。

### 原理（為什麼畫面穩）

- 頁面的 `performance.now()` 和 `requestAnimationFrame` 都換成虛擬時鐘，錄製器一格一格推進。電腦再慢，輸出也是精準的 30fps，不會掉格。
- 每一格直接從主題的 WebGL canvas 讀像素，不經過 Chromium 的離屏合成（合成器偶爾會交出舊畫面）。
- 開頭會自動跳過 GPU 暖機時的黑畫面。

## shots.json 怎麼寫

```json
{
  "defaults": { "size": [1080, 1920], "fps": 30, "preroll": 6 },
  "shots": {
    "鏡頭名": {
      "theme": "sea",
      "clock": 15.6,
      "script": [
        { "state": "storm",    "sec": 4.5, "sessions": ["storm", "storm", "storm"] },
        { "state": "clearing", "sec": 3.5 },
        { "state": "waiting",  "sec": 5,   "sessions": ["clear", "waiting", "clear"] }
      ]
    }
  }
}
```

鏡頭欄位（沒寫的用 `defaults`）：

| 欄位 | 意思 |
|---|---|
| `theme` | `themes/` 底下的資料夾名：`sea`、`ocean`、`jellyfish`、`snowpeak`、`paddy`、`meadow-real`、`weather` |
| `query` | 網址參數，例如 `sea=0`（天氣主題不顯示海） |
| `clock` | 一天中的時間（0–24），例如 15.6 是下午、22 是夜晚 |
| `size` | `[寬, 高]`，橫式用 `[1920, 1080]` |
| `fps` | 影格率 |
| `preroll` | 開錄前先讓第一段狀態跑幾秒（不錄），畫面才是穩定的 |
| `note` | 備註，程式不讀 |

`script` 每一段：

| 欄位 | 意思 |
|---|---|
| `state` | 天空：`clear` 待命／`overcast` 思考／`storm` 跑工具／`clearing` 做完／`waiting` 等你 |
| `sec` | 這段錄幾秒 |
| `sessions` | 最多 5 個 session 各自的狀態（船、水母群、營地），`null` 是沒有；不寫就沿用上一段 |
| `clockTo` | 這段期間把時間從目前慢慢推到這個值（縮時，例如 16.5 → 20.5 的日落） |
| `params` | 把主題參數釘住，例如 `{ "rainAmount": 1, "lightningRate": 0.4 }`；`null` 放開。可用的參數看各主題 `index.html` 的 `PARAMS` |
| `config` | 直接改主題的 `CONFIG`，例如 `{ "fullTransition": 1.5 }` 讓轉場快一點 |
| `eval` | 進階：任意 JS，`T` 是主題的測試介面，例如 `"T.strike(3)"` 打三道閃電（`sea`） |

所有主題都用同一套介面（`applyState`、`setSessions`、`setOverride`、`CONFIG`，見 [themes/README.md](../../themes/README.md)），所以同一份分鏡換個 `theme` 就能錄別的桌布。平交道（`crossing`）是 Godot 匯出的，不在 git 裡，也沒有這套介面，錄不了。

## 目前的鏡頭

| 鏡頭 | 內容 |
|---|---|
| `sea-storm-to-star` | 鉤子：一開場就是暴雨，雲散天晴，一艘船的燈閃起來（Claude 在等你） |
| `sea-fleet-night` | 夜海上五個 session 同時在跑，之後兩艘在等你 |
| `sea-sunset-timelapse` | 平靜的下午到入夜，12 秒縮時 |
| `jellyfish-day` | 海月白天：陰 → 放晴 → 等你 |
| `jellyfish-night` | 海月夜晚：暴風攪起海螢光，再平靜下來 |
| `snowpeak-dawn` | 雪山清晨：暴風雪 → 雲散 → 等你 |

## 舊的 README GIF（states.js）

`docs/screenshots/states.gif`（2026-10-15；600 寬、約 16 秒、7MB）是這樣做的：

1. 錄畫格：`node_modules/electron/dist/electron.exe docs/recording/states.js "$(pwd -W)" frames`
   960×540、12fps、下午 15.6 點（傍晚 18.2 太暗，陰晴分不出來），待命 1.6s → 思考 3.2s → 執行 4.0s → 收尾 3.4s → 等你 3.6s，左下角疊中英標籤。
   它用的是即時錄製，不是虛擬時鐘，偶爾會有重複格；要重做建議改寫成 `shots.json` 的一個鏡頭（`size: [960, 540]`、`fps: 12`），再加標籤。
2. 轉 GIF：

   ```bash
   ffmpeg -y -framerate 12 -i frames/f%04d.png \
     -vf "fps=10,scale=600:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=5" \
     -loop 0 states.gif
   ```

   720 寬／128 色太大，所以退到 600 寬／96 色。
3. 複製到 `docs/screenshots/states.gif`。
