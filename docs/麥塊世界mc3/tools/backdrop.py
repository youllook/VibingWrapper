# 背景貼圖：Codex 遠景＋中景扣圖疊起來，前景／中近景挖掉的洞用 OpenCV 修補（先縮小修補再放大，只填洞）
# 2026-10-29 拆成兩層做視差，另出一張輔助圖給重打光與狀態特效：
#   backdrop-mid.webp  中景層（RGBA）：疊好修好的整張圖，alpha＝中景扣圖＋前景洞（鏡頭不動時兩層疊起來＝原本整張）
#   backdrop-far.webp  遠景層：遠景扣圖，被中景／前景擋住的地方修補（只在鏡頭晃動時從中景邊緣露出一點）
#   backdrop-aux.png   半解析度；R、G＝畫面空間法線 xy（從模糊亮度推的假高度）、B＝受光面遮罩（暖色亮面）、A＝發光晶塊遮罩
# 用法：python -I backdrop.py <扣圖資料夾> <輸出資料夾>
import sys
import numpy as np, cv2
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
f = Image.open(f'{src}/codex-遠景.png').convert('RGBA'); m = Image.open(f'{src}/codex-中景.png').convert('RGBA')

def inpaint(rgb, hole, k=4):
    small = cv2.resize(rgb, None, fx=1 / k, fy=1 / k, interpolation=cv2.INTER_AREA); sh = cv2.resize(hole, small.shape[1::-1], interpolation=cv2.INTER_NEAREST)
    fill = cv2.inpaint(small, sh, 12, cv2.INPAINT_TELEA)
    fill = cv2.GaussianBlur(cv2.resize(fill, rgb.shape[1::-1], interpolation=cv2.INTER_CUBIC), (0, 0), 6)
    return np.where(hole[:, :, None] > 0, fill, rgb)

c = np.array(Image.alpha_composite(f, m)); rgb = cv2.cvtColor(c[:, :, :3], cv2.COLOR_RGB2BGR); hole = (c[:, :, 3] < 128).astype(np.uint8) * 255
hole = cv2.dilate(hole, np.ones((5, 5), np.uint8))   # 扣圖邊緣常帶前景殘色，洞往外多吃一點
# 洞附近 60px 內「受光末地石黃」的像素也當洞（Codex 把目標圖前景斷崖的亮邊留在中景層裡）
near = cv2.dilate(hole, np.ones((121, 121), np.uint8)) > 0
R, G, B = (c[:, :, i].astype(int) for i in range(3))
yellow = (R > 150) & (G > 120) & (R - B > 35)
yellow = cv2.dilate(yellow.astype(np.uint8), np.ones((7, 7), np.uint8)) > 0   # 反鋸齒的淡邊一起吃掉
hole = np.where(near & yellow, 255, hole).astype(np.uint8)
hole = cv2.morphologyEx(hole, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
full = inpaint(rgb, hole)   # 整張（BGR）

# 中景層 alpha：中景扣圖（去掉零星雜點）＋前景洞，邊緣羽化 1.5px
ma = (np.array(m)[:, :, 3] > 128).astype(np.uint8) * 255
ma = cv2.morphologyEx(ma, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
ma = np.maximum(ma, hole)
ma = cv2.GaussianBlur(ma, (0, 0), 1.5)
cv2.imencode('.webp', np.dstack([full, ma]), [cv2.IMWRITE_WEBP_QUALITY, 92])[1].tofile(f'{out}/backdrop-mid.webp')

# 遠景層：遠景扣圖以外（含中景、前景）全部修補；洞往外多吃 9px，中景邊緣晃開時露出的是乾淨的天
fa = np.array(f); fhole = cv2.dilate(((fa[:, :, 3] < 128) | (ma > 8)).astype(np.uint8) * 255, np.ones((9, 9), np.uint8))
far = inpaint(cv2.cvtColor(fa[:, :, :3], cv2.COLOR_RGB2BGR), fhole, k=8)
cv2.imencode('.webp', far, [cv2.IMWRITE_WEBP_QUALITY, 90])[1].tofile(f'{out}/backdrop-far.webp')

# 輔助圖
L = cv2.cvtColor(full, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
h = cv2.GaussianBlur(L, (0, 0), 2.5)
gx = cv2.Sobel(h, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(h, cv2.CV_32F, 0, 1, ksize=3)
k = 6.0; nx, ny = -gx * k, gy * k   # 影像 y 往下，畫面法線 y 往上
nz = np.ones_like(nx); ln = np.sqrt(nx * nx + ny * ny + nz * nz); nx, ny = nx / ln, ny / ln
b, g, r = (full[:, :, i].astype(np.float32) for i in range(3))
lit = np.clip((r - b - 15) / 40, 0, 1) * np.clip((r - 120) / 60, 0, 1)   # 暖色亮面＝被主光照到的末地石頂面、側面
lit = cv2.GaussianBlur(lit, (0, 0), 1.2)
glow = np.clip((r - 170) / 50, 0, 1) * np.clip((b - 170) / 50, 0, 1) * np.clip((r - g - 40) / 40, 0, 1)   # 粉紫高亮＝晶塊
glow = cv2.GaussianBlur(cv2.dilate(glow, np.ones((3, 3), np.uint8)), (0, 0), 1.5)
aux = np.dstack([(nx * 0.5 + 0.5), (ny * 0.5 + 0.5), lit, np.clip(glow * 1.5, 0, 1)]) * 255
# 用 cv2 縮（PIL 縮 RGBA 會先乘 alpha，晶塊以外的法線、受光面全變 0）
Image.fromarray(cv2.resize(aux.astype(np.uint8), (full.shape[1] // 2, full.shape[0] // 2), interpolation=cv2.INTER_AREA), 'RGBA').save(f'{out}/backdrop-aux.png', optimize=True)
print('ok', full.shape, 'lit', round(float(lit.mean()), 3), 'glow', round(float(glow.mean()), 4))
