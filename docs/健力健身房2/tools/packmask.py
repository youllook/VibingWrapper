# 01 遮罩 → 主題貼圖：mask-a.png（R 窗 G 鏡面 B 地上光斑）、mask-b.png（R 燈泡 G 整個地板）
# 用法（repo 根目錄）：python -I docs/健力健身房2/tools/packmask.py docs/健力健身房2/01-拆景 themes/powerlifting-gym-2/textures
from PIL import Image
import sys
S, out = sys.argv[1], sys.argv[2]
L = lambda f: Image.open(S + '/' + f).convert('L')
Image.merge('RGB', [L('mask-windows.png'), L('mask-mirror.png'), L('mask-floor-sun.png')]).save(out + '/mask-a.png')
z = Image.new('L', L('mask-bulbs.png').size, 0)
Image.merge('RGB', [L('mask-bulbs.png'), L('mask-floor.png'), z]).save(out + '/mask-b.png')
