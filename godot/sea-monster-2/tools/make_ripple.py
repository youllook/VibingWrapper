# Makes textures/ripple.png, the sea's ripple map (大海怪's RIPPLES, after three.js Water.js): a height field summed
# from ~70 sharpened waves around the wind whose wave vectors are whole cycles per tile, so it wraps seamlessly.
# RG = slope / rms / 8 + 0.5. Seeded, so every run makes the same map.  python tools/make_ripple.py
import math, os
import numpy as np
from PIL import Image

N = 256
seed = 7
def r():
    global seed
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647

comps = []
for i in range(70):
    km = 2 + math.pow(r(), 1.5) * 26
    ang = 0.93 + (r() - 0.5) * 2.4
    kx, ky = round(km * math.cos(ang)), round(km * math.sin(ang))
    if kx or ky:
        comps.append((kx * 2 * math.pi / N, ky * 2 * math.pi / N, math.hypot(kx, ky) ** -1.8, r() * 2 * math.pi))
y, x = np.mgrid[0:N, 0:N].astype(np.float64)
h = np.zeros((N, N))
for kx, ky, a, p in comps:
    v = 0.5 + 0.5 * np.sin(kx * x + ky * y + p)
    h += a * v * v                                      # squared: sharp crests, wide troughs
gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
rms = math.sqrt(((gx ** 2 + gy ** 2).mean()) / 2)
img = np.zeros((N, N, 3), np.uint8)
img[..., 0] = np.clip(np.round((0.5 + gx / rms / 8) * 255), 0, 255)
img[..., 1] = np.clip(np.round((0.5 + gy / rms / 8) * 255), 0, 255)
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'textures', 'ripple.png')
Image.fromarray(img).save(out)
print('wrote', os.path.normpath(out))
