extends Node3D
# 大海怪2 — an oblique aerial view over open ocean: a giant squid lies at the surface, a small boat motors past it
# (composition from the user's reference, 2026-10-27). The scene is built in code. The page (shell.html) owns
# state.json polling, the 30 fps cap and pause; this script reads window.wpCtl through JavaScriptBridge.
#
# Claude state → squid depth (metres of its back below the surface; negative = breaking the surface):
#   clear     sunk out of sight, only the boat
#   overcast  a dark shape far below
#   storm     rises until its back and eye break the surface
#   waiting   stays up, the eye follows the boat
#   clearing  sinks away again
# Native tests: godot --path godot/sea-monster-2 -- state=storm warp=20

const SQUID_SCALE := 10.0                      # kraken.glb is 8 m long → 72 m; its eye ≈ the boat's length
const SQUID_FLAT := 0.42                       # squashed top to bottom so it lies on the surface, arms just under it
const SQUID_POS := Vector3(5.0, 0.0, -5.0)      # body origin on the water plane
const SQUID_YAW := deg_to_rad(-146.0)
const SQUID_ROLL := 0.55                       # rolled onto its side so the near eye looks up at the camera          # mantle to the upper right of the screen, arms to the lower left
const DEPTH := {"none": 40.0, "clear": 40.0, "overcast": 22.0, "storm": 1.0, "waiting": 0.7, "clearing": 40.0}
const BOAT_LENGTH := 5.0
const BOAT_DRAFT := 0.35                        # how deep the hull sits
const PEOPLE_FLOOR := 0.05                      # deck height above the water line, for the two men
const BOAT_SPEED := 2.2                        # m/s, the water scrolls under a boat that stays put in frame

var state := "clear"
var warp := 0.0
var dbg := ""
var t := 0.0
var poll_t := 0.0

var cam: Camera3D
var sun: DirectionalLight3D
var water_mat: ShaderMaterial
var squid: Node3D
var skel: Skeleton3D
var limbs := []              # [{bones: [idx…], rest: [Quaternion…], phase}]
var eyes := []               # eye MeshInstance3Ds
var squid_depth := 40.0
var squid_scale := Vector3.ONE
var squid_base_y := 0.0      # body origin height that puts its highest point at the water line
var boat: Node3D
var boat_pos := Vector3(-15.0, 0.0, -25.0)
var boat_heading := deg_to_rad(-28.0)        # bow toward the lower right of the screen
var drift := Vector2.ZERO                    # how far the water has slid past the boat

func _ready() -> void:
	seed(7)
	_read_args()
	_build_environment()
	_build_water()
	_build_squid()
	_build_boat()
	cam = Camera3D.new()
	cam.fov = 38.0
	cam.near = 1.0
	cam.far = 2000.0
	add_child(cam)
	# high and to the south, looking down about 60°: the squid fills the right two thirds, the boat sits top left
	cam.position = Vector3(-4.0, 52.0, 30.0)
	cam.look_at(Vector3(-4.0, 0.0, -2.0), Vector3.UP)
	if dbg.find("cam=") >= 0:
		var v := dbg.get_slice("cam=", 1).get_slice(";", 0).split_floats(",")
		if v.size() == 6:
			cam.position = Vector3(v[0], v[1], v[2])
			cam.look_at(Vector3(v[3], v[4], v[5]), Vector3.UP)
	squid_depth = DEPTH.get(state, 40.0)
	for i in int(warp * 30.0):
		_step(1.0 / 30.0)

func _read_args() -> void:
	for a in OS.get_cmdline_user_args():
		var kv := a.split("=", true, 1)
		if kv.size() == 2:
			match kv[0]:
				"state": state = kv[1]
				"warp": warp = float(kv[1])
				"dbg": dbg = kv[1]

