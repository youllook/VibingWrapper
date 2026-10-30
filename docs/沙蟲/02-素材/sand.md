# C 沙與塵 `sand/` — 交件（2026-10-30；同日改版：塵改成「重的沙」而不是煙）

截圖（`SCENE=res://sand/preview.tscn FRAMES=90`）：
- [sand-normal.png](sand-normal.png)：8 m 眼高看地平線，約 250 m 外兩團塵（同主線參數：半徑 100／高 120 有沙瀑；半徑 90／高 80、`fall_count` 0）＋三根塵捲風
- [sand-gray.png](sand-gray.png)：`gray=1`（沙丘起伏烘在網格裡，灰模也看得到；粒子變成方片＝塵的覆蓋範圍）
- [sand-dust-close.png](sand-dust-close.png)：`close=1`，塵牆近看（約 190 m）
- [sand-devil.png](sand-devil.png)：`devil=1`，塵捲風近看

## 檔案

| 檔 | 內容 |
|---|---|
| `sand/dunes.tscn`＋`dunes.gd`（`SandDunes`）＋`dunes.gdshader` | 沙丘地面 |
| `sand/dust.tscn`＋`dust.gd`（`SandDust`） | 塵牆三層＋塵底沙幕＋噴出的沙粒＋落沙團＋沙瀑條帶 |
| `sand/devil.tscn`＋`devil.gd`（`SandDevil`）＋`devil.gdshader` | 塵捲風（可單獨擺） |
| `sand/puffs.gd`（`SandPuffs`） | 共用：做一組塵團 CPUParticles3D |
| `sand/dust_puff.gdshader` | 塵團 billboard shader（只吃 tint，不吃粒子 RGB）；含顆粒斑點、深色砂粒、底部下落條紋 |
| `sand/sand_veil.gdshader` | 塵團底下往下掉的沙幕（粒子版，只繞 Y 轉向鏡頭） |
| `sand/sand_grain.gdshader` | 小顆實心沙粒／沙塊（粒子，有最小像素尺寸） |
| `sand/sand_fall.gdshader` | 沙瀑條帶 shader（MultiMesh） |
| `sand/preview.tscn`＋`preview.gd` | 預覽；參數 `close=1`／`devil=1` 換近景鏡頭 |
| `sand/textures/` | `dune_hn.png`（高度＋坡度，1024²，2048 m 一循環）、`puff.png`（2×2 塵團圖集）、`streak.png`（落沙條紋）、`grain.png`（R 細砂、G/B 平滑雜訊） |
| `sand/tools/gen_textures.py` | 重生上面四張貼圖（`python sand/tools/gen_textures.py`，之後 `./tools/import.sh`） |

## dunes.tscn（`SandDunes`，MeshInstance3D）

- 範圍：以原點為中心 8 km × 8 km（`half_size` 4000）。**節點要放在世界原點、不旋轉**（高度用世界 xz 算）。
- 網格 256×256 格、**131 072 三角形**；格距中心約 0.8 m、邊緣約 60 m（近密遠疏）。
- 高度：`dune_hn.png` 的橫向沙丘（不對稱：迎風緩坡＋背風陡面，稜線蛇行）＋火山口。高度在 vertex shader 算（火山口可即時動），同一份也在 `_ready` 烘進頂點（灰模用；之後改 export 不會重烘，只有 `grid`／`half_size` 會）。
- 沙紋：fragment 裡兩種尺度（1.1 m、0.42 m）的法線起伏，看起來太細（< 幾個像素）就自動淡掉；陡坡上沒有沙紋。遠處坡度用 mipmap，自然變粗。
- `height_at(x, z)`：世界座標的沙面高度（跟 shader 同一套），主線擺岩柱／塵捲風貼地用。

