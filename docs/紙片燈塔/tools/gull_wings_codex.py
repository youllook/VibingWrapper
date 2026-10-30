from pathlib import Path
import json
import numpy as np
import cv2
from PIL import Image,ImageDraw

# All colours and paper edges come from the supplied cards. Only wing coordinates change.
SPECS=[
 dict(size=(440,244), boundary=[(0,145),(164,145),(180,144),(198,148),(220,157),(242,166),(256,175),(270,179),(440,179)], seam=[(0,310),(110,244),(152,213),(244,213)],
      left=([0,39,166,200,250,440],[27,27,18,0,0,0],[-4,-4,-15,0,0,0]), right=([0,213,235,309,397,440],[0,0,0,-21,-36,-36],[0,0,0,-30,-114,-114]),fade=42),
 dict(size=(492,232), boundary=[(0,143),(174,143),(191,140),(206,141),(226,146),(246,151),(268,157),(290,163),(320,172),(492,172)], seam=[(0,300),(117,252),(145,236),(232,236)],
      left=([0,35,153,211,492],[40,40,30,0,0],[-10,-10,-18,0,0]),right=([0,236,269,327,454,492],[0,0,0,-21,-45,-45],[0,0,0,-20,-7,-7]),fade=37),
 dict(size=(828,420), boundary=[(0,267),(287,267),(310,264),(335,264),(360,268),(385,277),(411,287),(445,297),(475,308),(503,315),(828,315)], seam=[(0,455),(224,406),(275,382),(420,382)],
      left=([0,52,262,351,828],[64,64,44,0,0],[-3,-3,-32,0,0]),right=([0,382,430,534,778,828],[0,0,0,-64,-57,-57],[0,0,0,-33,-12,-12]),fade=68)
]
def boundary_y(spec,x):
 b=np.array(spec['boundary']);return np.interp(x,b[:,0],b[:,1])
def displacement(spec,side,x,y):
 knots,dx,dy=spec[side]
 f=np.clip((boundary_y(spec,x)-y)/spec['fade'],0,1)
 f=f*f*(3-2*f)
 return np.interp(x,knots,dx)*f,np.interp(x,knots,dy)*f

def wing(spec,side,src,mask):
 h,w=src.shape[:2]; yy,xx=np.mgrid[:h,:w].astype(np.float32); sx=xx.copy();sy=yy.copy()
 for _ in range(55):
  dx,dy=displacement(spec,side,sx,sy)
  sx=(sx+xx-dx)*.5;sy=(sy+yy-dy)*.5
 layer=src.astype(np.float32)/255
 layer[:,:,3]*=mask
 layer[:,:,:3]*=layer[:,:,3,None]
 warped=cv2.remap(layer,sx.astype(np.float32),sy.astype(np.float32),cv2.INTER_CUBIC,borderMode=cv2.BORDER_CONSTANT)
 return np.clip(warped,0,1)

report=[]
preview=Image.new('RGB',(1000,1000),(70,113,139));d=ImageDraw.Draw(preview)
yoff=20
for i,spec in enumerate(SPECS):
 original=Image.open(f'gull{i}_ref4x.png').convert('RGBA');src=np.array(original);h,w=src.shape[:2]
 yy,xx=np.mgrid[:h,:w];body=yy>=boundary_y(spec,xx)
 seam=np.array(spec['seam']);left=xx<np.interp(yy,seam[:,0],seam[:,1]);wingmask=~body
 back=wing(spec,'left',src,wingmask&left);front=wing(spec,'right',src,wingmask&~left)
 out=front+back*(1-front[:,:,3,None])
 a=out[:,:,3];out[:,:,:3]=np.divide(out[:,:,:3],a[:,:,None],out=np.zeros_like(out[:,:,:3]),where=a[:,:,None]>1e-6)
 result=np.clip(np.rint(out*255),0,255).astype(np.uint8)
 result[body]=src[body] # Exact RGBA restoration, including the original silhouette and feet.
 result[result[:,:,3]==0,:3]=0
 # Preserve even invisible RGB samples in the protected original region.
 result[body]=src[body]
 final=Image.fromarray(result);final.save(f'gull{i}_b.png')
 maskim=Image.fromarray((body*255).astype(np.uint8));maskim.save(f'body_mask{i}.png')
 assert final.size==spec['size'] and final.mode=='RGBA'
 assert np.array_equal(result[body],src[body])
 assert np.count_nonzero(result[:,:,3])>0 and np.any(result[:,:,3]==0)
 report.append(dict(file=f'gull{i}_b.png',size=list(final.size),mode=final.mode,protected_body_changed_pixels=int(np.any(result!=src,axis=2)[body].sum()),changed_pixels=int(np.any(result!=src,axis=2).sum()),alpha_bbox=final.getbbox()))
 scale=min(460/w,280/h);sz=(round(w*scale),round(h*scale))
 d.text((20,yoff),f'gull{i} reference',fill='white');d.text((520,yoff),f'gull{i} wings raised',fill='white')
 for x,im in [(20,original),(520,final)]:
  im=im.resize(sz,Image.Resampling.LANCZOS);preview.paste(im,(x,yoff+24),im)
 # Exact half-opacity overlay for positional review.
 overlay=Image.blend(original,final,.5);overlay.save(f'gull{i}_overlay.png')
 yoff+=sz[1]+60
preview.crop((0,0,1000,yoff)).save('verification.png')
Path('verification.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))
