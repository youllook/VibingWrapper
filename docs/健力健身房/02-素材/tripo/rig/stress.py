import bpy, math, sys, os
from mathutils import Vector, Euler
argv = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
src = argv[0] if argv else r"E:\tmp\gym\tripo\powerlifter_rig.glb"
out = argv[1] if len(argv)>1 else r"E:\tmp\gym\tripo\stress"
os.makedirs(out, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
if src.endswith('.blend'):
    bpy.ops.wm.open_mainfile(filepath=src)
    bpy.context.scene.camera=None
else:
    bpy.ops.import_scene.gltf(filepath=src)
    for o in list(bpy.data.objects):
        if o.name=='Icosphere': bpy.data.objects.remove(o)
arm=[o for o in bpy.data.objects if o.type=='ARMATURE'][0]
me=[o for o in bpy.data.objects if o.type=='MESH'][0]
sc=bpy.context.scene
sc.render.engine='BLENDER_WORKBENCH'
sc.display.shading.light='STUDIO'; sc.display.shading.color_type='TEXTURE'
sc.display.shading.show_cavity=True
sc.render.resolution_x=600; sc.render.resolution_y=800
sc.world = sc.world or bpy.data.worlds.new('w')
cam=bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera=cam
cam.data.type='ORTHO'
H = me.dimensions.z
P = lambda n: arm.pose.bones.get('mixamorig:'+n) or arm.pose.bones.get(n)
def reset():
    for pb in arm.pose.bones: pb.rotation_mode='QUATERNION'; pb.rotation_quaternion=(1,0,0,0); pb.scale=(1,1,1); pb.location=(0,0,0)
def rot(n, x=0,y=0,z=0):
    # x=前彎(+)/後仰(-)、y=側傾、z=轉頭，全是世界軸（角色面朝 -Y）
    pb=P(n)
    if not pb: return
    R=Euler((math.radians(x),math.radians(y),math.radians(z)),'XYZ').to_matrix()
    B=(arm.matrix_world.to_3x3()@pb.bone.matrix_local.to_3x3()).normalized()
    pb.rotation_mode='QUATERNION'; pb.rotation_quaternion=(B.inverted()@R@B).to_quaternion()
SPLIT = P('Neck1') is not None
def nk(x=0,y=0,z=0):
    return [('Neck',x/2,y/2,z/2),('Neck1',x/2,y/2,z/2)] if SPLIT else [('Neck',x,y,z)]
poses = {
 'rest': [],
 'flex': [('Spine',25,0,0),('Spine1',15,0,0),('Spine2',10,0,0)],
 'squatlook': [('Spine',30,0,0),('Spine1',15,0,0),('Spine2',5,0,0),*nk(-25),('Head',-20,0,0)],
 'brace': [('Spine',-10,0,0),('Spine1',-10,0,0),('Spine2',-8,0,0),*nk(-15),('Head',-10,0,0),('S:Breath',1.06),('T:Belly',0.012)],
 'chindown': [*nk(25),('Head',20,0,0)],
 'grunt': [*nk(10),('Head',10,0,0),('Jaw',3,0,0)],
 'turn': [*nk(0,5,20),('Head',0,5,15)],
 'turnX': [*nk(0,8,25),('Head',0,10,30)],
}
names = argv[2].split(',') if len(argv)>2 else list(poses)
def shoot(tag, view):
    c=Vector((0,0,H*0.74))
    if view=='side': cam.location=c+Vector((-3,0,0)); cam.rotation_euler=(math.pi/2,0,-math.pi/2)
    elif view=='q': cam.location=c+Vector((-2.1,-2.1,0)); cam.rotation_euler=(math.pi/2,0,-math.pi/4)
    else: cam.location=c+Vector((0,-3,0)); cam.rotation_euler=(math.pi/2,0,0)
    cam.data.ortho_scale=H*0.62
    sc.render.filepath=os.path.join(out,f"{tag}_{view}.png")
    bpy.ops.render.render(write_still=True)
for n in names:
    reset()
    for e in poses[n]:
        if e[0].startswith('S:'):
            pb=P(e[0][2:]); 
            if pb: pb.scale=(e[1],)*3
        elif e[0].startswith('T:'):
            pb=P(e[0][2:])
            if pb: pb.location=(0,e[1],0)   # 骨頭本地 Y＝沿骨（朝前）
        else: rot(*e)
    bpy.context.view_layer.update()
    for v in (['side','q'] if n not in('turn','turnX','grunt') else ['front','q']): shoot(n,v)
print('DONE', [b.name for b in arm.data.bones][:0])
