# 遠景（far.png）在海鷗、吊線、帆船底下的補圖有鬼影（含烘進去的海鷗影子）→ 重補
#   帆船、海鷗本體：水平平移鄰近乾淨區塊，色差用「外圈差值 inpaint 進來」修正（行不變，水平線對得上）
#   吊線、找不到乾淨鄰區的：inpaint 低頻 + 乾淨天空的紙紋高頻
import numpy as np, cv2, shutil, os
from PIL import Image
L='E:/DesktopPet/.claude/worktrees/codex-machine-project-setup-0ff44f/themes/paper-lighthouse/assets/layers-full/'
bak='E:/tmp/paper-scene/flyers/far_orig.png'
if not os.path.exists(bak): shutil.copy(L+'far.png', bak)
far=np.array(Image.open(bak).convert('RGB'))
H,W=far.shape[:2]
g=np.array(Image.open(L+'gulls.png')).astype(int)
ga=g[...,3]>0
string=(ga&(g[...,2]-g[...,0]>40)).astype(np.uint8)
string[:224,1186:1210]|=ga[:224,1186:1210].astype(np.uint8)   # 中間那條線下半段是白的
body=(ga&~string.astype(bool)).astype(np.uint8)
body=cv2.morphologyEx(body,cv2.MORPH_OPEN,np.ones((3,3),np.uint8))
boat=(np.array(Image.open(L+'boats.png'))[...,3]>0).astype(np.uint8)
mid=(np.array(Image.open(L+'mid.png'))[...,3]>0).astype(np.uint8)
K=lambda r:cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(2*r+1,2*r+1))
gm=body.copy()
for dx in range(0,13,3):
    for dy in range(0,13,3): gm|=np.roll(np.roll(body,dy,0),dx,1)
gm=cv2.dilate(gm,K(6))
sm=cv2.dilate(string,K(2))
bm=cv2.dilate(boat,K(12))
forbid=cv2.dilate(gm|bm|sm|mid,K(6))
out=far.copy()

def feather_put(res,comp):
    a=cv2.GaussianBlur((comp>0).astype(np.float32),(0,0),2)[...,None]
    a=np.where(cv2.erode(comp,K(2))[...,None]>0,1.0,a)
    out[:]=np.clip(res*a+out*(1-a),0,255).astype(np.uint8)

def shift_fill(comp,x,y,w,h,maxk=700,sign=0):
    best=None
    ring=cv2.dilate(comp,K(3))-comp
    for k in range(16,maxk,8):
        for dx in (k,-k):
            if sign and dx*sign<0: continue
            if x+dx<0 or x+w+dx>W: continue
            sh=np.roll(comp,dx,axis=1)
            if forbid[sh>0].any(): continue
            src=np.roll(far,-dx,axis=1)
            err=np.abs(src[ring>0].astype(int)-out[ring>0].astype(int)).mean()+0.01*k
            if best is None or err<best[0]: best=(err,dx,src)
    if best is None: return None
    err,dx,src=best
    # 色差場：外面 = out-src，裡面用 inpaint 平滑延伸
    D=(out.astype(np.float32)-src.astype(np.float32))
    band=cv2.dilate(comp,K(8))
    Dq=np.clip(D/2+128,0,255).astype(np.uint8)
    Din=cv2.inpaint(Dq,comp,12,cv2.INPAINT_TELEA).astype(np.float32)
    Din=cv2.GaussianBlur(Din,(0,0),4)
    res=src.astype(np.float32)+(Din-128)*2
    feather_put(res,comp); return dx,err

def tex_fill(comp,x,y,w,h,ymax=None,r=9,bl=2.5):
    if ymax:   # 只在水平線以上找邊界（不讓海的藍滲上來）
        lo=out.copy(); lo[:ymax]=cv2.inpaint(out[:ymax].copy(),comp[:ymax].copy(),9,cv2.INPAINT_TELEA)
        lo[:ymax]=cv2.GaussianBlur(lo[:ymax],(0,0),2.5)
    else:
        lo=cv2.inpaint(out,comp,r,cv2.INPAINT_TELEA)
        lo=cv2.GaussianBlur(lo,(0,0),bl)
    dx=0
    for k in range(w+10,W,10):
        for d in (-k,k):
            if x+d<0 or x+w+d>W: continue
            if not forbid[np.roll(comp,d,axis=1)>0].any(): dx=d; break
        if dx: break
    src=np.roll(far,-dx,axis=1).astype(np.float32)
    feather_put(lo.astype(np.float32)+src-cv2.GaussianBlur(src,(0,0),bl),comp); return dx

HZ=466   # 遠海水平線（1872 畫布 y）
bsky=bm.copy(); bsky[HZ:]=0; bm[:HZ]=0
for name,m,shift0 in (('boat-sky',bsky,False),('boat',bm,True),('gull',gm,True),('string',sm,False)):
    n,lab,st,_=cv2.connectedComponentsWithStats(m,8)
    for i in range(1,n):
        x,y,w,h,_=st[i]; comp=(lab==i).astype(np.uint8)*255; shift=shift0
        # 人工挑過的：第三艘往左借（右邊鄰區有白浪斑）
        sign={475:-1}.get(int(x),0) if name=='boat' else 0
        r=shift_fill(comp,x,y,w,h,sign=sign) if shift else None
        if r: print(name,(x,y,w,h),'shift',r)
        else: print(name,(x,y,w,h),'inpaint+tex',tex_fill(comp,x,y,w,h,HZ if name=='boat-sky' else None,*((3,1.0) if name=='string' else (9,2.5))))
Image.fromarray(out).save(L+'far.png')
