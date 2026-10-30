# Makes textures/foam.png, the sea's foam lace: tileable Worley cell walls at three scales (bubbles crowd along the
# walls, the way sea foam breaks into a net) and a soft coverage noise. R = lace, G = coverage, B = fine bubbles.
# Seeded, so every run makes the same map.  python tools/make_foam.py
import os
import numpy as np
from PIL import Image

N = 512
rng = np.random.default_rng(11)

def worley(cells):
    # F2 − F1 over the 3×3 neighbouring cells, the point grid wrapping every `cells`
    pts = rng.random((cells, cells, 2))
    y, x = np.mgrid[0:N, 0:N] / N * cells
    cx = np.floor(x).astype(int); cy = np.floor(y).astype(int)
    ds = []
    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            gx = cx + ox; gy = cy + oy
            p = pts[gy % cells, gx % cells]
            ds.append(np.hypot(x - (gx + p[..., 0]), y - (gy + p[..., 1])))
    ds = np.sort(np.stack(ds), 0)
    return ds[1] - ds[0]

def value_noise(cells):
    g = rng.random((cells, cells))
    y, x = np.mgrid[0:N, 0:N] / N * cells
    x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int)
    fx = x - x0; fy = y - y0
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy)
    a = g[y0 % cells, x0 % cells]; b = g[y0 % cells, (x0 + 1) % cells]
    c = g[(y0 + 1) % cells, x0 % cells]; d = g[(y0 + 1) % cells, (x0 + 1) % cells]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy

lace = np.clip(np.exp(-worley(6) * 7.0) * 0.7 + np.exp(-worley(14) * 9.0) * 0.5, 0, 1)
cover = value_noise(4) * 0.5 + value_noise(8) * 0.3 + value_noise(16) * 0.2
fine = np.clip(np.exp(-worley(40) * 10.0), 0, 1)
img = np.stack([lace, cover, fine], -1)
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'textures', 'foam.png')
Image.fromarray(np.round(img * 255).astype(np.uint8)).save(out)
print('wrote', os.path.normpath(out))
