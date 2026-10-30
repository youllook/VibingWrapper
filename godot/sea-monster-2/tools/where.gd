extends SceneTree
# Where the big squid and its eyes end up: tools/where.gd -- <state> <seconds>
func _init() -> void:
	var a := OS.get_cmdline_user_args()
	var main: Node = (load("res://main.tscn") as PackedScene).instantiate()
	root.add_child(main)
	await process_frame
	main.state = a[0] if a.size() > 0 else "storm"
	for i in int((float(a[1]) if a.size() > 1 else 30.0) * 30.0):
		main._step(1.0 / 30.0)
	await process_frame
	await process_frame
	print("squid_at=", main.squid_at, " pos=", main.squid.global_position, " depth=", main.depth.v, " visible=", main.squid.visible, " base_y=", main.squid_base_y)
	for e in main.eyes:
		print(e.name, " at ", e.global_position, " screen ", main.cam.unproject_position(e.global_position))
	print("boat ", main.boat_pos, " screen ", main.cam.unproject_position(main.boat_pos))
	quit()
