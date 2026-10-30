# 健力健身房（powerlifting-gym）

地下鐵皮健身房的傍晚，選手在深蹲架下一組接一組地蹲。Claude 做得越久，槓上的片就加得越多；工作做完，三盞裁判燈一起亮白燈。
做給一位正在備賽健力的朋友。製作過程（00 分析 → 06 交付）在 `docs/健力健身房/`。

## 狀態

| state.json | 選手 | 燈光、特效 |
|---|---|---|
| sessions 全空 | 走到畫面外，槓掛在架上 | 室內燈關到 38%；霓虹偶爾閃；吊扇慢轉 |
| `clear` 待命 | 走回長凳坐下喘氣；偶爾站起來抹粉，拍手噴白粉 | 正常 |
| `overcast` 思考 | 繞到架子後面、鑽到槓下握槓 | 光束裡粉塵變多 |
| `storm` 執行 | 起槓退兩步，一下接一下深蹲；每 3 下卡一次黏滯點發抖 | 霓虹越來越亮；每 60 秒加一對片（4 → 6）；槓會彎 |
| `waiting` 等你 | 扛著槓站好，等主審喊「Rack」 | 裁判燈暗著、約每 4 秒微微亮一下；久等霓虹閃 |
| `clearing` 收尾 | 掛回槓，走回長凳 | 三盞白燈亮 3.5 秒；白板多一筆正字；粉塵從槓上震下來 |

日夜：白天是高窗斜射的夕陽光束；晚上窗外深藍、光束消失，頂燈從上方打亮選手，霓虹更顯眼。`?day=1`／`?night=1` 固定。

## 參數（`window.theme.PARAMS`）

| 參數 | 預設 | 說明 |
|---|---|---|
| `meetDate` | `'2027-02-15'` | 比賽日 `'YYYY-MM-DD'`，白板顯示 `MEET D-xx`；`null` 是 `MEET D-??`（2027 年二月中，確切日期未定） |
| `lines` | `['SQ 120', 'BP 100', 'DL 110', 'TOT 330']` | 白板右欄藍字（最多 5 行，每行約 7 字內，太長會超出白板） |
| `basePlates`／`maxPlates`／`plateEvery` | 4／6／60 | 每邊起始片數、上限、執行中每幾秒加一對 |

今日正字存在瀏覽器（`localStorage`，隔天換 key 自動歸零）。

## 檔案

| 檔案 | 內容 |
|---|---|
| `index.html` | 場景、燈光、狀態機（8 段動作串成各狀態） |
| `models/powerlifter.glb` | 選手（Tripo 生成＋Blender 綁骨，59 骨、8 段動作、2K 貼圖） |
| `assets/` | 鐵器（槓、片、架、台）、道具、背景件（吊扇、白板字）、`stage.js`（背景打光、粉塵） |
| `lib/` | 材質槽（`palette.js`、`surface.js` PBR＋三向投影做舊）、`kit.js` |
| `textures/` | `backdrop.webp`（Codex 背景，已修掉舊吊扇）、`mask-glow.png`（RGB：霓虹／燈泡／窗）、`mask-beam.png`（光束）、`micro_grime.jpg`（ambientCG CC0） |
| `assets.html`、`models.html`、`textures/dev-layers-bg.png` | 開發用檢視頁與分層比對底圖 |

網址參數 `?layers=1`、`?clip=Squat&t=1.8`、`?tune={json}` 是靜態驗收模式（選手停在單一姿勢、1:1 解析度），給 `docs/健力健身房/tools/` 的截圖與比對工具用。

## 效能

30 fps 上限、半解析度（`?scale=` 可改）。1080p 約 12 ms／格（2026-10-30，`PERF=1` 量測，含 CPU）。
