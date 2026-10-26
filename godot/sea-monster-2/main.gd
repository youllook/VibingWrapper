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
# Native tests: godot --path godot/sea-monster-2 -- state=storm warp=20

const SQUID_SCALE := 10.0                      # kraken.glb is 8 m long → 72 m; its eye ≈ the boat's length
const SQUID_FLAT := 0.42                       # squashed top to bottom so it lies on the surface, arms just under it
const SQUID_POS := Vector3(5.0, 0.0, -5.0)      # body origin on the water plane
const SQUID_YAW := deg_to_rad(-146.0)
const SQUID_ROLL := 0.55                       # rolled onto its side so the near eye looks up at the camera          # mantle to the upper right of the screen, arms to the lower left
const DEEP := 40.0                              # out of sight
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
const VISIT_EVERY := [6.0, 12.0]                # running, after the rise: a school comes in this often
const SQUID_REACH := 12.0                       # how far round its body axis the fish feel it (m)
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
var fishes: Node
var env_res: Environment
var eye_mat: ShaderMaterial
var squid_scale := Vector3.ONE
var squid_base_y := 0.0      # body origin height that puts its highest point at the water line
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
	# high and to the south, looking down about 60°: the squid fills the right two thirds, the boat dead centre
	# (user 2026-10-27: the squid stays put, the boat moves to the middle of the frame)
	cam.position = Vector3(-4.0, 52.0, 30.0)
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
	squid = (load("res://models/kraken.glb") as PackedScene).instantiate()
	squid_scale = Vector3(SQUID_SCALE, SQUID_SCALE * SQUID_FLAT, SQUID_SCALE * 1.2)   # a little stouter than the model
	add_child(squid)
	skel = squid.find_child("Skeleton3D", true, false)
	var body := squid.find_child("kraken", true, false) as MeshInstance3D
	# the body's real highest point once squashed and rolled onto its side (rest pose), so depth 0 = touching the surface
	var top := -INF
	var pose0 := (Basis(Vector3.UP, SQUID_YAW) * Basis(Vector3.RIGHT, SQUID_ROLL)).scaled_local(squid_scale)
	for v in body.mesh.surface_get_arrays(0)[Mesh.ARRAY_VERTEX]:
		top = maxf(top, (pose0 * v).y)
	squid_base_y = -top
	# wet skin: the GLB's colour/normal/roughness, a little glossier, plus a clear wet film
	var m := body.mesh.surface_get_material(0) as StandardMaterial3D
	if m:
		m = m.duplicate()
		m.roughness = 0.55
		m.clearcoat_enabled = true
		m.clearcoat = 0.6
		m.clearcoat_roughness = 0.18
		body.material_override = m
	eye_mat = ShaderMaterial.new()
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
	if (cur == "storm" or cur == "overcast") and depth.v < 25.0:
		return {"kind": "capsule", "a": ax[0], "b": ax[1], "r": SQUID_REACH * clampf((30.0 - depth.v) / 20.0, 0.0, 1.0), "rear": rear}
	return null

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
	fishes.step(minf(dt, 1.0 / 20.0), {"threat": _threat(), "ring": ring, "murk": murk.v,
		"boat": {"p": b2, "h": fwd, "len": BOAT_LENGTH, "beam": 2.0}})

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
	eye_mat.set_shader_parameter("pupil", pupil.v)
	water_mat.set_shader_parameter("murk", m)
	water_mat.set_shader_parameter("calm", clar)
