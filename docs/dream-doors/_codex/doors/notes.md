# 夢境之門素材生成紀錄

以內建 ImageGen 產出。門框成品為 1280 × 1280 RGB PNG，門板成品為 800 × 1920 RGB PNG。

兩張門框先用 `target.png` 作為造型與畫風參考，再以上一步產出的圖去背。輸出時按原比例縮放並置中，合成在純色 `#d8d8d8` 畫布上。門板按接近原生的 5:12 比例縮放至指定尺寸。

以下逐張列出成品所用的完整提示詞。

## `frame_wood.png`

### 初始生成

參考影像為 `target.png`。

```text
Create one square 1:1, 1024 px or larger, isolated game-prop reference image for Tripo image-to-3D.
Image 1 is the design and rendering reference for Dream Doors. Extract the architectural idea and softly painted Japanese animation background realism with warm gold and muted powder-blue notes. Leave all surrounding scenery out.
Show exactly one freestanding portal frame, built from two rectangular upright posts and one continuous, straight, projecting top lintel, with a compact stepped bracket under each overhanging end. Use a true clear opening width-to-height ratio of 2.4 to 3. Both posts stop at their own exposed, flat, squared feet. The opening is completely empty and shows the exact same solid light gray (#D8D8D8) as the outside background, all the way to the bottom. Omit door leaves, hinges, threshold, crossbar at floor level, floor, base platform, wall, foliage, props, text, watermark, and shadows cast onto the background.
Use a restrained, near-orthographic three-quarter view: camera 35 degrees to the right of front and 15 degrees above level, aiming at mid-height, so the tops and side thicknesses are visible. Center the complete object with consistent visual padding, taking up about 70 percent of the image height. Keep all ends and both foot bottoms inside the canvas. Use soft, even diffuse lighting and subtle material-level shading. Pure, opaque, perfectly flat #D8D8D8 background across the whole canvas.
Match the nearest full wooden frame in Image 1: worn pale taupe-brown timber, broad slightly layered square-ended lintel, substantial straight timber posts, simple Japanese-inspired carpentry and discreet stepped corbels. Show weather-softened chamfers, lengthwise grain, fine dry cracks, and occasional knots. Preserve the recognizable simple silhouette and keep warm highlights and cool gray-brown recesses subtle.
```

### 去背

輸入影像為該門框的初始生成圖，啟用透明背景。

```text
Image 1 is the source to edit. Isolate the existing freestanding pale weathered wooden portal as a clean game prop cutout. Preserve its timber, joinery, believable chunky post and lintel geometry, compact stepped corbels, exposed foot bottoms, lighting on the object, and three-quarter view. The object consists only of the two posts, top lintel and its brackets. Remove the gray background from both the open doorway and the area outside it, leaving true transparent alpha everywhere outside the intact shape of the frame. No ground, contact shadow, outline, backdrop, or threshold. Center the whole object in a square canvas with the full silhouette inside the image. Set both ends and both feet inside a generous margin. The result will be composited over a solid #D8D8D8 backdrop for Tripo.
```

## `frame_iron.png`

### 初始生成

參考影像為 `target.png`。

```text
Create one square 1:1, 1024 px or larger, isolated game-prop reference image for Tripo image-to-3D.
Image 1 is the design and rendering reference for Dream Doors. Extract the architectural idea and softly painted Japanese animation background realism with warm gold and muted powder-blue notes. Leave all surrounding scenery out.
Show exactly one freestanding portal frame, built from two rectangular upright posts and one continuous, straight, projecting top lintel, with a compact stepped bracket under each overhanging end. Use a true clear opening width-to-height ratio of 2.4 to 3. Both posts stop at their own exposed, flat, squared feet. The opening is completely empty and shows the exact same solid light gray (#D8D8D8) as the outside background, all the way to the bottom. Omit door leaves, hinges, threshold, crossbar at floor level, floor, base platform, wall, foliage, props, text, watermark, and shadows cast onto the background.
Use a restrained, near-orthographic three-quarter view: camera 35 degrees to the right of front and 15 degrees above level, aiming at mid-height, so the tops and side thicknesses are visible. Center the complete object with consistent visual padding, taking up about 70 percent of the image height. Keep all ends and both foot bottoms inside the canvas. Use soft, even diffuse lighting and subtle material-level shading. Pure, opaque, perfectly flat #D8D8D8 background across the whole canvas.
Use the middle blue-gray metal portal in Image 1 as the material and construction cue. Build it from aged blue-gray rectangular iron sections, with a projecting rectangular lintel and compact stepped metal support brackets. Clearly show rounded rivet heads along the joins, irregular faded powder-blue finish, rubbed edges, and a few restrained rusty flecks. Keep the geometry substantial and readable, without industrial pipes or attached machinery.
```

