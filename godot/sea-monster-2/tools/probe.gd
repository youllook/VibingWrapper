extends SceneTree
# Prints the kraken.glb node tree, meshes, AABBs and skeleton size.
func _init() -> void:
	var s: Node = (load("res://models/kraken.glb") as PackedScene).instantiate()
	root.add_child(s)
	_walk(s, 0)
	quit()
func _walk(n: Node, d: int) -> void:
	var extra := ""
	if n is MeshInstance3D:
		var m := n as MeshInstance3D
		extra = " aabb=%s surf=%d mat=%s" % [m.get_aabb(), m.mesh.get_surface_count(), m.mesh.surface_get_material(0)]
	if n is Skeleton3D:
		extra = " bones=%d" % (n as Skeleton3D).get_bone_count()
	if n is Node3D:
		extra += " xf=%s" % (n as Node3D).transform
	print("  ".repeat(d), n.name, " <", n.get_class(), ">", extra)
	if d < 4:
		for c in n.get_children(): _walk(c, d + 1)
