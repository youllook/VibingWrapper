# D 天空遠景 `sky/`（2026-10-30）

## 成品檔

| 檔案 | 內容 |
|---|---|
| `godot/sandworm2/sky/far.png` | 只剩遠景的背景圖（1672×941，Codex 由 target.png 重畫）：天空、雲、太陽、光芒、遠山稜線、地平線霧、地平線以下平坦霧化沙漠 |
| `sky/backdrop.tscn` ＋ `backdrop.gd` | 看板：MeshInstance3D（QuadMesh），**掛在 Camera3D 底下**，自動縮放成剛好填滿視錐 |
| `sky/backdrop.gdshader` | 雲飄＋太陽光暈呼吸；unshaded、不寫深度、不吃霧 |
| `sky/preview.tscn` ＋ `preview.gd` | 預覽：Camera3D（fov 50、y=8、far 20000）＋看板；`_ready` 呼叫 `Look.plain_env`／`Look.apply` |
| `sky/codex/` | Codex 工作夾（prompt.md、target.png、原始產出 far.png），有 `.gdignore`，Godot 不匯入 |

## 對位（以 1672×941 像素計）

- **太陽中心 (1511, 445)**，半徑約 15 px（目標圖 (1513, 445)）。
- **地平線（遠山山腳沒入霧、平原開始）y ≈ 545**；遠山稜線頂 y ≈ 400（左側最高峰）到 y ≈ 450（太陽旁）。
- 預覽截圖跟 far.png 逐像素比對：雲區以下（y > 400）平均差 < 1.3／255（只差在取樣與光暈），等於完全對齊。與目標圖疊圖（`sky-vs-target.png`，青線＝y 545、青圈＝太陽）稜線、太陽都對得上。
- 遠山稜線已**完整補畫成一條連續的山脊**：目標圖裡被石拱、沙蟲、塵、岩柱擋住的部分都補上了，同色同高同霧化，沒有斷口、沒有糊塊（用戶要求：背景是一張平面貼圖，山要整條）。

## 看板參數（backdrop.gd export）

| 參數 | 預設 | 說明 |
|---|---|---|
| `fov` | 50 | 鏡頭垂直 fov（度），要跟父鏡頭一致 |
| `aspect` | 1672/941 | 畫面寬高比 |
| `distance` | 15000 | 看板離鏡頭距離（公尺），要小於鏡頭 far |
| `plate` | far.png | 背景圖 |
| `drift_speed` | 0.0025 | 雲飄速度（UV／秒） |
| `drift_dir` | (1, −0.08) | 雲飄方向（UV，x 往右、y 往下） |
| `churn` | 0.004 | 雲的小幅雜訊翻攪量（UV） |
| `cloud_bottom` | 0.41 | 雲流動區的下緣（UV y，≈ 像素 386） |
| `sun_uv` | (0.903, 0.473) | 太陽位置（光暈中心、雲流動的避讓中心） |
| `glow_strength` | 0.12 | 光暈呼吸幅度（疊加亮度） |
| `glow_speed` | 0.35 | 呼吸頻率（次／秒） |

shader 另有 `drift_span`（0.03，單一相位最大位移）、`cloud_feather`（0.10）、`sun_keepout`（0.10）、`glow_radius`、`glow_color` 可在材質上調。

## 雲飄怎麼遮

- 遮罩 `m`：`1 − smoothstep(cloud_bottom − feather, cloud_bottom, uv.y)` → 像素 y < 292 全速流動，292–386 漸弱，**386 以下（稜線頂約 400、地平線、平原）完全不動**；再乘上太陽周圍的避讓圈（半徑約 0.06–0.16 畫高漸變），太陽與光芒不被拖動。
- 流動用雙相位 flow-map 手法：兩份取樣各自沿 `drift_dir` 滑動最多 `drift_span`，半週期交錯淡入淡出；相位加一層低頻雜訊打散，避免整片同時「呼吸」。另外疊 `churn` 小雜訊扭曲，讓雲有翻攪感。位移量都乘 `m`，所以遮罩外的像素取樣點就是原圖。
- 光暈：以 `sun_uv` 為中心的高斯加光，`glow_strength × (0.5 + 0.5 sin)` 呼吸，只加不減。

## 深度（為什麼永遠在最後面）

- `depth_draw_never`：不寫深度，不擋任何東西。
- vertex 把 clip-space z 釘在 `0.999999·w`（貼遠平面）：不管繪製順序，凡是在鏡頭 far 以內的不透明物件都會蓋過它；之後畫的透明物件（塵）讀到的深度也不含看板。
- `fog_disabled`：主場景若開霧，看板不會再被霧化一次（圖本身就有地平線霧）。
- `extra_cull_margin` 很大，不會被視錐剔除。

## 用法（主線）

```gdscript
var bd := preload("res://sky/backdrop.tscn").instantiate()
bd.fov = cam.fov; bd.aspect = 1672.0 / 941.0; bd.distance = 15000.0
cam.add_child(bd)
```
看板掛在鏡頭底下，鏡頭不動就和目標圖構圖一致。

## 截圖

- `sky-frame4.png`：第 4 格（≈ far.png 原貌）
- `sky-frame300.png`：第 300 格（10 秒後，雲已位移）
- `sky-vs-target.png`：與 target.png 50% 疊圖，青線地平線 y 545、青圈太陽

截圖：`SCENE=res://sky/preview.tscn FRAMES=n ./tools/shot.sh <out.png>`。

## 已知問題

- `Look.apply`（gray／layers 模式）會用 `material_override` 換掉看板材質 → 灰模／分層模式下看板是一面普通平板（灰或藍），失去「釘在遠平面」的特性；它在 15 km，仍在沙丘（4 km）後面，不影響檢查。
- 雙相位流動長時間看，雲會在約 12 秒（`drift_span / drift_speed`）的週期內交錯淡化，近看有輕微重影；調小 `drift_span` 可減輕，但雲就飄得比較短。
- 太陽光芒在畫面上是畫死的（不動），只有光暈在呼吸。
- 地平線以下的平原是平坦霧化的，近中景沙丘要由 sand 家族蓋上。