### 去背

輸入影像為該門框的初始生成圖，啟用透明背景。

```text
Image 1 is the source to edit. Isolate the existing freestanding powder-blue-gray iron portal as a clean game prop cutout. Preserve its rivets, weathering, chipped finish, steel sections, projecting lintel and compact stepped brackets, exposed foot bottoms, lighting on the object, and three-quarter view. The object consists only of the two posts, top lintel and its brackets. Remove the gray background from both the open doorway and the area outside it, leaving true transparent alpha everywhere outside the intact shape of the frame. No ground, contact shadow, outline, backdrop, or threshold. Center the whole object in a square canvas with the full silhouette inside the image. Set both ends and both feet inside a generous margin. The result will be composited over a solid #D8D8D8 backdrop for Tripo.
```

## `leaf_shoji.png`

參考影像為 `target.png`。

```text
Create a single tall, full-bleed game texture for the face of one Dream Doors door leaf, in an extreme portrait aspect ratio of 1:2.4 (800 × 1920 ideal, or closest tall format). The entire canvas is the front material surface. All four canvas edges are exactly the leaf's four outer edges, and all four canvas corners are solid leaf material. Use strict head-on orthographic elevation, at zero yaw and zero pitch: straight parallel verticals and horizontals, no perspective, no visible edge thickness or beveled sides. Fill the image edge to edge with useful texture, with zero neutral margin or studio backdrop. Show one leaf only. No architectural surround, wall, floor, threshold, scenery, text, watermark, or environmental cast shadow. Face details and hardware are allowed as part of the flat material texture. Light evenly from the front with fine texture and soft highlights, no hotspot, vignette, directional lighting gradient, or hard cast shadows.
Image 1 is a visual reference for the dreamlike palette and softly realistic hand-painted Japanese animation background art. Use nuanced material weathering, warm-gold and powder-blue undertones as appropriate, and clear readable details.
Use the nearest left leaf in Image 1 as the design cue. The upper half is a straight, fine, aged wooden shoji lattice of evenly spaced rectangular panes, each completely filled with opaque milky-ivory washi paper, with understated warm fibers. Do not show a view, floral silhouettes, backlighting, or transmission through the paper. The lower half is made of vertical aged pale honey-brown wood boards, with an integral horizontal wooden rail at the division and matching integral wood stiles. Keep the lattice edges axis-aligned and the lower panel visible all the way to the base.
```

## `leaf_plank.png`

```text
Create a rectangular portrait texture image with an exact 5:12 width-to-height shape, approximately 800 pixels wide by 1920 pixels tall. Depict the flat front face of one single door leaf as a full-bleed game texture. The outermost pixel rows and columns are the material of the leaf. Straight-on orthographic elevation at zero yaw and zero pitch, with horizontal and vertical lines parallel to the image edges. No view of the side edge, no margins, external surround, room, floor, scene, signage, text or watermark. Use softly realistic, hand-painted Japanese animation background art with carefully observed aged materials, a gentle diffuse front light and even color. Integrate hardware or glass details into the texture without hard cast shadows.
The entire surface from top to bottom is a single uninterrupted set of long vertical medium honey-brown weathered solid wood planks. Every area behind the vine is visibly brown wood grain and fine straight vertical plank seams, including above the handle and the very top of the door. NO WINDOWS, NO GLASS, NO PAPER, NO LATTICE, NO HORIZONTAL GRID anywhere. Paint a delicate climbing vine with warm-pink cherry blossoms, buds and a few leaves winding up the solid boards, sparse enough to keep the wood visible. Put one modest aged metal pull handle near the right edge at a practical handle height. Warm gold and dusty pink details, subtle scuffs and worn grain.
```

## `leaf_vault.png`

