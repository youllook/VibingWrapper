# 石拱 — Tripo sw2_arch.glb (from the Codex cut-out of the target), processed by tools/build_tripo.py into arch.glb:
# legs on the X axis, the reference's front facing +Z (toward the camera), origin = ground centre of the opening,
# native 94.7 wide (x -50.7..44.1) x 60 high x 42.2 deep. This root stretches it per axis.
@tool
extends Node3D

const NATIVE_OPENING := 67.2   # widest inner span (m), 16-20 m above the ground
const NATIVE_HEIGHT := 60.0    # top of the arch (m)

@export var opening := 67.2:   ## widest inner span of the opening, metres (scales X)
	set(v):
		opening = v
		_fit()
@export var height := 60.0:    ## overall height, metres (scales Y)
	set(v):
		height = v
		_fit()
@export var thickness := 1.0:  ## depth factor along Z (native 42 m front to back)
	set(v):
		thickness = v
		_fit()

func _ready() -> void:
	_fit()

func _fit() -> void:
	var m := get_node_or_null("Model") as Node3D
	if m:
		m.scale = Vector3(opening / NATIVE_OPENING, height / NATIVE_HEIGHT, thickness)
