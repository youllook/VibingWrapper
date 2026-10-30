# 02 素材：背景件（子代理 D）

2026-10-30。檔案：`themes/powerlifting-gym/assets/fx.js`、`themes/powerlifting-gym/textures/`、`docs/健力健身房/tools/masks.py`、`tools/wb_onbg.py`。

## 交付

| 檔案 | 內容 |
|---|---|
| `textures/backdrop.webp` | 底圖（`01-拆景/codex-白板空白.png`，1672×941，webp 品質 90，345 KB） |
| `textures/mask-glow.png` | RGBA 發光遮罩（1672×941，與底圖逐像素對齊）：**R＝霓虹字**、**G＝鎢絲燈泡＋光暈**、**B＝高窗亮面**（含鏡子裡映的窗）、**A＝裁判燈燈面** |
| `assets/fx.js` | `fan`（吊扇）、`whiteboard`（canvas 白板字示範） |
| `fx-masks.png` | 遮罩檢查圖：洋紅＝R、黃＝G、青＝B、綠＝A；白框＝白板四角、裁判燈圓；橘＝吊扇橢圓 |
| `fx-all.png`、`fx-fan.png`、`fx-fan-top.png`、`fx-whiteboard.png` | 檢視頁截圖 |
| `fx-whiteboard-onbg.png`（＋`-zoom`） | 白板墨水層透視貼回底圖的效果 |

重做遮罩：`python -I "docs/健力健身房/tools/masks.py"`（印出下面的座標 JSON）。
重做貼回檢查：先用 electron 把墨水層拿出來，再跑 `wb_onbg.py`：

```bash
EVAL="import('./assets/fx.js').then(m=>m.makeWhiteboardTexture({meetDate:'2026-12-12',today:'2026-10-30',tally:13,lines:['SQ 200','BP 130','DL 240']}).image.toDataURL())" \
  E:/DesktopPet/node_modules/.bin/electron "docs/健力健身房/tools/shot.js" "powerlifting-gym/assets.html?m=fx&i=fan" E:/tmp/x.png 640 360 \
  | grep '^eval' | sed 's/^eval data:image\/png;base64,//' | base64 -d > E:/tmp/gym/wb-ink.png
python -I "docs/健力健身房/tools/wb_onbg.py" E:/tmp/gym/wb-ink.png
```

## 像素座標（1672×941 底圖，左上為原點，y 向下）

| 東西 | 座標 | 來源 |
|---|---|---|
| 霓虹字外框 | x 1444–1611、y 170–275（燈管最亮處）；遮罩搜尋框 1436,168–1612,276 | 自動 |
| **白板可寫字區四角** | 左上 (1381, 339)、右上 (1665, 308)、右下 (1658, 534)、左下 (1391, 533) | 自動（亮度＋低飽和取最大輪廓的四個極點）。下緣在板擦／筆槽上方；右邊幾乎貼齊畫面右緣 |
| 裁判燈 左（紅） | 圓心 (1124.3, 645.9)、半徑 18.1 | 自動 |
| 裁判燈 中（黃） | 圓心 (1173.9, 645.0)、半徑 18.0 | 自動 |
| 裁判燈 右（白） | 圓心 (1225.0, 644.2)、半徑 18.5 | 自動 |
| 吊扇 | 馬達中心 (1120, 74)；扇葉轉動面在畫面上是橢圓，半軸 **rx 230、ry 80**；吊桿往上出畫面（約 (1116, 0)） | 目測（扇葉在畫面上很扁，3D 要從略低於扇面的角度看） |
| 燈泡 吊扇下 | (1190.3, 189.1) | 自動找亮點後人工挑 |
| 燈泡 鏡中左 | (18.7, 232.4) | 同上 |
| 燈泡 鏡中中 | (345.4, 248.3) | 同上 |
| 燈泡 鏡中右上 | (506.2, 281.5) | 同上 |
| 燈泡 鏡中右下 | (506.6, 317.7) | 同上 |
| 燈泡 鏡中左下 | (14.1, 393.5) | 同上 |
| 高窗（主排） | 多邊形 (600,0)–(975,140)–(975,270)–(600,135)，窗格斜向右下 | 手框＋亮度 |
| 高窗（左上兩扇） | (395,0)–(560,0)–(560,60)–(395,30) | 手框＋亮度 |
| 鏡中窗 | (95,325)–(375,315)–(380,455)–(95,455)；(470,385)–(525,455) | 手框＋亮度 |
| 高窗亮面總範圍 | x 95–964、y 0–448 | 自動 |

> 除了吊扇下那顆，其他燈泡都在左邊的鏡牆裡（是鏡中倒影），日夜切換時跟著 G 通道一起變就好。

## API

### `makeFan(opts)` → `THREE.Group`

原點＝吊桿頂端（天花板），往 -y 垂下。**會動的部件：`blades`**（Group，`blades.rotation.y += ω·dt`）。

