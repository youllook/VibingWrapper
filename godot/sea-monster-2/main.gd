extends Node3D
# 大海怪2 — an oblique aerial view over open ocean: a giant squid lies at the surface, a small boat motors past it
# (composition from the user's reference, 2026-10-27). The scene is built in code. The page (shell.html) owns
# state.json polling, the 30 fps cap and pause; this script reads window.wpCtl through JavaScriptBridge.
#
# Claude state → the same events as 大海怪 (themes/sea-monster): the squid's depth, the fish, the mood of the water
#   clear     bright blue sea; a school passes every 20–60 s
#   overcast  the sea sinks to blue-black over 10 s; a fright spreads from the boat and every school bolts
#   storm     omen (1.5–4 s): schools burst out of the deep ahead of a spreading front; the squid rises to its outline
#             (4–9 s) and on to the surface (9–13 s) while the water over it clears and the sea goes still;
#             then now and then a school wanders in and shies away. The first 9 s always play out.
#   waiting   the squid stays up, its pupil opening over two minutes; calm fish ring the boat, wider the longer you wait
#   clearing  the ring breaks up, the squid sinks, the sea brightens again over 10 s
# The pack (user 2026-10-27: 一群大魷魚): three smaller squid circle the boat far below it — dark shapes while it thinks,
# closing in at their own depths while it runs, drawing nearer while it waits, sinking one by one at the end.
# Native tests: godot --path godot/sea-monster-2 -- state=storm warp=20

const SQUID_SCALE := 10.0                      # kraken.glb is 8 m long → 72 m (the pack is sized from this)
const CAM_DIR := Vector3(0.0, 0.85, 0.52)        # roughly toward the camera, for picking the near eye
const HERO_K := 1.4                            # the big one: 1.4× (user 2026-10-27: 5× hid the pack), bigger than the frame;
                                               # it grows about its near eye, so the eye stays beside the boat
const SQUID_FLAT := 0.42                       # squashed top to bottom so it lies on the surface, arms just under it
const SQUID_POS := Vector3(5.0, 0.0, -5.0)      # body origin on the water plane
const SQUID_YAW := deg_to_rad(-146.0)
const SQUID_ROLL := 0.0                        # lies flat: at five times the size a roll lifts its far arms 100 m out of the
                                               # sea (was 0.55 to turn the near eye up); its eyes turn to the camera instead
const DEEP := 60.0                              # out of sight
const SHADOW := 22.0                            # thinking with the squid already up: a dark shape far below
const OUTLINE := 8.0                            # rise.outline reaches here
const UP := 3.0                                 # its highest point under the surface: the boat (dead centre) floats over its head
const UP_WAIT := 2.5
const RISE := {"omen": [1.5, 4.0], "outline": [4.0, 9.0], "peak": [9.0, 13.0]}
const LOCK := 9.0                               # seconds of the rise that play out whatever the state does
const MURK := {"none": 0.0, "clear": 0.0, "overcast": 1.0, "storm": 1.0, "waiting": 0.85, "clearing": 0.0}
const MURK_DUR := {"none": 10.0, "clear": 10.0, "overcast": 10.0, "storm": 3.0, "waiting": 6.0, "clearing": 10.0}
const THINK_R := 70.0                           # the fright spreads from the boat across the frame in 3 s
const OMEN_R := 70.0
const RING := [9.0, 13.0]                       # waiting: ring radius round the boat, wider over 5 minutes
const RING_N := 60
# the pack: size (× the 72 m model), where it patrols (centre relative to the boat, m — the open water the big one
# leaves in the frame: lower right, left, above — user 2026-10-27 moved the upper-left one down right), loop radius, seconds per loop, start angle, depth while
# thinking / running / waiting (m below the surface). The frame covers about x −51…43, z −33…18 on the water.
const PACK := [
	{"k": 0.40, "c": Vector2(27.0, 6.0), "r": 5.0, "lap": 70.0, "a0": 0.0, "think": 26.0, "storm": 8.0, "wait": 7.0},
	{"k": 0.35, "c": Vector2(-36.0, 4.0), "r": 9.0, "lap": 55.0, "a0": 2.2, "think": 30.0, "storm": 12.0, "wait": 10.0},
	{"k": 0.45, "c": Vector2(-4.0, -30.0), "r": 10.0, "lap": 85.0, "a0": 4.1, "think": 34.0, "storm": 14.0, "wait": 12.0},
]
const EYE_K := 0.9                              # glass eye size (× the model scale), sitting in the socket
const PACK_REACH := 7.0
const VISIT_EVERY := [6.0, 12.0]                # running, after the rise: a school comes in this often
const SQUID_REACH := 30.0                       # how far round its body axis the fish feel it (m)
const DEBOUNCE := 0.3
const BOAT_LENGTH := 5.0
const BOAT_DRAFT := 0.25                        # how deep the hull sits
const PEOPLE_FLOOR := 0.05                      # deck height above the water line, for the two men
const BOAT_SPEED := 2.2                        # m/s, the water scrolls under a boat that stays put in frame

