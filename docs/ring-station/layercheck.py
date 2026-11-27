"""步驟 3 擺景驗收：把灰模的分層遮罩（main.js ?ids=1 → theme.mask()）跟 Codex 拆的四層標準答案逐層算 IoU。
用法：python -I layercheck.py <mask.png> <layers 資料夾> [<輸出對照圖.png>]
遮罩顏色：紅＝鏡頭層、綠＝近景、藍＝城市、黑＝天空。
"""
import sys
import numpy as np
from PIL import Image

W, H = 480, 270
NAMES = [('L0_frame', 'frame'), ('L1_near', 'near'), ('L2_city', 'city'), ('L3_sky', 'sky')]


def ours(path):
    a = np.asarray(Image.open(path).convert('RGB').resize((W, H), Image.NEAREST)).astype(int)
    r, g, b = a[..., 0] > 127, a[..., 1] > 127, a[..., 2] > 127
    lab = np.full((H, W), 3)          # 天空
    lab[b & ~r & ~g] = 2
    lab[g & ~r & ~b] = 1
    lab[r & ~g & ~b] = 0
    return lab


def truth(folder):
    lab = np.full((H, W), 3)
    # 由遠到近蓋上去：跨層的歸最前層
    for i in (2, 1, 0):
        al = np.asarray(Image.open(f'{folder}/{NAMES[i][0]}.png').convert('RGBA').resize((W, H), Image.BILINEAR))[..., 3]
        lab[al > 127] = i
    return lab


def main():
    mine, gt = ours(sys.argv[1]), truth(sys.argv[2])
    scores = []
    for i, (_, n) in enumerate(NAMES):
        a, b = mine == i, gt == i
        u = (a | b).sum()
        iou = (a & b).sum() / u if u else 1.0
        scores.append(iou)
        print(f'{n:6s} IoU {iou:6.1%}   ours {a.mean():5.1%}  target {b.mean():5.1%}')
    acc = (mine == gt).mean()
    print(f'pixel agreement {acc:.1%}   mean IoU {np.mean(scores):.1%}')
    if len(sys.argv) > 3:
        pal = np.array([[230, 60, 60], [60, 200, 90], [70, 110, 230], [25, 25, 30]], np.uint8)
        diff = np.where((mine == gt)[..., None], pal[gt] // 3, pal[mine])
        Image.fromarray(np.concatenate([pal[mine], pal[gt], diff], 1)).save(sys.argv[3])


main()
