"""tools/compare.py <shot.png> <out.png> [label] — the target (arch_v2b, arch_v2a) and a shot side by side, plus
192×108 thumbnails of each (the layout check: the shapes must read at thumbnail size)."""
import sys
from PIL import Image, ImageDraw

TARGETS = [r"E:\tmp\sandworm_angles\arch_v2b.png", r"E:\tmp\sandworm_angles\arch_v2a.png"]
shot, out = sys.argv[1], sys.argv[2]
label = sys.argv[3] if len(sys.argv) > 3 else ""
W, H = 960, 540
ims = [Image.open(p).convert("RGB").resize((W, H)) for p in TARGETS[:1] + [shot]]
sheet = Image.new("RGB", (W * 2, H + 130), (20, 14, 10))
for i, im in enumerate(ims):
    sheet.paste(im, (i * W, 0))
    th = im.resize((192, 108)).resize((192, 108))
    sheet.paste(th, (i * W + 20, H + 12))
    sheet.paste(im.convert("L").resize((192, 108)).convert("RGB"), (i * W + 232, H + 12))
d = ImageDraw.Draw(sheet)
d.text((460, H + 20), "target arch_v2b", fill=(230, 200, 160))
d.text((W + 460, H + 20), "shot " + label, fill=(230, 200, 160))
sheet.save(out)
