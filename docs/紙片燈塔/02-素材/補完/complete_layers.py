from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw
W,H=1872,1053
X,Y=100,56
names=['far','boats','mid','gulls','reefs','near','fg']
original={n:np.array(Image.open('in/'+n+'.png').convert('RGBA')) for n in names}
plate=np.array(Image.open('out/background-plate.png').convert('RGB').resize((1672,941),Image.Resampling.LANCZOS))
out=Path('out')
def pad(a): return cv2.copyMakeBorder(a,56,56,100,100,cv2.BORDER_REFLECT_101)
def object_pad(a):
 # Repeat only material at the edge; do not reflect inland props into the bleed.
 yy=np.arange(-56,997); xx=np.arange(-100,1772)
 for v,limit in [(xx,1672),(yy,941)]:
  lo=v<0; hi=v>=limit
  t=(-v[lo]-1)%48; v[lo]=np.where(t<24,t,47-t)
  t=(v[hi]-limit)%48; v[hi]=limit-1-np.where(t<24,t,47-t)
 return a[yy[:,None],xx[None,:]].copy()
def restore(a,n):
 s=original[n]; b=a[Y:Y+941,X:X+1672]; m=s[:,:,3]>0; b[m]=s[m]; return a
def nearest(a,mask):
 _,labels=cv2.distanceTransformWithLabels((~mask).astype('uint8'),cv2.DIST_L2,5,labelType=cv2.DIST_LABEL_PIXEL)
 lookup=np.zeros((mask.sum()+1,a.shape[2]),a.dtype); lookup[1:]=a[mask]; return lookup[labels]
def match_fill(base,src):
 # Only adjust synthesized pixels; decay a locally averaged color residual.
 mask=src[:,:,3]>0
 residual=(src[:,:,:3].astype('float32')-base.astype('float32'))*mask[:,:,None]
 weight=cv2.GaussianBlur(mask.astype('float32'),(0,0),5)
 delta=cv2.GaussianBlur(residual,(0,0),5)/np.maximum(weight[:,:,None],.0001)
 boundary=mask & (weight<.999)
 extension=nearest(delta,boundary)
 dist=cv2.distanceTransform((~mask).astype('uint8'),cv2.DIST_L2,5)
 fixed=np.clip(base.astype('float32')+0.2*extension*np.exp(-dist[:,:,None]/8),0,255).astype('uint8')
 fixed[mask]=src[:,:,:3][mask]
 return fixed
result={}
# Far ocean uses only distant-water scale, continued behind the near plane.
farbase=plate.copy()
for y in range(468,941):
 t=(y-420)%88; sy=420+(t if t<44 else 87-t)
 farbase[y]=plate[sy]
far_rgb=match_fill(farbase,original['far'])
result['far']=np.dstack([pad(far_rgb),np.full((H,W),255,'uint8')])
# Near upper edge is a horizontal cut at source y=461; extend 20 px upward.
near_rgb=match_fill(plate,original['near'])
near= np.dstack([pad(near_rgb),np.zeros((H,W),'uint8')]); near[441+Y:,:,3]=255
result['near']=near
# Objects are mirrored into bleed only where they cross the original frame.
for n in ['fg','mid']:
 s=original[n]; a=object_pad(s)
 if n=='mid':
  m=s[:,:,3]>0
  rock=m.copy(); rock[:450]=False
  expanded=rock.copy()
  for dy in range(1,61): expanded[dy:] |= rock[:-dy]
  # Fill the concavity occluded by the penguin platform using adjacent cliff.
  close=cv2.morphologyEx(rock.astype('uint8'),cv2.MORPH_CLOSE,np.ones((51,151),'uint8')).astype(bool)
  expanded|=close
  bottoms=np.array([np.flatnonzero(rock[:,x])[-1] if rock[:,x].any() else -1 for x in range(1672)])
  envelope=cv2.dilate(bottoms.astype('float32')[None,:],np.ones((1,181),'uint8'))[0]
  for x in range(1050,1672):
   if bottoms[x]>=450:
    expanded[bottoms[x]:min(941,int(envelope[x])+61),x]=True
  fill=expanded & ~m
  # Reflect inward from each column's lower rock boundary for textured extensions.
  tex=nearest(s[:,:,:3],rock)
  for x in range(1672):
   ys=np.flatnonzero(rock[:,x])
   if not len(ys): continue
   bottom=ys[-1]
   for y in np.flatnonzero(fill[:,x]):
    sy=bottom-(y-bottom)-3
    if 0<=sy<941 and rock[sy,x]: tex[y,x]=s[sy,x,:3]
  s=s.copy(); s[fill,:3]=tex[fill]; s[fill,3]=255
  a=object_pad(s)
 result[n]=a
