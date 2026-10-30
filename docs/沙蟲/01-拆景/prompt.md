target.png is a 1672×941 matte painting: a desert seen through a natural rock arch, a giant sandworm bursting from the sand with its maw facing the camera, sunset on the right.

Split it into FOUR depth layers, saved as RGBA PNGs at exactly 1672×941, pixel-aligned with target.png. Each layer keeps the ORIGINAL pixels of its objects (do not repaint or restyle them) and is fully transparent (alpha 0) everywhere else. Every pixel of target.png belongs to exactly one layer; when something spans layers it goes to the FRONTMOST one. Do not invent hidden parts — only what is visible.

1. layer-near.png — the rock arch (its top span, left and right legs) and the rocky ground in the foreground (the stepped rock ledges lower-left, the rubble along the bottom edge, the rocks lower-right).
2. layer-midnear.png — the sand dunes from just past the foreground rocks out to the middle distance, the rock spires standing on that sand (the tall cluster left of centre, the spires lower-middle and right), and the thin dust devils rising off the dunes.
3. layer-mid.png — the sandworm: its head, four lips, teeth and throat, its segmented body arcing back, the sand pouring off it, the dust wall / billowing plume around its base, plus the small rock spires and dunes right around and behind the worm.
4. layer-far.png — everything behind: the distant mountain ridges, the hazy horizon, the sky, the clouds and the sun.

Use your image tools / code (Python with PIL/numpy is fine) to make clean masks with soft edges on the dust. After saving, print each file's size and the percentage of opaque pixels in each, and write a file named done.txt.

Write all outputs (and any helper script) inside this folder only.
