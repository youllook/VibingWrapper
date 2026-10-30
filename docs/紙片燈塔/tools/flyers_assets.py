# 產出 themes/paper-lighthouse/assets/gulls、assets/boats 的卡片與 json（座標都是 1872×1053 出血畫布）
import numpy as np, json, os, cv2
from PIL import Image, ImageFilter
T='E:/DesktopPet/.claude/worktrees/codex-machine-project-setup-0ff44f/themes/paper-lighthouse/'
W='E:/tmp/paper-scene/flyers/'
os.makedirs(T+'assets/gulls',exist_ok=True); os.makedirs(T+'assets/boats',exist_ok=True)
g=np.array(Image.open(T+'assets/layers-full/gulls.png')).astype(int)
blue=(g[...,2]-g[...,0]>40)&(g[...,3]>0)
cards=[(935,111,110,61,998),(1118,220,123,58,1197),(1466,109,207,105,1578)]   # 去線後的卡片框＋吊線 x
gulls=[]
for k,(x,y,w,h,sx) in enumerate(cards):
    a=Image.open(W+f'gulls/gull{k}_a.png')
    a.save(T+f'assets/gulls/gull{k}_a.png')
    if k==0:
        b4=Image.open(W+'gulls/gull0_b_pad.png'); pad=100//4
        b=b4.resize((w,h+pad),Image.LANCZOS); by=y-pad
    else:
        b=Image.open(W+f'gulls/gull{k}_b.png').resize((w,h),Image.LANCZOS); by=y
    b.save(T+f'assets/gulls/gull{k}_b.png')
    # 吊點：線那一欄、卡片最上面的不透明像素往下 2px（線埋進背上）
    aa=np.array(a)[...,3]
    col=sx-x
    ys=np.nonzero(aa[:,max(0,col-1):col+2].max(1)>128)[0]
    ay=y+int(ys.min())+2
    gulls.append(dict(a=f'gull{k}_a.png',b=f'gull{k}_b.png',ax=x,ay=y,bx=x,by=by,hook=[sx,ay]))
json.dump(gulls,open(T+'assets/gulls/gulls.json','w'),indent=1)
print(gulls)

bt=Image.open(T+'assets/layers-full/boats.png')
boats=[]
for k,(x,y,w,h) in enumerate([(241,401,95,103),(1071,414,68,74),(487,438,52,53),(618,448,35,35)]):
    c=bt.crop((x-4,y-4,x+w+4,y+h+4)); c.save(T+f'assets/boats/boat{k}.png')
    boats.append(dict(file=f'boat{k}.png',x=x-4,y=y-4,w=w+8,h=h+8))
# 第 5 艘（Codex 畫）：縮到跟 boat1/2 之間、烘遠景的糊與霧
b4=Image.open(W+'boat/boat4_4x.png'); bb=b4.getbbox(); b4=b4.crop(bb)
H5=60; s=H5/b4.height; b5=b4.resize((round(b4.width*s),H5),Image.LANCZOS)
P=6; c=Image.new('RGBA',(b5.width+2*P,b5.height+2*P)); c.paste(b5,(P,P))
c=c.filter(ImageFilter.GaussianBlur(0.8))
arr=np.array(c).astype(float); haze=np.array([200,215,232.])
arr[...,:3]=arr[...,:3]*0.86+haze*0.14
c=Image.fromarray(arr.clip(0,255).astype(np.uint8)); c.save(T+'assets/boats/boat4.png')
bottom=482; x5=850
boats.append(dict(file='boat4.png',x=x5-c.width//2,y=bottom-c.height+P,w=c.width,h=c.height))
json.dump(boats,open(T+'assets/boats/boats.json','w'),indent=1)
print(boats)
