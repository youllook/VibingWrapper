# world_clouds.png 生成紀錄

- 模式：內建 image_gen 工具。
- 參考圖：`target.png`，只參考右半邊的畫風、雲海、天空與光色。
- 請求尺寸：21:9、3360 × 1440，至少 2400 像素寬；若無法提供則允許 16:9。
- 工具實際輸出：1914 × 822 PNG；以 macOS `sips --resampleHeightWidth 1440 3360` 放大為最終 3360 × 1440（21:9）。這是尺寸重採樣，不代表原生生成了更多細節。
- 視覺檢查：水平雲海地平線約在畫面中央、太陽約在水平 56% 且略高於地平線；兩側為延續的天空與雲海。未見門、柱子、人物、建築、文字或邊框。
- 以下為實際提交的完整 prompt。

```text
Use case: stylized-concept.
Create a new panoramic environment painting, world_clouds.png, for the cloud-sea world in "Dream Gate". The supplied target.png is a STYLE REFERENCE ONLY: match the soft realism of a Japanese animated feature-film background, luminous color, clean atmospheric perspective, and finely sculpted cumulus and light seen on its RIGHT side. Do not reproduce its doors, walkway, person, flowers, buildings, or framing.

Canvas: ultrawide 21:9, preferably 3360 x 1440 pixels, at least 2400 pixels wide. If ultrawide is unavailable use 16:9. Full-bleed opaque image.
Composition: a perfectly level eye-height view at approximately the top of a vast cloud sea. No downward or upward camera tilt. The distant cloud-sea horizon is exactly halfway down the image (y=50%). The entire lower half, from the immediate foreground to infinity, is a continuous, fluffy, densely billowing sea of clouds, not water and not land. Volumetric foreground cloud lobes have golden-white sunset-lit tops and pale lavender-blue shadows. Clean atmospheric depth makes distant clouds softer and smaller.
The upper half is saturated blue sky, deeper blue at the zenith, graduating to warm peach near the horizon. A few beautifully sculpted mid-distance cumulus formations occupy the central 70% of the image, with warm golden rims facing the sun and blue-gray shadow planes. Preserve delicate luminous cloud detail and a spacious sky.
Sun center precisely at x=56% of the full width and y=44% of the full height, that is six percent of the image height above the central horizon. A small low-angle warm golden sun with a soft restrained halo; retain detail, avoid a large overexposed white patch.
Both the outermost left 15% and right 15% are quiet uninterrupted extensions of the sky and cloud sea. No distinct isolated towering cloud or single focal object cut off by either edge. Make these edge zones suitable for a panoramic environment.
Mood and materials: serene, airy, luminous, painterly but softly realistic; intricate sculptural cumulus, soft gold and cream highlights, pale lilac-blue shadows, peach horizon, rich clean blue sky. Faithful to the provided reference's right-hand cloud world.
Absolutely no gates, doors, pillars, stone slabs, path, walkway, people, architecture, plants, mountains, islands, ocean, text, logo, watermark, frame or border. The world itself consists only of sky, sun, and cloud sea.
```