```text
Create a rectangular portrait texture image with an exact 5:12 width-to-height shape, approximately 800 pixels wide by 1920 pixels tall. Depict the flat front face of one single door leaf as a full-bleed game texture. The outermost pixel rows and columns are the material of the leaf. Straight-on orthographic elevation at zero yaw and zero pitch, with horizontal and vertical lines parallel to the image edges. No view of the side edge, no margins, external surround, room, floor, scene, signage, text or watermark. Use softly realistic, hand-painted Japanese animation background art with carefully observed aged materials, a gentle diffuse front light and even color. Integrate hardware or glass details into the texture without hard cast shadows.
The entire front is aged powder-blue-gray iron with rubbed edges, blue-gray patina, fine scuffs and a few small rust spots. Put a row of individually visible round rivet heads near each of the four canvas edges, including unbroken top and bottom rows. Mount one single circular spoked turn-wheel directly at the exact visual center of the face, with the shape of a true geometric circle and a spoked hub, approximately two thirds as wide as the leaf. Keep the remaining field plainly metallic. No inset window, latch, lever, or other handle. Use an exact 5:12 canvas aspect ratio with minimal subsequent cropping.
```

## `leaf_stained.png`

```text
Create a rectangular portrait texture image with an exact 5:12 width-to-height shape, approximately 800 pixels wide by 1920 pixels tall. Depict the flat front face of one single door leaf as a full-bleed game texture. The outermost pixel rows and columns are the material of the leaf. Straight-on orthographic elevation at zero yaw and zero pitch, with horizontal and vertical lines parallel to the image edges. No view of the side edge, no margins, external surround, room, floor, scene, signage, text or watermark. Use softly realistic, hand-painted Japanese animation background art with carefully observed aged materials, a gentle diffuse front light and even color. Integrate hardware or glass details into the texture without hard cast shadows.
Use a slender weathered wooden perimeter at the canvas edges as the integral edge of the door leaf. Fill the area inside it from near the very top to near the very bottom with blue, violet and warm honey-gold stained glass. Fine, near-black lead cames divide the glass into abstract, gracefully curved botanical shapes, stylized leaves, stems and petals. The image on the glass is exclusively the abstract botanical decoration. The panes show only their own opaque rendered glass color and surface texture. Use a restrained amount of wood at top and bottom to preserve the tall glass field. Pass no real view, background or scenery through the glass.
```

## `leaf_painted.png`

```text
Create a rectangular portrait texture image with an exact 5:12 width-to-height shape, approximately 800 pixels wide by 1920 pixels tall. Depict the flat front face of one single door leaf as a full-bleed game texture. The outermost pixel rows and columns are the material of the leaf. Straight-on orthographic elevation at zero yaw and zero pitch, with horizontal and vertical lines parallel to the image edges. No view of the side edge, no margins, external surround, room, floor, scene, signage, text or watermark. Use softly realistic, hand-painted Japanese animation background art with carefully observed aged materials, a gentle diffuse front light and even color. Integrate hardware or glass details into the texture without hard cast shadows.
Make the COMPLETE face a solid assemblage of vertical wooden boards coated in soft matte powder-blue paint, including the whole upper portion and all four corners. The same painted wood continues uninterrupted from the top edge to the bottom edge. Naturally worn and peeling areas reveal light warm brown grain, with brush texture, cracks and some tiny chips along the board seams. One understated aged brass pull handle near the right edge at normal handle height. NO WINDOWS, NO GLASS, NO PAPER, NO LATTICE, NO OPENINGS, NO GRID, NO SCENERY. Strongly prioritize an all-wood door.
```

## `leaf_red.png`

```text
Create a rectangular portrait texture image with an exact 5:12 width-to-height shape, approximately 800 pixels wide by 1920 pixels tall. Depict the flat front face of one single door leaf as a full-bleed game texture. The outermost pixel rows and columns are the material of the leaf. Straight-on orthographic elevation at zero yaw and zero pitch, with horizontal and vertical lines parallel to the image edges. No view of the side edge, no margins, external surround, room, floor, scene, signage, text or watermark. Use softly realistic, hand-painted Japanese animation background art with carefully observed aged materials, a gentle diffuse front light and even color. Integrate hardware or glass details into the texture without hard cast shadows.
Make the COMPLETE leaf a solid assemblage of vertical wood boards with weathered rich vermilion lacquer. The top and bottom and every corner are warm vermilion red wood, and the same red wood grain continues through the entire upper and lower panels. Show straight tidy rows of small dark copper door studs that continue down much of the height, and one centered aged brass circular ring pull at natural handle height. Subtle scuffs, darkened joints and worn reddish-brown grain around the edges. NO WINDOWS, NO GLASS, NO LATTICE, NO PAPER, NO OPENINGS, NO SCENERY. The upper area must be opaque vermilion wood with metal studs.
```