var state := "clear"           # what state.json says
var cur := ""                  # the state being played
var pending := ""
var debounce_t := 0.0
var queued := ""
var warp := 0.0
var dbg := ""
var then_state := ""
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
var depth := Tw.new(DEEP)
var murk := Tw.new(0.0)
var fear_r := Tw.new(0.0)
var pupil := Tw.new(0.55)
var boat_k := Tw.new(1.0)
var script_on := false         # the storm rise is playing
var rise_t := 0.0
var next_school := 8.0
var next_omen := 0.0
var next_visit := 12.0
var wait_t := 0.0
var flinch_t := 99.0           # seconds since a school bolted in front of it (its pupil snaps tight, then eases open)
var fishes: Node
var env_res: Environment
var eye_mat: ShaderMaterial
var skin_mat: StandardMaterial3D
var pack := []                 # [{node, skel, limbs, eyes, base_y, scale, k, depth: Tw, ang, cfg}]
var squid_scale := Vector3.ONE
var squid_base_y := 0.0      # body origin height that puts its highest point at the water line
var squid_at := Vector3.ZERO  # its body origin on the water (SQUID_POS moved so the near eye stays put)
var boat: Node3D
var boat_pos := Vector3(-4.0, 0.0, -2.0)        # where the camera looks: the middle of the frame
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
	# high and to the south, looking down 40° (user 2026-10-27, picked over 58°, straight down and turned 30°):
	# the squid fills the right two thirds, the boat dead centre
	# (user 2026-10-27: the squid stays put, the boat moves to the middle of the frame)
	cam.position = Vector3(-4.0, 39.0, 45.0)
	cam.look_at(boat_pos, Vector3.UP)
	if dbg.find("cam=") >= 0:
		var v := dbg.get_slice("cam=", 1).get_slice(";", 0).split_floats(",")
		if v.size() == 6:
			cam.position = Vector3(v[0], v[1], v[2])
			cam.look_at(Vector3(v[3], v[4], v[5]), Vector3.UP)
	fishes = load("res://fish.gd").new()
	add_child(fishes)
	fishes.setup(cam)
	_enter(state, true)
	if then_state != "":
		state = then_state
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
				"then": then_state = kv[1]    # tests: a second state after the first, as if state.json changed

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
	env_res = env
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
	eye_mat = ShaderMaterial.new()
	eye_mat.shader = load("res://eye.gdshader")
	eye_mat.set_shader_parameter("iris_tex", load("res://models/iris.png"))
	var base_scale := Vector3(SQUID_SCALE, SQUID_SCALE * SQUID_FLAT, SQUID_SCALE * 1.2)   # a little stouter than the model
	squid_scale = base_scale * HERO_K
	var K := _make_kraken(squid_scale, Basis(Vector3.UP, SQUID_YAW) * Basis(Vector3.RIGHT, SQUID_ROLL))
	squid = K.node
	skel = K.skel
	limbs = K.limbs
	eyes = K.eyes
	squid_base_y = K.base_y
	# grow it about its near eye (the one rolled up toward the camera): find that eye in the model's own space
	var pose := Basis(Vector3.UP, SQUID_YAW) * Basis(Vector3.RIGHT, SQUID_ROLL)
	var hb := skel.find_bone("head")
	var near_eye := Vector3.ZERO
	for e in eyes:
		var el: Vector3 = skel.get_bone_global_rest(hb) * (e as Node3D).transform.origin
		if near_eye == Vector3.ZERO or (pose * el).dot(CAM_DIR) > (pose * near_eye).dot(CAM_DIR):
			near_eye = el
	var shift := pose.scaled_local(base_scale) * near_eye - pose.scaled_local(squid_scale) * near_eye
	squid_at = SQUID_POS + Vector3(shift.x, 0.0, shift.z)
	for c in PACK:
		var sc: Vector3 = base_scale * c.k
		var M := _make_kraken(sc, Basis.IDENTITY)
		M.merge({"scale": sc, "k": c.k, "depth": Tw.new(DEEP), "ang": c.a0, "cfg": c})
		M.node.visible = false
		pack.append(M)

