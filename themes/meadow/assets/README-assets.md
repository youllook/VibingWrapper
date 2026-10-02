# Meadow mountain layer assets

All images use a 3840 x 1080 canvas. Ridgeline ranges are measured from the top of the image using the first pixel in each column with alpha >= 32; percentages therefore describe vertical image position, not mountain height.

| File | Dimensions | File size | Ridgeline range |
|---|---:|---:|---:|
| `mountains-far.png` | 3840 x 1080, RGBA PNG | 1,976,999 bytes | 48.3%-67.0% from top |
| `mountains-mid.png` | 3840 x 1080, RGBA PNG | 2,623,889 bytes | 47.7%-69.8% from top |
| `hills-near.png` | 3840 x 1080, RGBA PNG | 2,967,448 bytes | 43.9%-75.9% from top (the highest points are tree clumps) |
| `preview.png` | 3840 x 1080, RGB PNG | 2,749,336 bytes | Composite preview; front visible ridge is 43.9%-75.9% from top |

The three layer PNGs have genuine alpha transparency above their ridgelines. Their top 40% is fully transparent. The leftmost 15% remains low in every layer: far 64.6%-67.0%, middle 65.4%-69.8%, and near 70.6%-75.9% from the top.

`preview.png` composites the layers in this order over a light-blue vertical sky gradient: far mountains, middle mountains, then near hills.

## Meadow texture atlases

Pixel rectangles below use half-open bounds: `(x, y, width, height)`, with `(0, 0)` at the atlas top-left. Pivot and root coordinates use pixel-edge space, so a grass root at `y = 1024` lies exactly on the atlas bottom edge.

### `leaf-clusters.png`

- Size: 2048 x 2048, RGBA PNG with a transparent background.
- Layout: 3 columns x 2 rows; six isolated, neutral mid-green foliage brush clumps. Columns are 683, 683, and 682 pixels wide so the atlas fills 2048 pixels exactly.
- Intended shader input: internal luminance carries the dark-core, mid-tone, and lit-edge information; hue is deliberately restrained for runtime tinting.

| Cell | Variation | Pixel rect `(x, y, w, h)` | Pivot, atlas px | Pivot, local px |
|---:|---|---|---|---|
| 0 | Broad rounded clump | `(0, 0, 683, 1024)` | `(341.5, 512)` | `(341.5, 512)` |
| 1 | Low elongated dab | `(683, 0, 683, 1024)` | `(1024.5, 512)` | `(341.5, 512)` |
| 2 | Compact asymmetrical oval | `(1366, 0, 682, 1024)` | `(1707, 512)` | `(341, 512)` |
| 3 | Airy irregular clump | `(0, 1024, 683, 1024)` | `(341.5, 1536)` | `(341.5, 512)` |
| 4 | Diagonal windswept dab | `(683, 1024, 683, 1024)` | `(1024.5, 1536)` | `(341.5, 512)` |
| 5 | Small scattered cluster | `(1366, 1024, 682, 1024)` | `(1707, 1536)` | `(341, 512)` |

### `grass-clumps.png`

- Size: 2048 x 1024, RGBA PNG with a transparent background.
- Layout: 4 columns x 1 row; four 512 x 1024 cells. Each painted tuft is bottom-centered and has a connected ground-contact base.
- Lighting/color: natural yellow-green through meadow green, lit from the upper right and darker at the base. Cells 1 and 2 include the tiny flowers.

| Cell | Variation | Pixel rect `(x, y, w, h)` | Root/pivot, atlas px | Root/pivot, local px |
|---:|---|---|---|---|
| 0 | Broad upright tuft | `(0, 0, 512, 1024)` | `(256, 1024)` | `(256, 1024)` |
| 1 | Left-leaning tuft, white flowers | `(512, 0, 512, 1024)` | `(768, 1024)` | `(256, 1024)` |
| 2 | Sparse right-leaning tuft, yellow flower | `(1024, 0, 512, 1024)` | `(1280, 1024)` | `(256, 1024)` |
| 3 | Compact windswept tuft | `(1536, 0, 512, 1024)` | `(1792, 1024)` | `(256, 1024)` |

### `atlas-preview.png`

