# 沙蟲基部的塵：翻騰塵牆（三層粒子）＋從高處落下的沙瀑（條帶＋落沙團）。原點＝沙蟲穿出沙面的中心、放在沙面上。
# 所有顏色只吃 shader 的 tint uniform（不吃粒子 RGB），逆光方向由 sun_direction 給。
@tool
class_name SandDust
extends Node3D

const FALL_SHADER := preload("res://sand/sand_fall.gdshader")
const STREAK := preload("res://sand/textures/streak.png")
const GRAIN := preload("res://sand/textures/grain.png")
const VEIL_SHADER := preload("res://sand/sand_veil.gdshader")
const GRAIN_SHADER := preload("res://sand/sand_grain.gdshader")

## 整體強度 0–1：透明度、大小、速度一起變；0 = 全部隱藏
@export_range(0.0, 1.0, 0.01) var intensity := 1.0:
	set(v):
		intensity = v
		if _ready_done: _apply_intensity()
## 塵牆半徑（公尺）：塵團從這圈地面翻起
@export_range(10.0, 300.0, 1.0) var radius := 60.0:
	set(v):
		radius = v
		if _ready_done: _build()
## 塵牆高度（公尺，大約值）
@export_range(10.0, 300.0, 1.0) var wall_height := 90.0:
	set(v):
		wall_height = v
		if _ready_done: _build()
## 沙瀑起點高度與半徑（公尺）：沙幕從這圈往下落到地面；高度 0 = 不要沙瀑
@export_range(0.0, 300.0, 1.0) var fall_height := 100.0:
	set(v):
		fall_height = v
		if _ready_done: _build()
@export_range(1.0, 200.0, 1.0) var fall_radius := 28.0:
	set(v):
		fall_radius = v
		if _ready_done: _build()
## 沙瀑分布的角度範圍（度，0 = +X，逆時針看俯視；預設整圈）
@export var fall_arc := Vector2(0, 360):
	set(v):
		fall_arc = v
		if _ready_done: _build()
## 粒子塵團（Skirt／Wall／Core 三層＋Veils 沙幕）。主線改用 Blender 體積塵序列（sand/plume.tscn）時關掉，只留沙粒與沙瀑
@export var billows := true:
	set(v):
		billows = v
		if _ready_done: _build()
@export_range(0, 64) var fall_count := 12:
	set(v):
		fall_count = v
		if _ready_done: _build()
## 塵團接觸沙面的高度（世界 y，火山口隆起時調高）與柔邊（公尺）
@export var ground_y := 0.0:
	set(v):
		ground_y = v
		if _ready_done: _apply_look()
@export var sun_direction := Vector3(0.48, 0.06, -0.87):
	set(v):
		sun_direction = v
		if _ready_done: _apply_look()
@export var tint := Color(0.85, 0.57, 0.32):
	set(v):
		tint = v
		if _ready_done: _apply_look()
@export var shade := Color(0.74, 0.45, 0.25):
	set(v):
		shade = v
		if _ready_done: _apply_look()
@export var glow := Color(1.0, 0.74, 0.42):
	set(v):
		glow = v
		if _ready_done: _apply_look()

var _parts: Array[CPUParticles3D] = []
var _base_op: Array[float] = []
var _extra: Array = []   # [CPUParticles3D, base opacity] — veils and grains (own shaders)
var _falls: MultiMeshInstance3D
var _fall_mat: ShaderMaterial
var _ready_done := false

func _ready() -> void:
	_build()
	_ready_done = true

func _clear() -> void:
	for c in get_children():
		if c.has_meta("sand_dust_gen"):
			remove_child(c)
			c.queue_free()
	_parts.clear()
	_base_op.clear()
	_extra.clear()
	_falls = null

func _add(p: Node3D, nm: String) -> void:
	p.name = nm
	p.set_meta("sand_dust_gen", true)
	add_child(p)

func _build() -> void:
	_clear()
	var r := radius
	var h := wall_height
	# Heavy sand, not smoke: every billow layer is thrown up fast, braked hard (damping), then pulled back down
	# by gravity > damping — it bursts, slows, sags and falls back; tops droop instead of drifting away.
	if billows:
		_billows(r, h)
	# 5 grains: small solid clumps thrown out of the eruption, falling back ballistically (real g)
	var grains := _grains(r, h)
	_add(grains, "Grains")
	_extra.append([grains, 0.95])
	_falls_build(r)
	_apply_look()
	_apply_intensity()

