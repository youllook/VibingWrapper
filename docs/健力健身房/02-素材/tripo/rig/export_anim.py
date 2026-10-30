import bpy
bpy.ops.wm.open_mainfile(filepath=r"E:\tmp\gym\tripo\powerlifter_anim.blend")
arm=[o for o in bpy.data.objects if o.type=='ARMATURE'][0]; me=[o for o in bpy.data.objects if o.type=='MESH'][0]
bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True); me.select_set(True)
bpy.context.view_layer.objects.active=arm
bpy.ops.export_scene.gltf(filepath=r"E:\DesktopPet\.claude\worktrees\american-gym-wallpaper-design-273587\themes\powerlifting-gym\models\powerlifter.glb",
    use_selection=True, export_skins=True, export_animations=True, export_animation_mode='ACTIONS',
    export_force_sampling=True, export_frame_step=1, export_yup=True, export_def_bones=False,
    export_anim_single_armature=True, export_optimize_animation_size=True)
print('EXPORTED')