# ---------------------------------------------------------------- scene
func _build_environment() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.02, 0.06, 0.11)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.5, 0.55, 0.6)
	env.ambient_light_energy = 0.45
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 1.05
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	# low afternoon sun from the far left, so its glitter lands in the top-left corner of the frame
	sun = DirectionalLight3D.new()
	sun.light_energy = 1.6
	sun.light_color = Color(1.0, 0.95, 0.86)
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 220.0
	add_child(sun)
	sun.look_at_from_position(Vector3.ZERO, Vector3(0.75, -0.42, 0.55), Vector3.UP)

func _build_water() -> void:
	var plane := PlaneMesh.new()
	plane.size = Vector2(900, 900)
	water_mat = ShaderMaterial.new()
	water_mat.shader = load("res://water.gdshader")
	water_mat.set_shader_parameter("sun_dir", -sun.global_transform.basis.z)
	var mi := MeshInstance3D.new()
	mi.mesh = plane
	mi.material_override = water_mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)

func _build_squid() -> void:
	squid = (load("res://models/kraken.glb") as PackedScene).instantiate()
	squid_scale = Vector3(SQUID_SCALE, SQUID_SCALE * SQUID_FLAT, SQUID_SCALE * 1.2)   # a little stouter than the model
	add_child(squid)
	skel = squid.find_child("Skeleton3D", true, false)
	var body := squid.find_child("kraken", true, false) as MeshInstance3D
	squid_base_y = -body.get_aabb().end.y * SQUID_SCALE * SQUID_FLAT
	# wet skin: the GLB's colour/normal/roughness, a little glossier, plus a clear wet film
	var m := body.mesh.surface_get_material(0) as StandardMaterial3D
	if m:
		m = m.duplicate()
		m.roughness = 0.55
		m.clearcoat_enabled = true
		m.clearcoat = 0.6
		m.clearcoat_roughness = 0.18
		body.material_override = m
	var eye_mat := ShaderMaterial.new()
	eye_mat.shader = load("res://eye.gdshader")
	eye_mat.set_shader_parameter("iris_tex", load("res://models/iris.png"))
	for n in ["eye_L", "eye_R"]:
		var e := squid.find_child(n, true, false) as MeshInstance3D
		if e:
			e.material_override = eye_mat
			eyes.append(e)
	# limbs: arm_1..7_00..17, tentacle_1..2_00..21 — each gets a slow travelling wave
	for prefix in ["arm_%d_", "tentacle_%d_"]:
		for k in range(1, 8):
			var bones := []
			var rest := []
			for j in 22:
				var bi := skel.find_bone((prefix % k) + ("%02d" % j))
				if bi < 0:
					break
				bones.append(bi)
				rest.append(skel.get_bone_pose_rotation(bi))
			if bones.size() > 0:
				limbs.append({"bones": bones, "rest": rest, "phase": randf() * TAU, "rate": randf_range(0.18, 0.3)})

func _build_boat() -> void:
	boat = Node3D.new()
	add_child(boat)
	boat.position = boat_pos
	boat.rotation.y = boat_heading
	# the Tripo boat (docs/大海怪2/漁船_Tripo需求單.md): its bow points +Z, turned to +X, scaled to 5 m, sunk to its draft
	var b: Node3D = (load("res://models/boat.glb") as PackedScene).instantiate()
	var pivot := Node3D.new()
	pivot.rotation.y = PI / 2
	boat.add_child(pivot)
	pivot.add_child(b)
	var box := _aabb(b)
	var k := BOAT_LENGTH / box.size.z
	b.scale = Vector3.ONE * k
	b.position = Vector3(-box.get_center().x * k, -box.position.y * k - BOAT_DRAFT, -box.get_center().z * k)
	# two men: one standing at the console, one sitting aft by the outboard
	var shirts := [Color(0.18, 0.3, 0.48), Color(0.42, 0.4, 0.36)]
	var skin := StandardMaterial3D.new()
	skin.albedo_color = Color(0.55, 0.4, 0.3)
	var spots := [[Vector3(-0.75, 0.0, 0.0), 0.95], [Vector3(-1.95, 0.0, 0.25), 0.6]]
	for i in 2:
		var m := StandardMaterial3D.new()
		m.albedo_color = shirts[i]
		var body := MeshInstance3D.new()
		var cm := CapsuleMesh.new()
		cm.radius = 0.2
		cm.height = spots[i][1]
		body.mesh = cm
		body.material_override = m
		body.position = spots[i][0] + Vector3(0, PEOPLE_FLOOR + cm.height / 2.0, 0)
		boat.add_child(body)
		var head := MeshInstance3D.new()
		var sm := SphereMesh.new()
		sm.radius = 0.12
		sm.height = 0.24
		head.mesh = sm
		head.material_override = skin
		head.position = spots[i][0] + Vector3(0, PEOPLE_FLOOR + cm.height + 0.1, 0)
		boat.add_child(head)

