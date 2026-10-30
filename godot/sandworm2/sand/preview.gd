# 沙與塵 preview：8 m 眼高看地平線，250 m 外兩團塵（同主線參數：半徑 100／高 120 有沙瀑、半徑 90／高 80 無沙瀑），兩根塵捲風。
# 正常模式用自己的夕陽天空與側光；gray=1／layers=1 用 Look 的平光。
extends Node3D

const SUN_VIEW := Vector3(0.555, 0.08, -0.83)   # where the sun sits in the target (screen x≈1510): dust backlight
const KEY := Vector3(0.9, 0.14, -0.38)           # side key light for the dunes (crests catch it)

func _ready() -> void:
	var md := Look.mode()
	if md == "":
		_own_env()
	else:
		Look.plain_env(self, md)
	var dunes: SandDunes = preload("res://sand/dunes.tscn").instantiate()
	dunes.crater_center = Vector2(20, -250)
	dunes.crater_radius = 80.0
	dunes.mound = 6.0
	dunes.clear_radius = 15.0
	add_child(dunes)
	# the same two dust instances the main scene uses: ~250 m away
	var dust: SandDust = preload("res://sand/dust.tscn").instantiate()
	dust.position = Vector3(20, 0, -250)
	dust.radius = 100.0
	dust.wall_height = 120.0
	dust.sun_direction = SUN_VIEW
	add_child(dust)
	var dust2: SandDust = preload("res://sand/dust.tscn").instantiate()
	dust2.position = Vector3(-200, 0, -330)
	dust2.radius = 90.0
	dust2.wall_height = 80.0
	dust2.fall_count = 0
	dust2.sun_direction = SUN_VIEW
	add_child(dust2)
	var spots := [Vector3(-110, 0, -190), Vector3(175, 0, -420), Vector3(-260, 0, -520)]
	for i in spots.size():
		var d: SandDevil = preload("res://sand/devil.tscn").instantiate()
		var p: Vector3 = spots[i]
		p.y = dunes.height_at(p.x, p.z)
		d.position = p
		d.seed = i * 1.7
		d.height = [45.0, 60.0, 50.0][i]
		d.sun_direction = SUN_VIEW
		add_child(d)
	var cam := Camera3D.new()
	cam.fov = 50.0
	cam.near = 0.5
	cam.far = 20000.0
	cam.position = Vector3(0, 8, 0)
	cam.rotation_degrees = Vector3(2.7, 0, 0)
	if Look.args().has("close"):   # close-up of the dust wall
		cam.look_at_from_position(Vector3(-60, 10, -70), Vector3(20, 45, -250), Vector3.UP)
	if Look.args().has("devil"):   # close-up of a dust devil
		cam.look_at_from_position(Vector3(-85, 5, -110), Vector3(-110, 22, -190), Vector3.UP)
	add_child(cam)
	cam.current = true
	Look.apply(self, md)

func _own_env() -> void:
	var we := WorldEnvironment.new()
	var env := Environment.new()
	var sky := Sky.new()
	var sm := ProceduralSkyMaterial.new()
	sm.sky_top_color = Color(0.55, 0.42, 0.38)
	sm.sky_horizon_color = Color(1.0, 0.66, 0.36)
	sm.ground_horizon_color = Color(0.95, 0.62, 0.36)
	sm.ground_bottom_color = Color(0.5, 0.32, 0.2)
	sm.sky_curve = 0.12
	sm.sun_angle_max = 8.0
	sky.sky_material = sm
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.42
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 1.0
	we.environment = env
	add_child(we)
	var sun := DirectionalLight3D.new()
	sun.light_color = Color(1.0, 0.78, 0.55)
	sun.light_energy = 1.5
	add_child(sun)
	sun.look_at(-KEY, Vector3.UP)
