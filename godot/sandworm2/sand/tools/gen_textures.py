# sand/tools/gen_textures.py — bakes the sand family's textures into sand/textures/ (run: python sand/tools/gen_textures.py)
#   dune_hn.png   1024² RGBA, tiles every 2048 m: R = dune height 0..1 (× DUNE_H m), G/B = dh/dx, dh/dz (0.5 + g/0.8), A = 255
#   puff.png      512² RGBA 2×2 atlas of soft billowy dust puffs (white, alpha = density)
#   streak.png    128×512 L, vertical sand-fall streaks, tiles in y
#   grain.png     256² L, tileable fine sand grain / blotch noise
import os
import numpy as np
from PIL import Image

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "textures")
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)


def periodic_noise(n, cells, rng, octaves=1, gain=0.5):
	"""tileable smooth value noise on an n×n grid, `cells` lattice cells across (doubled per octave)"""
	acc = np.zeros((n, n))
	amp, tot = 1.0, 0.0
	for o in range(octaves):
		c = cells * (2 ** o)
		lat = rng.random((c, c))
		t = np.arange(n) * c / n
		i0 = np.floor(t).astype(int)
		f = t - i0
		f = f * f * (3 - 2 * f)
		i1 = (i0 + 1) % c
		a = lat[np.ix_(i0, i0)]
		b = lat[np.ix_(i0, i1)]
		cc = lat[np.ix_(i1, i0)]
		d = lat[np.ix_(i1, i1)]
		fy = f[:, None]
		fx = f[None, :]
		acc += amp * ((a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + d * fx) * fy)
		tot += amp
		amp *= gain
	return acc / tot


# ---------- dunes ----------
N = 1024
TILE = 2048.0
DUNE_H = 12.0  # metres for R = 1 (must match dunes.gd DUNE_H)
px = TILE / N
z, x = np.mgrid[0:N, 0:N] * px  # row = z, col = x


def dune_family(kx, kz, warp_amp, amp_cells, seed, sharp=0.78):
	r = np.random.default_rng(seed)
	wx = (periodic_noise(N, 4, r, 3) - 0.5) * 2
	wz = (periodic_noise(N, 4, r, 3) - 0.5) * 2
	# phase along the wind, warped so crests snake
	ph = (kx * (x + warp_amp * wx) + kz * (z + warp_amp * wz)) / TILE
	t = ph - np.floor(ph)
	# asymmetric profile: long gentle windward rise (0..sharp), short steep slip face
	up = np.clip(t / sharp, 0, 1)
	dn = np.clip((1 - t) / (1 - sharp), 0, 1)
	prof = np.where(t < sharp, np.sin(up * np.pi / 2) ** 1.6, dn ** 1.3)
	m = periodic_noise(N, amp_cells, r, 2)
	m = np.clip((m - 0.25) / 0.6, 0, 1)
	return prof * (0.35 + 0.65 * m)


h = 0.70 * dune_family(5, 8, 120.0, 3, 11) + 0.18 * dune_family(-3, 13, 70.0, 5, 23, 0.7)
h += 0.22 * periodic_noise(N, 3, rng, 3) + 0.06 * periodic_noise(N, 24, rng, 2)
# soften: a tiny blur on the crest so it isn't a pixel-sharp kink
k = np.array([1, 4, 6, 4, 1], float); k /= k.sum()
for ax in (0, 1):
	h = sum(np.roll(h, i - 2, axis=ax) * k[i] for i in range(5))
h = (h - h.min()) / (h.max() - h.min())
hm = h * DUNE_H
gx = (np.roll(hm, -1, 1) - np.roll(hm, 1, 1)) / (2 * px)
gz = (np.roll(hm, -1, 0) - np.roll(hm, 1, 0)) / (2 * px)
print("dune slope max", np.abs(gx).max(), np.abs(gz).max())
rgba = np.stack([
	h * 255,
	np.clip(0.5 + gx / 0.8, 0, 1) * 255,
	np.clip(0.5 + gz / 0.8, 0, 1) * 255,
	np.full_like(h, 255),
], -1)
Image.fromarray(np.round(rgba).astype(np.uint8), "RGBA").save(os.path.join(OUT, "dune_hn.png"))

# ---------- puff atlas ----------
P = 256
yy, xx = (np.mgrid[0:P, 0:P] + 0.5) / P * 2 - 1
atlas = np.zeros((2 * P, 2 * P))
for idx in range(4):
	r = np.random.default_rng(100 + idx)
	n = periodic_noise(P, 4, r, 5, 0.55)
	# several overlapping lobes → a cauliflower billow, not a disc
	n2 = periodic_noise(P, 8, r, 4, 0.6)
	# round puff whose rim is pushed in and out by noise → a lumpy billow edge; density varies inside
	dist = np.sqrt(xx ** 2 + (yy * 1.08) ** 2) + (n - 0.5) * 0.55
	t = np.clip((0.7 - dist) / 0.5, 0, 1)
	a = t * t * (3 - 2 * t) * (0.55 + 0.45 * n2)
	a *= np.clip((1 - np.sqrt(xx ** 2 + yy ** 2)) / 0.15, 0, 1)  # never touch the quad border
	oy, ox = divmod(idx, 2)
	atlas[oy * P:(oy + 1) * P, ox * P:(ox + 1) * P] = a
img = np.stack([np.full_like(atlas, 255)] * 3 + [atlas * 255], -1)
Image.fromarray(np.round(img).astype(np.uint8), "RGBA").save(os.path.join(OUT, "puff.png"))

# ---------- streaks (columns of falling sand) ----------
W, H = 128, 512
r = np.random.default_rng(5)
col = np.zeros(W)
for _ in range(40):
	c = r.uniform(0, W)
	w = r.uniform(1.0, 6.0)
	d = np.minimum(np.abs(np.arange(W) - c), W - np.abs(np.arange(W) - c))
	col = np.maximum(col, r.uniform(0.3, 1.0) * np.exp(-(d / w) ** 2))
# vertical clumping: stretch a periodic noise along y
nz = periodic_noise(512, 8, r, 4)
nz = np.array(Image.fromarray((nz * 255).astype(np.uint8)).resize((W, H), Image.BILINEAR)) / 255.0
st = np.clip(col[None, :] * (0.45 + 0.9 * nz), 0, 1)
Image.fromarray(np.round(st * 255).astype(np.uint8), "L").save(os.path.join(OUT, "streak.png"))

# ---------- grain ----------
#   grain.png RGB: R = fine grain (blotches + white noise), G = smooth fbm (8 cells), B = smooth fbm (3 cells)
def norm(a):
	return (a - a.min()) / (a.max() - a.min())
g = norm(0.55 * periodic_noise(256, 32, rng, 3) + 0.45 * rng.random((256, 256)))
g2 = norm(periodic_noise(256, 8, rng, 4))
g3 = norm(periodic_noise(256, 3, rng, 4))
Image.fromarray(np.round(np.stack([g, g2, g3], -1) * 255).astype(np.uint8), "RGB").save(os.path.join(OUT, "grain.png"))
print("ok")
