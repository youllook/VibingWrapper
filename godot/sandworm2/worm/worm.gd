# 沙蟲 family B — the worm. Tripo rig (models/src/sandworm_rigged.glb) + a procedural maw riding the head bone:
# a pink flesh ring at the rim, rings of inward-hooked teeth (MultiMesh), a light-eating black funnel, and small
# spines on the inner faces of the four lips (each on its own lip bone). Spec: docs/沙蟲/02-素材/worm.md.
# Origin: on the sand line (y = 0) at the body's centre; sink = 0 leaves ~120 m of body above the sand.
@tool
extends Node3D

const Maw := preload("res://worm/maw.gd")
const MODEL := preload("res://models/src/sandworm_rigged.glb")
const SPINE := ["spine_00", "spine_01", "spine_02", "spine_03", "spine_04", "spine_05", "spine_06", "spine_07", "spine_08", "head"]
const LIPS := ["lip_front", "lip_back", "lip_left", "lip_right"]
# where the model's sand line sits (model metres): the spine starts 24 m under it, the rest stands above
const MODEL_OFFSET := Vector3(-0.3, 22.0, 0.3)

## rad per bone over the upper spine (spine_04 … head), about each bone's local X; + leans the head toward +Z
@export_range(-0.3, 0.5, 0.005) var bend := 0.0:
	set(v):
		bend = v
		_pose()
## rad on each lip bone; + peels the lips open (tips swing back, away from the mouth axis), − folds them shut.
## The hinge is the mouth rim's tangent at each lip root (bone X is not: lip_front's roll would swing it sideways)
@export_range(-0.6, 1.3, 0.01) var lip := 0.0:
	set(v):
		lip = v
		_pose()
## metres the whole worm is pushed down into the sand
@export_range(0.0, 160.0, 0.5) var sink := 0.0:
	set(v):
		sink = v
		_pose()
## rad about +Y (0 = mouth toward +Z)
@export_range(-3.1416, 3.1416, 0.01) var yaw := 0.0:
	set(v):
		yaw = v
		_pose()

var pivot: Node3D
var skel: Skeleton3D
var bone_i := {}
var bone_rest := {}
var lip_axis := {}   # per lip, its hinge in bone-local space
var mouth: Transform3D   # mouth frame, skeleton space, rest pose (maw.gd)
var spines: Array[Node] = []

func _ready() -> void:
	pivot = Node3D.new()
	pivot.name = "Pivot"
	add_child(pivot)
	var m := MODEL.instantiate()
	m.position = MODEL_OFFSET
	pivot.add_child(m)
	skel = m.find_children("*", "Skeleton3D", true, false)[0]
	for n in SPINE + LIPS:
		var i := skel.find_bone(n)
		bone_i[n] = i
		bone_rest[n] = skel.get_bone_rest(i).basis.get_rotation_quaternion()
	for mi in m.find_children("*", "MeshInstance3D", true, false):
		if mi.name.contains("throat"):
			mi.visible = false   # the Tripo throat tube pokes through the maw; the procedural funnel replaces it
	mouth = Maw.build(skel)
	spines = skel.find_children("Spines_*", "", false, false)
	for n in LIPS:
		var gr := skel.get_bone_global_rest(bone_i[n])
		var rad := gr.origin - mouth.origin
		rad -= mouth.basis.z * rad.dot(mouth.basis.z)
		var hinge := mouth.basis.z.cross(rad).normalized()   # tangent to the rim: + swings the lip outward and back
		lip_axis[n] = (gr.basis.inverse() * hinge).normalized()
	_pose()

func _pose() -> void:
	if skel == null:
		return
	pivot.position = Vector3(0, -sink, 0)
	pivot.rotation = Vector3(0, yaw, 0)
	for i in SPINE.size():
		var n: String = SPINE[i]
		var u := float(i) / float(SPINE.size() - 1)
		var a := bend * smoothstep(0.3, 0.7, u) * 1.6
		skel.set_bone_pose_rotation(bone_i[n], (bone_rest[n] as Quaternion) * Quaternion(Vector3(1, 0, 0), a))
	for n in LIPS:
		skel.set_bone_pose_rotation(bone_i[n], (bone_rest[n] as Quaternion) * Quaternion(lip_axis[n], lip))
	# folded shut, the lips overlap and the inner spines would poke through their backs
	for sp in spines:
		sp.visible = lip > -0.3

## the Maw node: its global transform is the mouth frame (origin = centre of the opening, +Z = out of the mouth)
func maw() -> Node3D:
	return skel.find_child("Maw", true, false) if skel else null
