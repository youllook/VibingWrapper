# 白板字貼回底圖檢查：把 fx.js 畫出來的透明墨水層（1024×640）用透視變換貼到底圖白板四角
# 用法：python -I "docs/健力健身房/tools/wb_onbg.py" <墨水 png> [輸出 png]
# 墨水 png 取法（electron 拍頁時用 EVAL 把 canvas 轉 dataURL）見 02-素材/fx.md
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
BG = ROOT / 'docs/健力健身房/01-拆景/codex-白板空白.png'
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / 'docs/健力健身房/02-素材/fx-whiteboard-onbg.png'

# 白板可寫字區四角（masks.py 自動偵測，見 fx.md）：左上、右上、右下、左下
WB = np.float32([[1381, 339], [1665, 308], [1658, 534], [1391, 533]])
INSET = 0.03   # 往內縮 3%，字不要貼著框


def main():
    bg = np.array(Image.open(BG).convert('RGB')).astype(np.float32)
    ink = np.array(Image.open(sys.argv[1]).convert('RGBA')).astype(np.float32)
    h, w = ink.shape[:2]
    c = WB.mean(0)
    dst = c + (WB - c) * (1 - INSET)
    M = cv2.getPerspectiveTransform(np.float32([[0, 0], [w, 0], [w, h], [0, h]]), dst)
    warped = cv2.warpPerspective(ink, M, (bg.shape[1], bg.shape[0]), flags=cv2.INTER_AREA)
    a = warped[..., 3:4] / 255
    # 墨水乘上底圖的明暗（白板上的光：右邊紅霓虹、左下暖光），讓字吃到同一個環境光
    shade = bg / np.maximum(np.percentile(bg[300:540, 1390:1650], 90, axis=(0, 1)), 1)
    col = warped[..., :3] * np.clip(shade, 0, 1.2)
    out = bg * (1 - a) + col * a
    img = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
    img.save(OUT)
    img.crop((1300, 250, 1672, 600)).resize((744, 700), Image.LANCZOS).save(OUT.with_name(OUT.stem + '-zoom.png'))
    print('saved', OUT)


if __name__ == '__main__':
    main()
