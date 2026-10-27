# Makes textures/streak.png, a falling water streak for the drips: a thin bright core fading at both ends, a few
# beads along it. White with the shape in alpha.  python tools/make_streak.py
import os
import numpy as np
from PIL import Image
W, H = 16, 128
g = np.mgrid[0:H, 0:W] + 0.5
y, x = g[0] / H, g[1] / W
core = np.exp(-((x - 0.5) / 0.18) ** 2)
along = np.sin(np.pi * y) ** 0.6
beads = 0.6 + 0.4 * np.clip(np.sin(y * 40.0) * 2.0, 0, 1)
a = np.clip(core * along * beads, 0, 1)
img = np.zeros((H, W, 4), np.uint8)
img[..., :3] = 255
img[..., 3] = np.round(a * 255).astype(np.uint8)
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'textures', 'streak.png')
Image.fromarray(img, 'RGBA').save(out)
print('wrote', os.path.normpath(out))