func _billows(r: float, h: float) -> void:
	# 1 low skirt: bursts outward along the sand and settles
	var skirt := SandPuffs.make({
		"amount": 60, "life": 7.0, "size": Vector2(r * 0.22, r * 0.38), "speed": Vector2(r * 0.25, r * 0.45),
		"dir": Vector3(0, 0.3, 0), "spread": 75.0, "gravity": Vector3(0, -r * 0.06, 0), "radial": r * 0.02, "damping": r * 0.06,
		"shape": "ring", "radius": r * 1.0, "inner": r * 0.7, "ring_h": 2.0, "grow": Vector2(0.6, 1.6), "fade": Vector2(0.08, 0.45),
		"opacity": 0.75, "ground_soft": r * 0.08})
	skirt.position.y = r * 0.08
	_add(skirt, "Skirt")
	_parts.append(skirt); _base_op.append(0.75)
	# 2 wall: big billows — burst to ~0.2–0.4 × wall_height in ~2.5 s (+ puff size ≈ wall_height overall), then sink back
	var wall := SandPuffs.make({
		"amount": 110, "life": 9.0, "size": Vector2(r * 0.32, r * 0.52), "speed": Vector2(h * 0.2, h * 0.3),
		"dir": Vector3.UP, "spread": 24.0, "gravity": Vector3(0, -h * 0.085, 0), "radial": r * 0.015, "damping": h * 0.035,
		"shape": "ring", "radius": r * 0.9, "inner": r * 0.35, "ring_h": 4.0, "grow": Vector2(0.55, 1.3), "fade": Vector2(0.06, 0.35),
		"opacity": 0.8, "ground_soft": r * 0.1})
	wall.position.y = r * 0.12
	_add(wall, "Wall")
	_parts.append(wall); _base_op.append(0.8)
	# 3 core: denser, lower billows hugging the body — this is what hides the worm's base
	var core := SandPuffs.make({
		"amount": 60, "life": 7.0, "size": Vector2(r * 0.28, r * 0.45), "speed": Vector2(h * 0.16, h * 0.24),
		"dir": Vector3.UP, "spread": 35.0, "gravity": Vector3(0, -h * 0.05, 0), "radial": r * 0.02, "damping": h * 0.025,
		"shape": "ring", "radius": r * 0.55, "inner": 0.0, "ring_h": 2.0, "grow": Vector2(0.7, 1.35), "fade": Vector2(0.06, 0.4),
		"opacity": 0.95, "ground_soft": r * 0.06})
	core.position.y = r * 0.1
	_add(core, "Core")
	_parts.append(core); _base_op.append(0.95)
	# 4 veils: streaky sand sheets pouring out of the underside of the billows
	var veil := _veil(r, h)
	_add(veil, "Veils")
	_extra.append([veil, 0.85])

func _falls_build(r: float) -> void:
	if fall_height > 0.5 and fall_count > 0:
		# 6 spray: clumps of sand falling off the rim, puffing wider as they drop
		var g := 9.8
		var spray := SandPuffs.make({
			"amount": 60, "life": sqrt(2.0 * fall_height / g) * 1.05, "size": Vector2(fall_radius * 0.15, fall_radius * 0.3),
			"speed": Vector2(0.5, 2.5), "dir": Vector3(0, -1, 0), "spread": 25.0, "gravity": Vector3(0, -g, 0),
			"radial": 0.6, "damping": 0.0, "shape": "ring", "radius": fall_radius, "inner": fall_radius * 0.85, "ring_h": 2.0,
			"grow": Vector2(0.4, 1.3), "fade": Vector2(0.3, 0.3), "opacity": 0.4, "ground_soft": r * 0.15})
		spray.position.y = fall_height
		spray.lifetime_randomness = 0.1
		_add(spray, "Spray")
		_parts.append(spray); _base_op.append(0.35)
		# 7 sheets: streaming curtains
		var q := QuadMesh.new()
		q.size = Vector2.ONE
		_fall_mat = ShaderMaterial.new()
		_fall_mat.shader = FALL_SHADER
		_fall_mat.set_shader_parameter("streak", STREAK)
		q.material = _fall_mat
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_custom_data = true
		mm.mesh = q
		mm.instance_count = fall_count
		var rng := RandomNumberGenerator.new()
		rng.seed = 4242
		for i in fall_count:
			var a := deg_to_rad(lerpf(fall_arc.x, fall_arc.y, (i + rng.randf_range(0.1, 0.9)) / fall_count))
			var rr := fall_radius * rng.randf_range(0.85, 1.1)
			var top := fall_height * rng.randf_range(0.75, 1.0)
			var w := fall_radius * rng.randf_range(0.18, 0.38)
			var b := Basis().scaled(Vector3(w, top, 1.0))
			# instance origin = bottom of the strip; the shader turns it to face the camera around Y
			mm.set_instance_transform(i, Transform3D(b, Vector3(cos(a) * rr, 0.0, -sin(a) * rr)))
			mm.set_instance_custom_data(i, Color(rng.randf(), rng.randf_range(0.7, 1.3), 1.0, rng.randf_range(0.6, 1.0)))
		_falls = MultiMeshInstance3D.new()
		_falls.multimesh = mm
		_falls.custom_aabb = AABB(Vector3(-fall_radius * 2, -5, -fall_radius * 2), Vector3(fall_radius * 4, fall_height + 10, fall_radius * 4))
		_add(_falls, "Sheets")

func _quad_mat(shader: Shader) -> Array:
	var q := QuadMesh.new()
	q.size = Vector2.ONE
	var m := ShaderMaterial.new()
	m.shader = shader
	q.material = m
	return [q, m]

