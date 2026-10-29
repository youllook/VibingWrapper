# Minecraft × 苦力怕桌布概念

三張圖皆由內建 image_gen 逐張依序生成，原檔複製至目前資料夾，未使用程式繪圖或後製。以固定鏡頭、16:9 橫幅構圖提示生成；工具實際輸出 mc1／mc3 為 1672×941，mc2 為 1672×940，接近但非精確 16:9，保留原檔未裁切。右上保留低對比區供未來 HUD 使用；概念圖本身不含 UI。以下動態是後續實作設計，靜態圖尚未包含狀態切換；霧、煙與雲層建議另以程式疊加柔和密度變化。

## 1. 雨夜窗外的訪客 — mc1.png

鏡頭：從深夜木屋內低角度望向窗外，一隻苦力怕貼近玻璃，暖光與湖畔冷月光形成安靜的危機感。分層：前景為失焦燈籠、桌沿與木窗框；中景為窗外苦力怕及雨滴玻璃；遠景為方塊森林、湖面與月下雲層。會動的元素：雨痕緩慢滑落、燈光輕閃、湖面反光、薄霧與苦力怕微小歪頭。AI 五態：待命＝苦力怕安靜站立，綠色反光緩慢呼吸；思考＝輕微歪頭，窗上綠光小幅往返；執行＝身體略向窗前傾，雨滴與反光流動稍快；收尾＝恢復直立，暖光短暫柔亮後回穩；等你＝看向鏡頭，身體間歇柔和閃白，維持爆炸前的懸念但不真正爆炸。

實際圖像 prompt：

```text
Use case: stylized-concept. Generate exactly ONE 16:9 horizontal wallpaper concept image, ideally 2048x1152. Title for context only: Visitor at the Rainy Window. A cinematic Minecraft voxel world seen from a fixed low camera INSIDE a small oak-block cabin at midnight, looking diagonally across a broad window. Foreground lower left: softly out-of-focus blocky wooden table edge and one tiny amber lantern; dark timber framing defines depth without clutter. Midground center-left: a clearly recognizable green Minecraft Creeper standing just outside the window, visible from square head to all four short blocky feet on an exterior stone sill/porch; tall rectangular torso, mottled green pixel-block texture, black square eyes and unmistakable downturned Creeper mouth, no arms. Its face is close to the glass, silent and expectant, with a faint eerie green reflection. Background: stepped block terrain, cubic spruce trees and a dark rainy lake in cool midnight blue. Cinematic warm interior versus cold cyan moonlight, soft volumetric atmosphere, subtle rain on glass and soft distant mist; suspense that something is about to happen, restrained rather than action. All architecture, trees, terrain and water belong to a cube-based voxel world. Clear foreground/midground/background separation. Reserve the upper-right 25 percent as quiet low-contrast blue darkness beyond the window with very little detail for a future HUD, but DO NOT draw a HUD. Beautiful polished atmospheric 3D concept art, not a flat gameplay screenshot. No people, text, letters, logo, watermark, UI, inventory, health bar, collage or panels. Only one finished wide image.
```

## 2. 深礦裂隙巨影 — mc2.png

鏡頭：貼近廢棄礦道鐵軌向上仰望，一隻巨型苦力怕從洞穴陰影中顯現，木橋與礦車襯托其尺度。分層：前景為鐵軌、礦車與碎石；中景為木棧橋及巨型苦力怕；遠景為深板岩洞壁、青色礦光、熔岩細流與暗霧。會動的元素：礦石光脈、漂浮微塵、熔岩亮度、低密度洞霧與苦力怕重心微移。AI 五態：待命＝巨影靜立、礦光低頻呼吸；思考＝青光沿附近礦脈逐段亮起，苦力怕微微低頭；執行＝四腳交替小幅受力，綠光由腳部向頭部推進，微塵稍增；收尾＝光脈回落、重心穩定，熔岩反光柔亮一次；等你＝巨型苦力怕直視鏡頭，輪廓緩慢閃白，保持即將跨步的張力。

實際圖像 prompt：