| export | 預設 | 範圍／說明 |
|---|---|---|
| `crater_center` | (0, −600) | 世界 x, z，沙蟲破土處 |
| `crater_radius` | 90 | 10–400 m，外圈隆起的稜在這個半徑 |
| `mound` | 14 | 0–60 m；0 = 平沙面。中心凹 −0.35×mound、稜高 1×mound、外圍緩坡 |
| `dune_amp` | 1.0 | 0–2；1 ≈ −4.8…+7.2 m |
| `clear_center` / `clear_radius` | (0,0) / 40 | 鏡頭腳下清空成平地（石拱地面），2× 半徑處恢復沙丘 |
| `haze_color` / `haze_near` / `haze_far` / `haze_max` | 暖橘 / 300 / 3800 / 0.85 | 地面自帶的地平線霧（不靠 Environment fog） |
| `ripple` | 0.45 | 0–1 沙紋強度 |
| `grid` / `half_size` | 256 / 4000 | 改了會重建網格 |

火山口隆起區自動壓平沙丘、顏色稍深稍紅（被翻過的沙）。

## dust.tscn（`SandDust`，Node3D）

原點＝沙蟲穿出沙面的中心，放在沙面上。子節點都在 `_ready` 程式產生（改 export 會重建）。

**重量感**：塵團不是飄上去的煙。每一層都是「往上噴 → 阻尼急煞 → 重力（大於阻尼）拉回來」：
Wall 約 2.5 秒衝到 0.2–0.4 × `wall_height`（加上塵團本身大小，整體高度 ≈ `wall_height`），之後下垂、落回沙面；
Core 更低更濃；Skirt 貼地往外衝再沉下來。塵團底部有往下流的條紋，Veils 從塵團肚子底下垂下沙幕。
**顆粒感**：塵團 shader 內有細斑點（吃進 alpha，邊緣最多）＋少量較深的砂粒點，輪廓比煙硬；另有 Grains 一層小顆實心沙粒用真實重力（9.8）拋出再落回，在 250 m 外約 3 px。

| 子節點 | 類型 | 數量 | 作用 |
|---|---|---|---|
| Skirt | CPUParticles3D | 60 | 貼地往外衝、沉下的低塵 |
| Wall | CPUParticles3D | 110 | 噴起又落回的大塵團（塵牆主體） |
| Core | CPUParticles3D | 60 | 貼著身體的濃塵（吃掉沙蟲下半身） |
| Veils | CPUParticles3D（`sand_veil`） | 50 | 塵團底下垂下、往下流的沙幕 |
| Grains | CPUParticles3D（`sand_grain`） | 900 | 噴出、拋物線落回的小沙粒（0.4–1.4 m，最小 3 px） |
| Spray | CPUParticles3D | 60 | 從 `fall_height` 落下的沙團（`fall_count` 0 時不產生） |
| Sheets | MultiMeshInstance3D | `fall_count`（12） | 沙瀑條帶，只繞 Y 轉向鏡頭，條紋往下流、下端張開 |

大塵團 340 個（每個 1 quad）＋沙幕 50＋沙粒 900（都很小，填充率可忽略）＋12 條帶；`fixed_fps` 30、`preprocess` 已設，一出場就是滿的。
`look_flat(c)`（主線加的）保留：它設 `tint`／`shade`／`glow`，新的 Veils／Grains 也吃這三個顏色，所以灰模一樣變灰。

| export | 預設 | 範圍／說明 |
|---|---|---|
| `intensity` | 1.0 | 0–1：透明度（^0.6）、塵團大小（0.55–1×）、粒子速度（0.5–1×）一起變；0 = 隱藏、停止發射 |
| `radius` | 60 | 10–300 m，塵牆半徑（塵團大小、沙粒最大尺寸也跟著縮放） |
| `wall_height` | 90 | 10–300 m，整體塵高（約略）；上衝速度、重力、阻尼、沙粒拋高都依它縮放 |
| `fall_height` / `fall_radius` | 100 / 28 | 沙瀑起點高度、半徑；高度 0 = 不要沙瀑 |
| `fall_arc` | (0, 360) | 沙瀑分布角度（度；0 = +X，往 −Z 為 90） |
| `fall_count` | 12 | 0–64 條帶 |
| `ground_y` | 0 | 塵團接沙面的世界高度（火山口隆起時調到稜高），底部在此上方柔邊淡出 |
| `sun_direction` | (0.48, 0.06, −0.87) | 指向太陽（世界），逆光亮邊與朝陽側變亮 |
| `tint` / `shade` / `glow` | #d9915a 一帶 / 深一階的暖橘 / 亮橘 | 本體、背光下緣、逆光亮邊 |