# one kraken.glb: wet skin, the glassy eyes, its limbs found for the travelling wave, and the height that puts its
# highest point (squashed, in `pose`) at the water line
func _make_kraken(scale_v: Vector3, pose: Basis) -> Dictionary:
	var node: Node3D = (load("res://models/kraken.glb") as PackedScene).instantiate()
	add_child(node)
	var sk: Skeleton3D = node.find_child("Skeleton3D", true, false)
	var body := node.find_child("kraken", true, false) as MeshInstance3D
	var top := -INF
	var pose0 := pose.scaled_local(scale_v)
	for v in body.mesh.surface_get_arrays(0)[Mesh.ARRAY_VERTEX]:
		top = maxf(top, (pose0 * v).y)
	# wet skin: the GLB's colour/normal/roughness, a little glossier, plus a clear wet film (one material for all of them)
	if skin_mat == null:
		skin_mat = (body.mesh.surface_get_material(0) as StandardMaterial3D).duplicate()
		skin_mat.roughness = 0.55
		skin_mat.clearcoat_enabled = true
		skin_mat.clearcoat = 0.6
		skin_mat.clearcoat_roughness = 0.18
	body.material_override = skin_mat
	var ey := []
	for n in ["eye_L", "eye_R"]:
		var e := node.find_child(n, true, false) as MeshInstance3D
		if e:
			e.material_override = eye_mat
			ey.append(e)
	# limbs: arm_1..7_00..17, tentacle_1..2_00..21 — each gets a slow travelling wave
	var lb := []
	for prefix in ["arm_%d_", "tentacle_%d_"]:
		for k in range(1, 8):
			var bones := []
			var rest := []
			for j in 22:
				var bi := sk.find_bone((prefix % k) + ("%02d" % j))
				if bi < 0:
					break
				bones.append(bi)
				rest.append(sk.get_bone_pose_rotation(bi))
			if bones.size() > 0:
				lb.append({"bones": bones, "rest": rest, "phase": randf() * TAU, "rate": randf_range(0.18, 0.3)})
	return {"node": node, "skel": sk, "limbs": lb, "eyes": ey, "base_y": -top}

# the travelling wave down every arm; amp scales it (the pack swims, so theirs is larger)
func _wave_limbs(sk: Skeleton3D, lb: Array, amp: float) -> void:
	for L in lb:
		var bones: Array = L["bones"]
		var n := bones.size()
		for j in n:
			var u := float(j) / float(n)
			var a := sin(t * L["rate"] * TAU / 4.0 - u * 5.0 + L["phase"]) * 0.05 * amp * (0.3 + u)
			var b := sin(t * 0.11 - u * 3.0 + L["phase"] * 1.7) * 0.025 * amp
			sk.set_bone_pose_rotation(bones[j], L["rest"][j] * Quaternion(Vector3(0, 0, 1), a) * Quaternion(Vector3(1, 0, 0), b))

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

# a value easing to a target over a duration (smoothstep), optionally after a delay
class Tw:
	var v := 0.0
	var a := 0.0
	var b := 0.0
	var d := 1.0
	var e := 1.0
	var wait := 0.0
	func _init(x: float) -> void:
		v = x
		a = x
		b = x
	func to(x: float, dur: float, delay := 0.0) -> Tw:
		a = v
		b = x
		d = maxf(dur, 1e-3)
		e = 0.0
		wait = delay
		return self
	func set_now(x: float) -> Tw:
		v = x
		a = x
		b = x
		e = d
		return self
	func step(dt: float) -> void:
		if wait > 0.0:
			wait -= dt
			return
		e = minf(e + dt, d)
		v = lerpf(a, b, smoothstep(0.0, 1.0, e / d))

func _ss(r: Array, x: float) -> float:
	return smoothstep(r[0], r[1], x)

func _apply(name: String) -> void:
	if script_on and rise_t < LOCK:
		queued = name
		return
	_enter(name)