- Size: 2048 x 2048, RGBA PNG.
- Presentation only: `leaf-clusters.png` is shown at 1024 x 1024, centered in the upper half; `grass-clumps.png` is shown at native size in the lower half. Both are composited over mid-grey (`#777777`) to make alpha edges easy to inspect.

## Cloud sprite atlas

### `clouds.png`

- Size: 2048 x 2048, RGBA PNG with a transparent background.
- Layout: 2 columns x 3 rows; six isolated soft-gouache cloud sprites. Every cell is exactly 1024 x 682 pixels. The final two atlas rows (`y = 2046..2047`) are transparent padding because three 682-pixel rows total 2046 pixels.
- Lighting/color: neutral daylight with white upper-right sunlit planes and blue-grey/lavender belly shadows, kept neutral for dusk, night, and overcast shader tinting.
- Pixel rectangles use half-open bounds: `(x, y, width, height)`, with `(0, 0)` at the atlas top-left.

| Cell | Cloud type | Pixel rect `(x, y, w, h)` |
|---:|---|---|
| 0 | Big summer cumulus — broad central tower | `(0, 0, 1024, 682)` |
| 1 | Big summer cumulus — asymmetric stepped crown | `(1024, 0, 1024, 682)` |
| 2 | Big summer cumulus — dominant rounded crown | `(0, 682, 1024, 682)` |
| 3 | Medium flat-bottomed cumulus — wide multi-peak | `(1024, 682, 1024, 682)` |
| 4 | Medium flat-bottomed cumulus — low twin-crown | `(0, 1364, 1024, 682)` |
| 5 | Long thin stratus wisp | `(1024, 1364, 1024, 682)` |

### `clouds-preview.png`

- Size: 2048 x 2048, RGB PNG.
- Presentation only: `clouds.png` composited at native size over a neutral blue vertical sky gradient.

## Meadow grass depth strips

The four RGBA strips form one fixed-camera meadow field. Sunlight comes from the upper right; farther layers use progressively smaller marks, lower contrast, and cooler/bluer greens. Each strip has a continuous fully opaque ground band at the bottom and a painted alpha silhouette above it. The matching grayscale sway mask is black throughout that ground/root band and reaches white (`255`) at the topmost blade pixels in each occupied column.

| File | Size / mode | Opaque or root band | Intended depth | Tile / seam notes |
|---|---|---|---|---|
| `grass-strip-1.png` | 2048 x 512, RGBA | Bottom 205 px = 40.04% fully opaque; 41.64% of all pixels have alpha 255 | Nearest, about 3 m | Horizontal edge blend: 144 px; left/right RGBA edge columns are identical (maximum channel delta 0) |
| `grass-strip-1-mask.png` | 2048 x 512, grayscale L | Bottom 205 px = 40.04% black root lock; tips reach 255 | Sway mask for about 3 m | Left/right mask columns are identical; tiles with strip 1 |
| `grass-strip-2.png` | 2048 x 512, RGBA | Bottom 205 px = 40.04% fully opaque; 41.93% of all pixels have alpha 255 | Mid-near, about 5 m | Horizontal edge blend: 128 px; left/right RGBA edge columns are identical (maximum channel delta 0) |
| `grass-strip-2-mask.png` | 2048 x 512, grayscale L | Bottom 205 px = 40.04% black root lock; tips reach 255 | Sway mask for about 5 m | Left/right mask columns are identical; tiles with strip 2 |
| `grass-strip-3.png` | 2048 x 512, RGBA | Bottom 205 px = 40.04% fully opaque; 43.08% of all pixels have alpha 255 | Mid-far, about 8 m | Horizontal edge blend: 112 px; left/right RGBA edge columns are identical (maximum channel delta 0) |
| `grass-strip-3-mask.png` | 2048 x 512, grayscale L | Bottom 205 px = 40.04% black root lock; tips reach 255 | Sway mask for about 8 m | Left/right mask columns are identical; tiles with strip 3 |
| `grass-strip-4.png` | 2048 x 256, RGBA | Bottom 102 px = 39.84% fully opaque; 40.03% of all pixels have alpha 255 | Farthest, about 14 m | Horizontal edge blend: 96 px; left/right RGBA edge columns are identical (maximum channel delta 0) |
| `grass-strip-4-mask.png` | 2048 x 256, grayscale L | Bottom 102 px = 39.84% black root lock; tips reach 255 | Sway mask for about 14 m | Left/right mask columns are identical; tiles with strip 4 |
| `strips-preview.png` | 4096 x 862, RGB | 100% opaque light presentation background | Depth-stack review only | Each 2048 px strip is repeated twice; the tile join is at x = 2048. Layers overlap back-to-front: 14 m, 8 m, 5 m, then 3 m |

