# rocks/ preview — arch, six spires and the ledge kit on a flat sand plane.
# user args: view=all (default) | arch (front, like the reference) | arch34 (3/4) | inside (camera just behind the arch looking out -Z)
#            | ledge (ledge kit close-up, arch hidden)
extends Node3D

func _ready() -> void:
	var md := Look.mode()
	Look.plain_env(self, md)
	if md == "":
		_warm_light()
	var ground := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(1600, 1600)
	ground.mesh = pm
	var gm := StandardMaterial3D.new()
	gm.albedo_color = Color(0.85, 0.6, 0.35)
	gm.roughness = 1.0
	ground.material_override = gm
	add_child(ground)
	var view: String = Look.args().get("view", "all")
	if view != "ledge":   # the ledge close-up leaves the arch out so its base slab doesn't block the view
		add_child((load("res://rocks/arch.tscn") as PackedScene).instantiate())
	for i in Spires.COUNT:
		var s := Spires.make(i)
		s.position = Vector3(-200 + i * 80, 0, -170 - (i % 2) * 40)
		add_child(s)
	add_child((load("res://rocks/ledge.tscn") as PackedScene).instantiate())
	var cam := Camera3D.new()
	cam.fov = 50.0
	cam.near = 0.5
	cam.far = 5000.0
	add_child(cam)
	match view:
		"arch":
			cam.position = Vector3(0, 28, 125)
			cam.look_at(Vector3(0, 28, 0))
		"arch34":
			cam.position = Vector3(75, 22, 95)
			cam.look_at(Vector3(0, 28, 0))
		"inside":
			cam.position = Vector3(0, 8, 70)
			cam.look_at(Vector3(0, 16, -100))
		"ledge":
			cam.position = Vector3(-2, 8, 12)
			cam.look_at(Vector3(-16, 5, -26))
		_:
			cam.position = Vector3(0, 70, 260)
			cam.look_at(Vector3(0, 20, -60))
	cam.current = true
	Look.apply(self, md)

# low warm sun from the right / behind the arch, like the target's sunset
func _warm_light() -> void:
	for c in get_children():
		if c is WorldEnvironment:
			var env := (c as WorldEnvironment).environment
			env.background_color = Color(0.9, 0.62, 0.38)
			env.ambient_light_color = Color(1.0, 0.8, 0.62)
			env.ambient_light_energy = 0.45
		elif c is DirectionalLight3D:
			(c as DirectionalLight3D).light_energy = 0.55
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-14, 115, 0)
	sun.light_color = Color(1.0, 0.72, 0.46)
	sun.light_energy = 1.6
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 600.0
	add_child(sun)
