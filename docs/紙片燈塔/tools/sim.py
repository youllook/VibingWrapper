# 相似度：成品截圖 vs 目標圖
# 用法：python -I sim.py <成品.png> <目標.png> [差異圖.png]
# 兩張都縮到 836×470 再比：
#   結構 SSIM（灰階，越接近 1 越像）——「相似度 %」就用它
#   色差 ΔE（Lab 平均，< 3 幾乎看不出、< 6 細看才看得出）
# 差異圖：左成品、右目標、下方 SSIM 熱度圖（越紅越不像）
import sys
import cv2
import numpy as np
sys.stdout.reconfigure(encoding='utf-8')

W, H = 836, 470

def load(p):
    im = cv2.imdecode(np.fromfile(p, np.uint8), cv2.IMREAD_COLOR)
    return cv2.resize(im, (W, H), interpolation=cv2.INTER_AREA)

def ssim_map(a, b):
    a, b = a.astype(np.float64), b.astype(np.float64)
    C1, C2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    g = lambda x: cv2.GaussianBlur(x, (11, 11), 1.5)
    ma, mb = g(a), g(b)
    va, vb, cab = g(a * a) - ma * ma, g(b * b) - mb * mb, g(a * b) - ma * mb
    return ((2 * ma * mb + C1) * (2 * cab + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2))

def main(out, ref, diff=None):
    A, B = load(out), load(ref)
    s = ssim_map(cv2.cvtColor(A, cv2.COLOR_BGR2GRAY), cv2.cvtColor(B, cv2.COLOR_BGR2GRAY))
    la, lb = (cv2.cvtColor(x, cv2.COLOR_BGR2LAB).astype(np.float64) for x in (A, B))
    la[..., 0] *= 100 / 255; lb[..., 0] *= 100 / 255
    la[..., 1:] -= 128; lb[..., 1:] -= 128
    de = np.sqrt(((la - lb) ** 2).sum(-1))
    print(f'相似度（SSIM）{s.mean() * 100:.1f}%　平均色差 ΔE {de.mean():.2f}')
    # 3×3 區塊，找哪裡最不像
    for j in range(3):
        print('  ' + '  '.join(f'{s[j*H//3:(j+1)*H//3, i*W//3:(i+1)*W//3].mean()*100:5.1f}%' for i in range(3)))
    if diff:
        heat = cv2.applyColorMap((np.clip(1 - s, 0, 1) * 255).astype(np.uint8), cv2.COLORMAP_JET)
        top = np.hstack([A, B]); bot = np.hstack([heat, cv2.addWeighted(B, 0.4, heat, 0.6, 0)])
        cv2.imencode('.png', np.vstack([top, bot]))[1].tofile(diff)

if __name__ == '__main__':
    main(*sys.argv[1:4])
