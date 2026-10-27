extends SceneTree
# Sea height in front of the boat vs the camera, a few seconds into a state:  -s tools/sea.gd -- storm 25
func _init() -> void:
	var a := OS.get_cmdline_user_args()
	var main: Node = (load("res://main.tscn") as PackedScene).instantiate()
	main.state = a[0] if a.size() > 0 else "storm"
	root.add_child(main)
	await process_frame
	for i in int((float(a[1]) if a.size() > 1 else 25.0) * 30.0):
		main._step(1.0 / 30.0)
	var wp: Array = main._wave_params()
	print("cam ", main.cam.global_position, " boat ", main.boat.position, " rot ", main.boat.rotation, " heave ", main.heave.v, " sea_k ", main.sea_k.v)
	for z in [0.0, -1.0, -2.0, -3.0, -4.0, -6.0, -8.0]:
		print("z ", z, " h ", main._sea_at(Vector2(0.0, z), wp[0], wp[1]).x)
	quit()
