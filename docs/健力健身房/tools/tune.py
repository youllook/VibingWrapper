# 擺放自動微調：對 Codex 扣圖的 IoU 做座標下降（前景＋中近景）
# 用法（repo 根目錄）：python docs/健力健身房/tools/tune.py '<起始 tune json>' 'bench.x:0.1,bench.z:0.1,...' [輪數]
import json, subprocess, sys, re, os, urllib.parse
sys.stdout.reconfigure(encoding='utf-8')
D = 'docs/健力健身房'; T = 'E:/tmp/gym/tune'; os.makedirs(T, exist_ok=True)
EL = 'E:/DesktopPet/node_modules/electron/dist/electron.exe'   # 直接叫 exe：經 .cmd 的話逾時只殺到 cmd，孫程序抓著管線會整個卡死
tune = json.loads(sys.argv[1]); specs = [(k, float(v)) for k, v in (s.split(':') for s in sys.argv[2].split(','))]
rounds = int(sys.argv[3]) if len(sys.argv) > 3 else 2
W = {'前景': 1.0, '中近景': 2.0}
def get(t, k):
    a, b = k.split('.'); return t[a][b]
def put(t, k, v):
    a, b = k.split('.'); t.setdefault(a, {})[b] = round(v, 4)
cache = {}
def score(t):
    key = json.dumps(t, sort_keys=True)
    if key in cache: return cache[key]
    url = 'powerlifting-gym/index.html?layers=1&tune=' + urllib.parse.quote(json.dumps(t))
    if os.path.exists(f'{T}/s.png'): os.remove(f'{T}/s.png')
    p = subprocess.Popen([EL, f'{D}/tools/shot.js', url, f'{T}/s.png', '836', '470'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try: p.wait(timeout=60)
    except subprocess.TimeoutExpired:
        subprocess.run(['taskkill', '/F', '/T', '/PID', str(p.pid)], capture_output=True); print('  截圖逾時，略過', flush=True)
    if not os.path.exists(f'{T}/s.png'): cache[key] = (0, {}); return cache[key]
    out = subprocess.run([sys.executable, '-I', '-X', 'utf8', f'{D}/tools/layercheck.py', f'{T}/s.png', f'{D}/01-拆景', f'{T}/c.png'], capture_output=True, text=True, encoding='utf-8').stdout
    iou = {m[0]: float(m[1]) for m in re.findall(r'(\S+)\tIoU ([\d.]+)', out)}
    s = sum(iou.get(k, 0) * w for k, w in W.items()) / sum(W.values())
    cache[key] = (s, iou); return cache[key]
best = score(tune); print('start', round(best[0], 4), best[1], flush=True)
for r in range(rounds):
    for k, st in specs:
        st = st / (2 ** r)
        for sgn in (1, -1):
            while True:
                t = json.loads(json.dumps(tune)); put(t, k, get(tune, k) + sgn * st)
                s = score(t)
                if s[0] > best[0] + 1e-4: tune, best = t, s; print(k, get(tune, k), round(s[0], 4), s[1], flush=True)
                else: break
print('BEST', json.dumps(tune, ensure_ascii=False)); print('IOU', best[1])
