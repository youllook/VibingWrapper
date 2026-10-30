# 健力健身房：從底圖抽發光遮罩
# 用法（worktree 根目錄）：python -I "docs/健力健身房/tools/masks.py"
# 輸入：docs/健力健身房/01-拆景/codex-白板空白.png（1672×941）
# 輸出：
#   themes/powerlifting-gym/textures/backdrop.webp   底圖（品質 90）
#   themes/powerlifting-gym/textures/mask-glow.png   RGBA 遮罩：R＝霓虹字、G＝鎢絲燈泡光暈、B＝高窗亮面、A＝裁判燈燈面
#   docs/健力健身房/02-素材/fx-masks.png             檢查圖（四通道著色疊在壓暗的底圖上）
# 座標（像素，左上原點）會印出來，抄進 02-素材/fx.md
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / 'docs/健力健身房/01-拆景/codex-白板空白.png'
TEX = ROOT / 'themes/powerlifting-gym/textures'
CHECK = ROOT / 'docs/健力健身房/02-素材/fx-masks.png'

# ---- 手動量的範圍（像素） ----
NEON_BOX = (1436, 168, 1612, 276)            # 霓虹字外框 x0,y0,x1,y1
WINDOW_POLYS = [                              # 高窗（含左側鏡子裡映出來的窗）
    [(395, 0), (560, 0), (560, 60), (395, 30)],            # 左上兩扇（被梁切掉一半）
    [(600, 0), (975, 140), (975, 270), (600, 135)],        # 主高窗一排（斜向右下）
    [(95, 325), (375, 315), (380, 455), (95, 455)],        # 鏡中窗（左）
    [(470, 385), (525, 385), (525, 455), (470, 455)],      # 鏡中窗（右）
]
BULBS = [                                     # 鎢絲燈泡（自動找亮點後，人工挑過）
    ('fan', 1190, 188), ('mirrorL', 18, 231), ('mirrorM', 346, 247),
    ('mirrorR1', 506, 281), ('mirrorR2', 506, 318), ('mirrorLow', 14, 393),
]
JUDGE_SEARCH = (1095, 615, 1255, 680)         # 裁判燈搜尋範圍
WB_SEARCH = (1365, 285, 1672, 560)            # 白板搜尋範圍


def soft(m, k):
    """0..1 遮罩邊緣柔化"""
    k = int(k) | 1
    return cv2.GaussianBlur(m.astype(np.float32), (k, k), 0)


