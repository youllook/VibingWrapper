"""Recompose layers back to front, verify source pixel identity and deliverable formats."""
from PIL import Image
from pathlib import Path
import numpy as np,json,hashlib
P=Path(__file__).parent
source=Image.open(P/'gym1.png').convert('RGB'); a=np.array(source)
names=['前景','中近景','中景','遠景']
canvas=Image.new('RGBA',source.size)
coverage=np.zeros(a.shape[:2],np.uint8)
for name in reversed(names):
 im=Image.open(P/f'codex-{name}.png')
 assert im.mode=='RGBA' and im.size==(1672,941)
 ar=np.array(im); mask=ar[:,:,3]>0
 assert set(np.unique(ar[:,:,3]))<={0,255}
 assert np.array_equal(ar[mask,:3],a[mask]),name
 coverage+=mask
 canvas=Image.alpha_composite(canvas,im)
assert np.all(coverage==1)
canvas.convert('RGB').save(P/'check-合成.png')
diff=np.abs(np.array(canvas.convert('RGB'),dtype=np.int16)-a.astype(np.int16))
assert diff.max()==0
for name in ['空場','白板空白']:
 im=Image.open(P/f'codex-{name}.png')
 assert im.mode=='RGB' and im.size==(1672,941)
empty=np.array(Image.open(P/'codex-空場.png'))
blank=np.array(Image.open(P/'codex-白板空白.png'))
bm=np.array(Image.open(P/'whiteboard-mask.png'))
assert np.array_equal(empty[bm==0],blank[bm==0])
report={'size':[1672,941],'layer_mode':'RGBA','background_mode':'RGB','max_composite_channel_error':int(diff.max()),'different_composite_pixels':int(np.any(diff,axis=2).sum()),'layers_cover_each_pixel_exactly_once':True,'blank_changes_only_whiteboard':True,'gym1_sha256':hashlib.sha256((P/'gym1.png').read_bytes()).hexdigest()}
(P/'check-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))
