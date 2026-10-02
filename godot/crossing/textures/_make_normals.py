# normal maps from the albedo textures (luminance as height, Sobel), tileable (wrap-around)
import numpy as np
from PIL import Image
def normal(src, dst, strength, blur=1):
    im = np.asarray(Image.open(src).convert('L'), dtype=np.float32) / 255.0
    h = im
    for _ in range(blur):
        h = (h + np.roll(h, 1, 0) + np.roll(h, -1, 0) + np.roll(h, 1, 1) + np.roll(h, -1, 1)) / 5.0
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 + (np.roll(np.roll(h, -1, 1), 1, 0) - np.roll(np.roll(h, 1, 1), 1, 0)) * 0.25 + (np.roll(np.roll(h, -1, 1), -1, 0) - np.roll(np.roll(h, 1, 1), -1, 0)) * 0.25
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 + (np.roll(np.roll(h, -1, 0), 1, 1) - np.roll(np.roll(h, 1, 0), 1, 1)) * 0.25 + (np.roll(np.roll(h, -1, 0), -1, 1) - np.roll(np.roll(h, 1, 0), -1, 1)) * 0.25
    n = np.stack([-dx * strength, dy * strength, np.ones_like(h)], -1)   # OpenGL convention (Godot): +Y up
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8)).save(dst)
    print(dst)
normal('ballast.png', 'ballast_n.png', 9.0, 1)
normal('sleeper.png', 'sleeper_n.png', 4.0, 1)
normal('asphalt.png', 'asphalt_n.png', 3.0, 1)
normal('verge.png', 'verge_n.png', 5.0, 1)
normal('crossing_panel.png', 'crossing_panel_n.png', 4.0, 1)
