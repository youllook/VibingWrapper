# 海浪分層：把補完的近海 near.png 沿浪花上緣切成 N 條浪條，每條從浪峰往下到底（後面的條被前面的蓋住）。
# 用法：python -I wavesplit.py <layers-full 資料夾> <輸出資料夾> [條數]
# 輸出：wave0.png（最遠）… waveN-1.png（最近）、crests.json（每條浪峰曲線）、crests.png（疊在近海上的檢查圖）
import sys, json
import numpy as np, cv2
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
N = int(sys.argv[3]) if len(sys.argv) > 3 else 6
near = np.array(Image.open(f'{src}/near.png').convert('RGBA'))
H, W = near.shape[:2]
rgb, a = near[..., :3].astype(float), near[..., 3]
mx, mn = rgb.max(-1), rgb.min(-1)
white = ((mx > 215) & (mx - mn < 45)).astype(np.uint8)
white = cv2.morphologyEx(white, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
# 浪花上緣：往下掃，第一個「下面 6px 大多是白」的位置
dense = cv2.blur(white.astype(np.float32), (5, 6), anchor=(2, 0)) > 0.6
dense[a == 0] = False

y0 = int(np.nonzero(a.any(1))[0].min())   # 近海上緣（海平線附近的切線）
# 浪條基準高度：越近越疏（透視），第 0 條就是近海上緣
t = np.linspace(0, 1, N)
base = y0 + (H - 120 - y0) * t ** 1.35

curves = [np.full(W, float(y0))]
for k in range(1, N):
    win = (base[k] - base[k - 1]) * 0.45
    ys = np.full(W, np.nan)
    lo, hi = int(base[k] - win), int(base[k] + win)
    for x in range(W):
        c = np.nonzero(dense[lo:hi, x])[0]
        if len(c): ys[x] = lo + c[0]
    ok = ~np.isnan(ys)
    ys = np.interp(np.arange(W), np.nonzero(ok)[0], ys[ok]) if ok.sum() > 20 else np.full(W, base[k])
    ys = np.array([np.median(ys[max(0, x - 40):x + 41]) for x in range(W)])            # 先去尖刺（浮標、單朵浪花）
    g = np.exp(-0.5 * (np.arange(-75, 76) / 25.0) ** 2); g /= g.sum()
    ys = np.convolve(np.pad(ys, 75, mode='edge'), g, 'valid')                            # 沿 x 平滑，浪形柔順
    ys = np.maximum(ys, curves[-1] + 18)                                               # 不交叉
    curves.append(ys)

yy = np.arange(H)[:, None]
for k, c in enumerate(curves):
    m = (yy >= (c[None, :] - 3)).astype(np.uint8)   # 往上多留 3px，浪花白邊歸在這條
    w = near.copy(); w[..., 3] = (a * m).astype(np.uint8)
    Image.fromarray(w).save(f'{out}/wave{k}.png')
json.dump([c[::8].round(1).tolist() for c in curves], open(f'{out}/crests.json', 'w'))

dbg = cv2.cvtColor(near[..., :3], cv2.COLOR_RGB2BGR).copy()
for k, c in enumerate(curves):
    pts = np.stack([np.arange(W), c], 1).astype(np.int32)
    cv2.polylines(dbg, [pts], False, (0, 0, 255) if k % 2 else (255, 0, 255), 3)
    cv2.putText(dbg, str(k), (20, int(c[20]) + 30), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 0), 3)
cv2.imwrite(f'{out}/crests.png', dbg)
print('crests at x=500:', [int(c[500]) for c in curves])
