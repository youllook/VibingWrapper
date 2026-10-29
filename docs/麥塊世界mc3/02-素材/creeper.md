# 苦力怕（creeper.js）

檔案：`themes/creeper-end/assets/creeper.js`（階段 2，子代理 A）

## 做了什麼
- `makeCreeper({ seed, pose, headYaw, headPitch })`：原版比例，每像素一顆體素，merged 只出外露面。皮膚 slot `creeper`（P.creeper / Light / Dark 隨機＋±5% 亮度，seed 決定）；腳底加暗邊。臉（兩方眼＋倒 T 嘴，16 像素）獨立 mesh，slot `creeperFace`，略凸 0.0015 避免 z-fight。
- 樞紐：`userData.parts = { head, body, legs:[FL,FR,BL,BR] }`。head 樞紐在脖子（y=18/16，rotation.order 'YXZ'）；legs 樞紐在腳頂（y=6/16），FL/FR 在 +z 前、BL/BR 在 -z 後（x>0 為 L）。
- pose：`walk` 站直；`lookBack` 預設 headYaw=45、headPitch=-22（度；yaw 正＝臉轉向 +x，pitch 負＝仰起），可傳參覆寫。
- 另匯出 `makeRow({ n, spacing, seed })`。items：`hero`（lookBack, seed 3）、`walker`（seed 5）、`row`（6 隻，間距 3）。

## 三角形數
每隻 2624 tris（主角同，預算 3k／6k 內）；row 15744；build 約 13 ms／隻。

## 截圖
`02-素材/creeper-hero-front.png`（yaw0 pitch10）、`creeper-hero-top.png`（yaw-35 pitch35）、`creeper-hero-back.png`、`creeper-walker-front.png`、`creeper-walker-3q.png`、`creeper-row-3q.png`。

## 和目標圖還差什麼
- 固有色平光，無光影、貼圖、輪廓光（階段 4、5）。
- 目標圖主角皮膚更亮、淺綠斑塊更多、有黃綠邊緣光；現在偏暗，可在階段 4 調。
- 主角回頭角度只是估計，要等場景擺好、對機位後調 headYaw/headPitch；身體朝向由場景旋轉 Group 決定。
- 腳底暗邊為簡化（隨機 60% 暗像素），非原版貼圖。
