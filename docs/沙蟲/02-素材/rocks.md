# A 岩石 `rocks/` — 交件（2026-10-30，同日改版：石拱與左下岩階換成 Tripo 重生成的新模型）

座標：公尺、+Y 朝上、沙面 y = 0、鏡頭那側是 +Z。
預覽：`SCENE=res://rocks/preview.tscn ./tools/shot.sh <out.png> [gray=1] [view=all|arch|arch34|inside|ledge]`

## 成品檔

| 檔 | 內容 | 尺寸（公尺） | 原點 | 三角形 |
|---|---|---|---|---|
| `rocks/arch.tscn`（+ `arch.gd`、`arch.glb`） | 石拱（Tripo `sw2_arch.glb`，參考 `rock_refs/arch_full.png`） | 94.7 寬(X −50.7…44.1) × 60 高 × 42.2 深(Z) | 拱口中線的地面中心 | 38,460 |
| `rocks/ledge.tscn`（+ `ledge.gd`、`ledge_left.glb`、`ledge_extras.glb`、`ledge_rock.tres`） | 前景岩階：Main（Tripo `sw2_ledge_left.glb`）＋選配 Rubble／Block | Main 28 寬 × 28 深 × 18.1 高 | 節點本身＝鏡頭腳下；Main 自己的原點＝底面中心 | Main 39,500；Rubble 8,832；Block 2,304 |
| `rocks/spires/spire_0..5.gltf`（共用 `spires_basecolor.jpg`）＋ `rocks/spires.gd`（`class_name Spires`） | 六根岩柱 | 見下表 | 底面中心，底部 y = 0 | 4.6k–8.8k |
| `rocks/preview.tscn`（+ `preview.gd`） | 預覽場景 | — | — | — |
| `rocks/tools/build_tripo.py`、`build_models.py`、`build_ledge.py`、`inspect.py` | Blender 重建腳本 | — | — | — |

重建（Blender 5.2，`-b -P`）：
- 石拱＋岩階：`build_tripo.py -- <sandworm2 絕對路徑>` → `arch.glb`、`ledge_left.glb`
- 岩柱：`build_models.py -- <sandworm2 絕對路徑> <2048 岩柱貼圖.jpg>`（舊 stone_arch 石拱的部分預設不輸出，加 `--old-arch` 才會寫出 `arch_old.glb`）
- 選配碎石／岩塊：`build_ledge.py -- <sandworm2 絕對路徑> [seed]` → `ledge_extras.glb`

重建後跑 `./tools/import.sh`。

### 石拱 `arch.tscn`
- 跟參考圖一樣：頂部的岩樑左上最厚、左腳粗、右腳細，拱口又寬又橫，底下有一塊相連的底座岩板。**參考圖的正面朝 +Z（鏡頭那側）**。腳本確認過：上半部的重心在 −X，也就是從 +Z 看過去在左邊。
- 等比縮放到高 60 m（×96.7），模型本身的比例沒有動。再沿 X 平移 −3.3 m，讓拱口中線對到 x = 0。
- 量測：
  - 拱口內寬：離地 4 m 約 33 m，8 m 約 53 m，**最寬 67.2 m 在離地 16–20 m**，28 m 約 61 m，32 m 約 47 m。
  - 拱口中央的洞頂離地 42.8 m。
  - 底座岩板頂面離地 2–3.5 m（中段），往兩腳升到 5–7 m。
- root 的 export（@tool）：`opening`（預設 67.2＝原生最寬，縮放 X）、`height`（預設 60，縮放 Y）、`thickness`（Z 方向倍數，預設 1）。
- 材質：顏色貼圖＋法線貼圖（4096，匯入時拆成 `arch_sw2_arch_*`），沒有 rm 貼圖，roughness 0.95、metallic 0，不透明（glTF 裡沒有 alphaMode＝OPAQUE）。法線貼圖看起來正常，所以保留。

### 前景岩階 `ledge.tscn`
- **Main**：Tripo 模型，一層層水平岩板，**往左（−X）疊高**，正面朝 +Z。等比縮放到寬 28 m（×28.6），高 18.1 m。材質處理跟石拱一樣（顏色＋法線，不透明）。
- **Rubble／Block**（選配，`extras` 開關，預設開）：舊的程式碎石帶（46 × 10 m）與三層方岩塊（~10 × 8 × 5.9 m），用 `ledge_rock.tres`。這個材質把石拱貼圖做 triplanar，再乘上頂點色。
- export（@tool）：`main_pos/yaw/scale`、`extras`、`extras_material`、`rubble_pos/yaw/scale`、`block_pos/yaw/scale`。
  - 預設位置照「鏡頭在節點原點上方 8 m、往 −Z 看」排：Main (−22,0,−26)、Rubble (0,0,−20)、Block (17,0,−21)。階段 3 再對位。
- 舊的程式疊板階梯（Steps）已經不用了。

### 岩柱 `Spires`
`Spires.make(i, height := 0.0, yaw := 0.0) -> Node3D`：i 取 0–5，height > 0 時等比縮到那個高度。也可以直接 instance `res://rocks/spires/spire_i.gltf`。常數 `Spires.HEIGHT[i]`、`Spires.HALF[i]`（底面半寬 x, z）。

| # | 原生高 | 底面半寬 x × z | 三角形 | 樣子 |
|---|---|---|---|---|
| 0 | 39.7 | 15.9 × 20.1 | 4,636 | 疊層蘑菇狀岩堆 |
| 1 | 56.7 | 20.8 × 22.7 | 6,050 | 雙尖柱 |
| 2 | 34.1 | 16.0 × 19.1 | 6,150 | 矮的多尖岩群 |
| 3 | 70.0 | 17.9 × 19.2 | 5,342 | 最高的單尖錐 |
| 4 | 45.6 | 18.6 × 20.1 | 8,750 | 疊層岩塔 |
| 5 | 49.0 | 18.1 × 18.3 | 7,994 | 雙柱並立 |

底面比柱身寬很多，是 Tripo 生成時連著的岩基，散布時要留間距。

## 截圖（`docs/沙蟲/02-素材/`）
- `rocks-arch.png`／`rocks-arch-gray.png`：石拱正面（跟參考圖同一面）
- `rocks-arch34.png`：石拱 3/4
- `rocks-all.png`／`rocks-all-gray.png`：全部擺在一起，後排六根岩柱
- `rocks-inside.png`／`rocks-inside-gray.png`：從拱前 70 m、高 8 m 往 −Z 看
- `rocks-ledge.png`／`rocks-ledge-gray.png`：岩階近看（石拱隱藏）

## 已知問題／給主線
- 底座岩板頂面離地 2–3.5 m。鏡頭若站在拱口裡或拱後很近，岩板會擋住下半部；可以把整座拱往下沉幾公尺（position.y 給負值），讓沙面蓋住岩板。
- 石拱和 Main 岩階都是 4K 顏色＋4K 法線（PNG），`rocks/` 目前約 86 MB。網頁匯出前建議縮成 2048，法線改 JPG 或靠 VRAM 壓縮。
- 選配的 Rubble／Block 和 Tripo 岩階的貼圖風格不同（triplanar、沒有法線），放在一起近看會看出差別；不需要就把 `extras` 關掉。
- 預覽場景的地面、天色、暖色側光只是給預覽用，不是交件內容。
