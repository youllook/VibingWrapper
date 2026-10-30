# 02 素材 — 道具（子代理 B）

檔案：`themes/powerlifting-gym/assets/props.js`　檢視：`assets.html?m=props&grid=1`

全部固有色＋平光，顏色只用 palette 槽；亂數全走 `kit.rng(seed)`。原點＝底面中心（毛巾例外，見下）。

## 交付與三角形數（2026-10-30 實測）

| item | 產生器 | 尺寸 (m) | 三角形 | 預算 | build |
|---|---|---|---|---|---|
| bench | `makeBench` | 1.20×0.44×0.45 | 1886 | 3k | ~16 ms |
| chalkBucket | `makeChalkBucket` | 0.44×0.28×0.45 | 894 | 2k | ~6 ms |
| towel | `makeTowel` | 0.38×0.34×0.25 | 1144 | 2k | ~3 ms |
| bottle | `makeBottle` | 0.08×0.26×0.08 | 384 | 2k | ~1 ms |
| crate | `makeCrate` | 0.52×0.47×0.41 | 432 | 2k | ~2 ms |
| judgeLights | `makeJudgeLights` | 0.62×0.81×0.28 | 780 | 2k | ~3 ms |

（長凳高 0.44 是因為頂面補丁比墊面高 4 mm；墊面本身 0.43。）

## 各項做法與參數

### bench — `makeBench({ seed=7, length=1.2, width=0.30, height=0.43, tapes=18 })`
- 長軸沿 X。墊子＝圓角矩形截面（r 22 mm、厚 75 mm）沿 X 擠出，槽 `benchBlack`。
- 布膠帶：每圈是自訂 mesh，沿截面周長繞一圈、離墊面 0.8–3.5 mm 分層（不打架），帶外表面＋兩側邊，所以看得出凸起。
  每圈隨機寬 35–85 mm、隨 z／y 歪斜（三成歪很大）、邊緣微抖；三成只貼上半圈（沒繞到底）。
  顏色比例：黑 25%／銀 30%／白 20%／紅 25%（槽 `benchBlack`、`tapeSilver`、`benchWhite`、`benchRed`）。頂面另貼 5 片補丁（紅、銀、白）。
- 鋼架（槽 `rack`）：墊下底板、中樑、兩支 T 字腳（立柱微外八＋落地橫腳 0.44 長）、低橫撐；腳底 `rubber` 墊、立柱 `rackWorn` 磨痕。
- mesh 名：`pad`、`tape_0..n`、`patch_0..4`（都在 `tape` 群組下）。

### chalkBucket — `makeChalkBucket({ seed=3, fill=0.62 })`
- 錐形舊鐵桶（底 r0.165、口 r0.215、高 0.27），Lathe 有壁厚，依角度徑向擾動做凹痕；捲邊 torus。槽 `bucket`。
- 鎂粉：極座標網格粉面，中間隆起、`(0.05, 0.03)` 有個手挖的凹，加 5 顆粉塊；桶緣 4 段沾白弧、桶外 7 塊往下流的白痕。槽 `chalk`。
- **抹粉點**：`group.userData.chalkTop`（群組區域座標 Vector3）；子物件 `'chalkTop'` 空物件跟著群組走；
  世界座標用 `chalkTopWorld(bucket)`（會先更新矩陣）。

### towel — `makeTowel({ seed=5, width=0.34, top=0.18, drop=0.32, back=0 })`
- **原點＝它掛住的那條邊**（邊沿 X、前面垂向 +Z）：放到木箱頂邊或桶緣上即可。`top`＝平躺長度、`drop`＝前垂長度、`back`＝後垂（掛桶緣時給 >0）。
- CatmullRom 截面路徑取樣成 26×10 網格，三道隨機皺褶波（越往下越亂、下擺微張），兩層（厚 4 mm）＋兩側收邊，兩面都看得到。槽 `towel`。
- items 示範把它抬高 0.32 m 讓下擺落地。

### bottle — `makeBottle({ height=0.26, radius=0.037 })`
- 原點底部中心。Lathe 瓶身（`bottle`）、黑蓋＋吸嘴＋提把（`rack`）、中段止滑帶（`steelDark`）。mesh 名 `bottle_body`、`bottle_cap`…。

### crate — `makeCrate({ seed=11, w=0.5, h=0.45, d=0.4 })`
- 四面各 3 條板條（有縫、微歪）、4 片蓋板、4 根角柱（`crate`），上下各一組 L 形包角鐵（`steelDark`）。

### judgeLights — `makeJudgeLights({ lampR=0.06, height=0.72, lights=[null,null,null] })`
- 三個 0.17 m 小燈箱並排（間距 0.185）坐在橫桿上，矮架＝底座＋兩支立柱，燈心離地 0.72。燈面朝 +Z、直徑 0.12。
- 每顆：燈箱（`lampBox`）、上半圈遮光罩（內外兩面）、燈圈（`steelDark`）、**燈面獨立 mesh `lamp_0..2`**（左到右）。
- `setLights(group, ['white'|'red'|null ×3])`：燈面換成 `lampWhite`／`lampRed`／`lampOff` 槽（同步 `userData.slot`），狀態存在 `group.userData.lights`。items 示範白白紅。

## 可動 API 摘要
- `setLights(judgeLights, states)` — 切燈。
- `chalkTopWorld(bucket)`／`bucket.userData.chalkTop`／子物件 `chalkTop` — 抹粉動畫手的目標點。
- `makeBottle()` 整個群組就是可拿起的物件（原點底部）。
- 毛巾、膠帶都可換 `seed` 出不同樣子。

## 截圖
- `props-all.png` 全部一列
- `props-bench-gym1.png`（yaw -40 pitch 5）、`props-bench-top.png`（俯看膠帶）
- `props-judge-gym1.png`（yaw -40 pitch 5）、`props-judge-side.png`（側面）
- `props-bucket.png`、`props-towel.png`、`props-crate.png`、`props-bottle.png`

## 和目標圖還差什麼
- 長凳：目標圖膠帶更破爛（撕開的毛邊、翹角、髒污）、墊子有點塌，這些要靠階段 4 貼圖／法線；目前帶子邊緣是直的。目標圖長凳在畫面上幾乎是「頭朝鏡頭」，組場景時要轉 Y。
- 粉桶：目標圖是更寬淺的盆，桶外滿是白粉噴點；目前只有幾塊白痕，斑駁感留給階段 4 的貼圖。
- 毛巾：沒有布料紋理（毛圈），皺褶偏規則；搭在箱角的「轉角」垂法（兩面都垂）沒做，只能搭直邊。
- 木箱：目標圖箱子像鐵皮包的舊箱、生鏽斑駁，目前只是乾淨的木板條。
- 裁判燈：目標圖燈面是發光、有外圈光暈，要等階段 5 發光；目標圖的支架被遮住看不清，矮架是推測。白燈在平光下偏米色（`lampWhite` 本來就靠發光撐）。