Strips 1 and 2 contain a few small white/yellow flowers. Strips 3 and 4 contain no flowers. None of the strips contains a dandelion puff or a scenery object.

## Additional foreground grass atlas

### `grass-clumps-2.png`

- Size: 2048 x 1024, RGBA PNG with a transparent background; 21.58% of atlas pixels are fully opaque.
- Layout: 4 columns x 1 row; four isolated 512 x 1024 cells. Cell boundary columns are fully transparent, and every tuft is rooted at the bottom-center pivot.
- Intended depth: foreground accents, extending `grass-clumps.png` from four to eight variants in total. This atlas is not intended to tile.

| Cell | Variation | Pixel rect `(x, y, w, h)` | Root/pivot, atlas px | Root/pivot, local px |
|---:|---|---|---|---|
| 0 | Short wide fan-shaped tuft | `(0, 0, 512, 1024)` | `(256, 1024)` | `(256, 1024)` |
| 1 | Tall airy tuft with grass seed heads | `(512, 0, 512, 1024)` | `(768, 1024)` | `(256, 1024)` |
| 2 | Sparse asymmetrical tuft with bare dandelion stem and no puff | `(1024, 0, 512, 1024)` | `(1280, 1024)` | `(256, 1024)` |
| 3 | Dense dark compact tuft | `(1536, 0, 512, 1024)` | `(1792, 1024)` | `(256, 1024)` |

## Fixed-camera turf replacement set

These five new paintings replace depth reuse with one independently painted texture per distance. They share the same upper-right sunlight and warm yellow-green / green / olive meadow palette, while mark size, contrast, and blue haze decrease with distance. All turf PNGs have genuine transparency above the silhouette and a continuous fully opaque root/ground band occupying approximately the bottom 40%.

| File | Size / mode / file size | Intended depth | Opaque fraction / root lock | Horizontal seam notes |
|---|---|---:|---|---|
| `turf-1.png` | 4096 x 1024 RGBA, 5,587,560 bytes | 2 m, nearest | 40.04% of all pixels fully opaque; bottom 410 px (40.04%) continuous opaque mass | Original midpoint is rephased to the tile boundary; 384 px internal painted seam repair; saved left/right RGBA edge-column maximum delta = 0 |
| `turf-1-mask.png` | 4096 x 1024 grayscale RGBA, 179,436 bytes | Sway mask for 2 m | 100% alpha-opaque; bottom 410 px black; occupied blade tips reach white | Left/right mask edge columns identical; tiles with `turf-1.png` |
| `turf-2.png` | 4096 x 1024 RGBA, 6,040,731 bytes | 3 m | 40.04% of all pixels fully opaque; bottom 410 px (40.04%) continuous opaque mass | Original midpoint is rephased to the tile boundary; 352 px internal painted seam repair; saved left/right RGBA edge-column maximum delta = 0 |
| `turf-2-mask.png` | 4096 x 1024 grayscale RGBA, 231,292 bytes | Sway mask for 3 m | 100% alpha-opaque; bottom 410 px black; occupied blade tips reach white | Left/right mask edge columns identical; tiles with `turf-2.png` |
| `turf-3.png` | 3072 x 640 RGBA, 2,774,264 bytes | 5 m | 40.00% of all pixels fully opaque; bottom 256 px (40.00%) continuous opaque mass | Original midpoint is rephased to the tile boundary; 288 px internal painted seam repair; saved left/right RGBA edge-column maximum delta = 0 |
| `turf-3-mask.png` | 3072 x 640 grayscale RGBA, 98,939 bytes | Sway mask for 5 m | 100% alpha-opaque; bottom 256 px black; occupied blade tips reach white | Left/right mask edge columns identical; tiles with `turf-3.png` |
| `turf-4.png` | 2048 x 400 RGBA, 848,728 bytes | 8 m | 40.00% of all pixels fully opaque; bottom 160 px (40.00%) continuous opaque mass | Original midpoint is rephased to the tile boundary; 224 px internal painted seam repair; saved left/right RGBA edge-column maximum delta = 0 |
| `turf-4-mask.png` | 2048 x 400 grayscale RGBA, 11,338 bytes | Sway mask for 8 m | 100% alpha-opaque; bottom 160 px black; occupied blade tips reach white | Left/right mask edge columns identical; tiles with `turf-4.png` |
| `turf-5.png` | 2048 x 256 RGBA, 408,505 bytes | 14 m, farthest | 39.84% of all pixels fully opaque; bottom 102 px (39.84%) continuous opaque mass | Original midpoint is rephased to the tile boundary; 192 px internal painted seam repair; saved left/right RGBA edge-column maximum delta = 0 |
| `turf-5-mask.png` | 2048 x 256 grayscale RGBA, 2,695 bytes | Sway mask for 14 m | 100% alpha-opaque; bottom 102 px black; occupied blade tips reach white | Left/right mask edge columns identical; tiles with `turf-5.png` |
| `mid-tufts.png` | 2048 x 1024 RGBA, 1,732,183 bytes | Accent sprites between turf layers, 4-10 m | 16.88% fully opaque; 25.81% nonzero-alpha coverage | Not tileable; every cell boundary has transparent clearance and only the root-connected clump component is retained |
| `turf-preview.png` | 4096 x 850 RGB, 3,955,665 bytes | Presentation / depth-stack QA | 100% opaque | Each depth is displayed as two 2048 px-wide tiles with the join at x = 2048; layers are composited far-to-near with tuft sprites between them |

