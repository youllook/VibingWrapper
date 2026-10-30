# 星圖：三個新主題構圖

三張圖片皆使用內建圖像生成工具各生成一次，依 concept1 → concept2 → concept3 順序完成，再複製原始 PNG 至本資料夾，未使用程式繪圖或縮放。要求 16:9、目標 1920×1080；工具實際輸出均為 1672×941（約 16:9，非精確 1920×1080）。以下動態與狀態映射為後續實作設計，本次交付為靜態概念圖。霧、塵光等以程式疊層實作時，應保留柔和密度感。

## 1. 雪原鐘塔巨像

**名稱：雪原鐘塔巨像。** 鏡頭描述：固定低機位從極地廢棄候車棚望向雪原，一座鐘塔巨像正從雪霧中緩緩現身。構圖分層：前景是左側破木樑、積雪鐵軌與琥珀色信號燈；中景是廢站與矮小機房；遠景是左中部鐘塔巨像、冰川山脊與右上方乾淨天空。會動的元素：程式雪霧、少量雪粒、鐘體微擺、胸腔鐘光與信號燈。AI 五種狀態：待命時鐘光低亮慢呼吸、霧緩移；思考時鐘光從下往上輕微流動、霧遮露交替；執行時鐘體微擺、雪霧向兩側退開，巨像輪廓更清楚；收尾時暖光柔和擴散一次後逐漸回落；等你時前景信號燈維持暖亮並極慢脈動。所有變化維持固定鏡頭與小幅度，不讓巨像走出構圖。圖檔：`concept1.png`。

實際圖像 prompt：

```text
Use case: stylized-concept
Create exactly one cinematic wallpaper concept image, 16:9 landscape, target 1920x1080. Theme: The Bell Colossus of the Snowfield. Fixed low camera from inside a ruined polar railway shelter, looking across a vast blue-hour snow plain. Foreground: dark broken timber beams framing only the left edge, snow-covered tracks and a tiny warm amber signal lamp at bottom left. Midground: tracks disappear toward a buried station and tiny abandoned utility huts, establishing enormous scale. Background and main subject: an immense ancient walking bell tower, a monolithic cathedral-like mechanical colossus on broad architectural legs, slowly revealing its upper torso through a soft veil of snow haze, positioned left of center. A suspended bronze bell glows gently inside its open chest; no face, no eyes. Its upper silhouette is crisp enough to read, its feet softly lost in snow density. Distant low glacial ridges along horizon. Clear foreground/midground/background separation, elegant atmospheric cinematic matte painting, richly textured restrained realism, icy indigo and pale cyan with subtle amber light, quiet awe and anticipation, not action spectacle. Atmosphere may be physically impossible. Snow haze is soft smooth density, no detailed clouds or heavy particles baked into image, suitable for later procedural animation. Reserve upper-right 30 percent as clean low-detail blue sky with gentle gradient for a future HUD; DO NOT draw the HUD. Edge-to-edge single scene, no text, no captions, no logos, no watermark, no collage. No squid, no worm, no jellyfish, no giant eye.
```

## 2. 軌道帆城

**名稱：軌道帆城。** 鏡頭描述：固定在陰影月面上，看一艘攜帶垂直城市的巨大帆船從月球地平線後升起。構圖分層：前景是玄武岩與小型探測天線；中景是斜向弧形月面、地平線柔光；遠景是左側巨型銅色摺帆與城市艦體、右側低處行星弧光和上方大面積黑色太空。會動的元素：帆面微弱波紋、城市燈帶、天線指示燈、程式塵光。AI 五種狀態：待命時窗光稀疏閃動、帆面幾乎靜止；思考時青綠訊號沿垂直城塔緩慢上行；執行時暖金燈帶依序點亮、帆面亮紋向外擴展；收尾時訊號聚成一次柔和光脈衝後降亮；等你時前景探測器指示燈慢閃，城市維持安定微光。艦體僅可極微幅上浮，右上 HUD 區保持低細節。圖檔：`concept2.png`。

實際圖像 prompt：

