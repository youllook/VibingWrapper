# 分層核對：Codex 四層扣圖（標準答案）vs 灰模 layers=1 截圖，逐層算 IoU
# 用法：python -I layercheck.py <layers=1 截圖.png> <扣圖資料夾> <差異圖輸出.png>
# 扣圖資料夾要有 layer-near/midnear/mid/far.png（RGBA，不透明＝屬於該層）；跨層時前面的層優先，都沒有＝遠景。
# 去雜訊：每層遮罩二值化後做開運算（去碎點）＋閉運算（補小洞）。
# 輸出：上排 標準答案｜灰模分層，下排 差異（亮＝對、暗＝錯，顏色是灰模放成的層）｜灰模截圖；並印各層 IoU。
import sys, colorsys
from PIL import Image, ImageFilter
sys.stdout.reconfigure(encoding='utf-8')

ORDER = ['near', 'midnear', 'mid', 'far']
NAME = {'near': '近景', 'midnear': '中近景', 'mid': '中景', 'far': '遠景'}
COL = {'near': (255, 70, 70), 'midnear': (255, 140, 40), 'mid': (255, 215, 60), 'far': (90, 160, 255)}
render_path, ref_dir, out = sys.argv[1:4]
r = Image.open(render_path).convert('RGB')
W, H = r.size
K = 5

def clean(m):
    m = m.point(lambda a: 255 if a > 128 else 0)
    m = m.filter(ImageFilter.MinFilter(K)).filter(ImageFilter.MaxFilter(K))
    return m.filter(ImageFilter.MaxFilter(K)).filter(ImageFilter.MinFilter(K))

masks = {n: clean(Image.open(f'{ref_dir}/layer-{n}.png').convert('RGBA').resize((W, H)).getchannel('A')).load() for n in ORDER[:-1]}

def truth(x, y):
    for n in ORDER[:-1]:
        if masks[n][x, y] > 128: return n
    return 'far'

def ours(px):   # Look.LAYER_COL：紅、橘、黃、藍（灰模底色＝沒東西＝遠景）
    h, s, v = colorsys.rgb_to_hsv(*(c / 255 for c in px))
    if s < 0.3 or v < 0.2: return 'far'
    h *= 360
    if h < 18 or h > 330: return 'near'
    if h < 38: return 'midnear'
    if h < 75: return 'mid'
    return 'far'

rp = r.load()
A, B, D = (Image.new('RGB', (W, H)) for _ in range(3))
ap, bp, dp = A.load(), B.load(), D.load()
inter = {n: 0 for n in ORDER}; union = {n: 0 for n in ORDER}
for y in range(H):
    for x in range(W):
        t, o = truth(x, y), ours(rp[x, y])
        ap[x, y] = COL[t]; bp[x, y] = COL[o]
        union[t] += 1
        if o != t: union[o] += 1
        if t == o: inter[t] += 1; dp[x, y] = tuple(c // 2 + 60 for c in COL[t])
        else: dp[x, y] = tuple(int(c * 0.45) for c in COL[o])
c = Image.new('RGB', (W * 2, H * 2))
c.paste(A, (0, 0)); c.paste(B, (W, 0)); c.paste(D, (0, H)); c.paste(r, (W, H))
c.resize((W, H)).save(out)
for n in ORDER: print(f'{NAME[n]}\tIoU {inter[n] / max(1, union[n]):.2f}')
