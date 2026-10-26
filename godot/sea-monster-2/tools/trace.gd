extends SceneTree
# Prints, once a second, what the fish are doing in a state: tools/trace.gd -- <state> <seconds>
func _init() -> void:
	var a := OS.get_cmdline_user_args()
	var main: Node = (load("res://main.tscn") as PackedScene).instantiate()
	root.add_child(main)
	await process_frame
	main.state = a[0] if a.size() > 0 else "storm"
	for sec in (int(a[1]) if a.size() > 1 else 40):
		for i in 30:
			main._step(1.0 / 30.0)
		var F: Array = main.fishes.fish
		var on := 0
		var scared := 0
		for f in F:
			if not main.fishes.off_screen(f.p, 0.0):
				on += 1
			if f.fear > 0.0:
				scared += 1
		print("t=%2d cur=%s depth=%.1f script=%s visit_in=%.1f fish=%d on_screen=%d scared=%d schools=%d flinch_t=%.1f" % [sec + 1, main.cur, main.depth.v, main.script_on, main.next_visit, F.size(), on, scared, main.fishes.schools.size(), main.flinch_t])
	quit()
