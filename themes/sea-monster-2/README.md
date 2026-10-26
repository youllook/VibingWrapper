# 大海怪2（sea-monster-2）

高空斜俯視的深海：一艘小艇拖著白浪駛過，Claude 執行時一隻巨魷浮上水面，大眼睛就在船旁。構圖照用戶 2026-10-27 給的參考圖（小艇左上、巨魷頭與眼在畫面中央、外套膜往右上出框、腕往左下攤開）。

這個主題是 **Godot 4 網頁匯出**，原始碼在 [`godot/sea-monster-2/`](../../godot/sea-monster-2/)：`main.gd` 用程式組場景、`water.gdshader` 海面、`eye.gdshader` 巨眼、`shell.html` 網頁外殼（讀 `state.json`、30 fps 上限、暫停、3/4 解析度）。巨魷沿用大海怪的 `kraken.glb`（Tripo 生、自綁骨架）。

匯出檔（`index.*`，約 100 MB）不進 git，要自己建（在 repo 根目錄）：

```
godot --headless --path godot/sea-monster-2 --import
godot --headless --path godot/sea-monster-2 --export-release "Web" ../../themes/sea-monster-2/index.html
```

本機看單格：`godot/sea-monster-2/tools/shot.sh <輸出.png> state=storm warp=30`（Compatibility 算繪、1080p）。

## 狀態

| Claude | 畫面 |
|---|---|
| clear 待命 | 只有小艇在開，海面閃光 |
| overcast 思考 | 巨魷在 22 m 深處（只剩極暗的影） |
| storm 執行 | 浮到背脊離水面 1 m（快升、慢沉） |
| waiting 等你 | 再浮高一點（0.7 m） |
| clearing 收尾 | 沉回去 |

測試參數：`?state=storm&warp=30`（warp = 先快轉幾秒）。

## 做法

- 巨魷：放大 10 倍（72 m 長，眼睛約等於船長）、上下壓扁到 0.42（才能整隻貼在水面，腕在水下一點點）、寬 ×1.2；側翻 0.55 rad 讓近側眼朝鏡頭。眼睛每格重設成正球（不跟著壓扁）。腕與觸腕每節骨頭加一道慢的行進波。
- 海：不打光的手算著色器——多層浪＋雜訊的法線 → 依深度緩衝折射水下的東西 → 沿光路逐色吸收（紅先沒）→ 天光菲涅耳＋太陽閃光 → 船尾白浪（雜訊斷開的中線＋兩條淡 V 臂）。牠浮上來時海面變靜（`calm`）。
- 船固定在畫面裡，水往後流（`drift`），所以魷魚看起來在跟著船走。
- 小艇：`models/boat.glb`（2026-10-27 Tripo H3.1 圖生、2K PBR、生成時直接限 2 萬面，見 `docs/大海怪2/漁船_Tripo需求單.md`）；船首原本朝 +Z，轉 90° 對到 +X、縮成 5 m、吃水 0.35 m。船上兩個人是程式放的膠囊＋球（駕駛站在操作台後、一人坐船尾）。

## 待辦

- 船上的人換成真模型（現在是膠囊）。
- 腕攤得更開（參考圖觸腕穗伸到左右兩邊畫框）。
- 下載量：`index.pck` 75 MB（巨魷貼圖照原尺寸壓），可在匯入設定縮貼圖。
- 內顯效能未量。
