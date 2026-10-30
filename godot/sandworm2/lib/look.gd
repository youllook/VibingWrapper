# 沙蟲 shared look switches, used by main.gd and every family's preview scene.
#   gray=1    every mesh plain light grey, lit by one sun + flat ambient (stage 3 layout checks)
#   layers=1  every mesh one flat colour per depth layer, unshaded (tools/layercheck.py reads the hues)
class_name Look

const LAYER_COL := {
	"near": Color(1.0, 0.27, 0.27),    # red
	"midnear": Color(1.0, 0.55, 0.16), # orange
	"mid": Color(1.0, 0.84, 0.24),     # yellow
	"far": Color(0.35, 0.63, 1.0),     # blue
}

static func args() -> Dictionary:
	var a := {}
	for s in OS.get_cmdline_user_args():
		var kv := s.split("=", true, 1)
		a[kv[0]] = kv[1] if kv.size() > 1 else "1"
	return a

# a node with look_flat(color) paints itself (dust and devils keep their soft shapes instead of turning into
# solid quads) and its subtree is left alone
static func _all_geo(n: Node, out: Array, col := Color.WHITE) -> void:
	if n.has_method("look_flat"):
		n.call("look_flat", col)
		return
	if n is GeometryInstance3D:
		out.append(n)
	for c in n.get_children():
		_all_geo(c, out, col)

# paint everything under `root` for the debug mode; `layer` is the depth layer it belongs to
static func apply(root: Node, mode: String, layer: String = "") -> void:
	if mode == "":
		return
	var m := StandardMaterial3D.new()
	if mode == "layers":
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		m.albedo_color = LAYER_COL.get(layer, Color.WHITE)
	else:
		m.albedo_color = Color(0.72, 0.72, 0.72)
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	var geo := []
	_all_geo(root, geo, m.albedo_color)
	for g in geo:
		(g as GeometryInstance3D).material_override = m

static func mode() -> String:
	var a := args()
	if a.has("layers"):
		return "layers"
	if a.has("gray"):
		return "gray"
	return ""

# a plain sun + ambient + dark backdrop for gray / layers views (and the family previews)
static func plain_env(parent: Node, md: String) -> void:
	var we := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.125, 0.125, 0.157)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(1, 1, 1)
	env.ambient_light_energy = 0.35 if md != "layers" else 0.0
	we.environment = env
	parent.add_child(we)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-35, 40, 0)
	sun.light_energy = 1.0
	parent.add_child(sun)