| 參數 | 預設 | 說明 |
|---|---|---|
| `rod` | 0.32 | 吊桿長（m） |
| `diameter` | 1.3 | 扇葉直徑（m，葉尖到葉尖） |
| `blades` | 5 | 扇葉數 |
| `pitch` | 12 | 扇葉傾角（度） |
| `droop` | 4 | 扇葉下垂角（度） |
| `seed` | 3 | 各片角度的小誤差 |

結構：吊碗 `canopy`、吊桿 `rod`、馬達殼 `motor`（Lathe）、`blades` 底下 5 組（鐵臂 `bladeIron*`＋木葉 `blade*`）＋底蓋 `cap`。
材質槽：`fan`（馬達、吊碗、底蓋）、`steelDark`（吊桿、鐵臂）、`wood`（扇葉，照目標圖的淺木色；要統一成 `fan` 也只是換槽）。
**924 三角形**（預算 2k），build 6–16 ms。

### `makeWhiteboardTexture(data, w = 1024, h = 640)` → `THREE.CanvasTexture`
### `drawWhiteboard(texture, data)` → 同一張 texture（重畫，`needsUpdate = true`）
### `meetLabel(meetDate, today)` → 字串

| data 欄位 | 說明 |
|---|---|
| `meetDate` | 比賽日 `'YYYY-MM-DD'` 或 Date；沒給 → `MEET D-??` |
| `today` | 今天（預設現在）；只比年月日。當天 → `MEET DAY!`，過了 → `MEET D+n` |
| `tally` | 今日完成次數＝正字筆數；筆順 上橫→中豎→右短橫→左短豎→下橫，第 6 筆開新字。8 個字（40 筆）內大字一排 4 個，超過縮小一排 6 個 |
| `lines` | 右欄最多 5 行（藍筆），如 `['SQ 200','BP 130','DL 240']` |
| `board` | `false`（預設）＝**透明底只畫墨水**，給疊在看板白板上用；`true`＝畫白板底色（示範用） |
| `seed` | 筆跡亂數（同資料同筆跡；收尾加一筆時舊筆畫不會跳） |

- `drawWhiteboard` 沒給的欄位沿用上一次（存在 `texture.userData.data`），所以收尾只要 `drawWhiteboard(tex, { tally: n + 1 })`。
- 顏色：標題紅、正字黑、右欄藍；逐字抖動（旋轉、大小、上下）、整行略歪、筆畫兩端下筆墨點、乾擦紋（destination-out 細線）、淡淡的舊字殘影與板擦抹痕。
- 字型：`"Segoe Print", "Comic Sans MS", "Bradley Hand", cursive`，全是系統字，不外部載入。

### 檢視項目

- `fan`：預設參數。
- `whiteboard`：1.6×1.0 m 平面（`MeshBasicMaterial`、`userData.slot='whiteboardInk'`）貼 `board:true` 的貼圖，加鋁框、筆槽、一根立柱看離地高度。資料＝`meetDate '2026-12-12'、today '2026-10-30'、tally 13、lines SQ/BP/DL` → 顯示 **MEET D-43**、正正下。

## 給階段 3、5 的用法建議

- 白板：在看板白板四角上放一個平面（或直接把四角轉成 3D 四邊形），貼 `board:false` 的貼圖，材質用 `MultiplyBlending` 或在 shader 裡把墨水色乘上底圖亮度（`wb_onbg.py` 就是這樣做，字會吃到霓虹的紅光），往內縮 3% 不貼框。
- 吊扇：3D 扇葉要對上畫面橢圓（rx 230 : ry 80 ≈ 2.9:1），也就是相機略低於扇面、俯角約 20°。看板上原本的扇葉要先修掉（或 3D 扇葉直接蓋住），不然會看到兩組。
- 遮罩：`mask-glow.png` 的 A 通道大部分是 0。**載入時要確保不預乘 alpha**（three.js 預設 `premultiplyAlpha=false`，Chrome 會保留 RGB；若某平台 RGB 被吃掉，改成兩張 RGB 圖）。

## 已知不足

- 吊扇座標是目測；底圖的扇葉本身還在，3D 扇疊上去前需要決定「修圖拿掉原扇葉」還是「讓 3D 扇完全蓋住」。
- 白板四角是自動偵測的極點，誤差約 ±3 px；左緣有一點陰影，自動框略往內。
- 正字超過 90 筆會疊在第一排上；一天做到那麼多次應該不會發生。
- 白板字的字距在 Segoe Print 下最好看；沒有這字型的系統（Mac）會退到 Comic Sans／Bradley Hand，字寬不同，右欄可能要調位置。
- 霓虹遮罩只抓燈管＋小光暈，牆上的大片紅色漫射光沒放進去（階段 5 可以另外用一個大高斯當漫射）。
