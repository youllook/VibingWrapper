# Blender 5.2 headless: procedural rock slabs -> rocks/ledge_extras.glb (steps unused since the Tripo ledge; rubble + block are extras).
#   blender -b -P rocks/tools/build_ledge.py -- <sandworm2 dir> [seed]
# Blender frame (exported Y-up: blender +Y = godot -Z, away from the camera).
#   steps  : stacked horizontal slabs, tiers climb toward -X (left), origin = front-right foot of the stack
#   rubble : flat broken stones scattered along a strip, origin = strip centre
#   block  : a squat 3-slab block, origin = base centre
# Every vertex gets a colour (tops light, sides mid, undersides dark, per-slab tint) that the
# Godot material multiplies over the triplanar rock texture.
import bpy, sys, os, random, math
from mathutils import Vector, noise

argv = sys.argv[sys.argv.index('--') + 1:]
ROOT = argv[0]
SEED = int(argv[1]) if len(argv) > 1 else 7
OUT = os.path.join(ROOT, 'rocks', 'ledge_extras.glb')
rnd = random.Random(SEED)

bpy.ops.wm.read_factory_settings(use_empty=True)


def slab(name, size, loc, yaw=0.0, tilt=(0.0, 0.0), sub=3, rough=0.35, nscale=2.2):
    """a rounded, noise-chipped box. size=(x,y,z) metres, loc=centre of its bottom face"""
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    m = o.modifiers.new('sub', 'SUBSURF')
    m.levels = sub
    m.render_levels = sub
    m.subdivision_type = 'SIMPLE'
    bpy.ops.object.modifier_apply(modifier='sub')
    me = o.data
    hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
    rx, rz = min(0.5, hx * 0.5, hy * 0.5), min(0.2, hz * 0.4)
    off = Vector((rnd.uniform(0, 100), rnd.uniform(0, 100), rnd.uniform(0, 100)))
    for v in me.vertices:
        p = v.co.copy()
        inner = Vector((max(-hx + rx, min(hx - rx, p.x)), max(-hy + rx, min(hy - rx, p.y)), max(-hz + rz, min(hz - rz, p.z))))
        d = p - inner
        n = d.normalized() if d.length > 1e-6 else Vector((0, 0, 1))
        if d.length > 1e-6:
            p = inner + n * min(d.length, max(rx, rz))
        q = (p + off) / nscale
        f = noise.fractal(q, 0.6, 2.0, 4) * rough
        side = 1.0 - abs(n.z) * 0.7          # chip the sides harder than the flat tops: strata stay readable
        p = p + n * f * side
        band = 0.06 * math.sin(p.z * 9.0 + off.x)   # faint horizontal banding on the sides
        p.x += n.x * band
        p.y += n.y * band
        v.co = p
    me.update()
    o.rotation_euler = (tilt[0], tilt[1], yaw)
    o.location = (loc[0], loc[1], loc[2] + hz)
    bpy.ops.object.transform_apply(location=True, rotation=True)
    o['tint'] = rnd.uniform(0.82, 1.08)
    return o


def colourize(o):
    me = o.data
    if 'Col' not in me.color_attributes:
        me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    ca = me.color_attributes['Col']
    t = o.get('tint', 1.0)
    for v in me.vertices:
        nz = v.normal.z
        c = 0.6 + 0.4 * max(0.0, nz) if nz > -0.2 else 0.6 + 1.0 * (nz + 0.2)   # undersides dark
        c = max(0.22, min(1.0, c))
        r = (c + noise.noise(v.co * 0.7) * 0.08) * t
        ca.data[v.index].color = (min(1, r), min(1, r * 0.97), min(1, r * 0.93), 1.0)


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        colourize(o)
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    bpy.ops.object.shade_smooth()
    return o


def drop_onto(objs, others):
    """sit each object on whatever is under its centre (ray down through the `others`)"""
    for o in objs:
        o.hide_set(True)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        c = sum((v.co for v in o.data.vertices), Vector()) / len(o.data.vertices)
        zmin = min(v.co.z for v in o.data.vertices)
        hit, loc, *_ = bpy.context.scene.ray_cast(dg, Vector((c.x, c.y, 200)), Vector((0, 0, -1)))
        top = loc.z if hit else 0.0
        for v in o.data.vertices:
            v.co.z += top - zmin - 0.12
        o.data.update()
    for o in objs:
        o.hide_set(False)


