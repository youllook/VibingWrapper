# 浪條裁底：第 k 條浪只需要畫到「第 k+1 條浪峰往下 MARGIN px」，再往下一定被前一條（不透明）蓋住。
# 6 條都延伸到畫面底部時，下半部每個像素要畫 6 次（加上影子 12 次），內顯光填色就超過預算。
# 用法：python -I wavecrop.py <waves 資料夾> [margin]   （在 wavesplit.py 之後跑；會覆寫 wave*.png）
import sys, json
import numpy as np
from PIL import Image

d = sys.argv[1]
MARGIN = int(sys.argv[2]) if len(sys.argv) > 2 else 40   # 浪幅最大 5px×暴風雨 2 倍，兩條反向 ≈ 20px，留一倍
crests = json.load(open(f'{d}/crests.json'))
for k in range(len(crests) - 1):
    im = np.array(Image.open(f'{d}/wave{k}.png').convert('RGBA'))
    H, W = im.shape[:2]
    nxt = np.interp(np.arange(W), np.arange(len(crests[k + 1])) * 8, crests[k + 1])
    cut = np.minimum(H, np.ceil(nxt + MARGIN)).astype(int)
    rows = np.arange(H)[:, None]
    before = int((im[..., 3] > 0).sum())
    im[..., 3][rows >= cut[None, :]] = 0
    Image.fromarray(im).save(f'{d}/wave{k}.png')
    print(f'wave{k}: 不透明像素 {before} → {int((im[..., 3] > 0).sum())}，底到 y<={cut.max()}')
