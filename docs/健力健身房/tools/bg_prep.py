# 05 背景前處理：修掉看板上的舊吊扇（3D 吊扇會轉，舊的不拿掉會看到兩組）＋抽出光束遮罩（晚上要把光束拿掉、粉塵只在光束裡亮）
# 用法（repo 根目錄）：python -I docs/健力健身房/tools/bg_prep.py [檢查圖輸出資料夾]
# 讀 01-拆景/codex-白板空白.png（原圖）＋ 05-背景/no-fan.png（Codex 修掉吊扇）→ 寫 textures/backdrop.webp、mask-beam.png（灰階，光束強度）
import sys, os
import numpy as np, cv2
# cv2.imread／imwrite 在 Windows 讀不了中文路徑 → 用 numpy 轉手
def imread(p, flag=cv2.IMREAD_COLOR): return cv2.imdecode(np.fromfile(p, np.uint8), flag)
def imwrite(p, img, params=()): cv2.imencode(os.path.splitext(p)[1], img, list(params))[1].tofile(p)

D = 'docs/健力健身房'; T = 'themes/powerlifting-gym/textures'
out = sys.argv[1] if len(sys.argv) > 1 else 'E:/tmp/gym/05'
os.makedirs(out, exist_ok=True)
src = imread(f'{D}/01-拆景/codex-白板空白.png', cv2.IMREAD_COLOR)
H, W = src.shape[:2]

# ---- 1. 舊吊扇：Codex 修掉的版本（05-背景/no-fan.png，遮罩外像素與原圖完全相同；brief 見 05-背景/prompt.md）----
# （自己用 cv2.inpaint 試過：浪板紋會被抹成一片糊，所以交給 Codex 的圖像編輯）
fixed = imread(f'{D}/05-背景/no-fan.png', cv2.IMREAD_COLOR)
mask = imread(f'{D}/05-背景/fan-mask.png', cv2.IMREAD_GRAYSCALE)
imwrite(f'{T}/backdrop.webp', fixed, [cv2.IMWRITE_WEBP_QUALITY, 90])

# ---- 2. 光束：帶通濾波的亮帶 × 高窗往左下的範圍；外加範圍本身的一層薄霧 ----
Lf = cv2.cvtColor(fixed, cv2.COLOR_BGR2LAB)[..., 0].astype(np.float32)
beam = np.clip(cv2.GaussianBlur(Lf, (0, 0), 7) - cv2.GaussianBlur(Lf, (0, 0), 45), 0, None)   # 帶通：留下寬 20–80 px 的亮帶
poly = np.array([[560, 0], [990, 0], [990, 300], [760, 760], [250, 760], [250, 420]], np.int32)   # 光束只在高窗往左下這一塊
region = np.zeros((H, W), np.uint8); cv2.fillPoly(region, [poly], 255)
region = cv2.GaussianBlur(region, (0, 0), 30).astype(np.float32) / 255
win = imread(f'{T}/mask-glow.png', cv2.IMREAD_COLOR)[..., 0].astype(np.float32) / 255   # B 通道＝窗（cv2 是 BGR）
beam = cv2.GaussianBlur(beam, (0, 0), 3) * region * (1 - np.clip(win * 2, 0, 1))
beam = np.clip(beam / np.percentile(beam[region > 0.5], 99) * 0.7 + region * (1 - np.clip(win * 2, 0, 1)) * 0.3, 0, 1)
imwrite(f'{T}/mask-beam.png', (beam * 255).astype(np.uint8))

# ---- 檢查圖 ----
chk = fixed.copy(); chk[mask > 0] = (chk[mask > 0] * 0.5 + np.array([0, 0, 255]) * 0.5).astype(np.uint8)
imwrite(f'{out}/bg-fan-before-after.jpg', np.vstack([src[0:260, 800:1440], fixed[0:260, 800:1440], chk[0:260, 800:1440]]))
night = (fixed.astype(np.float32) - beam[..., None] * 90).clip(0, 255) * 0.5
imwrite(f'{out}/bg-beam.jpg', np.vstack([cv2.resize(np.dstack([beam * 255] * 3).astype(np.uint8), (836, 470)), cv2.resize(night.astype(np.uint8), (836, 470))]))
print('ok')
