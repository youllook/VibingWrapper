# Generation prompts and method

Used built-in image_gen for both repairs; Python masks preserve original pixels and registration.

1. Edit gym1.png: remove the central lifter, entire loaded barbell, all main squat-rack uprights, hooks and beams, foreground chalk bucket, towel, wooden box, and taped bench with its legs. Keep and reconstruct the wooden lifting platform. Preserve the original camera, framing, light shafts and dust. Keep the left storage equipment, right referee lamps, stored barbells, keg, dumbbells and floor plates fixed. Preserve brickwork, high windows, mirror, ceiling, fan, bulbs, poster, neon and whiteboard writing. Reconstruct only the occluded scenery. Output a 1672 x 941 empty gym plate.

2. Edit the empty plate: erase every handwritten word, number and tally mark on the right whiteboard. Leave a dirty off-white surface with faint wiping marks. Preserve its frame, tray and markers; keep the poster and neon text intact. Keep all other scene content and framing unchanged.

The final empty image combines generated repair regions with the original. The final blank-board image changes only the whiteboard interior. build_layers.py reproduces the outputs from the saved generation intermediates. check_layers.py recreates the composite and verifies sizes, modes, original-pixel identity and exact reconstruction.
