import sys, glob, os
from PIL import Image, ImageDraw
d, n, out = sys.argv[1], sys.argv[2], sys.argv[3]
rows=[]
for v in ('q','s'):
    fs=sorted(glob.glob(os.path.join(d,f'{n}_{v}_*.png')), key=lambda f:int(f.rsplit('_',1)[1][:-4]))
    if fs: rows.append([Image.open(f).convert('RGB') for f in fs])
w,h=rows[0][0].size; S=Image.new('RGB',(w*len(rows[0]),h*len(rows)))
for r,row in enumerate(rows):
    for c,im in enumerate(row): S.paste(im,(c*w,r*h))
ImageDraw.Draw(S).text((6,6),n,fill='red'); S.thumbnail((2400,1200)); S.save(out,quality=85)