func _enter(name: String, now := false) -> void:
	if not MURK.has(name) or name == cur:
		return
	var prev := cur
	cur = name
	if now:
		murk.set_now(MURK[name])
	else:
		murk.to(MURK[name], MURK_DUR[name])
	boat_k.to(0.45 if name == "waiting" else 1.0, 4.0)
	if name == "overcast":
		fear_r.set_now(0.0).to(THINK_R, 3.0)
	if name == "waiting":
		wait_t = 0.0
		fishes.claim_ring(RING_N, Vector2(boat_pos.x, boat_pos.z))
	if prev == "waiting":
		fishes.release_ring()
	if name == "storm":
		next_omen = 0.0
		next_visit = randf_range(8, 14)
	var up := depth.v < 30.0
	if name != "storm":
		script_on = false
	match name:
		"storm":
			if up:
				depth.to(UP, 3.0)
				pupil.to(0.7, 3.0)
			else:
				script_on = true
				rise_t = 0.0
				depth.set_now(DEEP)
				pupil.set_now(0.45)
		"overcast":
			if up:
				depth.to(SHADOW, 4.0)
				pupil.to(0.5, 4.0)
		"waiting":
			depth.to(UP_WAIT, 5.0)
		_:
			depth.to(DEEP, 9.0)
			pupil.to(0.5, 4.0)
	if now and not script_on:
		depth.set_now(depth.b)
		pupil.set_now(pupil.b)
	# the pack: each at its own depth, a beat after the one before
	for i in pack.size():
		var M: Dictionary = pack[i]
		var c: Dictionary = M.cfg
		var d: Tw = M.depth
		match name:
			"storm":
				if script_on:
					d.set_now(DEEP).to(c.storm, 6.0, 5.0 + i * 1.5)   # they come in behind the big one's rise
				else:
					d.to(c.storm, 4.0, i * 0.5)
			"overcast":
				d.to(c.think, 6.0, i * 1.5)
			"waiting":
				d.to(c.wait, 5.0, i * 1.0)
			_:
				d.to(DEEP, 10.0, i * 3.0)             # sinking one by one
		if now and not script_on:
			d.set_now(d.b)

func _storm_script(dt: float) -> void:
	if not script_on:
		return
	rise_t += dt
	var T := rise_t
	depth.set_now(DEEP - (DEEP - OUTLINE) * _ss(RISE.outline, T) - (OUTLINE - UP) * _ss(RISE.peak, T))
	pupil.set_now(0.45 + 0.25 * _ss(RISE.peak, T))      # at the top: it sees the boat
	if T >= RISE.peak[1]:
		script_on = false
	if T >= LOCK and queued != "":
		var q := queued
		queued = ""
		_enter(q)

# the squid's body axis on the water: tail (mantle end) and arm tips
func _squid_axis() -> Array:
	var tail := squid.global_transform * Vector3(-4.0, 0.0, 0.0)
	var tips := squid.global_transform * Vector3(4.0, 0.0, 0.0)
	return [Vector2(tail.x, tail.z), Vector2(tips.x, tips.z)]

# what the fish are afraid of: thinking — something under the boat, a circle spreading from it; running — the omen
# front spreading the same way, then the squid itself
func _threat():
	var b2 := Vector2(boat_pos.x, boat_pos.z)
	var ax := _squid_axis()
	var rear: Vector2 = (ax[0] - ax[1]).normalized()     # escape turns toward its tail, away from the arms
	if cur == "overcast" and depth.v > 25.0:
		return {"kind": "circle", "c": b2, "r": fear_r.v, "rear": rear} if fear_r.v > 0.5 else null
	if cur == "storm" and script_on and rise_t < RISE.omen[1]:
		var r := OMEN_R * _ss(RISE.omen, rise_t)
		return {"kind": "circle", "c": b2, "r": r, "rear": rear} if r > 0.5 else null
	if cur != "storm" and cur != "overcast":
		return null
	var caps := []
	if depth.v < 25.0:
		caps.append({"kind": "capsule", "a": ax[0], "b": ax[1], "r": SQUID_REACH * clampf((30.0 - depth.v) / 20.0, 0.0, 1.0)})
	for M in pack:
		var dv: float = M.depth.v
		if dv < 25.0:
			var tl: Vector3 = M.node.global_transform * Vector3(-4.0, 0.0, 0.0)
			var tp: Vector3 = M.node.global_transform * Vector3(4.0, 0.0, 0.0)
			caps.append({"kind": "capsule", "a": Vector2(tl.x, tl.z), "b": Vector2(tp.x, tp.z), "r": PACK_REACH * clampf((30.0 - dv) / 20.0, 0.0, 1.0)})
	if caps.is_empty():
		return null
	return {"kind": "multi", "list": caps, "rear": rear}