顏色規則：**完全不讀粒子 RGB**，alpha 也由壽命（`INSTANCE_CUSTOM.y`）在 shader 裡算；unshaded，最暗只到 `shade`（暖橘），不會有暗塊。每個塵團用密度貼圖往太陽方向位移取樣，做出「朝陽側亮邊」的立體感。

## devil.tscn（`SandDevil`，Node3D）

原點＝柱腳（放沙面上，可用 `dunes.height_at`）。一根上寬下窄的開口圓筒（20×24 段，960 三角形）＋底部 14 個塵團。

| export | 預設 | 說明 |
|---|---|---|
| `intensity` | 1.0 | 0–1，0 = 隱藏 |
| `height` / `base_radius` / `top_radius` | 50 / 2.2 / 6.5 m | 改了會重建 |
| `sway` / `spin` | 3 m / 0.4 圈/秒 | 頂端擺幅、條紋旋轉 |
| `seed` | 0 | 每根給不同值，擺動不同步 |
| `sun_direction` / `tint` | 同上 | |

## 主線怎麼擺

```gdscript
var dunes: SandDunes = preload("res://sand/dunes.tscn").instantiate()   # 放原點、不旋轉
dunes.crater_center = Vector2(worm_x, worm_z); dunes.crater_radius = 80; dunes.mound = 15
var dust: SandDust = preload("res://sand/dust.tscn").instantiate()
dust.position = Vector3(worm_x, 0, worm_z); dust.ground_y = 0
dust.fall_height = 口緣高度; dust.fall_radius = 頭半徑; dust.fall_arc = 面向鏡頭那半圈
dust.sun_direction = 指向太陽
var devil: SandDevil = preload("res://sand/devil.tscn").instantiate()
devil.position = Vector3(x, dunes.height_at(x, z), z)
```

- 分層：沙丘＝中近景、塵牆／沙瀑＝中景、塵捲風＝中近景。
- 光：沙丘是一般受光材質，要一盞低角度的側光（preview 用從右前方 (0.9, 0.14, −0.38) 來的暖光，稜線才亮）；塵與塵捲風 unshaded，只看 `sun_direction`，所以主線燈怎麼打都不會變黑。
- 灰模（`gray=1`）：沙丘起伏照樣在；粒子被換成灰色材質後是不轉向的方片 → 只能當「塵蓋到哪裡」的遮罩看。

## 已知問題

- 截圖是靜止畫面，「噴起→下垂→落回」的重量感要看動態（`./tools/shot.sh` 只截最後一格）。
- **填充率**：塵團是大張半透明 quad，近看塵牆時重疊很多層。內顯若超預算，先降 `intensity`（不降數量）或把 `Wall` 的 amount 從 110 往下調（在 `dust.gd`）。
- 沙丘火山口在 −600 m 處網格約 25 m 一格，隆起的剪影有點折線（shader 法線是平滑的，只有輪廓看得出來）。
- `fall_height` 以上沒有沙蟲時，沙瀑和落沙團是懸空的（preview 裡看到的就是這樣），要靠主線對準口緣。
- 塵與沙的地接處用 `ground_y` 做柔邊，不是真的深度柔化；塵團落在高低差大的沙丘上，底緣可能看到一條淡淡的切線。
- 高度貼圖每 2048 m 重複一次；地平線附近被霧蓋掉，近中景看不出來。
- 主線若再開 Environment fog，跟沙丘自帶的 `haze` 會疊兩次，二選一。
