extends SceneTree
# The water's projected grid on the CPU: for a column of NDC rows, where the base point lands and how high the sea
# is there, vs the camera.  -s tools/grid.gd -- storm 25
func _init() -> void:
	var a := OS.get_cmdline_user_args()
	var main: Node = (load("res://main.tscn") as PackedScene).instantiate()
	main.state = a[0] if a.size() > 0 else "storm"
	root.add_child(main)
	await process_frame
	for i in int((float(a[1]) if a.size() > 1 else 25.0) * 30.0):
		main._step(1.0 / 30.0)
	await process_frame
	var cam: Camera3D = main.cam
	var wp: Array = main._wave_params()
	var co := cam.global_position
	print("cam ", co, " basis ", cam.global_transform.basis)
	var ip := cam.get_camera_projection().inverse()
	for ny in [0.0, -0.5, -0.8, -1.0, -1.3, -1.6, -2.0, -2.5, -3.0, -3.5]:
		var vp := ip * Vector4(0.0, ny, 0.5, 1.0)
		var vd := Vector3(vp.x, vp.y, vp.z) / vp.w
		vd = vd.normalized()
		var rd := cam.global_transform.basis * vd
		rd.y = minf(rd.y, -0.003)
		var tt := co.y / -rd.y
		var p := Vector2(co.x, co.z) + Vector2(rd.x, rd.z) * tt
		var h: Vector3 = main._sea_at(p, wp[0], wp[1])
		print("ndc %5.2f  rd %s  base %s  dist %.2f  sea %.2f" % [ny, rd, p, tt, h.x])
	quit()
