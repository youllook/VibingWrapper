# 在 mc3 上畫分層標註：近景／中近景／中景／遠景（用法：python -I layers.py <mc3.png> <out.png>）
import sys
from PIL import Image, ImageDraw, ImageFont
src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGBA')
ov = Image.new('RGBA', im.size, (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
font = ImageFont.truetype('C:/Windows/Fonts/msjh.ttc', 30)
L = [
  ('遠景', (90, 160, 255), [(0, 0), (1672, 0), (1672, 260), (1000, 200), (760, 180), (0, 130)]),
  ('中景', (255, 215, 60), [(0, 130), (760, 180), (800, 330), (720, 470), (330, 440), (0, 360)]),
  ('中景下層', (255, 215, 60), [(700, 560), (1672, 520), (1672, 941), (720, 941)]),
  ('中近景', (255, 140, 40), [(460, 500), (840, 330), (960, 250), (1240, 290), (1240, 520), (1060, 470), (840, 560), (600, 620)]),
  ('近景', (255, 70, 70), [(0, 360), (220, 410), (460, 520), (640, 620), (720, 941), (0, 941)]),
]
for name, c, poly in L:
    d.polygon(poly, fill=c + (60,), outline=c + (255,), width=4)
    x = sum(p[0] for p in poly) / len(poly); y = sum(p[1] for p in poly) / len(poly)
    d.text((x - 40, y - 18), name, font=font, fill=(255, 255, 255, 255), stroke_width=3, stroke_fill=c + (255,))
Image.alpha_composite(im, ov).convert('RGB').save(out)