def main():
    rgb = np.array(Image.open(SRC).convert('RGB'))
    H, W = rgb.shape[:2]
    assert (W, H) == (1672, 941), (W, H)
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    hh, ss, vv = [hsv[..., i].astype(np.float32) for i in range(3)]
    lum = rgb.astype(np.float32) @ np.array([0.299, 0.587, 0.114], np.float32)
    out = {}

    # ---- R：霓虹字 ----
    x0, y0, x1, y1 = NEON_BOX
    box = np.zeros((H, W), np.float32); box[y0:y1, x0:x1] = 1
    red = ((hh < 8) | (hh > 170)).astype(np.float32)
    core = np.clip((vv - 200) / 50, 0, 1) * box                  # 燈管本體（偏白）
    tube = np.clip((vv - 185) / 50, 0, 1) * red * box * np.clip((ss - 120) / 80, 0, 1)
    R = np.maximum(core, tube * 0.8)
    R = np.maximum(R, soft(R, 7) * 0.7)                           # 燈管周圍小光暈
    R = np.clip(R, 0, 1)
    ys, xs = np.nonzero(core > 0.5)
    out['neon'] = dict(box=[int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())])

    # ---- G：燈泡 ----
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    G = np.zeros((H, W), np.float32)
    bulbs = []
    for name, bx, by in BULBS:
        # 在附近 12px 找最亮的重心修正位置
        r = 12
        sub = lum[by - r:by + r, max(bx - r, 0):bx + r]
        w = np.clip(sub - 200, 0, None)
        if w.sum() > 0:
            gy, gx = np.mgrid[by - r:by + r, max(bx - r, 0):bx + r]
            bx, by = float((gx * w).sum() / w.sum()), float((gy * w).sum() / w.sum())
        d2 = (xx - bx) ** 2 + (yy - by) ** 2
        halo = np.exp(-d2 / (2 * 14.0 ** 2)) * 0.55                  # 光暈
        near = (d2 < 18 ** 2).astype(np.float32)
        bcore = np.clip((lum - 170) / 60, 0, 1) * near                  # 燈泡玻璃
        G = np.maximum(G, np.maximum(halo, bcore))
        bulbs.append(dict(name=name, x=round(bx, 1), y=round(by, 1)))
    out['bulbs'] = bulbs

    # ---- B：高窗亮面 ----
    poly = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(poly)
    for p in WINDOW_POLYS:
        d.polygon(p, fill=255)
    poly = np.array(poly, np.float32) / 255
    warm = np.clip((lum - 150) / 70, 0, 1)
    B = soft(warm * poly, 5)
    ys, xs = np.nonzero(B > 0.4)
    out['windows'] = dict(polys=WINDOW_POLYS, bbox=[int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())])

    # ---- A：裁判燈（亮度找三個圓） ----
    x0, y0, x1, y1 = JUDGE_SEARCH
    m = np.zeros((H, W), np.uint8)
    m[y0:y1, x0:x1] = (vv[y0:y1, x0:x1] > 150).astype(np.uint8)
    n, lab, st, cen = cv2.connectedComponentsWithStats(m)
    idx = sorted([i for i in range(1, n) if st[i, 4] > 300], key=lambda i: cen[i][0])
    assert len(idx) == 3, [st[i] for i in range(1, n)]
    A = np.zeros((H, W), np.float32)
    judges = []
    for name, i in zip(('left', 'center', 'right'), idx):
        cx, cy = cen[i]
        rad = float(np.sqrt(st[i, 4] / np.pi))
        d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
        A = np.maximum(A, np.clip((rad + 1.5 - d) / 3, 0, 1))      # 1.5px 軟邊
        judges.append(dict(name=name, x=round(float(cx), 1), y=round(float(cy), 1), r=round(rad, 1)))
    out['judges'] = judges

    # ---- 白板四角（可寫字區） ----
    x0, y0, x1, y1 = WB_SEARCH
    m = np.zeros((H, W), np.uint8)
    m[y0:y1, x0:x1] = ((vv[y0:y1, x0:x1] > 95) & (ss[y0:y1, x0:x1] < 150)).astype(np.uint8) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = max(cs, key=cv2.contourArea).reshape(-1, 2).astype(np.float32)
    s, df = c.sum(1), c[:, 0] - c[:, 1]
    tl, br = c[s.argmin()], c[s.argmax()]
    tr, bl = c[df.argmax()], c[df.argmin()]
    out['whiteboard'] = dict(tl=tl.tolist(), tr=tr.tolist(), br=br.tolist(), bl=bl.tolist())

    # ---- 輸出 ----
    TEX.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgb).save(TEX / 'backdrop.webp', quality=90, method=6)
    rgba = np.stack([R, G, B, A], -1)
    Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA').save(TEX / 'mask-glow.png', optimize=True)

    # 檢查圖：底圖壓暗 35%，四通道各著色加上去
    base = rgb.astype(np.float32) * 0.35
    cols = {'R': (255, 40, 200), 'G': (255, 230, 0), 'B': (0, 200, 255), 'A': (0, 255, 80)}
    for ch, mk in zip('RGBA', (R, G, B, A)):
        base = base * (1 - mk[..., None] * 0.75) + np.array(cols[ch], np.float32) * mk[..., None] * 0.75
    img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    wb = out['whiteboard']
    d.polygon([tuple(wb[k]) for k in ('tl', 'tr', 'br', 'bl')], outline=(255, 255, 255))
    d.rectangle(out['neon']['box'], outline=(255, 40, 200))
    for j in judges:
        d.ellipse([j['x'] - j['r'], j['y'] - j['r'], j['x'] + j['r'], j['y'] + j['r']], outline=(255, 255, 255))
    fan = FAN
    d.ellipse([fan['x'] - fan['rx'], fan['y'] - fan['ry'], fan['x'] + fan['rx'], fan['y'] + fan['ry']], outline=(255, 140, 0))
    d.line([(fan['rodTop'][0], fan['rodTop'][1]), (fan['x'], fan['y'])], fill=(255, 140, 0), width=2)
    d.text((10, 10), 'R neon=magenta  G bulbs=yellow  B windows=cyan  A judge=green  white=whiteboard/judge  orange=fan', fill=(255, 255, 255))
    CHECK.parent.mkdir(parents=True, exist_ok=True)
    img.save(CHECK)
    out['fan'] = FAN
    print(json.dumps(out, ensure_ascii=False, indent=1))


# 吊扇：目測量（扇葉轉動面在畫面上是扁橢圓）
FAN = dict(x=1120, y=74, rx=230, ry=80, rodTop=[1116, 0])

if __name__ == '__main__':
    main()
