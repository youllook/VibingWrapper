# gull0 翅膀上揚：兩翼各自繞肩膀旋轉（Codex 的位移場在這隻會撕裂），身體像素原樣蓋回
import numpy as np, cv2
from PIL import Image
PAD=100
o=Image.open('gull0_ref4x.png').convert('RGBA'); W,H=o.size
src=np.zeros((H+PAD,W,4),np.uint8); src[PAD:]=np.array(o)
h,w=src.shape[:2]; yy,xx=np.mgrid[:h,:w]
bnd=np.array([(0,145),(164,145),(180,144),(198,148),(220,157),(242,166),(256,175),(270,179),(440,179)],float); bnd[:,1]+=PAD
body=yy>=np.interp(xx,bnd[:,0],bnd[:,1])
seam=np.array([(0,310),(110,244),(152,213),(244,213)],float); seam[:,0]+=PAD
left=xx<np.interp(yy,seam[:,0],seam[:,1])
def rot(mask,center,deg):
    L=src.copy(); L[~mask]=0
    M=cv2.getRotationMatrix2D(center,deg,1.0)
    return cv2.warpAffine(L,M,(w,h),flags=cv2.INTER_CUBIC,borderValue=(0,0,0,0))
def over(a,b):  # a over b (straight alpha)
    aa=a[...,3:4]/255.; ba=b[...,3:4]/255.; oa=aa+ba*(1-aa)
    rgb=(a[...,:3]*aa+b[...,:3]*ba*(1-aa))/np.maximum(oa,1e-6)
    return np.concatenate([rgb,oa*255],-1).clip(0,255).astype(np.uint8)
back=rot(~body&left,(190,150+PAD),-7)    # 後翼（左）往上抬 12°
front=rot(~body&~left,(236,170+PAD),30)   # 前翼（右）繞肩往上轉 38°
near=((xx-232)**2+(yy-170-PAD)**2<34**2)&~body&~left
near|=((xx-178)**2+(yy-150-PAD)**2<24**2)&~body&left
base=src.copy(); base[~near]=0
out=over(front,over(back,base))
bd=src.copy(); bd[~body]=0
out=over(bd,out)
Image.fromarray(out).save('gull0_b_pad.png')
pv=Image.new('RGBA',(w*2+20,h),(70,113,139,255)); pv.alpha_composite(Image.fromarray(src),(0,0)); pv.alpha_composite(Image.fromarray(out),(w+20,0)); pv.save('v_rot0.png')
