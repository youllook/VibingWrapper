# 對照拼圖：python -I grid.py out.jpg cols x,y,w,h 標籤1=圖1 標籤2=圖2 ...（每張裁同一塊、左上角標字）
import sys
from PIL import Image, ImageDraw, ImageFont
out, cols, box = sys.argv[1], int(sys.argv[2]), [int(v) for v in sys.argv[3].split(',')]
items = [a.split('=', 1) for a in sys.argv[4:]]
x, y, w, h = box
font = ImageFont.truetype('C:/Windows/Fonts/msjh.ttc', 26)
rows = (len(items) + cols - 1) // cols
g = Image.new('RGB', (w * cols, h * rows))
for i, (lab, f) in enumerate(items):
    im = Image.open(f).convert('RGB').crop((x, y, x + w, y + h))
    d = ImageDraw.Draw(im); d.rectangle((0, 0, 14 + d.textlength(lab, font=font), 40), fill=(0, 0, 0)); d.text((7, 4), lab, font=font, fill=(255, 255, 255))
    g.paste(im, ((i % cols) * w, (i // cols) * h))
g.save(out, quality=88)
