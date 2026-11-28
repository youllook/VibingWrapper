"""並排對照：上＝目標圖、下＝截圖（加 10% 格線）。用法：python -I sbs.py <shot> <out>"""
import sys, os
from PIL import Image, ImageDraw
here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 960, 540
a = Image.open(os.path.join(here, 'target.png')).convert('RGB').resize((W, H))
b = Image.open(sys.argv[1]).convert('RGB').resize((W, H))
out = Image.new('RGB', (W, H * 2))
out.paste(a, (0, 0)); out.paste(b, (0, H))
d = ImageDraw.Draw(out)
for k in range(1, 10):
    for y0 in (0, H):
        d.line([(W * k / 10, y0), (W * k / 10, y0 + H)], fill=(255, 0, 0), width=1)
        d.line([(0, y0 + H * k / 10), (W, y0 + H * k / 10)], fill=(255, 0, 0), width=1)
out.save(sys.argv[2], quality=88)
