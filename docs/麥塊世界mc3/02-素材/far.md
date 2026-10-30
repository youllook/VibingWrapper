# far（遠景）素材說明

檔案：`themes/creeper-end/assets/far.js`。截圖：`far-island.png`、`far-field-p35.png`、`far-field-p15.png`、`far-void.png`。

## 做了什麼
- `makeFarIsland({ seed, radius, scale })`：不規則台地（1–2 層）＋倒錐底（深約 1.3–2 倍半徑，越深越暗）＋0–2 根黑曜石柱（柱頂一格發光）＋紫頌剪影（3–6 格主幹、1 個側枝、端點發光）。頂面中心 y=0。預設 radius 15、scale 2。
- `makeFarField({ seed, count, area })`：預設 50 座、600×600，半徑 4–25，垂直 ±40。離中心越遠越小，距中心 <30% 用 scale 2，其餘 scale 4。兩檔各合併成 4 個 mesh。
- `makeVoid({ radius })`：反向球（預設 2000），ShaderMaterial 垂直漸層：下 void → 地平 haze → 上 voidTop。無霧、無發光。
- 槽：endstone / obsidian / chorusStem / chorusFlower（柱頂光點也放此槽）/ void。

## 數字
| 項目 | 三角形 | draw call | build |
|---|---|---|---|
| farIsland（R15） | 2.7k | 4 | ~35 ms |
| farField（50 座） | 44.7k | 8 | ~96 ms |
| void | 960 | 1 | 2 ms |
| 遠景合計 | 約 46k（預算 60k） | 9 | |

## 與目標圖還差什麼
- 島偏小偏稀：目標圖遠景島大而密、幾乎成連續台地，這裡是散點；階段 3 可調 count/半徑，或把 area 縮小。
- 島緣沒有目標圖那種階梯狀層疊斷崖，倒錐底較光滑。
- 柱子只有 1 格寬（scale 2 → 2 方塊），目標圖的大柱較粗；紫頌分枝簡化。
- 發光花是整格（2–4 方塊）實心色塊，階段 5 加發光與霧後才會像剪影＋光點。
- 虛空漸層只有三色，沒有目標圖的雲霧質感（階段 4/5）。
- voidBackdrop 在檢視器中半徑縮成 300，否則超出相機遠平面。
