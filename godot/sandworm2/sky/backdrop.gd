# 沙蟲 far backdrop — a quad that exactly fills the frustum of its parent Camera3D at `distance`.
# Parent it under the Camera3D (local origin = camera); set fov/aspect to the camera's (fov is vertical, degrees).
@tool
extends MeshInstance3D

@export var fov := 50.0:
	set(v): fov = v; _fit()
@export var aspect := 1672.0 / 941.0:
	set(v): aspect = v; _fit()
@export var distance := 15000.0:   # keep below the camera's far plane
	set(v): distance = v; _fit()
@export var plate: Texture2D:
	set(v): plate = v; _param("plate", v)
@export_group("Clouds")
@export_range(0.0, 0.02, 0.0001) var drift_speed := 0.0025:
	set(v): drift_speed = v; _param("drift_speed", v)
@export var drift_dir := Vector2(1.0, -0.08):
	set(v): drift_dir = v; _param("drift_dir", v)
@export_range(0.0, 0.02, 0.0001) var churn := 0.004:
	set(v): churn = v; _param("churn", v)
@export_range(0.0, 1.0, 0.005) var cloud_bottom := 0.41:
	set(v): cloud_bottom = v; _param("cloud_bottom", v)
@export_group("Sun glow")
@export var sun_uv := Vector2(1510.0 / 1672.0, 445.0 / 941.0):
	set(v): sun_uv = v; _param("sun_uv", v)
@export_range(0.0, 1.0, 0.01) var glow_strength := 0.12:
	set(v): glow_strength = v; _param("glow_strength", v)
@export_range(0.0, 3.0, 0.01) var glow_speed := 0.35:
	set(v): glow_speed = v; _param("glow_speed", v)

func _ready() -> void:
	_fit()
	for p in ["plate", "drift_speed", "drift_dir", "churn", "cloud_bottom", "sun_uv", "glow_strength", "glow_speed"]:
		_param(p, get(p))

func _mat() -> ShaderMaterial:
	return material_override as ShaderMaterial

func _param(n: String, v) -> void:
	if _mat() and v != null:
		_mat().set_shader_parameter(n, v)

func _fit() -> void:
	var h := 2.0 * distance * tan(deg_to_rad(fov) * 0.5)
	var q := mesh as QuadMesh
	if q == null:
		q = QuadMesh.new()
		mesh = q
	q.size = Vector2(h * aspect, h)
	position = Vector3(0, 0, -distance)
	rotation = Vector3.ZERO
	extra_cull_margin = 16384.0
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_param("aspect", aspect)
