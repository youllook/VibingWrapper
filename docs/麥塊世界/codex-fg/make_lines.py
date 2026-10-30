from PIL import Image, ImageDraw
import json
import numpy as np

# Manually traced visible structural edges in the original mc1.png.
# No texture edges, outdoor edges or hidden geometry are invented.
paths = {
 'ceiling': [[(0,20),(79,52),(145,0)],[(0,155),(75,180)],[(80,132),(211,59)],[(307,70),(479,0)],[(358,91),(599,0)],[(378,105),(777,5)]],
 'left_wall': [[(78,130),(40,518)],[(102,139),(65,459)],[(211,0),(190,467)],[(245,0),(234,674)],[(294,0),(270,670)],[(312,70),(307,660)]],
 'small_window': [[(145,182),(204,155)],[(145,182),(136,299),(200,278)],[(136,313),(198,293)],[(136,313),(128,420)],[(190,310),(184,467)]],
 'large_frame': [[(359,91),(336,661),(775,733)],[(378,105),(343,653),(774,717)],[(777,5),(774,738),(813,746),(814,0)],[(833,0),(834,734)],[(854,0),(853,727),(1671,866)],[(813,746),(1671,901)],[(596,756),(1671,933)]],
 'table': [[(221,668),(595,736),(0,836)],[(595,736),(591,850),(534,875),(527,940)],[(591,850),(656,867),(655,940)],[(534,893),(655,878)],[(0,858),(522,770)]],
 'lantern': [[(10,540),(52,546),(221,536),(230,519),(18,519),(10,540)],[(10,540),(0,681),(17,700),(56,709),(218,692),(221,536)],[(52,546),(56,681),(218,666)],[(56,681),(56,709)],[(77,545),(78,677)],[(199,541),(196,668)],[(52,519),(55,475),(89,461),(190,469),(191,519)],[(88,462),(86,447),(115,446),(116,424),(155,423),(158,448),(168,449),(168,469)]]
}
im=Image.new('RGB',(1672,941),'black')
d=ImageDraw.Draw(im)
for group in paths.values():
 for points in group: d.line(points,fill='white',width=1)
im.save('fg_lines.png')
with open('structure_points.json','w',encoding='utf-8') as f: json.dump(paths,f,indent=2)
a=np.array(Image.open('mc1.png').convert('RGB'))
b=np.array(Image.open('fg.png').convert('RGB'))
m=(b[:,:,0]>220)&(b[:,:,1]<40)&(b[:,:,2]>220)
report={'size':list(Image.open('fg.png').size),'magenta_like_pixels':int(m.sum()),'exact_FF00FF_pixels':int(np.all(b==[255,0,255],axis=2).sum()),'changed_pixels_outside_magenta_region':int(np.any(a!=b,axis=2)[~m].sum()),'pixels_outside_magenta_region':int((~m).sum()),'pixel_perfect_pass':False,'lines_reference':'Manual visible structure tracing of mc1.png; approximate, not calibrated'}
with open('validation.json','w',encoding='utf-8') as f: json.dump(report,f,indent=2)
print(json.dumps(report))
