import cv2, numpy as np, sys
def edges(p):
    g=cv2.cvtColor(cv2.imread(p),cv2.COLOR_BGR2GRAY).astype(np.float32)
    g=cv2.GaussianBlur(g,(0,0),1.5); return cv2.Laplacian(g,cv2.CV_32F)
a=edges('gym4.png')
m=np.ones_like(a); mm=cv2.imread('mask-mirror.png',0); fm=cv2.imread('mask-fan.png',0)
m[(mm>0)|(fm>0)]=0
for p in ['plate-day.png','plate-shade.png','plate-night.png']:
    b=edges(p)
    sh,r=cv2.phaseCorrelate(a*m,b*m)
    # edge correlation outside edited regions
    c=np.corrcoef((a*m).ravel(),(b*m).ravel())[0,1]
    print(p,'shift(px)=(%.2f,%.2f)'%sh,'edge-corr=%.3f'%c)
