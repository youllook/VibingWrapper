# 沙塵滾滾：把 plume.py 渲出的序列（out/f000.png …）排成一張預乘 alpha 的圖集。
#   python -I sand/blender/plume_atlas.py [frames_dir] [out.png] [cols]
# Output: sand/textures/plume_atlas.png (RGBA8, colour premultiplied by alpha so bilinear filtering and the
# frame cross-fade in sand/plume.gdshader stay clean). Prints the cols/rows/frames that sand/plume.gd must use.
import sys, os, glob
import numpy as np
from PIL import Image

here = os.path.dirname(os.path.abspath(__file__))
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, "out")
dst = sys.argv[2] if len(sys.argv) > 2 else os.path.join(here, "..", "textures", "plume_atlas.png")
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 6

files = sorted(glob.glob(os.path.join(src, "f[0-9][0-9][0-9].png")))
assert files, "no frames in " + src
fr = [np.asarray(Image.open(f).convert("RGBA")).astype(np.float32) / 255.0 for f in files]
h, w = fr[0].shape[:2]
rows = (len(fr) + cols - 1) // cols
atlas = np.zeros((rows * h, cols * w, 4), np.float32)
for i, a in enumerate(fr):
	r, c = divmod(i, cols)
	p = a.copy()
	p[..., :3] *= p[..., 3:4]
	atlas[r * h:(r + 1) * h, c * w:(c + 1) * w] = p
Image.fromarray((atlas * 255 + 0.5).clip(0, 255).astype(np.uint8), "RGBA").save(dst, optimize=True)
print(f"atlas {dst}: {cols * w}x{rows * h}, cell {w}x{h}, cols {cols}, rows {rows}, frames {len(fr)}")
