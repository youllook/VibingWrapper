# 前景岩階 — laid out relative to this node (default: this node under the camera's feet, camera ~8 m up looking -Z).
#   Main   : Tripo sw2_ledge_left.glb -> ledge_left.glb (tools/build_tripo.py): stepped slabs rising to the LEFT,
#            28 wide (X) x 28 deep x 18.1 high, origin = base centre, front facing +Z. The lower-left piece.
#   Rubble : (extra) flat broken stones in a 46 x 10 m strip, origin = strip centre   } procedural, ledge_extras.glb
#   Block  : (extra) squat 3-slab block ~10 x 8 x 5.9 m, origin = base centre         } (tools/build_ledge.py)
@tool
extends Node3D

const MAIN := preload("res://rocks/ledge_left.glb")
const EXTRAS := preload("res://rocks/ledge_extras.glb")

@export var main_pos := Vector3(-22, 0, -26)
@export var main_yaw := 0.0
@export var main_scale := 1.0
@export var extras := true            ## show the procedural Rubble / Block
@export var extras_material: Material = preload("res://rocks/ledge_rock.tres")
@export var rubble_pos := Vector3(0, 0, -20)
@export var rubble_yaw := 0.0
@export var rubble_scale := 1.0
@export var block_pos := Vector3(17, 0, -21)
@export var block_yaw := 0.4
@export var block_scale := 1.0

func _ready() -> void:
	var m := MAIN.instantiate() as Node3D
	m.name = "Main"
	m.position = main_pos
	m.rotation.y = main_yaw
	m.scale = Vector3.ONE * main_scale
	add_child(m)
	if not extras:
		return
	var src := EXTRAS.instantiate()
	var meshes := {}
	for c in src.find_children("*", "MeshInstance3D", true, false):
		meshes[String(c.name).to_lower()] = (c as MeshInstance3D).mesh
	src.free()
	for p in [["Rubble", "rubble", rubble_pos, rubble_yaw, rubble_scale],
			["Block", "block", block_pos, block_yaw, block_scale]]:
		var mi := MeshInstance3D.new()
		mi.name = p[0]
		mi.mesh = meshes.get(p[1])
		mi.material_override = extras_material
		mi.position = p[2]
		mi.rotation.y = p[3]
		mi.scale = Vector3.ONE * p[4]
		add_child(mi)
