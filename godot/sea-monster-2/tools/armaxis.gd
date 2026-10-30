extends SceneTree
# Which local bone axis bends an arm up/down: rotate every bone of each limb by 0.15 rad about X, then Z, and print
# how far the tip moves vertically vs sideways (in the kraken node's space, +Y = its back).
func _init() -> void:
	var node: Node3D = (load("res://models/kraken.glb") as PackedScene).instantiate()
	root.add_child(node)
	var sk: Skeleton3D = node.find_child("Skeleton3D", true, false)
	for limb in ["arm_1_", "arm_4_", "arm_7_", "tentacle_1_"]:
		var bones := []
		for j in 22:
			var bi := sk.find_bone(limb + "%02d" % j)
			if bi >= 0:
				bones.append(bi)
		var tip: int = bones[-1]
		var rest := []
		for b in bones:
			rest.append(sk.get_bone_pose_rotation(b))
		var p0 := gpose(sk, tip).origin
		for axis in [Vector3(1, 0, 0), Vector3(0, 0, 1)]:
			for i in bones.size():
				sk.set_bone_pose_rotation(bones[i], rest[i] * Quaternion(axis, 0.15))
			var d := gpose(sk, tip).origin - p0
			print("%s axis %s: up %.2f side %.2f" % [limb, axis, d.y, Vector2(d.x, d.z).length()])
			for i in bones.size():
				sk.set_bone_pose_rotation(bones[i], rest[i])
	quit()

# the bone's pose in skeleton space, multiplying the local poses up the parent chain (the skeleton's own cache
# is only refreshed on its next update)
func gpose(sk: Skeleton3D, b: int) -> Transform3D:
	var t := sk.get_bone_pose(b)
	var p := sk.get_bone_parent(b)
	while p >= 0:
		t = sk.get_bone_pose(p) * t
		p = sk.get_bone_parent(p)
	return t