# Each reef grows downward only, sampling its own interior to avoid a new rim.
s=original['reefs']; a=np.zeros((H,W,4),'uint8'); m=s[:,:,3]>0
for x in range(1672):
 ys=np.flatnonzero(m[:,x])
 if not len(ys): continue
 # Connected vertical runs, not a single overall bounding rectangle.
 ends=ys[np.r_[np.diff(ys)>1,True]]
 for bottom in ends:
  for d in range(1,16):
   yy=bottom+d
   if yy>=941: break
   sy=max(0,bottom-d-2)
   if m[sy,x]: a[yy+Y,x+X]=s[sy,x]
result['reefs']=a
for n in ['boats','gulls']:
 a=np.zeros((H,W,4),'uint8')
 if n=='gulls':
  s=original[n]; xs=np.flatnonzero(s[0,:,3]>0)
  for x in xs: a[:Y,x+X]=s[0,x]
 result[n]=a
for n in names:
 result[n]=restore(result[n],n); Image.fromarray(result[n]).save(out/(n+'.png'))
def preview(shifts,path):
 canvas=Image.new('RGBA',(W,H),(255,0,255,255))
 for n,dx in zip(names,shifts): canvas.alpha_composite(Image.fromarray(result[n]),(dx,0))
 canvas.save(out/path)
 rgb=np.array(canvas)[:,:,:3]; return int(np.all(rgb==[255,0,255],axis=2).sum())
normal=preview([0]*7,'preview.png')
shift=preview([0,2,-4,6,-8,10,-12],'preview-shift.png')
other=preview([0,-2,4,-6,8,-10,12],'preview-shift-reverse.png')
lines=['Canvas 1872x1053; original offset (100,56); bleed L/R=100, T/B=56.','']
for n in names:
 im=Image.open(out/(n+'.png')); a=np.array(im); s=original[n]; m=s[:,:,3]>0
 count=int(np.any(a[Y:Y+941,X:X+1672][m]!=s[m],axis=1).sum())
 lines.append(f'{n}.png: size={im.width}x{im.height}; mode={im.mode}; visible pixels {"PASS" if count==0 else "FAIL"}; different pixels={count}')
 assert count==0 and im.size==(W,H) and im.mode=='RGBA'
for n,region in [('far',result['far'][:,:,3]),('near',result['near'][Y+441:,:,3])]:
 coverage=float(np.mean(region==255)*100); lines.append(f'{n}: opaque coverage={coverage:.6f}% ({np.count_nonzero(region==255)}/{region.size}); region '+('whole canvas' if n=='far' else 'x=0..1871, y=497..1052 (source upper edge 461 minus 20 + 56)')); assert coverage==100
lines += ['',f'preview.png: magenta holes={normal}',f'preview-shift.png: offsets far/boats/mid/gulls/reefs/near/fg = 0,+2,-4,+6,-8,+10,-12; magenta holes={shift}',f'preview-shift-reverse.png: inverse offsets; magenta holes={other}','', 'Method: built-in image generation clean background plate; synthesized-only boundary color matching; reflected texture bleed; downward cliff/reef reconstruction; exact original RGBA replacement last.','Far lower ocean continues the distant-wave band. Near fills all occlusions with ocean. Mid grows 60px down; reefs grow up to 15px per visible run.','No additional white outline added. Boats unchanged; gull top-row strings extended 56px upward.']
(out/'check.txt').write_text('\n'.join(lines),encoding='utf-8')
# Inspectable thumbnails of completed layers.
sheet=Image.new('RGB',(936,4*290),(65,65,65))
for i,n in enumerate(names):
 im=Image.fromarray(result[n]); im.thumbnail((468,264)); sheet.paste(im,((i%2)*468,(i//2)*290),im); ImageDraw.Draw(sheet).text(((i%2)*468+8,(i//2)*290+268),n,fill='white')
sheet.save(out/'layers-completed.jpg')
print('\n'.join(lines))
