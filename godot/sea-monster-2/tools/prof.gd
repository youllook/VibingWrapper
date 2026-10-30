extends SceneTree
# Times the fish sim natively: tools/prof.gd — loads main.tscn in a given state, warps, then averages _step.
func _init() -> void:
	var main: Node = (load("res://main.tscn") as PackedScene).instantiate()
	root.add_child(main)
	await process_frame
	for st in ["storm", "waiting", "clear"]:
		main.state = st
		for i in 600:
			main._step(1.0 / 30.0)
		var t0 := Time.get_ticks_usec()
		for i in 120:
			main._step(1.0 / 30.0)
		var fish_t0 := Time.get_ticks_usec()
		for i in 120:
			main.fishes.step(1.0 / 30.0, {"threat": main._threat(), "ring": null, "murk": 0.5, "boat": null})
		print("%s: step %.2f ms (fish only %.2f ms), %d fish" % [st, (fish_t0 - t0) / 120000.0, (Time.get_ticks_usec() - fish_t0) / 120000.0, main.fishes.fish.size()])
	quit()
