extends SceneTree
# A skinned GLB's skeleton: rests, poses and the skin's binds.  -s tools/bones2.gd -- res://models/x.glb
func _init() -> void:
	var a := OS.get_cmdline_user_args()
	var s: Node3D = (load(a[0]) as PackedScene).instantiate()
	root.add_child(s)
	await process_frame
	var sk: Skeleton3D = s.find_child("Skeleton3D", true, false)
	print("skel xf ", sk.transform, " parent ", sk.get_parent().name, " ", (sk.get_parent() as Node3D).transform)
	for i in mini(sk.get_bone_count(), 8):
		print(i, " ", sk.get_bone_name(i), " parent ", sk.get_bone_parent(i), " rest ", sk.get_bone_rest(i).origin, " pose ", sk.get_bone_pose_position(i), " gpose ", sk.get_bone_global_pose(i).origin)
	var mi: MeshInstance3D = s.find_children("*", "MeshInstance3D", true, false)[0]
	print("skin binds ", mi.skin.get_bind_count(), " bind0 ", mi.skin.get_bind_name(0), " ", mi.skin.get_bind_pose(0))
	quit()
