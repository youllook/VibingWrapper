# Task: repaint target.png as a clean FAR-ONLY background plate

Input: `target.png` in this folder (1672x941). It shows a sunset desert seen through a dark rock arch, with a giant sandworm, dust, rock spires and dunes.

Use your image generation / image editing tool, with `target.png` as the reference/input image, to produce ONE image that keeps ONLY the far background layer:

KEEP (same colors, same lighting, same positions):
- the sunset sky and the orange/golden clouds
- the sun on the right, sitting right at the horizon at about x=1510, y=445 (in 1672x941 pixels), with its rays and glow
- the distant hazy mountain ridges along the horizon
- the warm horizon haze

REMOVE completely and paint naturally what they hid:
- the rock arch (top, left and right pillars) and all foreground rock ledges and rubble
- every rock spire / pinnacle (near and far)
- the sandworm, its sand falls and all dust clouds / dust devils
- the near and mid dunes

MOUNTAIN RIDGES (important):
- The distant mountain ridges must be COMPLETE and CONTINUOUS across the full width of the frame, from the left edge to the right edge.
- In target.png they are only visible in pieces (left of the worm around x=180-600, and right of it around x=1330-1620); the parts hidden behind the rock arch, the sandworm, its dust clouds and the rock spires must be painted in as natural, continuous ridgelines with the same hazy warm color, the same height range and the same atmospheric fading.
- No gaps, no smears, no blurry patches, no ghost shapes where the worm, dust or arch used to be.

FILL:
- The sky must continue edge to edge across the WHOLE frame: where the arch was (top, left, right) paint more of the same cloudy sunset sky, continuous with the clouds that are visible through the opening.
- The horizon stays at the same height as in target.png (distant mountains around y=460-540, horizon line about y=520). Do not move or rescale it.
- Below the horizon: distant, flat, hazy, featureless warm orange desert plain fading into haze. No dunes with strong shapes, no rocks, no objects.

Hard rules:
- Same camera, same framing, same aspect ratio as target.png; the sun must stay at about (1510, 445).
- No arch, no rocks, no worm, no dust, no people, no text, no watermark, no border.
- Output size: 1672x941 (if your tool produces a different size with the same 16:9-ish aspect, resize it to exactly 1672x941 afterwards with Python and Pillow).

Save the result as `far.png` in this folder. When far.png is fully written, create `done.txt` containing the word done. Do not modify target.png.