func _aabb(n: Node) -> AABB:
	var box := AABB()
	var first := true
	for m in n.find_children("*", "MeshInstance3D", true, false):
		var mi := m as MeshInstance3D
		var b: AABB = (n as Node3D).global_transform.affine_inverse() * mi.global_transform * mi.get_aabb()
		box = b if first else box.merge(b)
		first = false
	return box

# ---------------------------------------------------------------- state
func _poll() -> void:
	if not OS.has_feature("web"):
		return
	var s = JavaScriptBridge.eval("JSON.stringify(window.wpCtl || {})", true)
	var d = JSON.parse_string(str(s))
	if d is Dictionary:
		state = str(d.get("state", "clear"))
		dbg = str(d.get("dbg", ""))
		warp = float(d.get("warp", 0.0))

func _process(dt: float) -> void:
	poll_t -= dt
	if poll_t <= 0.0:
		poll_t = 0.5
		_poll()
	_step(dt)

func _step(dt: float) -> void:
	t += dt
	# the squid rises fast and sinks slowly
	var target: float = DEPTH.get(state, 40.0)
	var rate := 0.45 if target < squid_depth else 0.12
	squid_depth = lerpf(squid_depth, target, 1.0 - exp(-rate * dt))
	squid.position = SQUID_POS + Vector3(0, squid_base_y - squid_depth + sin(t * 0.21) * 0.25, 0)
	squid.basis = (Basis(Vector3.UP, SQUID_YAW + sin(t * 0.07) * 0.02) * Basis(Vector3.RIGHT, SQUID_ROLL + sin(t * 0.13) * 0.015)).scaled_local(squid_scale)
	# the eyes stay round although the body is squashed
	for e in eyes:
		e.global_basis = e.global_basis.orthonormalized().scaled(Vector3.ONE * SQUID_SCALE * 0.85)
	for L in limbs:
		var bones: Array = L["bones"]
		var n := bones.size()
		for j in n:
			var u := float(j) / float(n)
			var a := sin(t * L["rate"] * TAU / 4.0 - u * 5.0 + L["phase"]) * 0.05 * (0.3 + u)
			var b := sin(t * 0.11 - u * 3.0 + L["phase"] * 1.7) * 0.025
			skel.set_bone_pose_rotation(bones[j], L["rest"][j] * Quaternion(Vector3(0, 0, 1), a) * Quaternion(Vector3(1, 0, 0), b))
	# the boat rocks; the sea slides under it
	var fwd := Vector2(cos(boat_heading), -sin(boat_heading))
	drift += fwd * BOAT_SPEED * dt
	boat.position = boat_pos + Vector3(0, sin(t * 1.3) * 0.06 - 0.12, 0)
	boat.rotation = Vector3(sin(t * 1.1) * 0.025, boat_heading, sin(t * 0.9 + 1.0) * 0.035)
	water_mat.set_shader_parameter("time", t)
	water_mat.set_shader_parameter("drift", drift)
	water_mat.set_shader_parameter("boat_pos", Vector2(boat_pos.x, boat_pos.z))
	water_mat.set_shader_parameter("boat_dir", fwd)
	water_mat.set_shader_parameter("calm", clampf(1.0 - squid_depth / 6.0, 0.0, 1.0))