```text
Use case: stylized-concept. Generate exactly ONE 16:9 horizontal cinematic Minecraft voxel wallpaper, ideally 2048x1152. Title for context only: The Shape Beneath the Mine. Fixed dramatic very low camera on an abandoned mineshaft rail, looking upward into an immense underground cavern. Foreground bottom and left: chunky stone blocks, close rails converging toward a broken timber trestle, a small empty mining cart silhouetted at lower left. Midground left-of-center: a GIANT unmistakable green Minecraft Creeper, a living creature not a statue, emerging from a dark vertical cavern opening behind the bridge. Show its full characteristic silhouette: huge cubic green head, black square eyes and downturned black Creeper mouth, long rectangular mottled-green torso with no arms, four squat cubic feet braced on stepped rock shelves. Its green skin catches cyan ore glow, face clearly readable; enormous scale contrasted with tiny rail track. Background: deep stepped deepslate walls and sparse luminous cyan mineral blocks receding into soft teal volumetric haze, a thin amber lava seam far below. Build every solid structure from cubes and angular voxel forms. Strong foreground/midground/background staging, cinematic chiaroscuro, cyan-green and charcoal with restrained amber accent. A suspended moment before the creature takes a step, quiet ominous tension. Keep the upper-right quarter as simple dark cavern space fading into smooth low-contrast mist, clean enough for later HUD placement without drawing any HUD. Mist should read as gentle atmospheric density, not hard painted smoke shapes. Polished atmospheric 3D concept illustration, not a gameplay screenshot. No humans, text, letters, logos, watermark, UI, health bars, inventory, collage or panels. One wide image only.
```

## 3. 末地浮島巡行 — mc3.png

鏡頭：高空斜俯視末地浮島，一隻近景苦力怕回望鏡頭，其餘同伴沿狹長方塊石橋列隊，停在虛空前。分層：前景為左下末地石平台與主角苦力怕；中景為斜向延伸的橋面與苦力怕隊列；遠景為紫色虛空、層疊浮島、紫頌植物與黑曜石柱。會動的元素：紫霧密度、島底柔光、細小漂浮粒子、隊列腳步及近景苦力怕回頭角度；鏡頭與浮島位置固定。AI 五態：待命＝全隊站定，島底光緩慢起伏；思考＝近景主角輕微轉頭，隊列由近至遠依次浮現綠色輪廓光；執行＝同伴在各自站位小幅踏步，光點沿橋向前流動；收尾＝踏步依序停止，最後一道光抵達領隊；等你＝近景主角保持回望並柔和閃白，遠處隊列定格等待。

實際圖像 prompt：

```text
Use case: stylized-concept. Generate exactly ONE 16:9 horizontal wallpaper concept image, ideally 2048x1152. Title for context only: Procession Across the End. An imaginative Minecraft End-dimension voxel world, cinematic fixed HIGH oblique aerial camera looking steeply down across disconnected floating pale end-stone islands over a lavender abyss. Strong diagonal composition from bottom-left toward center distance, with expansive quiet negative space in the upper-right quarter: smooth muted mauve-violet void and very soft atmospheric density, no bright focal objects there. Foreground bottom-left: a large nearest green Minecraft Creeper standing on the edge of a stepped ivory voxel island, seen three-quarter from above with its FRONT FACE clearly visible as it looks back up toward the camera; cubic head, black square eyes, iconic downturned black Creeper mouth, mottled bright green rectangular body, no arms and FOUR short cubic feet. This Creeper is a main focal subject, not a tiny incidental dot. Midground: five smaller clearly recognizable green Creepers spaced in a quiet procession across a narrow zigzag bridge of cubic end-stone blocks connecting floating islands; the leader has stopped before a small gap in the bridge, a feeling of an imminent decision. Background far left and center: distant terraced floating islands, sparse angular purple chorus plants and a few slender obsidian monoliths softened by lilac haze. All terrain and plants built from distinct cubes; pale gold grazing rim light, green characters against desaturated violet and ivory, soft cinematic shadows, subtle glow beneath islands that may defy physics. Clear foreground/midground/background scale separation. Atmospheric spacious surreal suspense, elegant polished voxel 3D concept art rather than a gameplay screenshot. Do not add cabin, mine, rain, dragons or humans. No text, letters, logo, watermark, HUD, UI, health bar, inventory, collage or panels. One wide image only.
```
