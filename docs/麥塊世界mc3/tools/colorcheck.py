# 色彩對比：成品截圖 vs 目標圖，切 8×6 格逐格比平均色（Lab ΔE）與明暗
# 用法：python -I colorcheck.py <成品.png> <目標.png> [差異圖.png]
# 印：每格 ΔE（越小越像）、每格亮度差（+ 表示成品較亮）、整體平均 ΔE、整體亮度標準差（對比）兩邊各多少
import sys
from PIL import Image, ImageDraw, ImageFilter
sys.stdout.reconfigure(encoding='utf-8')
GX, GY = 8, 6

def lab(rgb):
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(float(v)) for v in rgb)
    x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
    f = lambda t: t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    return 116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))

def cells(path):
    im = Image.open(path).convert('RGB').resize((GX * 16, GY * 16), Image.BOX)
    out = []
    for j in range(GY):
        row = []
        for i in range(GX):
            c = im.crop((i * 16, j * 16, i * 16 + 16, j * 16 + 16)).resize((1, 1), Image.BOX).getpixel((0, 0))
            row.append(lab(c))
        out.append(row)
    L = [lab(im.getpixel((x, y)))[0] for y in range(0, im.height, 2) for x in range(0, im.width, 2)]
    m = sum(L) / len(L)
    return out, (sum((v - m) ** 2 for v in L) / len(L)) ** 0.5, m

a, sa, ma = cells(sys.argv[1])
b, sb, mb = cells(sys.argv[2])
dE = [[sum((p - q) ** 2 for p, q in zip(a[j][i], b[j][i])) ** 0.5 for i in range(GX)] for j in range(GY)]
print('每格 ΔE')
for r in dE: print(' '.join(f'{v:5.1f}' for v in r))
print('每格亮度差 L（+ 成品較亮）')
for j in range(GY): print(' '.join(f'{a[j][i][0] - b[j][i][0]:+5.1f}' for i in range(GX)))
print(f'平均 ΔE {sum(map(sum, dE)) / (GX * GY):.1f}　亮度 成品 {ma:.1f}／目標 {mb:.1f}　對比(L 標準差) 成品 {sa:.1f}／目標 {sb:.1f}')
if len(sys.argv) > 3:
    W, H = 836, 470
    A = Image.open(sys.argv[1]).convert('RGB').resize((W, H)); B = Image.open(sys.argv[2]).convert('RGB').resize((W, H))
    c = Image.new('RGB', (W * 2, H)); c.paste(A, (0, 0)); c.paste(B, (W, 0))
    d = ImageDraw.Draw(c)
    for j in range(GY):
        for i in range(GX):
            v = dE[j][i]; col = (80, 220, 90) if v < 10 else (240, 200, 60) if v < 20 else (240, 70, 70)
            x0, y0 = i * W // GX, j * H // GY
            d.rectangle([x0, y0, x0 + W // GX, y0 + H // GY], outline=col, width=1)
            d.text((x0 + 4, y0 + 3), f'{v:.0f}', fill=col)
    c.save(sys.argv[3])
