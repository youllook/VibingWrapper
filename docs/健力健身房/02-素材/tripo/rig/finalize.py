# 縮放到 1.80 m、套用變換、材質不透明，存 blend 與 GLB
import bpy, numpy as np
bpy.ops.wm.open_mainfile(filepath=r"E:\tmp\gym\tripo\powerlifter_rig.blend")
arm=[o for o in bpy.data.objects if o.type=='ARMATURE'][0]
me=[o for o in bpy.data.objects if o.type=='MESH'][0]
k=1.80/me.dimensions.z
for o in list(bpy.data.objects):
    if o.type=='EMPTY' and o is not arm.parent and o.parent is not None and o.parent.type=='ARMATURE': pass
# 把 armature 從 node 空物件底下拿出來
mw=arm.matrix_world.copy(); arm.parent=None; arm.matrix_world=mw
arm.scale=(k,k,k)
bpy.ops.object.select_all(action='DESELECT')
for o in (arm,me): o.select_set(True)
bpy.context.view_layer.objects.active=arm
bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
for o in list(bpy.data.objects):
    if o.type=='EMPTY' and not o.children: bpy.data.objects.remove(o)
for o in list(bpy.data.objects):
    if o.type=='EMPTY' and o.name.lower()=='node_0' and not o.children: bpy.data.objects.remove(o)
for m in bpy.data.materials:
    m.surface_render_method='DITHERED'
    bs=m.node_tree.nodes.get('Principled BSDF')
    if bs:
        a=bs.inputs['Alpha']
        for l in list(a.links): m.node_tree.links.remove(l)
        a.default_value=1.0
    if hasattr(m,'blend_method'): m.blend_method='OPAQUE'
co=np.array([(me.matrix_world@v.co)[:] for v in me.data.vertices])
print('BOUNDS',co.min(0).round(3),co.max(0).round(3),'bones',len(arm.data.bones))
bpy.ops.wm.save_as_mainfile(filepath=r"E:\tmp\gym\tripo\powerlifter_rig_180.blend")
bpy.ops.object.select_all(action='DESELECT')
for o in (arm,me): o.select_set(True)
bpy.ops.export_scene.gltf(filepath=r"E:\DesktopPet\.claude\worktrees\american-gym-wallpaper-design-273587\themes\powerlifting-gym\models\powerlifter.glb",
    use_selection=True, export_skins=True, export_animations=False, export_yup=True, export_image_format='AUTO')
print('EXPORTED')