```text
Use case: stylized-concept
Create exactly one cinematic wallpaper concept image, 16:9 landscape, target 1920x1080. Theme: Orbital Sail City. A fixed camera on the shadowed surface of a fractured moon, looking out across a silent airless basalt crater. Foreground: angular charcoal rocks across the bottom and a small unoccupied survey antenna at lower left, subtle amber indicator lights. Midground: curved moon horizon sweeps from bottom left toward lower right; a thin luminous dust band just above the horizon provides soft layered atmospheric stylization. Main subject in the far middle distance: an enormous ancient spacecraft carrying a vertical city, emerging from behind the moon at left-center, with several kilometer-long translucent pleated solar sails unfurling upward and diagonally toward the left. The sails resemble architectural fans and delicate copper foil, NOT tentacles or animal shapes. Tiny illuminated terraces and window grids reveal the overwhelming scale. Background: deep petrol-black space with sparse tiny stars and a faint muted planetary crescent low at far right. Keep upper-right 30 percent empty dark space, almost no stars, calm low-contrast area for a future HUD; DO NOT draw the HUD. Composition dominated by strong sail diagonals and monumental negative space, clear foreground/midground/background layers. Premium cinematic science-fiction matte painting, convincing intricate materials, restrained palette of charcoal, oxidized copper, muted gold and pale turquoise. Quiet anticipation of something huge slowly rising into view. Artistic atmospheric light may violate physical optics. Any dust/glow must be smooth soft density, no busy nebula or detailed smoke, suitable for future procedural animation. Single edge-to-edge scene, no text, no logos, no watermark, no collage. No giant eye, no worms, no squid, no jellyfish.
```

## 3. 雨城天鯨

**名稱：雨城天鯨。** 鏡頭描述：固定在雨後屋頂俯望運河老城，一頭背負古老水道與柏樹的巨鯨從暮色薄霧中浮現。構圖分層：前景是濕瓦、欄杆與左側暖光溫室；中景是運河、石造民居與層疊拱橋；遠景是左中上方巨鯨、淡紫色山城和右上乾淨暮空。會動的元素：鯨鰭與尾鰭極慢擺動、身體微幅浮沉、程式薄霧、運河反光及窗燈。AI 五種狀態：待命時鯨身輕微呼吸式浮沉、水面緩流；思考時背上水道的微光逐段亮起、薄霧輕輕遮露腹部；執行時鰭略微舒展、運河與窗燈形成緩慢向遠方傳遞的暖光；收尾時水面柔光漣漪擴散一次、鯨鰭回到休息角度；等你時前景溫室燈緩慢呼吸，鯨身安靜懸停。變化不移動鏡頭、不侵入右上留白。圖檔：`concept3.png`。

實際圖像 prompt：

```text
Use case: stylized-concept
Create exactly one cinematic wallpaper concept image, 16:9 landscape, target 1920x1080. Theme: The Sky Whale Above the Rain City. Fixed rooftop camera looking along a narrow canal avenue through an old densely built hillside city at violet dusk after rain. Foreground: wet terracotta rooftop and dark balcony railing confined to the lower edge, a small warm-lit greenhouse on the lower left. Midground: layers of tightly packed old stone apartment buildings, warm windows, overhead wires and a canal reflecting muted rose light; strong perspective leads toward left-center. Main subject: an immense serene airborne baleen whale, anatomically recognizable as a humpback whale with broad tail flukes and pectoral fins, floating horizontally above the rooftops from left toward center. Its monumental back carries a small overgrown grove of dark cypress trees and traces of an ancient stone aqueduct. Much of its lower body disappears gently into a soft pale lavender atmospheric veil above the distant city, suggesting that a huge creature is slowly becoming visible. The whale is dignified and quiet, its eye tiny and insignificant; no glowing eye. Background: distant terraced city fading into a simple pale mauve evening sky. Keep upper-right 30 percent mostly clean uninterrupted low-contrast sky for a future HUD; whale, trees, wires and towers must stay out of that area. DO NOT draw a HUD. Cinematic painterly realism, tactile stone and rain-wet roof textures, warm ochre and dusty rose versus cool violet, dreamlike intimate city atmosphere and immense scale, clear foreground/midground/background. Light can be physically impossible. Mist is smooth soft density, no intricate clouds, no heavy rain streaks, suitable for later procedural animation. Single edge-to-edge scene, no text, no signs with lettering, no logos, no watermark, no collage. No squid, no worm, no jellyfish, no giant eye, no ocean scene.
```