func _drive_fish(dt: float, fwd: Vector2) -> void:
	var b2 := Vector2(boat_pos.x, boat_pos.z)
	if cur == "clear" or cur == "clearing":          # idle: a school every 20–60 s, at most two
		next_school -= dt
		if next_school <= 0.0:
			if fishes.schools.size() < 2:
				fishes.spawn(randi_range(40, 90), ["ball", "ring", "band", "scatter"].pick_random())
			next_school = randf_range(20, 60)
	if cur == "storm" and script_on and rise_t > RISE.omen[0] and rise_t < RISE.omen[1] - 0.5:   # the omen: schools keep bolting
		next_omen -= dt
		if next_omen <= 0.0:
			next_omen = randf_range(1.0, 1.8)
			var front := OMEN_R * _ss(RISE.omen, rise_t)
			for i in 12:                                  # somewhere on screen, just ahead of the front
				var p: Vector2 = fishes.water_at(Vector2(randf_range(0.08, 0.92), randf_range(0.08, 0.92)))
				var d := p.distance_to(b2)
				if d < front + 3.0 or d > front + 18.0:
					continue
				fishes.spawn(randi_range(30, 60), "band" if randf() < 0.5 else "ball", p, p, randf_range(30, 50), true)
				break
	if cur == "storm" and not script_on and depth.v < OUTLINE:   # the long hold: now and then a school swims in toward
		next_visit -= dt                                          # the boat, meets the squid under it and bolts
		if next_visit <= 0.0:
			next_visit = randf_range(VISIT_EVERY[0], VISIT_EVERY[1])
			fishes.spawn(randi_range(40, 80), "band" if randf() < 0.6 else "ball", b2 + Vector2.from_angle(randf() * TAU) * randf_range(0.0, 8.0),
				null, randf_range(30, 50), false, randf_range(8, 12))
	var ring = null
	if cur == "waiting":
		wait_t += dt
		ring = {"c": b2, "r": lerpf(RING[0], RING[1], minf(wait_t / 300.0, 1.0))}
		if wait_t > 5.0:                                # the pupil opens slowly over two minutes, hunting a little
			pupil.set_now(0.5 + 0.35 * minf((wait_t - 5.0) / 120.0, 1.0) + 0.03 * sin(t * 0.7))
	fear_r.step(dt)
	fishes.bolts = 0
	fishes.step(minf(dt, 1.0 / 20.0), {"threat": _threat(), "ring": ring, "murk": murk.v,
		"boat": {"p": b2, "h": fwd, "len": BOAT_LENGTH, "beam": 2.0}})
	# a school bolting in front of it: the pupil snaps tight (user 2026-10-27), but not again while it is still easing
	flinch_t += dt
	if fishes.bolts >= 6 and squid.visible and depth.v < 15.0 and flinch_t > 2.5:
		flinch_t = 0.0

# the glass eyes: round although the body is squashed, so only the one facing the camera is shown — lying flat,
# the far one would poke out through the top of its squashed head (user 2026-10-27: "two extra black balls");
# watch = turn the pupil (+Y) up to the camera
func _fit_eyes(ey: Array, size: float, watch: bool) -> void:
	if ey.size() < 2:
		return
	var a: Node3D = ey[0]
	var b: Node3D = ey[1]
	var near: Node3D = a if a.global_position.distance_to(cam.global_position) < b.global_position.distance_to(cam.global_position) else b
	for e in ey:
		(e as Node3D).visible = e == near
	if watch:
		var y: Vector3 = (cam.global_position - near.global_position).normalized()
		var x := y.cross(Vector3.BACK).normalized()
		near.global_basis = Basis(x, y, x.cross(y)).scaled(Vector3.ONE * size)
	else:
		near.global_basis = near.global_basis.orthonormalized().scaled(Vector3.ONE * size)

