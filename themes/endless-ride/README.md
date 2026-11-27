# 無限騎行（endless-ride）

高原草坡上，一台小機車沿著窄路一直往前騎。追焦鏡頭在車後；近處的草與路樁飛掠、遠山與瞭望塔慢慢移動、
頭上是 raymarch 的體積雲、身邊飄過花粉與種子。感覺參考 Meng To 的 Cloud Pass 示範，場景、造型全部原創、
沒有外部模型或圖片（騎士與機車是 three.js 基本形狀拼的，之後可換 GLB）。

三招食譜在 `docs/素材庫/mengto_ride_skills/`（MIT）。對應實作：

| 招式 | 在哪裡 | 做法 |
|---|---|---|
| endless-riding-parallax | `scene.js` `tick()` 第 1 段、`common.js`、`terrain.js` | 一個 JS double 的 `sim.distance` 驅動路面、輪子、草、石頭、路樁、粒子；地形所有項都是 960 公尺的整數倍頻，GPU 只拿 `distance mod 960`；草／石／樁是有限的一池 instance，`z = mod(seedZ + 里程, L) − (L − 尾巴)`，跑到鏡頭後面才繞回最遠端；遠景（山稜＋塔）掛同一個 `land` transform，走 140 秒閉環 `x = k·1.2(1−cos a)、z = k·12 sin a`（k＝6，場景以公尺計所以放大），另外扣掉路的橫移與起伏當真實視差 |
| ride-particles-and-clouds | `particles.js`、`sky.js` `makeCloudPass()` | 920 顆（小螢幕 425）instanced quad，`z = mod(seedZ + travel + flutter, 34) − 24`，鏡頭深度兩端淡出、貼地形高度、用上一格與這一格各自的矩陣拉殘影；雲是 3D 密度逐步 `T *= exp(−密度×步長)`，半解析度、每 2 格算一次，在合成那關放大；雲、粒子、草、地形共用同一組太陽方向與顏色 uniform（`common.js` 的 `U`）；粒子 depthTest 開、depthWrite 關 |
| scroll-fisheye-dolly-zoom | `lens.js` | `spread = 1 + 0.72w`：主體→鏡頭向量 ÷ spread、`tan(fov/2)` × spread；`curve = 0.30w²`，視角再 ×(1+curve) 留外擴；調投影偏移把騎士釘在原本的螢幕位置；最後一關取樣 `center + delta·(1+curve·r²)/(1+curve)`。**不接滾輪**：`w` 由 Claude 狀態給、以秒級緩動 |

`node check.mjs` 跑這三招的數值自檢（用本主題實際的常數）。

## 狀態對照

| Claude | 狀態 | 畫面 |
|---|---|---|
| 不在 | `absent` | 停車、左腳撐地、引擎怠速微震；黃昏色、車燈亮；w＝0 |
| 待命 | `clear` | 巡航 13 m/s；積雲、藍天；w＝0.15 |
| 思考 | `overcast` | 10 m/s；雲量上來、霧變厚、飽和度降；w＝0.3 |
| 執行 | `storm` | 24 m/s；強風、粒子全開＋長殘影、暗雲、偶爾雲內閃電；w＝0.6（dolly zoom 的時刻） |
| 收尾 | `clearing` | 減速到 8 m/s；太陽破雲、路面還有點反光；w＝0.2 |
| 等你 | `waiting` | 慢慢停下，回頭越過肩膀看鏡頭、尾燈呼吸；w＝0 |

數值都在 `states.js` 的 `PARAMS`，趨近速率在 `RATE`。

## 網址參數與測試介面

- `?state=<名稱>` 固定狀態；數字鍵 0–5 切換（不在／待命／思考／執行／收尾／等你）
- `?hour=0–24`（或 `?day=1`、`?night=1`）：時段。**預設固定在傍晚前的斜陽（16:30），不跟電腦時鐘**
- `?full=1` 場景全解析度（預設 0.75）；`?cloudEvery=1` 雲每格都算；`?w=0–1` 固定鏡頭寬度；`?still=1` 關閃電
- `window.theme`：`applyState(name)`、`setSessions([...])`、`STATES`、`PARAMS`、`CONFIG`、`frameMs`、
  `step(dt, n, snap)`（手動推進，隱藏視窗截圖用）、`bench(n)`（每格毫秒，含 GPU）、`measure()`（胸口到座墊的像素距離）、`strike()`
- `window.wpPause(on)`、分頁隱藏時停；30 fps 上限

## 效能（RTX 2060 SUPER，1904×1041 視窗）

`theme.bench(150)`：預設設定約 2.8 ms／格（雲每格都算 3.8 ms、再加全解析度 4.7 ms）。
估算約 52 萬個三角形（地面 10 萬、草 14 萬片葉 × 3）。

## 已知的弱點

- 騎士與機車是積木人，近看很陽春；回頭、撐腳的姿勢只是兩節骨的插值。最值得換成真模型的就是它。
- 草是寬葉片，鏡頭旁邊那幾排看得出三角形；80 公尺外沒有草葉，只靠地面著色。
- 山稜是 CPU 高度場，稜線偏尖、沒有侵蝕感；塔是基本形狀堆的剪影。
- 雲是半解析度 26 步，雲緣偏糊，沒有真正的「體積光柱」；低霧只有 12 步。
- 遠景閉環放大 6 倍（食譜原值在公尺尺度下看不出來），仍然很慢：要看視差主要靠路的彎曲與起伏。
- 路樁、石頭的排列每 420／440 公尺重複一次；草每 36／120 公尺重複一次（看不太出來）。
- 夜晚色盤只是粗調（星星會透過雲）。
