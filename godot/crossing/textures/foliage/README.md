# Foliage atlas

`foliage_atlas.png` is a 2048×1024 RGBA atlas arranged as a 4×2 grid of 512×512 cells. Cell indices are row-major:

| Cell | Plant clump |
| ---: | --- |
| 0 | Young–mid growth bright-green rice hill |
| 1 | Older, denser rice hill with outward-bending leaves and yellow-green tips |
| 2 | Fresh green roadside wild-grass tuft |
| 3 | Dry-season straw-yellow and green wild-grass tuft |
| 4 | Low, wide broadleaf field-edge weed clump |
| 5 | Tall, airy seeding Guinea-grass-style clump |
| 6 | Cyperus-like field-ditch sedge with small umbels |
| 7 | Loose Bidens-pilosa-style weeds with white petals and yellow centres |

`foliage_atlas_mask_check.png` composites the atlas over `#808080` for visual alpha inspection.

The atlas stores straight alpha. RGB has been propagated from the nearest visible plant texel into every fully transparent texel on a per-cell basis, preventing black or white mipmap fringes while preserving transparent alpha.
