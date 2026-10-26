extends SceneTree
# The water the frame covers: screen corners / edge midpoints → world (x, z)
func _init() -> void:
	var main: Node = (load("res://main.tscn") as PackedScene).instantiate()
	root.add_child(main)
	await process_frame
	for f in [Vector2(0, 0), Vector2(0.5, 0), Vector2(1, 0), Vector2(0, 0.5), Vector2(1, 0.5), Vector2(0, 1), Vector2(0.5, 1), Vector2(1, 1)]:
		print(f, " -> ", main.fishes.water_at(f))
	quit()
