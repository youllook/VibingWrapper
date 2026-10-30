# 沙丘地面（8 km × 8 km，原點為中心）。網格近密遠疏；高度在 shader 裡算（可即時改火山口），
# 同一份高度也烘進網格頂點，所以 gray=1 灰模（材質被蓋掉）一樣有沙丘起伏。
# 節點要放在世界原點、不旋轉（高度用世界 xz 算）。height_at(x, z) 給主線擺東西貼地用。
@tool
class_name SandDunes
extends MeshInstance3D

const DUNE_H := 12.0     # metres per unit of the height texture (gen_textures.py DUNE_H)
const TILE := 2048.0     # metres the height texture spans before repeating
const DUNE_BASE := 0.4   # texture value that sits at y = 0
const HN := preload("res://sand/textures/dune_hn.png")
const GRAIN := preload("res://sand/textures/grain.png")
const SHADER := preload("res://sand/dunes.gdshader")

## 沙蟲破土處（世界 x, z）
@export var crater_center := Vector2(0, -600): set = _set_cc
## 火山口半徑（公尺）：外圈隆起的稜就在這個半徑
@export_range(10.0, 400.0, 1.0) var crater_radius := 90.0: set = _set_cr
## 隆起量（公尺）：0 = 平的沙面（沙蟲不在），破土時 15–30
@export_range(0.0, 60.0, 0.5) var mound := 14.0: set = _set_mound
## 沙丘起伏倍率：1 ≈ −4.8…+7.2 m
@export_range(0.0, 2.0, 0.05) var dune_amp := 1.0: set = _set_amp
## 鏡頭腳下清空成平地的圓（石拱地面），世界 x, z
@export var clear_center := Vector2.ZERO: set = _set_clc
@export_range(0.0, 400.0, 1.0) var clear_radius := 40.0: set = _set_clr
## 地平線霧：從 haze_near 開始、到 haze_far 達 haze_max
@export var haze_color := Color(0.98, 0.66, 0.38): set = _set_haze
@export var haze_near := 300.0: set = _set_hn
@export var haze_far := 3800.0: set = _set_hf
@export_range(0.0, 1.0) var haze_max := 0.85: set = _set_hm
## 沙紋強度（0 關掉）
@export_range(0.0, 1.0) var ripple := 0.45: set = _set_rip
## 網格每邊格數（256 → 13 萬三角形）
@export_range(32, 512) var grid := 256: set = _set_grid
## 半邊長（公尺）
@export var half_size := 4000.0: set = _set_half

var _mat: ShaderMaterial
var _img: Image
var _built := false

func _ready() -> void:
	_mat = ShaderMaterial.new()
	_mat.shader = SHADER
	_mat.set_shader_parameter("hn", HN)
	_mat.set_shader_parameter("grain", GRAIN)
	_mat.set_shader_parameter("tile", TILE)
	_mat.set_shader_parameter("dune_h", DUNE_H)
	_mat.set_shader_parameter("dune_base", DUNE_BASE)
	material_override = null
	_push()
	rebuild()

func _push() -> void:
	if _mat == null:
		return
	_mat.set_shader_parameter("crater_c", crater_center)
	_mat.set_shader_parameter("crater_r", crater_radius)
	_mat.set_shader_parameter("mound", mound)
	_mat.set_shader_parameter("dune_amp", dune_amp)
	_mat.set_shader_parameter("clear_c", clear_center)
	_mat.set_shader_parameter("clear_r", clear_radius)
	_mat.set_shader_parameter("haze", haze_color)
	_mat.set_shader_parameter("haze_near", haze_near)
	_mat.set_shader_parameter("haze_far", haze_far)
	_mat.set_shader_parameter("haze_max", haze_max)
	_mat.set_shader_parameter("ripple", ripple)

# ---- height (same maths as the shader) ----
func _tex_h(x: float, z: float) -> float:
	if _img == null:
		_img = HN.get_image()
		if _img.is_compressed():
			_img.decompress()
		_img.clear_mipmaps()
		_img.convert(Image.FORMAT_RGBA8)
	var w := _img.get_width()
	var u := fposmod(x / TILE, 1.0) * w - 0.5
	var v := fposmod(z / TILE, 1.0) * w - 0.5
	var x0 := floori(u)
	var y0 := floori(v)
	var fx := u - x0
	var fy := v - y0
	var a := _img.get_pixel(posmod(x0, w), posmod(y0, w)).r
	var b := _img.get_pixel(posmod(x0 + 1, w), posmod(y0, w)).r
	var c := _img.get_pixel(posmod(x0, w), posmod(y0 + 1, w)).r
	var d := _img.get_pixel(posmod(x0 + 1, w), posmod(y0 + 1, w)).r
	return lerpf(lerpf(a, b, fx), lerpf(c, d, fx), fy)

