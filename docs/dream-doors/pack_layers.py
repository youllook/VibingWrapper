"""把六個世界的拆景結果（E:/Tools/scene-split）打包成夢境之門用的圖集。
用法：python -I pack_layers.py [拆景根目錄]
輸出到 themes/dream-doors/tex/：
  layers_L0.webp … layers_L3.webp：第 k 層的六個世界由上而下疊成一張（2048 × 878·6），L0 不透明、其餘帶透明
  layers_n.webp：L1–L3 的法線（1024 × 439·18；第 (k-1)·6 + 世界列）
  layers.js：每個世界每層的「1/相對距離」（天空＝0），給 shader 算視差（用 import 載入）
世界列的順序跟 main.js 的 PANOS 一樣：coast, lantern, moonlake, snow, wheat, clouds。"""
import json, os, sys, numpy as np, cv2
from PIL import Image

ROOT = sys.argv[1] if len(sys.argv) > 1 else 'E:/Tools/scene-split/test'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'themes', 'dream-doors', 'tex')
NAMES = ['coast', 'lantern', 'moonlake', 'snow', 'wheat', 'clouds']
W, H, NW, NH, K = 2048, 878, 1024, 439, 4

col = [np.zeros((H * 6, W, 4), np.uint8) for _ in range(K)]
nrm = np.zeros((NH * 6 * (K - 1), NW, 3), np.uint8); nrm[...] = (128, 128, 255)
inv = []
for r, n in enumerate(NAMES):
    d = os.path.join(ROOT, f'world_{n}_layers')
    meta = json.load(open(os.path.join(d, 'layers.json'), encoding='utf-8'))
    L = meta['layers']; assert len(L) == K, (n, len(L))
    inv.append([0 if l['distance'] is None else round(1 / l['distance'], 4) for l in L])
    for k, l in enumerate(L):
        im = cv2.imread(os.path.join(d, l['file']), cv2.IMREAD_UNCHANGED)
        if im.shape[2] == 3: im = np.dstack([im, np.full(im.shape[:2], 255, np.uint8)])
        im = cv2.resize(im, (W, H), interpolation=cv2.INTER_AREA)
        if k == 0: im[..., 3] = 255
        else:  # 透明處的顏色往外延伸（正規化模糊），線性取樣時邊緣才不會滲進黑邊
            a = im[..., 3:4].astype(np.float32) / 255; c = im[..., :3].astype(np.float32)
            num, den = c * a, a.copy()
            for s in (3, 9, 27):
                num = np.where(den > 0.999, num, cv2.GaussianBlur(num, (0, 0), s).reshape(num.shape) * (1 - den) + num)
                den = np.where(den > 0.999, den, np.clip(cv2.GaussianBlur(den, (0, 0), s).reshape(den.shape) * (1 - den) + den, 0, 1))
            fill = num / np.maximum(den, 1e-4)
            im[..., :3] = np.where(a > 0.99, c, fill).clip(0, 255).astype(np.uint8)
        col[k][r * H:(r + 1) * H] = cv2.cvtColor(im, cv2.COLOR_BGRA2RGBA)
        if k > 0:
            nm = cv2.resize(cv2.imread(os.path.join(d, l['normal']), cv2.IMREAD_COLOR), (NW, NH), interpolation=cv2.INTER_AREA)
            row = (k - 1) * 6 + r
            nrm[row * NH:(row + 1) * NH] = cv2.cvtColor(nm, cv2.COLOR_BGR2RGB)
    print(n, inv[-1], meta['horizon'])

for k in range(K):
    im = Image.fromarray(col[k] if k else col[k][..., :3])
    im.save(os.path.join(OUT, f'layers_L{k}.webp'), quality=86, alpha_quality=100, method=6)
Image.fromarray(nrm).save(os.path.join(OUT, 'layers_n.webp'), quality=90, method=6)
with open(os.path.join(OUT, 'layers.js'), 'w', encoding='utf-8') as f:   # 用 import 載入（桌布可能是 file://，不能 fetch）
    f.write('// pack_layers.py 產生：每個世界（coast, lantern, moonlake, snow, wheat, clouds）四層的 1/相對距離，最近層＝1、天空＝0\n')
    f.write('export const LAYER_INV = ' + json.dumps(inv) + ';\n')
for f in sorted(os.listdir(OUT)):
    if f.startswith('layers'): print(f, os.path.getsize(os.path.join(OUT, f)) // 1024, 'KB')
