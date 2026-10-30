# 塵捲風：一根上寬下窄、會擺動旋轉的塵柱（shader 圓筒）＋底部翻起的小塵團。原點＝柱腳、放在沙面上。
@tool
class_name SandDevil
extends Node3D

const SHADER := preload("res://sand/devil.gdshader")
const STREAK := preload("res://sand/textures/streak.png")
const GRAIN := preload("res://sand/textures/grain.png")

## 0–1：透明度與底部塵團；0 = 隱藏
@export_range(0.0, 1.0, 0.01) var intensity := 1.0:
	set(v):
		intensity = v
		if _ready_done: _apply()
## 柱高、底半徑、頂半徑（公尺）
@export_range(5.0, 300.0, 1.0) var height := 50.0:
	set(v):
		height = v
		if _ready_done: _build()
@export_range(0.2, 40.0, 0.1) var base_radius := 2.2:
	set(v):
		base_radius = v
		if _ready_done: _build()
@export_range(0.5, 80.0, 0.1) var top_radius := 6.5:
	set(v):
		top_radius = v
		if _ready_done: _build()
## 頂端擺幅（公尺）、旋轉（圈／秒）
@export_range(0.0, 30.0, 0.1) var sway := 3.0:
	set(v):
		sway = v
		if _ready_done: _apply()
@export_range(0.0, 3.0, 0.01) var spin := 0.4:
	set(v):
		spin = v
		if _ready_done: _apply()
## 不同的捲風給不同的種子，擺動才不會同步
@export var seed := 0.0:
	set(v):
		seed = v
		if _ready_done: _apply()
@export var sun_direction := Vector3(0.48, 0.06, -0.87):
	set(v):
		sun_direction = v
		if _ready_done: _apply()
@export var tint := Color(0.88, 0.64, 0.4):
	set(v):
		tint = v
		if _ready_done: _apply()

var _col: MeshInstance3D
var _mat: ShaderMaterial
var _base: CPUParticles3D
var _ready_done := false

func _ready() -> void:
	_build()
	_ready_done = true

func _build() -> void:
	for c in get_children():
		if c.has_meta("sand_devil_gen"):
			remove_child(c)
			c.queue_free()
	var seg := 20
	var rings := 24
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for j in rings + 1:
		var t := float(j) / rings
		# narrow neck near the ground, flaring out higher up
		var r := lerpf(base_radius, top_radius, pow(t, 0.8))
		for i in seg + 1:
			var a := TAU * i / seg
			var n := Vector3(cos(a), 0.0, sin(a))
			st.set_normal(n)
			st.set_uv(Vector2(float(i) / seg, t))
			st.add_vertex(n * r + Vector3(0, t * height, 0))
	for j in rings:
		for i in seg:
			var a := j * (seg + 1) + i
			var b := a + 1
			var c := a + seg + 1
			var d := c + 1
			st.add_index(a); st.add_index(c); st.add_index(b)
			st.add_index(b); st.add_index(c); st.add_index(d)
	_mat = ShaderMaterial.new()
	_mat.shader = SHADER
	_mat.set_shader_parameter("streak", STREAK)
	_mat.set_shader_parameter("grain", GRAIN)
	var m := st.commit()
	m.surface_set_material(0, _mat)
	_col = MeshInstance3D.new()
	_col.mesh = m
	_col.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_col.custom_aabb = AABB(Vector3(-top_radius - 30, 0, -top_radius - 30), Vector3(2 * top_radius + 60, height + 5, 2 * top_radius + 60))
	_col.name = "Column"
	_col.set_meta("sand_devil_gen", true)
	add_child(_col)
	_base = SandPuffs.make({
		"amount": 14, "life": 4.0, "size": Vector2(base_radius * 3.0, base_radius * 5.5), "speed": Vector2(1.0, 3.0),
		"dir": Vector3(0, 0.4, 0), "spread": 80.0, "gravity": Vector3(0, -0.3, 0), "radial": 1.5, "damping": 0.5,
		"shape": "sphere", "radius": base_radius * 1.5, "grow": Vector2(0.5, 1.6), "fade": Vector2(0.15, 0.5),
		"opacity": 0.6, "ground_soft": base_radius * 0.8})
	_base.position.y = base_radius
	_base.name = "Base"
	_base.set_meta("sand_devil_gen", true)
	add_child(_base)
	_apply()

func _apply() -> void:
	if _mat == null:
		return
	var k := clampf(intensity, 0.0, 1.0)
	visible = k > 0.001
	_mat.set_shader_parameter("opacity", 0.9 * k)
	_mat.set_shader_parameter("spin", spin)
	_mat.set_shader_parameter("sway", sway)
	_mat.set_shader_parameter("seed", seed)
	_mat.set_shader_parameter("height", height)
	_mat.set_shader_parameter("sun_dir", sun_direction.normalized())
	_mat.set_shader_parameter("tint", tint)
	_mat.set_shader_parameter("glow", tint.lerp(Color.WHITE, 0.35))
	var pm := SandPuffs.mat(_base)
	pm.set_shader_parameter("opacity", 0.6 * k)
	pm.set_shader_parameter("tint", tint)
	pm.set_shader_parameter("shade", tint.darkened(0.12))
	pm.set_shader_parameter("glow", tint.lightened(0.25))
	pm.set_shader_parameter("sun_dir", sun_direction.normalized())
	pm.set_shader_parameter("ground_y", global_position.y if is_inside_tree() else 0.0)

## Look switches (gray=1 / layers=1): one flat colour, kept soft
func look_flat(c: Color) -> void:
	tint = c
