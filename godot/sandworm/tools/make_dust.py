"""tools/make_dust.py — textures/dust.png: a soft billow of dust (white, alpha = density) for the plume, the dust wall
and the dust devils; noisy edges so overlapping billows don't read as discs."""
import numpy as np
from PIL import Image

N = 256
rng = np.random.default_rng(7)


def noise(octaves=5):
    acc = np.zeros((N, N))
    amp = 1.0
    for o in range(octaves):
        k = 4 * 2 ** o
        g = rng.random((k + 1, k + 1))
        x = np.linspace(0, k, N, endpoint=False)
        i = x.astype(int)
        f = x - i
        f = f * f * (3 - 2 * f)
        a = g[i][:, i] * (1 - f)[None, :] + g[i][:, i + 1] * f[None, :]
        b = g[i + 1][:, i] * (1 - f)[None, :] + g[i + 1][:, i + 1] * f[None, :]
        acc += amp * (a * (1 - f)[:, None] + b * f[:, None])
        amp *= 0.5
    return acc / acc.max()


y, x = np.mgrid[0:N, 0:N] / (N - 1) * 2 - 1
r = np.sqrt(x * x + y * y)
n = noise()
d = np.clip(1.0 - (r + (n - 0.5) * 0.55), 0, 1) ** 2.2
d *= np.clip(0.55 + 0.6 * n, 0, 1)
d = np.clip(d * 1.1, 0, 1)
shade = np.clip(0.92 + 0.15 * (n - 0.5) - 0.12 * y, 0, 1)    # a little lighter at the top
img = np.dstack([shade, shade, shade, d]) * 255
Image.fromarray(img.astype(np.uint8), "RGBA").save("textures/dust.png")
print("dust.png", d.mean())
