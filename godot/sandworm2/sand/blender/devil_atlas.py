# 把 devil_render.py 的格子拼成圖集：python sand/blender/devil_atlas.py [E:/tmp/devil_fb]
# 每款 72 格 → 12×6、每格 160×320（從 2× 算圖縮小）→ sand/textures/devil_fb_<v>.png（1920×1920）。
# 存法：A＝透明度、RGB＝預乘過的亮度（灰階 × alpha）——預乘後線性濾波／格間交叉淡化都不會有黑邊。
import sys, os, glob
import numpy as np
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else "E:/tmp/devil_fb"
DST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "textures")
COLS, ROWS, CW, CH = 12, 6, 160, 320

for v in (0, 1):
    fs = sorted(glob.glob(os.path.join(SRC, "v%d" % v, "f_*.png")))
    assert len(fs) == COLS * ROWS, (v, len(fs))
    atlas = np.zeros((ROWS * CH, COLS * CW, 4), np.float32)
    hist = []
    for i, f in enumerate(fs):
        a = np.asarray(Image.open(f).convert("RGBA"), np.float32) / 255.0
        lum = a[..., :3] @ np.array([0.2126, 0.7152, 0.0722], np.float32)
        pre = np.stack([lum * a[..., 3], a[..., 3]], -1)
        h, w = pre.shape[:2]
        fy, fx = h // CH, w // CW
        pre = pre.reshape(CH, fy, CW, fx, 2).mean((1, 3))   # box filter in premultiplied space
        r, c = divmod(i, COLS)
        cell = atlas[r * CH:(r + 1) * CH, c * CW:(c + 1) * CW]
        cell[..., 0] = cell[..., 1] = cell[..., 2] = pre[..., 0]
        cell[..., 3] = pre[..., 1]
        m = pre[..., 1] > 0.05
        hist.append(pre[..., 0][m] / pre[..., 1][m])
    allv = np.concatenate(hist)
    print("v%d lum (straight) p5/p50/p95:" % v, np.percentile(allv, [5, 50, 95]).round(3))
    out = os.path.join(DST, "devil_fb_%d.png" % v)
    Image.fromarray((np.clip(atlas, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA").save(out, optimize=True)
    print("wrote", os.path.normpath(out), os.path.getsize(out) // 1024, "KB")
