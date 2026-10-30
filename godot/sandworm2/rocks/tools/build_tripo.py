# Blender 5.2 headless: the Tripo arch + lower-left ledge (regenerated from Codex refs) -> rocks/arch.glb, rocks/ledge_left.glb
#   blender -b -P rocks/tools/build_tripo.py -- <sandworm2 dir>
# Both: uniform scale to real metres, origin = ground centre, base at 0, material opaque (Tripo exports BLEND),
# keep base colour + normal map, drop the rm map (roughness 0.95, metallic 0).
# Facing: the reference image's front must face blender -Y (= godot +Z, toward the camera). The heavy side
# (arch: thick upper-left span; ledge: tall stack) is on the viewer's LEFT in the refs, i.e. -X when seen from +Z;
# if the mesh has it at +X the object is turned 180 degrees.
import bpy, sys, os
from mathutils import Vector, Matrix

ROOT = sys.argv[sys.argv.index('--') + 1]
SRC = os.path.join(ROOT, 'models', 'src')
OUT = os.path.join(ROOT, 'rocks')


def load(name):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, name))
    o = [o for o in bpy.data.objects if o.type == 'MESH'][0]
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o


def heavy_side(o, zfrac):
    """mean X of the verts in the top part of the object (above zfrac of its height)"""
    zs = [v.co.z for v in o.data.vertices]
    z0, z1 = min(zs), max(zs)
    top = [v.co.x for v in o.data.vertices if v.co.z > z0 + zfrac * (z1 - z0)]
    return sum(top) / len(top)


def fix_material(o):
    for m in o.data.materials:
        m.blend_method = 'OPAQUE' if hasattr(m, 'blend_method') else None
        if hasattr(m, 'surface_render_method'):
            m.surface_render_method = 'DITHERED'
        nt = m.node_tree
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        for inp in ('Alpha', 'Roughness', 'Metallic'):
            for l in list(bsdf.inputs[inp].links):
                nt.links.remove(l)
        bsdf.inputs['Alpha'].default_value = 1.0
        bsdf.inputs['Roughness'].default_value = 0.95
        bsdf.inputs['Metallic'].default_value = 0.0
        for n in list(nt.nodes):
            if n.type == 'TEX_IMAGE' and n.image and '_rm' in n.image.name:
                nt.nodes.remove(n)
            elif n.type == 'SEPARATE_COLOR':
                nt.nodes.remove(n)


def place(o, height=None, width=None):
    me = o.data
    if heavy_side(o, 0.6) > 0:
        me.transform(Matrix.Rotation(3.14159265, 4, 'Z'))
        print(o.name, 'turned 180')
    vs = [v.co for v in me.vertices]
    mn = Vector([min(p[i] for p in vs) for i in range(3)]); mx = Vector([max(p[i] for p in vs) for i in range(3)])
    s = height / (mx.z - mn.z) if height else width / (mx.x - mn.x)
    c = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    me.transform(Matrix.Scale(s, 4) @ Matrix.Translation(-c))
    me.update()
    vs = [v.co for v in me.vertices]
    mn = Vector([min(p[i] for p in vs) for i in range(3)]); mx = Vector([max(p[i] for p in vs) for i in range(3)])
    print('PLACED', o.name, 'scale', round(s, 3), 'bbox', tuple(round(x, 2) for x in mn), tuple(round(x, 2) for x in mx),
          'tris', sum(len(p.vertices) - 2 for p in me.polygons), 'heavyX', round(heavy_side(o, 0.6), 2))
    return vs


def export(o, path):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=True, export_tangents=True, export_materials='EXPORT', export_image_format='AUTO')


# ---- arch ----
o = load('sw2_arch.glb')
o.name = 'arch'
vs = place(o, height=60.0)
gaps = []
# opening measurements (the slab at the base joins the legs, so look for the gap above it)
for z0 in range(0, 60, 4):
    band = [p for p in vs if z0 <= p.z < z0 + 4 and abs(p.y) < 6]
    xs = sorted(p.x for p in band)
    # largest empty run in x around the centre
    best = (0, 0, 0)
    for a, b in zip(xs, xs[1:]):
        if b - a > best[0]:
            best = (b - a, a, b)
    print('GAP z', z0, 'w', round(best[0], 2), 'from', round(best[1], 2), 'to', round(best[2], 2))
    if 12 <= z0 <= 24:
        gaps.append(best)
# centre the opening on x = 0 (the widest band, 12-28 m up, is the 'between the legs' reference)
w, a, b = max(gaps)
cx = sum((g[1] + g[2]) / 2 for g in gaps) / len(gaps)
o.data.transform(Matrix.Translation(Vector((-cx, 0, 0))))
o.data.update()
vs = [v.co for v in o.data.vertices]
under = min(p.z for p in vs if abs(p.x) < 4 and abs(p.y) < 6 and p.z > 10)
print('ARCH opening centre shift', round(-cx, 2), 'widest', round(w, 2), 'underside at centre', round(under, 2),
      'x range', round(min(p.x for p in vs), 2), round(max(p.x for p in vs), 2))
fix_material(o)
export(o, os.path.join(OUT, 'arch.glb'))

# ---- ledge ----
o = load('sw2_ledge_left.glb')
o.name = 'ledge_left'
place(o, width=28.0)
fix_material(o)
export(o, os.path.join(OUT, 'ledge_left.glb'))
print('DONE')
