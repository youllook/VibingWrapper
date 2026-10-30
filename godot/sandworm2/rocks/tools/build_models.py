# Blender 5.2 headless: stone arch + six spires -> rocks/. Run:
#   blender -b -P rocks/tools/build_models.py -- <sandworm2 dir> <spires_basecolor_2048.jpg>
# Arch: legs rotated onto the X axis (opening faces +-Y blender = +-Z godot), uniform scale so the
# native scale (arch.gd stretches it to the wanted opening/height), origin = ground midpoint between the legs.
# Spires: each object -> its own glTF (separate, shared jpg), origin = base centre, base at 0.
import bpy, sys, math, os
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
ROOT = argv[0]
SPIRE_TEX = argv[1]
SRC = os.path.join(ROOT, 'models', 'src')
OUT = os.path.join(ROOT, 'rocks')
OPENING = 45.0      # target inner opening width (m) measured 4-16 m above ground
MAX_TRIS_ARCH = 60000

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)

def plain_material(name, img_path, rough=0.95):
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(img_path)
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = 0.0
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = 0.2
    return m

def export(path, fmt='GLB', texdir=''):
    kw = dict(filepath=path, export_format=fmt, use_selection=True, export_yup=True, export_apply=True,
              export_tangents=False, export_materials='EXPORT', export_image_format='AUTO')
    if fmt == 'GLTF_SEPARATE':
        kw['export_texture_dir'] = texdir
    bpy.ops.export_scene.gltf(**kw)

def select_only(o):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o

# ---------------- arch ----------------
reset()
bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, 'stone_arch.glb'))
arch = [o for o in bpy.data.objects if o.type == 'MESH'][0]
select_only(arch)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = arch.data
low = [v.co.copy() for v in me.vertices if v.co.z < 15]
# 2-means on the low verts (xy) -> the two legs
a, b = Vector((-30, -20, 0)), Vector((25, 16, 0))
for _ in range(20):
    A = [p for p in low if (p.xy - a.xy).length < (p.xy - b.xy).length]
    B = [p for p in low if (p.xy - a.xy).length >= (p.xy - b.xy).length]
    a = sum(A, Vector()) / len(A); b = sum(B, Vector()) / len(B)
ang = math.atan2(b.y - a.y, b.x - a.x)
print('LEGS', tuple(round(x, 2) for x in a), tuple(round(x, 2) for x in b), 'angle', math.degrees(ang))
mid = (a + b) / 2
mid.z = 0
me.transform(Matrix.Rotation(-ang, 4, 'Z') @ Matrix.Translation(-mid))
me.update()
vs = [v.co for v in me.vertices]
def gap(z0, z1):
    band = [p for p in vs if z0 <= p.z < z1 and abs(p.y) < 12]
    l = max(p.x for p in band if p.x < 0); r = min(p.x for p in band if p.x > 0)
    return l, r
for z0 in (0, 4, 8, 12, 16, 20, 28, 36):
    l, r = gap(z0, z0 + 4)
    print('GAP z', z0, round(l, 2), round(r, 2), 'w', round(r - l, 2))
under = min(p.z for p in vs if abs(p.x) < 4 and abs(p.y) < 12 and p.z > 8)
print('UNDERSIDE', round(under, 2), 'H', round(max(p.z for p in vs), 2))
ws = [gap(z, z + 4) for z in (4, 8, 12)]
w = sum(r - l for l, r in ws) / len(ws)
s = 1.0  # native size; arch.gd scales X/Y/Z separately (opening / height exports)
print('NATIVE_OPENING', round(w, 3))
cx = sum((l + r) / 2 for l, r in ws) / len(ws)   # centre the opening, not the leg centroids
me.transform(Matrix.Scale(s, 4) @ Matrix.Translation(Vector((-cx, 0, 0))))
me.update()
vs = [v.co for v in me.vertices]
mn = Vector([min(p[i] for p in vs) for i in range(3)]); mx = Vector([max(p[i] for p in vs) for i in range(3)])
print('ARCH scale', round(s, 4), 'bbox', tuple(round(x, 2) for x in mn), tuple(round(x, 2) for x in mx))
for z0 in (0, 4, 8, 12, 16, 20, 28, 36):
    l, r = gap(z0, z0 + 4)
    print('GAP2 z', z0, round(l, 2), round(r, 2), 'w', round(r - l, 2))
print('UNDERSIDE2', round(min(p.z for p in vs if abs(p.x) < 4 and abs(p.y) < 12 and p.z > 8), 2))
if tris(arch) > MAX_TRIS_ARCH:
    d = arch.modifiers.new('dec', 'DECIMATE'); d.ratio = MAX_TRIS_ARCH / tris(arch) * 0.98
    bpy.ops.object.modifier_apply(modifier='dec')
print('ARCH tris', tris(arch))
me.materials.clear()
me.materials.append(plain_material('arch_rock', os.path.join(SRC, 'stone_arch_stone_arch_basecolor.jpg')))
arch.name = 'arch'
select_only(arch)
if '--old-arch' in argv:   # superseded by build_tripo.py (sw2_arch.glb); kept only for reference
    export(os.path.join(OUT, 'arch_old.glb'))

# ---------------- spires ----------------
reset()
bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, 'rock_spires.glb'))
mat = plain_material('spire_rock', SPIRE_TEX)
mat.node_tree.nodes['Image Texture'].image.name = 'spires_basecolor'
objs = sorted([o for o in bpy.data.objects if o.type == 'MESH'], key=lambda o: o.name)
for i, o in enumerate(objs):
    select_only(o)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    vs = [v.co for v in o.data.vertices]
    z0 = min(p.z for p in vs)
    h = max(p.z for p in vs) - z0
    base = [p for p in vs if p.z < z0 + 0.2 * h]
    c = Vector(((min(p.x for p in base) + max(p.x for p in base)) / 2, (min(p.y for p in base) + max(p.y for p in base)) / 2, 0))
    o.data.transform(Matrix.Translation(Vector((-c.x, -c.y, -z0))))
    o.data.update()
    vs = [v.co for v in o.data.vertices]
    mn = Vector([min(p[k] for p in vs) for k in range(3)]); mx = Vector([max(p[k] for p in vs) for k in range(3)])
    o.location = (0, 0, 0)
    o.data.materials.clear(); o.data.materials.append(mat)
    o.name = 'spire_%d' % i
    print('SPIRE', i, 'tris', tris(o), 'bbox', tuple(round(x, 2) for x in mn), tuple(round(x, 2) for x in mx))
for i, o in enumerate(objs):
    select_only(o)
    export(os.path.join(OUT, 'spires', 'spire_%d.gltf' % i), 'GLTF_SEPARATE', '')
print('DONE')
