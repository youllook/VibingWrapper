extends SceneTree
# Where things ended up: the fisherman's meshes and bones, the boat, the camera.  -s tools/where.gd
func _init() -> void:
	var main: Node = (load("res://main.tscn") as PackedScene).instantiate()
	root.add_child(main)
	await process_frame
	await process_frame
	var f: Node3D = main.fisher
	print("fisher global ", f.global_transform)
	for m in f.find_children("*", "MeshInstance3D", true, false):
		var mi := m as MeshInstance3D
		print(mi.name, " global aabb ", mi.global_transform * mi.get_aabb(), " skin ", mi.skin != null)
	var sk: Skeleton3D = main.fisher_skel
	print("skel global ", sk.global_transform)
	for n in ["mixamorig_Hips", "mixamorig_Head", "mixamorig_RightHand", "mixamorig_LeftHand"]:
		var b := sk.find_bone(n)
		if b >= 0:
			print(n, " ", sk.global_transform * sk.get_bone_global_pose(b).origin)
	print("cam ", main.cam.global_position)
	quit()
