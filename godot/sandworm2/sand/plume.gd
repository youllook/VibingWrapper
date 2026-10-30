# 沙塵滾滾：Blender 體積塵序列（sand/blender/plume.py）的播放器。
# 序列是從主線的固定鏡頭渲的，只對那個鏡頭成立：這裡用同一個鏡頭把渲染時的螢幕框（CROP，目標圖像素）反投影成一張
# 網格——每個頂點都在它那條像素射線上，所以不管放多深，螢幕上都剛好落在渲染時的位置。
# 深度：上半部在 `depth`（沙蟲身體前面一點，蓋得住下半身、蓋不住頭——頭的部分圖裡本來就被挖空），
# 往下的列若碰到 `ground_h` 高的沙面就改貼在沙面前面，塵腳不會被沙丘吃掉。
@tool
class_name SandPlume
extends MeshInstance3D

const SHADER := preload("res://sand/plume.gdshader")
const ATLAS := preload("res://sand/textures/plume_atlas.png")

## 渲染時的螢幕框（目標圖 1672×941 的像素：x0, y0, x1, y1）——要和 plume.py 的 CROP 一致
const CROP := Rect2(300, 250, 1120, 460)
const VP := Vector2(1672, 941)
const COLS := 6
const ROWS := 10
const FRAMES := 60
const FPS := 12.0

## 0–1：透明度；0 = 隱藏
@export_range(0.0, 1.0, 0.01) var intensity := 1.0:
	set(v):
		intensity = v
		_apply()
## 播放速度倍率（1 = 渲染時的 12 fps，一輪 5 秒）
@export_range(0.0, 3.0, 0.01) var speed := 1.0
## 顏色微調：曝光（線性倍率）、色調、飽和度
@export_range(0.0, 6.0, 0.01) var exposure := 1.25:
	set(v):
		exposure = v
		_apply()
@export_range(0.5, 2.6, 0.01) var gamma := 1.25:
	set(v):
		gamma = v
		_apply()
@export var tint := Color.WHITE:
	set(v):
		tint = v
		_apply()
@export_range(0.0, 2.0, 0.01) var saturation := 0.85:
	set(v):
		saturation = v
		_apply()
## 網格深度（沿鏡頭前方的距離，公尺）與沙面高度（塵腳貼在這個高度的沙面前面）
@export var depth := 256.0
@export var ground_h := 16.0

var _mat: ShaderMaterial
var _frame := 0.0

## 用主線鏡頭（固定）建網格；fov = 垂直視角
func build(cam_xform: Transform3D, fov: float) -> void:
	var f := (VP.y * 0.5) / tan(deg_to_rad(fov * 0.5))
	var nx := 40
	var ny := 20
	var verts := PackedVector3Array()
	var uvs := PackedVector2Array()
	var idx := PackedInt32Array()
	var o := cam_xform.origin
	for j in ny + 1:
		for i in nx + 1:
			var uv := Vector2(float(i) / nx, float(j) / ny)
			var px := CROP.position + uv * CROP.size
			# camera-space ray with forward component 1, so t = distance along the view axis
			var d := cam_xform.basis * Vector3((px.x - VP.x * 0.5) / f, -(px.y - VP.y * 0.5) / f, -1.0)
			var t := depth
			if d.y < -1e-4:
				t = minf(t, (ground_h - o.y) / d.y)
			t = maxf(t, 20.0)
			verts.append(o + d * t)
			uvs.append(uv)
	for j in ny:
		for i in nx:
			var a := j * (nx + 1) + i
			idx.append_array([a, a + 1, a + nx + 1, a + 1, a + nx + 2, a + nx + 1])
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = verts
	arr[Mesh.ARRAY_TEX_UV] = uvs
	arr[Mesh.ARRAY_INDEX] = idx
	var am := ArrayMesh.new()
	am.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	mesh = am
	_mat = ShaderMaterial.new()
	_mat.shader = SHADER
	_mat.set_shader_parameter("atlas", ATLAS)
	_mat.set_shader_parameter("cols", COLS)
	_mat.set_shader_parameter("rows", ROWS)
	_mat.set_shader_parameter("frames", FRAMES)
	material_override = _mat
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# sort as if farther away than it is: the grains and sand sheets around the worm (and the devils) draw over it.
	# (render_priority would also put it under the sky backdrop, which is drawn as a transparent far card)
	sorting_offset = -120.0
	_apply()

func _apply() -> void:
	visible = intensity > 0.001
	if _mat == null:
		return
	_mat.set_shader_parameter("opacity", intensity)
	_mat.set_shader_parameter("exposure", exposure)
	_mat.set_shader_parameter("tint", tint)
	_mat.set_shader_parameter("saturation", saturation)
	_mat.set_shader_parameter("gamma", gamma)

func _process(delta: float) -> void:
	if _mat == null:
		return
	_frame = fmod(_frame + delta * FPS * speed, float(FRAMES))
	_mat.set_shader_parameter("frame", _frame)

## Look switches (gray=1 / layers=1): one flat colour, keep the soft shape
func look_flat(c: Color) -> void:
	if _mat == null:
		return
	_mat.set_shader_parameter("flat_mix", 1.0)
	_mat.set_shader_parameter("flat_color", c)
