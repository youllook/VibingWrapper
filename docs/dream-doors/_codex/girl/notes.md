# 圖像生成記錄

三張圖皆使用內建 ImageGen，並以 `target.png` 為角色或場景參考。以下逐字記錄送出的 prompt。

## girl.png

正面生成以 `target.png` 作為參考。去背後將角色合成至 1055 × 1664 的純 `#d8d8d8` 畫布，全身約佔畫面高度 84.9%。

### 正面生成

```text
Use case: stylized-concept. Create a single full-body front orthographic character reference for Tripo image-to-3D and skeletal rigging, taking the short-haired girl walking away in target.png as the character design reference. Repose her standing still, centered, upright, facing directly towards the camera with a calm neutral expression and head level. Natural near-realistic proportions, about seven head heights. Symmetrical A-pose: straight arms slope down and outward approximately 45 degrees away from her sides, both hands fully visible and separated from her torso, fingers relaxed and together, feet slightly apart and pointing forwards. Maintain clear negative space between each forearm and the body, skirt, and bag.
Keep the design from the reference: chestnut brown softly tousled short bob ending above the shoulders, loose brick-red button-up shirt with sleeves rolled to the forearms, warm off-white mid-calf pleated skirt, visible white ankle socks, simple brown ankle boots, and one natural beige canvas crossbody flap bag at her anatomical left outer hip. The canvas strap runs from her anatomical right shoulder to left hip. In this front view, that means the strap starts on the viewer's LEFT side and descends diagonally to the bag on the viewer's RIGHT. The bag rests snugly at the hip with a gap between it and the arm. Keep the hem of the shirt untucked and the pleats clearly legible.
Match the reference's soft Japanese anime rendering with subtly realistic color and fabric shading and clean silhouette edges. Use diffuse even lighting. Place only the character on a perfectly uniform solid light gray RGB(216,216,216) #D8D8D8 background extending edge to edge. No floor, horizon, gradient, texture, cast or contact shadow, scenery, ground plane, text or labels. Portrait canvas of at least 1024 pixels short edge. Show the whole figure from hair to boot soles with a little clearance evenly above and below and the character occupying approximately 85% of image height. One isolated character, one strictly frontal view.
```

### 正面去背

```text
Use case: background-extraction. Extract the single front-facing standing character from the supplied turnaround frame. Replace the gray background with genuine RGBA transparency and keep the character drawing identical to the supplied image: same exact orthographic front view, A-pose and joint positions, identity, proportions, hand silhouettes, hair strands, shirt and rolled cuffs, pleated skirt, boots, white socks, and original placement and shape of the beige canvas bag and strap. Preserve the original framing, aspect ratio, scale, color and lighting. Keep the character fully opaque with naturally antialiased contours; everything beyond the character silhouette including the space between the forearms and body and between her boots must be transparent, with no gray halo, cast shadow, floor, redraw, labels or checkerboard. Show all of the original figure from the top of the hair to the bottom of the boot soles.
```

## girl_back.png

背面生成依序使用正面初稿和 `target.png` 作為參考。去背後套用同規格畫布，全身約佔畫面高度 84.7%。

### 背面生成

```text
Use case: stylized-concept. Produce one full-body orthographic REAR view for the same character turnaround, with precisely the same symmetrical A-pose and outfit. Image 1 is the front character sheet and sets the character's identity, silhouette, joint angles, materials, colors, body and clothing proportions. Image 2, target.png, confirms her rear hairstyle and the original way the bag is worn. Turn Image 1's character and camera relationship exactly 180 degrees without changing her posture. We should see the back of her head and body squarely, no face visible, no three-quarter angle. Match Image 1's levels for the shoulders, upper-arm roll cuffs, elbows, wrists, fingertips, hips, skirt hem, socks and soles. Both arms descend diagonally out from the shoulders, hands relaxed with fingers together, feet slightly separated with matching positions, and there is clear empty space between the arms and torso/skirt/bag.
Keep the same chestnut brown softly tousled bob above the shoulders, loose untucked brick-red button-up with sleeves rolled to the forearm, warm off-white mid-calf pleated skirt, white ankle socks, brown lace-up ankle boots showing their backs, and beige canvas crossbody flap bag. The bag stays on her anatomical LEFT hip, which is the VIEWER'S LEFT in this rear view. The wide beige strap must come off the shoulder on the VIEWER'S RIGHT and cross the back descending diagonally to the bag on the VIEWER'S LEFT, as in Image 2. Preserve a gap between the bag and the arm. Preserve Image 1's soft Japanese anime treatment and natural seven-head proportions and show the same character and pose distanced from the frame on all sides.
One centered isolated character, from hair to boot soles. Portrait canvas at least 1024 pixels on the shorter edge. The entire figure should occupy approximately 85% of the frame height, with equal blank space above and below. Strictly uniform flat light gray RGB(216,216,216) #D8D8D8 field; diffuse even lighting. No ground, contact or cast shadow, horizon, gradient, vignette, typography, props beyond the worn bag, or environment.
```

### 背面去背

```text
Use case: background-extraction. Extract the single rear-facing standing character from the supplied turnaround frame. Replace the gray background with genuine RGBA transparency and keep the character drawing identical to the supplied image: same exact orthographic back view, A-pose and joint positions, identity, proportions, hand silhouettes, hair strands, shirt and rolled cuffs, pleated skirt, boots, white socks, and original placement and shape of the beige canvas bag and strap. Preserve the original framing, aspect ratio, scale, color and lighting. Keep the character fully opaque with naturally antialiased contours; everything beyond the character silhouette including the space between the forearms and body and between her boots must be transparent, with no gray halo, cast shadow, floor, redraw, labels or checkerboard. Show all of the original figure from the top of the hair to the bottom of the boot soles.
```

## sakura_branch.png

使用 `target.png` 作為參考並要求透明背景。將生成的 1774 × 887 RGBA PNG 等比調整為 2048 × 1024，保留 alpha 通道。

### 櫻花枝生成

```text
Use case: stylized-concept. Create a single isolated foreground cherry blossom branch asset based on the flowering branch at the upper left of target.png. Use the supplied scene only as the reference for the branch growth, abundance of flowers and warm sunset light. Start with one thick dark brown textured bough entering the canvas at the upper-left corner area, angled diagonally down towards the right. It divides naturally into smaller branches and fine twigs reaching to the right and lower right, with the ends in frame and generous open transparent space beneath. Fill the forks with many dense, distinct clusters of delicate five-petalled pale blush pink and ivory-white Japanese cherry blossoms, a few buds and delicate stamens. Make the canopy full and well defined, with an organic, asymmetrical outline and subtle gaps between blossom groups. Soft, realistic Japanese anime environment-art rendering in the same style as the reference. Warm golden backlight catches translucent petal edges and softly lights the bark. Keep the bark and spanning forks legible underneath the bloom. Single attached branch only, no loose petals.
Render a landscape PNG approximately 2048 pixels wide with a genuinely transparent background and an RGBA alpha channel. Every area outside the branch and flowers, including open holes between twigs, should be transparent. Keep fine petal contours clean. No drawn checkerboard, gray or white background, sky, door, landscape, ground, cast shadow, backdrop, bloom haze in the transparent area, text or watermark.
```

