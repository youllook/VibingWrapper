# 礁石逐群拆開，並算出每群該插在哪兩條浪之間：
# 找第一條「浪峰在礁石底部往上 18px 以下」的浪條 j，礁石放在浪 j 後面、浪 j-1 前面（浪 j 蓋住礁石底部 → 浪拍在礁石腳下）。
# 用法：python -I reefsplit.py <layers-full 資料夾> <waves 資料夾>
# 輸出：<waves>/reef{i}.png、<waves>/reefs.json [{file, cx, bottom, behindWave}]
import sys, json
import numpy as np, cv2
from PIL import Image

src, wv = sys.argv[1], sys.argv[2]
reefs = np.array(Image.open(f'{src}/reefs.png').convert('RGBA'))
crests = [np.repeat(np.array(c), 8)[:reefs.shape[1]] for c in json.load(open(f'{wv}/crests.json'))]
a = (reefs[..., 3] > 0).astype(np.uint8)
n, lab, stats, _ = cv2.connectedComponentsWithStats(cv2.dilate(a, np.ones((25, 25), np.uint8)))
out = []
for i in range(1, n):
    x, y, w, h, area = stats[i]
    m = (lab == i) & (a > 0)
    if m.sum() < 200: continue
    ys, xs = np.nonzero(m)
    cx, bottom = int(xs.mean()), int(ys.max())
    j = next((k for k, c in enumerate(crests) if c[cx] > bottom - 18), len(crests))
    r = reefs.copy(); r[~m, 3] = 0
    f = f'reef{len(out)}.png'
    Image.fromarray(r).save(f'{wv}/{f}')
    out.append({'file': f, 'cx': cx, 'bottom': bottom, 'behindWave': j})
json.dump(out, open(f'{wv}/reefs.json', 'w'), indent=1)
for o in out: print(o)
