"""Rebuild all deliverables: python build_plates.py (Pillow, numpy, opencv-python)."""
from pathlib import Path
import json, hashlib
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
SIZE = (1672, 941)
SOURCE_SHA = '42536ce8b7fa90d41cfca3ac31eda8d04a61104877acb7e32b0c97f332185660'
def read(name):
    im = Image.open(ROOT/name).convert('RGB')
    if im.size != SIZE:
        im = im.resize(SIZE, Image.Resampling.LANCZOS)
    return np.asarray(im).astype(np.float32)
def save(a, name):
    Image.fromarray(np.uint8(np.clip(np.rint(a),0,255))).save(ROOT/name)
def poly(points, blur=1):
    im = Image.new('L',SIZE); ImageDraw.Draw(im).polygon(points,fill=255)
    return np.asarray(im.filter(ImageFilter.GaussianBlur(blur))).astype(np.float32)/255
def circles(items, blur=1):
    im = Image.new('L',SIZE); d=ImageDraw.Draw(im)
    for item in items:
        x,y=item['center']; r=item['radius']; d.ellipse((x-r,y-r,x+r,y+r),fill=255)
    return np.asarray(im.filter(ImageFilter.GaussianBlur(blur))).astype(np.float32)/255
def blend(a,b,m): return a*(1-m[...,None])+b*m[...,None]
def dump(name,data): (ROOT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def gauss(a,s): return cv2.GaussianBlur(a,(0,0),s)

def main():
    assert hashlib.sha256((ROOT/'gym4.png').read_bytes()).hexdigest()==SOURCE_SHA
    (ROOT/'.done').unlink(missing_ok=True)
    orig=read('gym4.png'); gen=read('generated-day.png')
    for n in ['day','shade','night']:
        save(read('generated-'+n+'.png'),'generated-'+n+'.png')
    board_points=[(1521,166),(1671,142),(1671,455),(1537,465)]
    mirror=poly([(803,263),(1478,158),(1503,637),(800,625)],0.8)
    # Foreground bench occludes the lower right mirror: it is not mirror glass.
    mirror*=1-poly([(1513,551),(1490,561),(1482,576),(1478,597),(1484,617),(1510,627),(1671,627),(1671,540)],0.8)
    board=poly(board_points,0.8)
    fan={'center':[1182,65],'radius':216,'canvas_size':list(SIZE),'units':'px','coordinate_origin':'top-left','note':'Full circular blade sweep, clipped at image edge; ceiling perspective makes visible blades elliptical.'}
    lamps=[{'name':n,'center':c,'radius':r} for n,c,r in [('red',[123,338],19),('yellow',[177,347],18),('white',[231,355],18)]]
    bulbs=[{'name':n,'center':[x,y],'radius':r,'in_mirror':ref} for n,x,y,r,ref in [
        ('left_wall',49,140,12,False),('bar_rack_wall',474,379,8,False),('pillar_wall',595,366,10,False),
        ('mirror_pendant_1',1061,347,6,True),('mirror_pendant_2',1194,343,11,True),
        ('mirror_pendant_3',1238,343,7,True),('mirror_pendant_4',1258,369,9,True),
        ('mirror_pendant_5',1371,341,11,True),('mirror_pendant_6',1470,309,12,True),
        ('mirror_distant_1',865,466,5,True),('mirror_distant_2',909,475,6,True),
        ('mirror_distant_3',1003,508,6,True),('mirror_distant_4',1250,517,7,True)]]
    windows=Image.new('L',SIZE); d=ImageDraw.Draw(windows)
    for p in [[(374,0),(547,0),(545,110),(374,28)],[(615,64),(768,157),(767,235),(614,160)],[(807,201),(854,230),(807,237)]]: d.polygon(p,fill=255)
    for p,w in [([(432,0),(430,57)],7), ([(474,0),(473,78)],7), ([(513,0),(511,98)],6), ([(376,4),(545,80)],5), ([(639,78),(637,174)],5), ([(662,94),(660,191)],5), ([(687,110),(685,205)],5), ([(712,125),(710,214)],6), ([(739,143),(737,224)],5), ([(614,111),(768,196)],5), ([(824,211),(824,235)],4), ([(841,220),(841,232)],4)]: d.line(p,fill=0,width=w)
    windows=np.asarray(windows.filter(ImageFilter.GaussianBlur(.65))).astype(np.float32)/255
    # Local replacement regions. Untouched pixels outside this mask remain identical.
    roof=poly([(956,0),(1409,0),(1404,131),(1205,169),(1055,165),(959,117)],3)
    motor=poly([(1171,0),(1193,0),(1197,45),(1206,57),(1204,74),(1189,83),(1170,77),(1163,65),(1172,49)],1)
    roof*=1-motor
    haze=poly([(561,108),(609,60),(790,176),(790,627),(685,626),(679,526),(615,520),(608,431),(559,429)],5)
    # Keep physical lamp, pillar hardware and foreground equipment unchanged.
    haze*=1-circles([{'center':[595,366],'radius':25}],4)
    edit=np.maximum.reduce([mirror,board,roof,haze])
    day=blend(orig,gen,edit)
    save(edit*255,'mask-edit-day.png')
    # Transfer illumination only. All high-frequency geometry comes from day.
    # Foreground objects are protected against accidental omissions in generated sources.
    equipment=np.maximum.reduce([
        poly([(0,395),(287,394),(293,676),(0,704)],5),
        poly([(301,151),(482,164),(481,572),(527,605),(533,675),(306,678)],4),
        poly([(1477,552),(1671,541),(1671,940),(1434,916),(1435,837),(1509,827),(1514,654),(1470,635)],4)])
    plates={}
    for name,gain in [('shade',.74),('night',.30)]:
        target=read('generated-'+name+'.png')
        base_low=gauss(day,3)
        target_low=gauss(target,3)
        ratio=np.clip((target_low+2)/(base_low+2),.025,3.0)
        ratio=blend(ratio,np.ones_like(ratio)*gain,equipment)
        out=np.clip((day+2)*ratio-2,0,255)
        # Mirror is intentionally soft, so use the generated mirror directly.
        out=blend(out,target,mirror)
        if name=='shade':
            out=blend(out,day,circles(lamps,2))
        else:
            # Exact dark lens silhouettes, no residual signal-light emission.
            out=blend(out,target,circles([dict(v,radius=v['radius']+9) for v in lamps],3))
        plates[name]=out
    shade,night=plates['shade'],plates['night']
    for name,a in [('day',day),('shade',shade),('night',night)]: save(a,'plate-'+name+'.png')
    floor=poly([(0,699),(673,671),(1450,712),(1484,805),(1422,940),(0,940)],1)
    lum=lambda a: a@np.array([.2126,.7152,.0722])
    difference=gauss(lum(day)-lum(shade),1)
    sun=np.clip((difference-26)/48,0,1)*floor
    sun=gauss(sun,.8)
    masks={'windows':windows,'mirror':mirror,'floor-sun':sun,'fan':circles([fan]),'lamps':circles(lamps),'board':board,'bulbs':circles(bulbs)}
    for name,m in masks.items(): save(m*255,'mask-'+name+'.png')
    meta={'canvas_size':list(SIZE),'units':'px','coordinate_origin':'top-left'}
    dump('fan.json',fan); dump('lamps.json',dict(meta,lamps=lamps))
    dump('board.json',dict(meta,corner_order=['top-left','top-right','bottom-right','bottom-left'],corners=board_points))
    dump('bulbs.json',dict(meta,bulbs=bulbs))
    colors=[(80,190,255),(200,100,255),(255,208,40),(70,255,130),(255,80,100),(50,240,225),(255,145,40)]
    overlay=orig.copy()
    for (name,m),c in zip(masks.items(),colors): overlay=blend(overlay,np.full_like(orig,c),m*.46)
    im=Image.fromarray(np.uint8(np.clip(overlay,0,255))); d=ImageDraw.Draw(im)
    font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',18)
    for i,((name,m),c) in enumerate(zip(masks.items(),colors)):
        x=18+i*232; d.rectangle((x,904,x+224,933),fill=(18,20,24)); d.rectangle((x+6,913,x+18,925),fill=c);d.text((x+25,908),name,fill='white',font=font)
    im.save(ROOT/'check-遮罩.png')
    sheet=Image.new('RGB',SIZE,(15,15,15)); d=ImageDraw.Draw(sheet)
    for i,(label,a) in enumerate([('ORIGINAL',orig),('DAY',day),('SHADE',shade),('NIGHT',night)]):
        x=(i%2)*836; y=(i//2)*470
        tile=Image.fromarray(np.uint8(np.clip(a,0,255))).resize((836,470),Image.Resampling.LANCZOS)
        sheet.paste(tile,(x,y)); d.rectangle((x+8,y+8,x+130,y+37),fill=(15,15,15)); d.text((x+18,y+12),label,font=font,fill='white')
    sheet.save(ROOT/'check-三張.png')
    assert all(Image.open(ROOT/('mask-'+n+'.png')).mode=='L' for n in masks)
    assert all(Image.open(p).size==SIZE for p in ROOT.glob('*.png'))
    assert hashlib.sha256((ROOT/'gym4.png').read_bytes()).hexdigest()==SOURCE_SHA
    unchanged=np.all(np.uint8(np.rint(day))==orig.astype(np.uint8),axis=2)
    report={'canvas_size':list(SIZE),'source_sha256':SOURCE_SHA,'source_unchanged':True,'outside_day_edit_mask_pixels_exact':bool(unchanged[edit==0].all()),'day_unchanged_pixel_fraction':float(unchanged.mean()),'bulb_count':len(bulbs),'png_modes':{p.name:Image.open(p).mode for p in ROOT.glob('*.png')},'method':'Masked day inpainting; shade/night illumination transfer preserving day geometry, protected equipment and local mirror replacement.'}
    dump('validation.json',report)
    print(json.dumps(report,ensure_ascii=False,indent=2))
    # Completion marker is created only after programmatic checks; visual QA done separately.
    (ROOT/'.done').touch()

if __name__=='__main__': main()
