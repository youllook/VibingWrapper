"""狀態對照格：python -I grid.py <out> <png>... （每張下方標檔名）"""
import sys
from PIL import Image, ImageDraw
fs = sys.argv[2:]; W, H = 640, 360; cols = 2; rows = (len(fs) + 1) // 2
o = Image.new('RGB', (W * cols, (H + 24) * rows), 'white'); d = ImageDraw.Draw(o)
for i, f in enumerate(fs):
    x, y = (i % cols) * W, (i // cols) * (H + 24)
    o.paste(Image.open(f).convert('RGB').resize((W, H)), (x, y)); d.text((x + 8, y + H + 6), f.split('/')[-1], fill='black')
o.save(sys.argv[1], quality=86)
