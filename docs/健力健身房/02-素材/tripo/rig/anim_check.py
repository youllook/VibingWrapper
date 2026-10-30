# 動作檢查：槓鈴掛 Bar 骨、凳子、地板，每段抽幾格算圖
# blender -b -P anim_check.py -- <動作,動作> <輸出資料夾> [格數]
import bpy, math, sys, os
from mathutils import Vector
args = sys.argv[sys.argv.index('--') + 1:]
names = args[0].split(','); out = args[1]; K = int(args[2]) if len(args) > 2 else 6
os.makedirs(out, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=r"E:\tmp\gym\tripo\powerlifter_anim.blend")
sc = bpy.context.scene
arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]

def mat(name, rgb):
    m = bpy.data.materials.new(name); m.diffuse_color = (*rgb, 1); return m
iron = mat('iron', (0.08, 0.08, 0.09)); steel = mat('steel', (0.6, 0.6, 0.62)); wood = mat('wood', (0.45, 0.3, 0.18))
from mathutils import Matrix
bpy.ops.mesh.primitive_cylinder_add(radius=0.014, depth=2.2)
bar = bpy.context.object; bar.data.materials.append(steel)
for sx in (-1, 1):
    for k in range(4):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.225, depth=0.055, location=(0, 0, sx * (0.70 + k * 0.06)))
        p = bpy.context.object; p.data.materials.append(iron); p.parent = bar
def place_bar():
    bpy.context.view_layer.update()
    pb = arm.pose.bones['Bar']
    bar.matrix_world = arm.matrix_world @ pb.matrix @ Matrix.Rotation(-math.pi / 2, 4, 'X')
bpy.ops.mesh.primitive_plane_add(size=6); fl = bpy.context.object; fl.data.materials.append(mat('floor', (0.25, 0.22, 0.2)))
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.10, 0.215)); bench = bpy.context.object
bench.scale = (1.2, 0.30, 0.43); bench.data.materials.append(mat('bench', (0.6, 0.1, 0.1)))

sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
sc.display.shading.show_shadows = True
sc.render.resolution_x = 520; sc.render.resolution_y = 640
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 50
views = {'c': (Vector((-1.0, -1.6, 1.65)), Vector((0, 0.1, 1.40))), 'q': (Vector((-2.6, -3.6, 1.3)), Vector((0, 0.1, 0.95))), 's': (Vector((-3.4, 2.9, 1.3)), Vector((0, 0.1, 0.9)))}
def look(c, t):
    cam.location = c; d = (t - c).normalized()
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
for n in names:
    act = bpy.data.actions[n]
    arm.animation_data.action = act
    arm.animation_data.action_slot = act.slots[0]
    bench.hide_render = n != 'Sit'
    bar.hide_render = n in ('Sit', 'Chalk', 'Walk')
    for c in bar.children: c.hide_render = bar.hide_render
    f0, f1 = act.frame_range
    for i in range(K):
        f = round(f0 + (f1 - f0) * i / (K - 1))
        sc.frame_set(f); place_bar()
        for v, (c, t) in views.items():
            look(c, t)
            sc.render.filepath = os.path.join(out, f'{n}_{v}_{i}.png'); bpy.ops.render.render(write_still=True)
print('DONE')
