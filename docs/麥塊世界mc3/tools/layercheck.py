# 分層核對：Codex 扣圖（標準答案）vs 灰模 ?layers=1 截圖
# 用法：python -I layercheck.py <灰模分層.png> <扣圖資料夾> <輸出.png>
# 扣圖資料夾要有 codex-前景/中近景/中景/遠景.png（RGBA，不透明＝屬於該層）；跨層時前景優先。
# 前處理：①去雜訊——每層遮罩二值化後做開運算（去碎點）＋閉運算（補小洞）；
# ②去背——遠景層裡沒有紋理的平滑天空剔除，另成「天空」類（灰模的暗底同理），四層 IoU 只比物件。
# 輸出：上排 標準答案｜灰模，下排 差異（亮＝對、暗紅＝錯，標出灰模把它放成哪層），並印各層 IoU。
import sys, colorsys
from PIL import Image, ImageFilter, ImageChops
sys.stdout.reconfigure(encoding='utf-8')

ORDER = ['前景', '中近景', '中景', '遠景']
COL = {'天空': (32, 32, 40), '前景': (255, 70, 70), '中近景': (255, 140, 40), '中景': (255, 215, 60), '遠景': (90, 160, 255)}
render_path, ref_dir, out = sys.argv[1:4]
r = Image.open(render_path).convert('RGB')
W, H = r.size
K = 5   # 去雜訊核（像素）

def clean(m):
    m = m.point(lambda a: 255 if a > 128 else 0)
    m = m.filter(ImageFilter.MinFilter(K)).filter(ImageFilter.MaxFilter(K))   # 開：去碎點
    return m.filter(ImageFilter.MaxFilter(K)).filter(ImageFilter.MinFilter(K))  # 閉：補小洞

raw = {n: Image.open(f'{ref_dir}/codex-{n}.png').convert('RGBA').resize((W, H)) for n in ORDER}
masks = {n: clean(raw[n].getchannel('A')) for n in ORDER}
# 去背：遠景層的天空＝局部紋理很低（原圖和模糊版差很小）
g = raw['遠景'].convert('L')
tex = ImageChops.difference(g, g.filter(ImageFilter.GaussianBlur(3))).filter(ImageFilter.MaxFilter(7))
obj = tex.point(lambda d: 255 if d > 6 else 0)
masks['遠景'] = clean(ImageChops.multiply(masks['遠景'], obj).filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9)))
if len(sys.argv) > 4: masks['遠景'].save(sys.argv[4])   # 選配：輸出去背後的遠景遮罩看看
masks = {n: m.load() for n, m in masks.items()}

def truth(x, y):
    for n in ORDER[:-1]:
        if masks[n][x, y] > 128: return n
    return '遠景' if masks['遠景'][x, y] > 128 else '天空'

def ours(px):   # 灰模分層色：紅、橘、黃、藍；暗底（#202028）＝虛空＝遠景
    h, s, v = colorsys.rgb_to_hsv(*(c / 255 for c in px))
    if s < 0.3 or v < 0.2: return '天空'
    h *= 360
    if h < 18 or h > 330: return '前景'
    if h < 38: return '中近景'
    if h < 75: return '中景'
    return '遠景'

rp = r.load()
A, B, D = Image.new('RGB', (W, H)), Image.new('RGB', (W, H)), Image.new('RGB', (W, H))
ap, bp, dp = A.load(), B.load(), D.load()
inter = {n: 0 for n in COL}; union = {n: 0 for n in COL}
for y in range(H):
    for x in range(W):
        t, o = truth(x, y), ours(rp[x, y])
        ap[x, y] = COL[t]; bp[x, y] = COL[o]
        for n in ORDER:
            if t == n or o == n: union[n] += 1
        if t == o: inter[t] += 1; dp[x, y] = tuple(c // 2 + 60 for c in COL[t])
        else: dp[x, y] = tuple(int(c * 0.55) for c in COL[o])
c = Image.new('RGB', (W * 2, H * 2), (0, 0, 0))
c.paste(A, (0, 0)); c.paste(B, (W, 0)); c.paste(D, (0, H)); c.paste(r, (W, H))
c.resize((W, H)).save(out)
for n in ORDER: print(f'{n}\tIoU {inter[n] / max(1, union[n]):.2f}')
