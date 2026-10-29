# 背景貼圖：Codex 遠景＋中景扣圖疊起來，前景／中近景挖掉的洞用 OpenCV 修補（先縮小修補再放大，只填洞）
# 用法：python -I backdrop.py <扣圖資料夾> <輸出.jpg>
import sys
import numpy as np, cv2
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
f = Image.open(f'{src}/codex-遠景.png').convert('RGBA'); m = Image.open(f'{src}/codex-中景.png').convert('RGBA')
c = np.array(Image.alpha_composite(f, m)); rgb = cv2.cvtColor(c[:, :, :3], cv2.COLOR_RGB2BGR); hole = (c[:, :, 3] < 128).astype(np.uint8) * 255
hole = cv2.dilate(hole, np.ones((5, 5), np.uint8))   # 扣圖邊緣常帶前景殘色，洞往外多吃一點
# 洞附近 60px 內「受光末地石黃」的像素也當洞（Codex 把目標圖前景斷崖的亮邊留在中景層裡）
near = cv2.dilate(hole, np.ones((121, 121), np.uint8)) > 0
R, G, B = (c[:, :, i].astype(int) for i in range(3))
yellow = (R > 150) & (G > 120) & (R - B > 35)
yellow = cv2.dilate(yellow.astype(np.uint8), np.ones((7, 7), np.uint8)) > 0   # 反鋸齒的淡邊一起吃掉
hole = np.where(near & yellow, 255, hole).astype(np.uint8)
hole = cv2.morphologyEx(hole, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
k = 4; small = cv2.resize(rgb, None, fx=1 / k, fy=1 / k, interpolation=cv2.INTER_AREA); sh = cv2.resize(hole, small.shape[1::-1], interpolation=cv2.INTER_NEAREST)
fill = cv2.inpaint(small, sh, 12, cv2.INPAINT_TELEA)
fill = cv2.GaussianBlur(cv2.resize(fill, rgb.shape[1::-1], interpolation=cv2.INTER_CUBIC), (0, 0), 6)
res = np.where(hole[:, :, None] > 0, fill, rgb)
cv2.imencode('.jpg', res, [cv2.IMWRITE_JPEG_QUALITY, 92])[1].tofile(out)
print('ok', res.shape)