func _veil(r: float, h: float) -> CPUParticles3D:
	var p := CPUParticles3D.new()
	var qm := _quad_mat(VEIL_SHADER)
	(qm[1] as ShaderMaterial).set_shader_parameter("streak", STREAK)
	(qm[1] as ShaderMaterial).set_shader_parameter("ground_soft", r * 0.1)
	p.mesh = qm[0]
	p.amount = 50
	p.lifetime = 6.0
	p.preprocess = 7.0
	p.lifetime_randomness = 0.3
	p.local_coords = false
	p.draw_order = CPUParticles3D.DRAW_ORDER_VIEW_DEPTH
	p.fixed_fps = 30
	p.fract_delta = true
	p.emission_shape = CPUParticles3D.EMISSION_SHAPE_RING
	p.emission_ring_axis = Vector3.UP
	p.emission_ring_radius = r * 0.8
	p.emission_ring_inner_radius = r * 0.3
	p.emission_ring_height = h * 0.15
	p.position.y = h * 0.4
	p.direction = Vector3.DOWN
	p.spread = 10.0
	p.initial_velocity_min = 1.0
	p.initial_velocity_max = 3.0
	p.gravity = Vector3(0, -2.5, 0)
	p.scale_amount_min = r * 0.12
	p.scale_amount_max = r * 0.22
	return p

func _grains(r: float, h: float) -> CPUParticles3D:
	var g := 9.8
	var p := CPUParticles3D.new()
	var qm := _quad_mat(GRAIN_SHADER)
	(qm[1] as ShaderMaterial).set_shader_parameter("grain", GRAIN)
	p.mesh = qm[0]
	var vmax := sqrt(2.0 * g * h * 0.7)
	p.amount = 900
	p.lifetime = 2.0 * vmax / g
	p.preprocess = p.lifetime
	p.lifetime_randomness = 0.25
	p.local_coords = false
	p.fixed_fps = 30
	p.fract_delta = true
	p.emission_shape = CPUParticles3D.EMISSION_SHAPE_RING
	p.emission_ring_axis = Vector3.UP
	p.emission_ring_radius = r * 0.55
	p.emission_ring_inner_radius = r * 0.1
	p.emission_ring_height = 4.0
	p.position.y = r * 0.1
	p.direction = Vector3.UP
	p.spread = 32.0
	p.initial_velocity_min = sqrt(2.0 * g * h * 0.2)
	p.initial_velocity_max = vmax
	p.radial_accel_min = 0.5
	p.radial_accel_max = 2.0
	p.gravity = Vector3(0, -g, 0)
	p.angle_min = -180.0
	p.angle_max = 180.0
	p.angular_velocity_min = -90.0
	p.angular_velocity_max = 90.0
	p.scale_amount_min = 0.4
	p.scale_amount_max = maxf(1.4, r * 0.014)
	return p

func _apply_look() -> void:
	var mats: Array[ShaderMaterial] = []
	for p in _parts:
		mats.append(SandPuffs.mat(p))
	for m in mats:
		m.set_shader_parameter("tint", tint)
		m.set_shader_parameter("shade", shade)
		m.set_shader_parameter("glow", glow)
		m.set_shader_parameter("sun_dir", sun_direction.normalized())
		m.set_shader_parameter("ground_y", ground_y)
	for e in _extra:
		var em: ShaderMaterial = ((e[0] as CPUParticles3D).mesh as QuadMesh).material
		em.set_shader_parameter("tint", tint)
		em.set_shader_parameter("shade", shade)
		em.set_shader_parameter("glow", glow)
		em.set_shader_parameter("ground_y", ground_y)
	if _fall_mat:
		_fall_mat.set_shader_parameter("tint", tint.lerp(glow, 0.55))
		_fall_mat.set_shader_parameter("glow", glow)
		_fall_mat.set_shader_parameter("sun_dir", sun_direction.normalized())

func _apply_intensity() -> void:
	var k := clampf(intensity, 0.0, 1.0)
	visible = k > 0.001
	for i in _parts.size():
		var m := SandPuffs.mat(_parts[i])
		m.set_shader_parameter("opacity", _base_op[i] * pow(k, 0.6))
		m.set_shader_parameter("size", 0.55 + 0.45 * k)
		_parts[i].speed_scale = 0.5 + 0.5 * k
		_parts[i].emitting = k > 0.001
	for e in _extra:
		var em: ShaderMaterial = ((e[0] as CPUParticles3D).mesh as QuadMesh).material
		em.set_shader_parameter("opacity", float(e[1]) * pow(k, 0.7))
		em.set_shader_parameter("size", 0.6 + 0.4 * k)
		(e[0] as CPUParticles3D).emitting = k > 0.001
	if _fall_mat:
		_fall_mat.set_shader_parameter("opacity", 0.75 * pow(k, 0.8))

## Look switches (gray=1 / layers=1): one flat colour, kept soft
func look_flat(c: Color) -> void:
	tint = c
	shade = c
	glow = c
