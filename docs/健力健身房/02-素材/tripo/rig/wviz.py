import bpy, math, numpy as np
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath=r"E:\tmp\gym\tripo\powerlifter_rig.blend")
me=[o for o in bpy.data.objects if o.type=='MESH'][0]
M='mixamorig:'
cols={'Spine':(0.3,0.3,0.3),'Spine1':(0.5,0.2,0.6),'Spine2':(1,0,1),'Neck':(1,0,0),'Neck1':(0,0.8,0.2),'Head':(0,0.3,1),'Jaw':(1,1,1),'Breath':(0,1,1),'Belly':(1,0.5,0)}
N=len(me.data.vertices); C=np.full((N,3),0.08)
gi={g.index:g.name.replace(M,'') for g in me.vertex_groups}
for v in me.data.vertices:
    c=np.zeros(3); 
    for g in v.groups:
        n=gi[g.group]
        if n in cols: c+=g.weight*np.array(cols[n])
    C[v.index]=np.maximum(c,0.08)
a=me.data.color_attributes.new('w','FLOAT_COLOR','POINT')
for i in range(N): a.data[i].color=(*C[i],1)
sc=bpy.context.scene; sc.render.engine='BLENDER_WORKBENCH'
sc.display.shading.light='FLAT'; sc.display.shading.color_type='VERTEX'
sc.render.resolution_x=700; sc.render.resolution_y=900
cam=bpy.data.objects.new('c',bpy.data.cameras.new('c')); sc.collection.objects.link(cam); sc.camera=cam
cam.data.type='ORTHO'; cam.data.ortho_scale=0.5
outs=[]
for name,loc,rot in [('front',(0,-2,0.74),(math.pi/2,0,0)),('side',(-2,0,0.74),(math.pi/2,0,-math.pi/2)),('back',(0,2,0.74),(math.pi/2,0,math.pi))]:
    cam.location=loc; cam.rotation_euler=rot
    p=f"E:/tmp/gym/tripo/wviz_{name}.png"; sc.render.filepath=p; bpy.ops.render.render(write_still=True); outs.append(p)
