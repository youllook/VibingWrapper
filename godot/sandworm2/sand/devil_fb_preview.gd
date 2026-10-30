# 塵捲風（導流線序列）preview：主線同一支鏡頭（25 m 眼高、地平線在第 545 列），三根塵捲風照主線 DEVILS 的像素位置擺（約 110–150 m 外）。
#   old=1   換成舊的 SandDevil（同位置、同高度）對照
#   close=1 鏡頭拉近到約 45 m 看細節
#   gray=1 / layers=1  Look 的平光（look_flat）
extends Node3D

const VP := Vector2(1672, 941)
const FOV := 50.0
const HORIZON_PX := 545.0
const EYE := 25.0
const SUN_TO := Vector3(0.555, 0.08, -0.83)
const DEVILS := [[Vector2(905, 722), 560.0], [Vector2(1160, 770), 660.0], [Vector2(1420, 780), 690.0]]

var cam := Camera3D.new()

func _ready() -> void:
	var md := Look.mode()
	if md == "":
		_env()
	else:
		Look.plain_env(self, md)
	var dunes: SandDunes = preload("res://sand/dunes.tscn").instantiate()
	dunes.clear_radius = 60.0
	dunes.dune_amp = 1.6
	add_child(dunes)
	cam.fov = FOV
	cam.near = 0.5
	cam.far = 20000.0
	cam.position = Vector3(0, EYE, 0)
	var f := (VP.y * 0.5) / tan(deg_to_rad(FOV * 0.5))
	cam.rotation.x = atan((HORIZON_PX - VP.y * 0.5) / f)
	add_child(cam)
	cam.current = true
	var a := Look.args()
	var old := a.has("old")
	var root := Node3D.new()
	add_child(root)
	for dv in DEVILS:
		var base := _ground_at(dv[0])
		var d := Vector2(base.x, base.z).length()
		var n: Node3D = (preload("res://sand/devil.tscn") if old else preload("res://sand/devil_fb.tscn")).instantiate()
		n.height = (dv[0].y - dv[1]) / f * d
		n.seed = base.x
		n.sun_direction = SUN_TO
		n.position = Vector3(base.x, dunes.height_at(base.x, base.z), base.z)
		root.add_child(n)
		print("devil at ", n.position, " dist ", snappedf(d, 0.1), " h ", snappedf(n.height, 0.1))
	if a.has("close"):   # ~45 m from the middle one
		var m: Node3D = root.get_child(1)
		var tgt: Vector3 = m.position + Vector3(0, m.height * 0.5, 0)
		cam.look_at_from_position(tgt + Vector3(-8, -2, 45), tgt, Vector3.UP)
	Look.apply(self, md, "midnear")

func _ground_at(px: Vector2) -> Vector3:
	var s := get_viewport().get_visible_rect().size / VP
	var o := cam.project_ray_origin(px * s)
	var d := cam.project_ray_normal(px * s)
	return o + d * (-o.y / d.y)

func _env() -> void:
	var we := WorldEnvironment.new()
	var env := Environment.new()
	var sky := Sky.new()
	var sm := ProceduralSkyMaterial.new()
	sm.sky_top_color = Color(0.62, 0.42, 0.3)
	sm.sky_horizon_color = Color(1.0, 0.66, 0.36)
	sm.ground_horizon_color = Color(0.95, 0.62, 0.36)
	sm.ground_bottom_color = Color(0.5, 0.32, 0.2)
	sm.sky_curve = 0.12
	sky.sky_material = sm
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.42
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	we.environment = env
	add_child(we)
	var sun := DirectionalLight3D.new()
	sun.light_color = Color(1.0, 0.78, 0.55)
	sun.light_energy = 1.5
	add_child(sun)
	sun.look_at(-Vector3(0.9, 0.14, -0.38), Vector3.UP)
