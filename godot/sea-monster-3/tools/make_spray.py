# Makes textures/spray.png, one puff of spray for the particles: a soft blob broken into droplets and streaks by
# noise, white with the shape in alpha. Seeded.  python tools/make_spray.py
import os
import numpy as np
from PIL import Image

N = 128
rng = np.random.default_rng(5)
y, x = (np.mgrid[0:N, 0:N] + 0.5) / N * 2 - 1
r = np.hypot(x, y)
blob = np.clip(1 - r, 0, 1) ** 1.6
noise = np.zeros((N, N))
for s, a in ((4, 0.5), (8, 0.3), (16, 0.2)):
    g = rng.random((s + 1, s + 1))
    gy, gx = (np.mgrid[0:N, 0:N] / N * s)
    x0 = gx.astype(int); y0 = gy.astype(int); fx = gx - x0; fy = gy - y0
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy)
    noise += a * ((g[y0, x0] * (1 - fx) + g[y0, x0 + 1] * fx) * (1 - fy) + (g[y0 + 1, x0] * (1 - fx) + g[y0 + 1, x0 + 1] * fx) * fy)
alpha = np.clip(blob * (0.4 + 1.2 * noise) - 0.15, 0, 1)
drops = np.zeros((N, N))
for _ in range(60):
    cx, cy = rng.normal(0, 0.45, 2); rad = rng.uniform(0.01, 0.035)
    drops = np.maximum(drops, np.clip(1 - np.hypot(x - cx, y - cy) / rad, 0, 1))
alpha = np.clip(np.maximum(alpha, drops * 0.9) * np.clip(1.2 - r, 0, 1), 0, 1)
img = np.zeros((N, N, 4), np.uint8)
img[..., :3] = 255
img[..., 3] = np.round(alpha * 255).astype(np.uint8)
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'textures', 'spray.png')
Image.fromarray(img, 'RGBA').save(out)
print('wrote', os.path.normpath(out))
