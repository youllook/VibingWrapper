# Rural Taiwan Level-Crossing Textures

All images are PNG albedo/emission assets for Godot 4. The albedo textures use flat, neutral source lighting so scene lighting can provide the final dusk response. Generated source art was finished with periodic edge processing and checked in 2x2 repeats under [`previews/`](./previews/).

| File | Size | Intended scale and tiling | Description |
|---|---:|---|---|
| `ballast.png` | 1024x1024 | About 1 m x 1 m; repeat U and V | Angular, dirty grey granite railway ballast with restrained rust-brown staining. |
| `sleeper.png` | 1024x256 | One roughly 2.5 m sleeper top across U; repeat U only | Weathered light-grey prestressed concrete with chips and faint rail-seat rust marks. |
| `asphalt.png` | 1024x1024 | About 2 m x 2 m; repeat U and V | Worn dark rural asphalt with exposed pale aggregate, hairline cracks, and old patches. |
| `crossing_panel.png` | 1024x1024 | About 1 m x 1 m; repeat U and V | Worn dark ribbed rubber/concrete crossing-deck surface with ingrained dirt. |
| `rail_rust.png` | 1024x128 | About 2 m along the rail per U repeat; repeat U only | Deep brown-orange rust, pitting, and darker streaks for the rail web/foot side. |
| `verge.png` | 1024x1024 | About 2 m x 2 m; repeat U and V | Dry soil, mixed gravel, and sparse short green-yellow trackside weeds. |
| `emu_side.png` | 2048x512 | One generic roughly 20 m car segment per U repeat; repeat U only | Orthographic brushed-stainless commuter EMU side with teal/orange bands, tinted windows, and one sliding-door pair. |
| `emu_side_emissive.png` | 2048x512 | Use the exact UVs and U repeat as `emu_side.png` | Black emission mask with softly varied warm light confined to the matching windows. |
| `barrier_stripe.png` | 1024x128 | About 2 m along the barrier per U repeat; repeat U only | Weathered safety-yellow and black diagonal barrier-arm paint with light grime. |

## Seam QA

Each PNG has a same-named 2x2 repeat preview in `previews/`. Natural two-axis materials were offset by half a tile and repaired with a cosine-feathered interior patch; structured horizontal strips use phase-aligned or narrow symmetric edge matching to avoid layout ghosting. `previews/seam_report.txt` records boundary RMS relative to ordinary adjacent-pixel RMS; values near 1 indicate a boundary no stronger than local texture detail, while 0 indicates explicitly matched structured-strip edges.

## Generation brief

Built-in image generation was prompted for photorealistic, orthographic, evenly lit game textures with no cast shadows, perspective, text, logos, watermarks, or people. Per-file prompts specified the material details in the table above, seamless U/V behavior, the requested physical scale, and the exact EMU/emissive layout relationship.