# the pack loops in the open water round the big one, mantle first (jetting), arms trailing; slower while it waits
func _drive_pack(dt: float) -> void:
	for i in pack.size():
		var M: Dictionary = pack[i]
		var c: Dictionary = M.cfg
		var d: Tw = M.depth
		d.step(dt)
		var node: Node3D = M.node
		node.visible = d.v < DEEP - 0.5
		if not node.visible:
			continue
		M["ang"] += TAU / c.lap * dt * (0.6 if cur == "waiting" else 1.0)
		var a: float = M.ang
		var tv := Vector2(-sin(a), cos(a))                     # direction of travel on the water (x, z)
		var c0 := boat_pos + Vector3(c.c.x, 0.0, c.c.y)
		node.position = c0 + Vector3(cos(a), 0.0, sin(a)) * c.r + Vector3(0, M.base_y - d.v + sin(t * 0.3 + i) * 0.4, 0)
		var yaw := atan2(tv.y, -tv.x)                          # its mantle (-X) leads
		node.basis = (Basis(Vector3.UP, yaw + sin(t * 0.25 + i * 2.0) * 0.08) * Basis(Vector3.RIGHT, sin(t * 0.2 + i) * 0.12)).scaled_local(M.scale)
		_fit_eyes(M.eyes, SQUID_SCALE * c.k * EYE_K, false)
		if (Engine.get_process_frames() + i) % 2 == 0:       # their arms every other frame
			_wave_limbs(M.skel, M.limbs, 1.8)

func _step(dt: float) -> void:
	t += dt
	# a new state from the page settles for DEBOUNCE before it plays
	if state != cur and state != pending and pending == "":
		pending = state
		debounce_t = DEBOUNCE
	if pending != "":
		debounce_t -= dt
		if debounce_t <= 0.0:
			var p := pending
			pending = ""
			if p != cur:
				_apply(p)
	_storm_script(dt)
	depth.step(dt)
	murk.step(dt)
	boat_k.step(dt)
	if not script_on and cur != "waiting":
		pupil.step(dt)
	squid_depth = depth.v
	squid.visible = squid_depth < DEEP - 0.5
	squid.position = squid_at + Vector3(0, squid_base_y - squid_depth + sin(t * 0.21) * 0.25, 0)
	squid.basis = (Basis(Vector3.UP, SQUID_YAW + sin(t * 0.07) * 0.02) * Basis(Vector3.RIGHT, SQUID_ROLL + sin(t * 0.13) * 0.015)).scaled_local(squid_scale)
	_fit_eyes(eyes, SQUID_SCALE * HERO_K * EYE_K, true)
	if squid.visible:
		_wave_limbs(skel, limbs, 1.0)
	_drive_pack(dt)
	# the boat rocks; the sea slides under it
	var fwd := Vector2(cos(boat_heading), -sin(boat_heading))
	drift += fwd * BOAT_SPEED * boat_k.v * dt
	boat.position = boat_pos + Vector3(0, sin(t * 1.3) * 0.06 - 0.12, 0)
	boat.rotation = Vector3(sin(t * 1.1) * 0.025, boat_heading, sin(t * 0.9 + 1.0) * 0.035)
	water_mat.set_shader_parameter("time", t)
	water_mat.set_shader_parameter("drift", drift)
	water_mat.set_shader_parameter("boat_pos", Vector2(boat_pos.x, boat_pos.z))
	water_mat.set_shader_parameter("boat_dir", fwd)
	_drive_fish(dt, fwd)
	# mood (氛圍優先於光學): bright blue at rest, blue-black while it works; the water over the squid clears and the
	# sea stills as it comes up from half depth, so it emerges from the dark
	var m := murk.v
	var clar := smoothstep(14.0, 1.5, squid_depth)
	sun.light_energy = lerpf(1.7, 0.6, m) + 0.3 * clar
	env_res.ambient_light_energy = lerpf(0.5, 0.18, m)
	env_res.tonemap_exposure = lerpf(1.1, 0.95, m)
	var flinch := smoothstep(0.0, 0.15, flinch_t) * (1.0 - smoothstep(0.6, 3.5, flinch_t))
	eye_mat.set_shader_parameter("pupil", pupil.v * (1.0 - 0.45 * flinch))
	eye_mat.set_shader_parameter("lit", 0.25 + sun.light_energy / 1.7)
	eye_mat.set_shader_parameter("sun_to", sun.global_transform.basis.z)
	water_mat.set_shader_parameter("murk", m)
	water_mat.set_shader_parameter("calm", clar)