The sway masks are black outside the moving blade silhouette and throughout the root mass. Within occupied blade pixels they ramp per column from black at the root line to white at that column's highest painted tip.

### `mid-tufts.png` cell map

The atlas uses eight exact 512 x 512 cells in row-major order. Every root is at the bottom-center pixel edge of its cell; local root coordinates are `(256, 512)`. Cells 0-5 are sharp; cells 6-7 are intentionally painted with soft depth-of-field focus.

| Cell | Variation | Pixel rect `(x, y, w, h)` | Root/pivot, atlas px | Root/pivot, local px |
|---:|---|---|---|---|
| 0 | Low wide split fan | `(0, 0, 512, 512)` | `(256, 512)` | `(256, 512)` |
| 1 | Narrow upright tuft with two seed heads | `(512, 0, 512, 512)` | `(768, 512)` | `(256, 512)` |
| 2 | Asymmetrical left-leaning crescent | `(1024, 0, 512, 512)` | `(1280, 512)` | `(256, 512)` |
| 3 | Compact rounded tussock with central dip | `(1536, 0, 512, 512)` | `(1792, 512)` | `(256, 512)` |
| 4 | Sparse three-prong tuft | `(0, 512, 512, 512)` | `(256, 1024)` | `(256, 512)` |
| 5 | Low right-windswept tuft | `(512, 512, 512, 512)` | `(768, 1024)` | `(256, 512)` |
| 6 | Soft-focus medium fan | `(1024, 512, 512, 512)` | `(1280, 1024)` | `(256, 512)` |
| 7 | Soft-focus narrow tuft | `(1536, 512, 512, 512)` | `(1792, 1024)` | `(256, 512)` |

### Turf edge repair — 2026-10-02

Repainted the transparent upper silhouettes of `turf-4.png` and `turf-5.png` to remove the straight horizontal mass boundary and vertically stretched colour band. Both retain their original canvas sizes, opaque bottom/root bands, and pixel-identical horizontal tile edges; `turf-4-mask.png` and `turf-5-mask.png` were regenerated from the repaired silhouettes so the exposed tips are white and the root mass is black.

### Turf edge repair — 2026-10-02 (near/mid strips)

Repainted the upper silhouettes of `turf-1.png`, `turf-2.png`, and `turf-3.png` to remove the straight mass boundary and vertically smeared colour columns while preserving each strip's gouache palette and depth-specific stroke scale. Their matching masks were regenerated from the repaired alpha silhouettes with white tips, black roots, and pixel-identical horizontal tile edges.