# ---- steps: tiers rising to the left (-x) and back (+y) ----
steps = []
z = 0.0
STEP_X = 2.6
for k in range(7):
    th = rnd.uniform(0.9, 1.9) if k else rnd.uniform(0.6, 1.0)
    width = 26.0 - k * STEP_X
    depth = 18.0 - k * 1.2
    y0 = k * 1.1
    n = rnd.randint(2, 4)
    edges = [0.0] + sorted(rnd.uniform(0.15, 0.85) for _ in range(n - 1)) + [1.0]
    for i in range(n):
        a, b = edges[i], edges[i + 1]
        w = (b - a) * width - rnd.uniform(0.15, 0.5)
        cx = -k * STEP_X - (1 - (a + b) / 2) * width
        d = depth * rnd.uniform(0.85, 1.0)
        over = rnd.uniform(0.0, 0.6)
        cy = y0 + d / 2 - over
        steps.append(slab('s%d_%d' % (k, i), (w + over, d, th), (cx + rnd.uniform(-0.3, 0.3), cy, z - 0.05),
                          yaw=rnd.uniform(-0.05, 0.05), tilt=(rnd.uniform(-0.02, 0.02), rnd.uniform(-0.03, 0.03)),
                          sub=3, rough=0.45))
    z += th * rnd.uniform(0.92, 0.98)
loose = []
for i in range(9):
    k = rnd.randint(0, 5)
    s = rnd.uniform(0.7, 2.0)
    loose.append(slab('loose%d' % i, (s * rnd.uniform(1.0, 2.2), s * rnd.uniform(0.8, 1.6), s * rnd.uniform(0.4, 0.8)),
                      (-rnd.uniform(1, 10) - k * STEP_X, rnd.uniform(0.5, 2.5) + k * 1.1, 0.0),
                      yaw=rnd.uniform(0, 6.28), sub=2, rough=0.3, nscale=1.0))
drop_onto(loose, steps)
steps_o = join(steps + loose, 'steps')

# ---- rubble: flat broken stones in a strip 44 m wide, 7 m deep, centred on its origin ----
rub = []
for i in range(46):
    s = rnd.uniform(0.35, 2.4) ** 1.2
    rub.append(slab('r%d' % i, (s * rnd.uniform(1.0, 2.0), s * rnd.uniform(0.8, 1.5), s * rnd.uniform(0.3, 0.6)),
                    (rnd.uniform(-22, 22), rnd.uniform(-3.5, 3.5), -0.1 * s), yaw=rnd.uniform(0, 6.28),
                    tilt=(rnd.uniform(-0.25, 0.25), rnd.uniform(-0.25, 0.25)),
                    sub=2, rough=0.25 * s + 0.1, nscale=max(0.6, s)))
rubble_o = join(rub, 'rubble')

# ---- block: squat 3-slab stack ~9.5 x 7.5 x 5.8 m, origin base centre ----
blk = []
z = 0.0
for k, (w, d, th) in enumerate([(9.5, 7.5, 2.4), (8.6, 6.8, 2.0), (7.0, 5.5, 1.6)]):
    blk.append(slab('b%d' % k, (w, d, th), (rnd.uniform(-0.6, 0.6) - k * 0.3, rnd.uniform(-0.4, 0.4) + k * 0.4, z - 0.05),
                    yaw=rnd.uniform(-0.08, 0.08), sub=3, rough=0.55))
    z += th * 0.95
block_o = join(blk, 'block')

for o in (steps_o, rubble_o, block_o):
    vs = [v.co for v in o.data.vertices]
    print('LEDGE', o.name, 'tris', sum(len(p.vertices) - 2 for p in o.data.polygons),
          'bbox', tuple(round(min(v[i] for v in vs), 2) for i in range(3)), tuple(round(max(v[i] for v in vs), 2) for i in range(3)))

mat = bpy.data.materials.new('ledge_rock')
for o in (steps_o, rubble_o, block_o):
    o.data.materials.clear()
    o.data.materials.append(mat)
    o.data.color_attributes.active_color = o.data.color_attributes['Col']
bpy.ops.object.select_all(action='SELECT')
kw = dict(filepath=OUT, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
          export_tangents=False, export_materials='PLACEHOLDER')
try:
    bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
except TypeError:
    bpy.ops.export_scene.gltf(**kw)
print('DONE')
