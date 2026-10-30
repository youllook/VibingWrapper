# 塵捲風（導流線序列）：Blender 烘的 25 m 塵捲風無縫循環，放在一張只繞 Y 轉向鏡頭的板子上播。SandDevil 的替代品。
# 原點＝柱腳（放沙面上，可用 dunes.height_at）。來源：sand/blender/devil_render.py → devil_atlas.py → sand/textures/devil_fb_<v>.png
@tool
class_name SandDevilFB
extends Node3D

const SHADER := preload("res://sand/devil_fb.gdshader")
const ATLAS := [preload("res://sand/textures/devil_fb_0.png"), preload("res://sand/textures/devil_fb_1.png")]
# the bake (devil_render.py): column BAKE_H m tall in a cell of FRAME_W × FRAME_H m, foot BASE_V up from the cell's bottom
const BAKE_H := 25.0
const FRAME_W := 15.0
const FRAME_H := 30.0
const BASE_V := 0.0823
const COLS := 12
const ROWS := 6
const FRAMES := 72
const LOOP_S := 4.0

## 0–1：透明度；0 = 隱藏
@export_range(0.0, 1.0, 0.01) var intensity := 1.0:
	set(v):
		intensity = v
		if _ready_done: _apply()
## 柱高（公尺）：整張板子等比例縮放
@export_range(5.0, 300.0, 0.5) var height := 25.0:
	set(v):
		height = v
		if _ready_done: _build()
## 橫向放寬（1 = 烘的粗細；目標圖的塵捲風比烘的胖一點）
@export_range(0.5, 3.0, 0.01) var width := 1.3:
	set(v):
		width = v
		if _ready_done: _build()
## 頂端額外擺幅（公尺，疊在烘進去的擺動上）
@export_range(0.0, 30.0, 0.1) var sway := 0.6:
	set(v):
		sway = v
		if _ready_done: _apply()
## 播放速度（1 = 烘的速度，4 秒一輪）
@export_range(0.1, 3.0, 0.01) var speed := 1.0:
	set(v):
		speed = v
		if _ready_done: _apply()
## 種子：決定用哪一款（2 款）與循環相位，每根給不同值
@export var seed := 0.0:
	set(v):
		seed = v
		if _ready_done: _apply()
## 指向太陽（世界）；只用來決定逆光亮邊有多亮（光的方向已烘在圖裡：太陽在右後方）
@export var sun_direction := Vector3(0.555, 0.08, -0.83):
	set(v):
		sun_direction = v
		if _ready_done: _apply()
@export var tint := Color(0.86, 0.62, 0.4):
	set(v):
		tint = v
		if _ready_done: _apply()
@export var shade := Color(0.66, 0.42, 0.24):
	set(v):
		shade = v
		if _ready_done: _apply()
@export var glow := Color(1.0, 0.8, 0.56):
	set(v):
		glow = v
		if _ready_done: _apply()

var _quad: MeshInstance3D
var _mat: ShaderMaterial
var _flat := false
var _ready_done := false

func _ready() -> void:
	_build()
	_ready_done = true
	_apply.call_deferred()   # again once the scene's camera exists (rim strength)

func _build() -> void:
	if _quad:
		remove_child(_quad)
		_quad.queue_free()
	var k := height / BAKE_H
	var w := FRAME_W * k * width
	var h := FRAME_H * k
	var base := BASE_V * h
	var q := QuadMesh.new()
	q.size = Vector2(w, h)
	q.center_offset = Vector3(0, h * 0.5 - base, 0)
	_mat = ShaderMaterial.new()
	_mat.shader = SHADER
	q.material = _mat
	_quad = MeshInstance3D.new()
	_quad.name = "Board"
	_quad.mesh = q
	_quad.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# the board turns toward the camera in the shader: a box that holds it at any yaw
	_quad.custom_aabb = AABB(Vector3(-w * 0.5 - sway, -base, -w * 0.5 - sway), Vector3(w + 2 * sway, h, w + 2 * sway))
	add_child(_quad)
	_mat.set_shader_parameter("quad_h", h)
	_mat.set_shader_parameter("base_m", base)
	_mat.set_shader_parameter("ground_soft", 0.8 * k)
	_apply()

func _hash() -> float:
	var x := sin(seed * 12.9898 + 78.233) * 43758.5453
	return x - floorf(x)

func _apply() -> void:
	if _mat == null:
		return
	var k := clampf(intensity, 0.0, 1.0)
	visible = k > 0.001
	var hsh := _hash()
	_mat.set_shader_parameter("atlas", ATLAS[int(hsh * ATLAS.size()) % ATLAS.size()])
	_mat.set_shader_parameter("cols", COLS)
	_mat.set_shader_parameter("rows", ROWS)
	_mat.set_shader_parameter("frames", FRAMES)
	_mat.set_shader_parameter("fps", FRAMES / LOOP_S * speed)
	_mat.set_shader_parameter("phase", fposmod(hsh * 7.0, 1.0))
	_mat.set_shader_parameter("seed", seed)
	_mat.set_shader_parameter("opacity", k)
	_mat.set_shader_parameter("sway", sway)
	_mat.set_shader_parameter("tint", tint)
	_mat.set_shader_parameter("shade", tint if _flat else shade)
	_mat.set_shader_parameter("glow", tint if _flat else glow)
	_mat.set_shader_parameter("flat_look", 1.0 if _flat else 0.0)
	# the bake is lit from ahead-right and low; the rim is strongest when the sun really is ahead of the camera
	var cam := get_viewport().get_camera_3d() if is_inside_tree() else null
	var r := 1.0
	if cam:
		var to := (global_position - cam.global_position).normalized()
		r = lerpf(0.5, 1.2, clampf(to.dot(sun_direction.normalized()) * 1.3, 0.0, 1.0))
	_mat.set_shader_parameter("rim", r)

## Look switches (gray=1 / layers=1): one flat colour, keep the soft shape
func look_flat(c: Color) -> void:
	_flat = true
	tint = c
	if _ready_done: _apply()
