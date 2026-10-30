# 02 素材 — A 鐵器（`themes/powerlifting-gym/assets/iron.js`）

2026-10-30。固有色＋平光階段，顏色全走 palette 槽（`iron`／`ironWorn`／`steel`／`steelDark`／`rack`／`rackWorn`／`wood`／`rubber`）。

## 交付項目與三角形數

| item | 尺寸（m） | 三角形 | build | 預算 |
|---|---|---|---|---|
| `plate20` | ø0.45×0.05 | 1,320 | ≤3 ms | — |
| `plate25` | ø0.45×0.06 | 1,320 | ≤3 ms | — |
| `barbell`（空槓） | 2.20 | 1,360 | ≤6 ms | — |
| `barbellLoaded`（每邊 4×25 kg） | 2.20×0.63×0.63 | 11,920 | ≤9 ms | ≤12k ✅ |
| `barbellBent`（bend 0.06） | 2.20×0.66×0.63 | 11,920 | ≤7 ms | ≤12k ✅ |
| `rack` | 1.47×2.30×1.65 | 8,196 | ≤17 ms | ≤10k ✅ |
| `platform` | 2.40×0.04×2.40 | 60 | <1 ms | — |

每邊 8 片時槓鈴 22,480 tris（預算只算 8 片總數；真要滿片可把 `makePlate` 的 `segments` 調低）。

## 做法

- **硬邊車削 `latheX`**：剖面沿 X 軸轉一圈，剖面轉折處是硬邊（法線不平滑）、圓周方向平滑；每段可指定材質槽，所以一條剖面能拆成多個 mesh。
- **槓片**：外圈凸緣（全厚）、兩面內凹、字環凸起 3 mm（一圈環帶，不做真字）、內轂（全厚）、中孔 ø51 mm。磨亮部分（外緣倒角＋外圈圓周＋字環頂面）是獨立 mesh `plateWorn`（槽 `ironWorn`）。幾何依 kg 快取共用。seed 決定繞軸轉角與裝在槓上的微歪（±0.35°）。
- **槓身**：一條剖面車出整根槓（套筒 ø50、擋環 ø80 厚 30 mm、握把 ø28），長段每 6 cm 切一節以便彎曲；滾花區（中央 ±0.08、兩側 0.21–0.60）與擋環用 `steelDark`，其餘 `steel`。
- **彎曲**：`bend`＝內側擋環（±0.655）相對槓中心的下垂量。擋環內是二次曲線，擋環外（套筒＋片）沿切線剛性延伸，所以片會跟著斜。bend 0.06 時套筒末端下垂約 0.14 m（照片裡扛重槓兩端下垂的樣子）。負值＝往上翹。
- **深蹲架**：4 根 75 mm 方管高 2.3、內寬／內深 1.20；上方四根橫樑＋前方引體桿；底座左右兩根沿 Z（前後各伸出當腳）＋後橫樑，前方開口。孔 ø25 間距 50 mm，從 0.2 m 到頂：每根立柱前後兩面、前兩根另加左右兩面，用兩個 InstancedMesh（`holeWear` 磨亮孔緣，大小隨 seed 不一；`holes` 黑孔），共 480 孔（每孔 16 tris）。J 鉤掛在前立柱內側往架內伸，鉤臂往內偏 12 mm 讓開擋環。保護槓是穿過前後立柱的 50 mm 方管，頂面有磨掉漆的條帶、兩端插銷頭。
- **舉重台**：中間三片木板（沿 Z，±1 mm 高低差）＋兩側黑橡膠。

## 產生器 API（會動的部件）

```js
import { makePlate, makeBarbell, setBend, setPlates, makeRack, makePlatform } from './assets/iron.js';

makePlate({ kg = 20, seed = 1, segments = 30 })        // Group，原點＝片中心、軸沿 X；userData.thickness
makeBarbell({ platesPerSide = 0, kinds = [25], bend = 0, seed = 1 })
  // Group 'barbell'，原點＝槓中心：
  //   bar        槓身 Group（bar_steel、bar_steelDark 兩個 mesh）
  //   plates_L / plates_R   片的 Group，原點在擋環外緣（±0.685），內含 plate_L0… 與扣環 clip_L / clip_R
setBend(barbell, meters)   // 只改槓身頂點 y＋移動/傾斜 plates_L/R；100 次約 5 ms，可每格呼叫
setPlates(barbell, n)      // 每邊 0–8 片，不重建槓；片快取重用（拿掉的會從場景移除，不算三角形）
makeRack({ hookHeight = 1.35, safetyHeight = 0.75, seed = 1 })
  // Group 'rack'，原點＝底面中心、正面 +Z：
  //   hook_L / hook_R      position.y＝槓放在鉤上時的槓中心高度（改 y 就調高度）
  //   safety_L / safety_R  position.y＝保護槓頂面高度
  //   userData.barZ        槓放在鉤上時槓中心的 z（0.54）
makePlatform({ seed = 1 }) // Group 'platform'，原點＝底面中心，頂面 y=0.04
```

組場景：槓放上架 → `barbell.position.set(0, rackY + hookHeight, rack.userData.barZ)`（見 `iron-組合-*.png`，架放在台上時 rackY＝0.04）。

## 截圖

- `iron-all.png` 全部一列（grid）
- `iron-plate25.png`、`iron-barbellLoaded.png`、`iron-platform.png`
- `iron-barbellBent-front.png` 正面看彎度
- `iron-rack-gym1角度.png`（yaw −40、pitch 5）
- `iron-組合-gym1角度.png`、`iron-組合-正面俯.png`：架＋台＋5 片槓（臨時組合，只為驗收，不是 item）

## 和目標圖還差什麼

- **質感全在階段 4**：目標圖的片是做舊黑鐵、邊緣與字磨亮，現在只是兩個平色槽；方管的掉漆、鏽斑也是。
- **孔的槽**：palette 沒有「孔」專用色，暫用 `rubber`（最暗的槽之一），孔緣用 `rackWorn`。建議階段 4 加 `rackHole` 槽。
- **片的輪廓**：目標圖的舊片外圈較圓潤、有一圈厚唇，現在是直角＋4 mm 倒角；近看圓周 30 段稍見稜角。
- **8 片放不下**：套筒 0.415 m，8×25 kg（0.48 m）或 8×20 kg（0.40＋扣環）都會超出，`setPlates` 會照放並 console.warn。目標圖一邊約 5–6 片，實用上 ≤6×25 或 ≤7×20。
- **彎曲沒更新法線**：彎曲量小時看不出；彎很大時高光會略偏。
- 架上沒有編號貼紙、螺栓、底板；目標圖立柱頂端有連接板，可之後補。
