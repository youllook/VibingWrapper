# 環形太空站（ring-station）

坐在環形太空站的軌道列車上，從車窗往前方偏右看：城市沿圓筒內壁往上爬、越過玻璃拱窗、在頭頂倒掛而過；近景護欄桁架高速掠過。
無限系列第 4 支（目標圖：`docs/infinite-series/x02.png`；製作文件：`docs/ring-station/`）。

**目前做完步驟 5（燈光、霧、狀態）**：大氣與窗燈在 `atmos.js`、材質在 `materials.js`、狀態表 `STATES` 在 `main.js`。剩步驟 6（裝桌面實跑、內顯效能、動態模糊）。`?gray=1` 可切回灰模。

## 幾何
- 棲地＝半徑 2 km 的圓筒內壁，轉軸沿世界 +X、穿過 (0, 2000, 0)；鏡頭腳下地面 y＝0。座標換算在 `ring.js`（`hab`、`standMatrix`）。
- O'Neill 式三陸三窗：陸地帶以 0°／120°／240° 為中心各 ±50°，窗帶每段 20°（縱肋每 120 m）。列車每 76 秒過一次玻璃橋（約 13 秒），橋下是星空。環向拱肋每 650 m 一圈。
- **無限**：鏡頭與車窗固定，整個棲地繞 X 軸轉（ω＝55 m/s ÷ 1978 m），角度 mod 2π，沒有接縫。
- 太陽：氛圍優先，擺在目標圖的位置（世界固定、不隨棲地轉），不在軸上。

## 模型（`models/`，Tripo H3.5 生成 → 重拓撲 1 萬面 → glbprep）
| 檔 | 實際大小 | 近（三角） | 遠 `_far`（三角） |
|---|---|---|---|
| dome_hall | 直徑 110 m | 10,090 | 700 |
| greenhouse | 長 120 m | 9,917 | 599 |
| round_tower | 高 48 m | 11,576 | 3,710 |
| spire_tower | 高 130 m | 9,261 | 509 |
| terrace_block | 高 26 m | 9,633 | 1,591 |
| townhouses | 寬 32 m | 9,625 | 2,372 |
| tree | 高 9 m | 7,492 | 1,667 |
| worker | 1.8 m | 9,931 | — |
| service_panel | 1.3 m | 10,040 | — |

近模貼圖 1024、遠模 256（WebP）。輸入圖在 `docs/ring-station/_codex/assets-*/`，Tripo 原始匯出在 `E:\tmp\ring-station-tripo\raw\`。
LOD：每款兩個 InstancedMesh，每 12 格依棲地轉角重新分配（離鏡頭 650 m 內用近模）。

## 網址參數
| 參數 | 用途 |
|---|---|
| `freeze=1`、`t=秒` | 停在某個時間（擺景驗收用 t=0） |
| `ref=0.5` | 疊目標圖對照 |
| `ids=1` | 分層遮罩（紅＝鏡頭層、綠＝近景、藍＝城市、黑＝遠景天空） |
| `yaw pitch roll fov cx cy` | 鏡頭微調（度／公尺） |
| `wx ys yt px pz` | 3D 車窗：牆離鏡頭、窗台高、窗頂高（相對眼高）、窗柱 x／z |
| `sx sy sz` | 前排座椅背位置 |
| `land` | 陸地帶半寬（度，預設 50） |
| `spin wnear wfar` | 星空隨自轉掃過的速度 rad/s、窗帶由星空漸變成霧的距離 |
| `state` | 固定狀態：idle／thinking／working／finishing／waiting／absent |
| `day` `night` | 固定白天／夜間 |
| `fog exp pr` | 霧密度、曝光、渲染解析度倍率（預設 0.6） |
| `lodnear lodmid lodtree` | LOD 距離（500／1500／150 m） |
| `speed` | 待命速度 m/s（各狀態速度在 `STATES`） |
| `wth wyaw pyaw` | 維修工位置與朝向 |

## 擺景驗收工具（`check.js`，開發用）
`index.html?freeze=1&ids=1` 後在主控台：`score()` 逐層 IoU、`compare()` 對照圖、`optimize({參數:[起始, 步長]})` 座標下降（每組參數開一個 iframe 打分）。標準答案是 Codex 拆的 `docs/ring-station/_codex/layers/`。
