# worm/ preview: the worm on a flat sand plane, a camera on the maw.
# user args: lip= bend= sink= yaw= (worm exports) · view=front|side|wide · dist= (metres from the maw, front view)
extends Node3D

func _ready() -> void:
	var a := Look.args()
	var md := Look.mode()
	Look.plain_env(self, md)
	var worm: Node3D = load("res://worm/worm.tscn").instantiate()
	worm.lip = float(a.get("lip", "0.8"))
	worm.bend = float(a.get("bend", "0.1"))
	worm.sink = float(a.get("sink", "0"))
	worm.yaw = float(a.get("yaw", "0"))
	add_child(worm)
	for h in String(a.get("hide", "")).split(",", false):   # debug: hide meshes whose name contains h
		for mi in worm.find_children("*" + h + "*", "GeometryInstance3D", true, false):
			mi.visible = false
	var ground := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(600, 600)
	ground.mesh = pm
	var gm := StandardMaterial3D.new()
	gm.albedo_color = Color(0.85, 0.6, 0.36)
	ground.material_override = gm
	add_child(ground)
	if md == "":
		var key := DirectionalLight3D.new()   # warm low sun from the right, like the target
		key.light_color = Color(1.0, 0.78, 0.55)
		key.light_energy = 1.4
		add_child(key)
		key.look_at_from_position(Vector3(1, 0.35, 0.6), Vector3.ZERO)
		key.position = Vector3.ZERO
		var fill := OmniLight3D.new()     # a little front light so the maw reads
		fill.omni_range = 400
		fill.light_energy = 0.6
		fill.light_color = Color(1.0, 0.85, 0.7)
		add_child(fill)
		fill.position = Vector3(0, 90, 120)
	Look.apply(self, md)
	var cam := Camera3D.new()
	cam.fov = 40
	cam.far = 5000
	add_child(cam)
	await get_tree().process_frame
	if a.has("stats"):   # debug: triangle count of everything under the worm
		var tris := 0
		for g in worm.find_children("*", "GeometryInstance3D", true, false):
			if g is MeshInstance3D and g.mesh:
				for si in g.mesh.get_surface_count():
					var ar: Array = g.mesh.surface_get_arrays(si)
					var ix = ar[Mesh.ARRAY_INDEX]
					tris += (ix.size() if ix else (ar[Mesh.ARRAY_VERTEX] as PackedVector3Array).size()) / 3
			elif g is MultiMeshInstance3D:
				var mmesh: Mesh = g.multimesh.mesh
				var ar: Array = mmesh.surface_get_arrays(0)
				var ix = ar[Mesh.ARRAY_INDEX]
				tris += (ix.size() if ix else (ar[Mesh.ARRAY_VERTEX] as PackedVector3Array).size()) / 3 * g.multimesh.instance_count
		push_warning("STATS tris=%d" % tris)
	var maw: Node3D = worm.find_child("Maw", true, false)
	var o := maw.global_position
	var z := maw.global_transform.basis.z.normalized()
	var view: String = a.get("view", "front")
	if view == "front":
		cam.look_at_from_position(o + z * float(a.get("dist", "70")), o)
	elif view == "side":
		cam.look_at_from_position(Vector3(230, 60, 20), Vector3(0, 60, 0))
	else:   # roughly the main scene's distance: the whole worm from 400 m, eye height 8 m
		cam.look_at_from_position(Vector3(0, 8, 400), Vector3(0, 60, 0))
