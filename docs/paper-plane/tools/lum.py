"""亮度分布：python -I lum.py <img>...  印 p5/p25/p50/p75/p95（0–255）"""
import sys, numpy as np
from PIL import Image
for f in sys.argv[1:]:
    a = np.asarray(Image.open(f).convert('L').resize((480, 270))).astype(float)
    print(f.split('/')[-1], [int(np.percentile(a, q)) for q in (5, 25, 50, 75, 95)])
