extends SceneTree
# Prints a GLB's node tree with mesh AABBs and skeleton size:  -s tools/probe.gd -- res://models/x.glb
func _init() -> void:
	var a := OS.get_cmdline_user_args()
	var s: Node = (load(a[0] if a.size() > 0 else "res://models/boat.glb") as PackedScene).instantiate()
	root.add_child(s)
	await process_frame
	_walk(s, 0)
	quit()
func _walk(n: Node, d: int) -> void:
	var extra := ""
	if n is MeshInstance3D:
		var m := n as MeshInstance3D
		extra = " aabb=%s surf=%d" % [m.get_aabb(), m.mesh.get_surface_count()]
	if n is Skeleton3D:
		var sk := n as Skeleton3D
		var names := []
		for i in sk.get_bone_count(): names.append(sk.get_bone_name(i))
		extra = " bones=%d %s" % [sk.get_bone_count(), names]
	if n is Node3D:
		extra += " xf=%s" % (n as Node3D).transform
	print("  ".repeat(d), n.name, " <", n.get_class(), ">", extra)
	for c in n.get_children(): _walk(c, d + 1)