func _mask(p: Vector2) -> float:
	var r := p.distance_to(crater_center)
	var c := smoothstep(0.7 * crater_radius, 1.8 * crater_radius, r)
	return c * smoothstep(clear_radius, 2.0 * clear_radius, p.distance_to(clear_center))

func _crater(p: Vector2) -> float:
	var r := p.distance_to(crater_center) / maxf(crater_radius, 1.0)
	if r < 1.0:
		return mound * (-0.35 + 1.35 * r * r)
	return mound * exp(-pow((r - 1.0) / 0.75, 2.0))

## 世界座標 (x, z) 的沙面高度（公尺），跟 shader 同一套算法
func height_at(x: float, z: float) -> float:
	var p := Vector2(x, z)
	return (_tex_h(x, z) - DUNE_BASE) * DUNE_H * dune_amp * _mask(p) + _crater(p)

# grid coordinate −1…1 → metres: ~0.8 m cells at the centre, ~60 m at the edge
func _warp(t: float) -> float:
	var a := absf(t)
	return signf(t) * half_size * (0.025 * a + 0.975 * pow(a, 2.2))

func rebuild() -> void:
	if not is_inside_tree() or _mat == null:
		return
	var n := grid
	var xs := PackedFloat32Array()
	xs.resize(n + 1)
	for i in n + 1:
		xs[i] = _warp(-1.0 + 2.0 * i / n)
	var verts := PackedVector3Array()
	var norms := PackedVector3Array()
	verts.resize((n + 1) * (n + 1))
	norms.resize((n + 1) * (n + 1))
	var hs := PackedFloat32Array()
	hs.resize((n + 1) * (n + 1))
	for j in n + 1:
		for i in n + 1:
			hs[j * (n + 1) + i] = height_at(xs[i], xs[j])
	for j in n + 1:
		for i in n + 1:
			var k := j * (n + 1) + i
			verts[k] = Vector3(xs[i], hs[k], xs[j])
			var il := maxi(i - 1, 0)
			var ir := mini(i + 1, n)
			var jd := maxi(j - 1, 0)
			var ju := mini(j + 1, n)
			var gx := (hs[j * (n + 1) + ir] - hs[j * (n + 1) + il]) / (xs[ir] - xs[il])
			var gz := (hs[ju * (n + 1) + i] - hs[jd * (n + 1) + i]) / (xs[ju] - xs[jd])
			norms[k] = Vector3(-gx, 1.0, -gz).normalized()
	var idx := PackedInt32Array()
	idx.resize(n * n * 6)
	var q := 0
	for j in n:
		for i in n:
			var a := j * (n + 1) + i
			var b := a + 1
			var c := a + n + 1
			var d := c + 1
			idx[q] = a; idx[q + 1] = b; idx[q + 2] = c
			idx[q + 3] = b; idx[q + 4] = d; idx[q + 5] = c
			q += 6
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = verts
	arr[Mesh.ARRAY_NORMAL] = norms
	arr[Mesh.ARRAY_INDEX] = idx
	var am := ArrayMesh.new()
	am.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	am.surface_set_material(0, _mat)
	mesh = am
	# shader moves vertices (crater animation): keep a generous box so it never culls
	custom_aabb = AABB(Vector3(-half_size, -80, -half_size), Vector3(2 * half_size, 200, 2 * half_size))
	_built = true

func _set_cc(v: Vector2) -> void: crater_center = v; _push()
func _set_cr(v: float) -> void: crater_radius = v; _push()
func _set_mound(v: float) -> void: mound = v; _push()
func _set_amp(v: float) -> void: dune_amp = v; _push()
func _set_clc(v: Vector2) -> void: clear_center = v; _push()
func _set_clr(v: float) -> void: clear_radius = v; _push()
func _set_haze(v: Color) -> void: haze_color = v; _push()
func _set_hn(v: float) -> void: haze_near = v; _push()
func _set_hf(v: float) -> void: haze_far = v; _push()
func _set_hm(v: float) -> void: haze_max = v; _push()
func _set_rip(v: float) -> void: ripple = v; _push()
func _set_grid(v: int) -> void:
	grid = v
	if _built: rebuild()
func _set_half(v: float) -> void:
	half_size = v
	if _built: rebuild()
