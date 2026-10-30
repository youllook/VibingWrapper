extends Node3D
# 大海怪3 — from low in a small wooden boat, a storm sea; while Claude works a giant squid's eye
# heaves up out of the water beside the boat, tilting the sea, and throws its arms up curling and lashing; its head
# and eye stay out of the water staring into the lens. When the work is done it sinks back and the sea goes wild
# around the empty boat. Composition from the user's reference (2026-10-27); no fisherman (user 2026-10-30).
#   clear     待命  — a calm sea
#   overcast  思考  — the swell builds
#   storm     執行  — the eye rises (the sea heaves and tilts), arms burst out curling, head and eye stare at you
#   waiting   等你  — it stays up, staring; the arms sink to a slow sway
#   clearing  收尾  — it sinks back; the sea goes wild, then settles to calm

# the squid: a Tripo head made for the close-up (head.glb: origin at its base, eyes on ±X, arm stumps toward +Z, about
# 0.86 × 0.85 × 0.98) and Tripo arms (tentacle.glb: root at −X, tip at +X, suckers up, a 16-bone chain t00…t15)
const HEAD_S := 10.0                             # → about 8.5 m across
const HEAD_AT := Vector3(3.4, -3.4, -10.5)       # its base when it is up (the eye just over the water line)
const HEAD_YAW := -1.6                            # its +X eye turned to the boat
# its eye is head.glb's own (user 2026-10-30: no live eye laid over it)
const HEAD_C := Vector3(0.0, 0.45, 0.0)          # middle of the head
const HEAD_R := 4.2                              # its radius at the water line
# the arms out of the water: root (m, its depth when up), heading (rad), length, thickness, how far it rears up,
# how hard it curls, roll (sucker side), phase
const TENTS := [
	{"at": Vector3(-9.0, -2.0, -22.0), "yaw": 2.5, "len": 26.0, "thick": 12.0, "rise": 1.2, "curl": 1.0, "roll": 0.7, "ph": 0.0},
	{"at": Vector3(13.0, -2.0, -17.0), "yaw": 0.5, "len": 22.0, "thick": 10.0, "rise": 1.05, "curl": 1.3, "roll": -0.5, "ph": 1.9},
	{"at": Vector3(-2.5, -1.5, -11.0), "yaw": 2.2, "len": 14.0, "thick": 8.0, "rise": 0.6, "curl": 1.6, "roll": 0.9, "ph": 3.6},
]
const DOWN := 30.0                                # sunk out of sight
const CAM_LOCAL := Vector3(0.02, 1.3, 0.6)        # low over the near gunwale, in the boat's frame
const CAM_LOOK := Vector3(1.2, 0.0, -14.0)
const DEBOUNCE := 0.3
const LEE := 0.4
const LENS := {"clear": 0.08, "overcast": 0.3, "storm": 0.85, "waiting": 0.6, "clearing": 1.0}
const BOAT_LEN := 6.5
const BOAT_DRAFT := 0.40
const BOAT_YAW := -PI / 2 + 0.25                  # model −Z (the bow posts) → world −X, turned a little away
const BOAT_AT := Vector3(0.3, 0.0, 0.4)

# the sea: [wavelength m, amplitude m at sea_k 1, direction off the wind (rad)], steepness shared
const WAVES := [
	[41.0, 0.85, 0.0], [27.0, 0.60, 0.35], [19.0, 0.45, -0.42], [13.0, 0.32, 0.62], [9.1, 0.22, -0.2],
	[6.3, 0.15, 0.95], [4.4, 0.10, -0.7], [3.1, 0.07, 0.3], [2.2, 0.05, -1.1], [1.6, 0.035, 1.3],
	[1.15, 0.025, -0.5], [0.8, 0.017, 0.8],
]
const WIND := -2.0                               # waves run toward the camera from the far right

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

var state := "clear"
var cur := ""
var pending := ""
var debounce_t := 0.0
var warp := 0.0
var warped := false
var then_state := ""
var seq := PackedStringArray()
var seq_t := 0.0
var dbg := ""
var t := 0.0
var poll_t := 0.0
var st_t := 0.0                 # seconds in the current state

var cam: Camera3D
var sun: DirectionalLight3D
var env_res: Environment
var sky_mat: ShaderMaterial
var water_mat: ShaderMaterial
var water_mi: MeshInstance3D
var squid: Node3D
var head: Node3D
var tents := []                  # [{node, skel, bones, rest, cfg}]
var boat: Node3D
var spray: CPUParticles3D
var mist: CPUParticles3D
var drips: CPUParticles3D
var post_mat: ShaderMaterial
var lens := Tw.new(0.1)         # water drops on the lens

var sea_k := Tw.new(0.2)        # wave height
var light_k := Tw.new(1.0)
var heave := Tw.new(0.0)        # the mound over it (m)
var churn := Tw.new(0.0)
var sink := Tw.new(DOWN)        # how far below its up pose (m)
var arms := Tw.new(0.0)         # 0 … 1: arms out of the water
var lash := Tw.new(0.0)         # how hard they whip
var ring_t := 99.0
var was_up := false

func _ready() -> void:
	seed(3)
	_read_args()
	_build_environment()
	_build_squid()
	_build_boat()
	cam = Camera3D.new()
	cam.fov = 46.0
	cam.near = 0.1
	cam.far = 4000.0
	boat.add_child(cam)
	cam.position = CAM_LOCAL
	cam.look_at_from_position(CAM_LOCAL, CAM_LOOK, Vector3.UP)
	if dbg.find("cam=") >= 0:
		var v := dbg.get_slice("cam=", 1).get_slice(";", 0).split_floats(",")
		if v.size() == 6:
			cam.top_level = true
			cam.look_at_from_position(Vector3(v[0], v[1], v[2]), Vector3(v[3], v[4], v[5]), Vector3.UP)
	_build_water()
	_build_spray()
	_build_post()
	water_mi.visible = dbg.find("nowater") < 0
	if dbg.find("noboat") >= 0:
		for c in boat.get_children():
			if c != cam and c is Node3D:
				(c as Node3D).visible = false
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
				"then": then_state = kv[1]
				"seq": seq = kv[1].split(",")   # recordings: state:seconds,state:seconds,… played in order

# ---------------------------------------------------------------- scene
func _build_environment() -> void:
	var env := Environment.new()
	sky_mat = ShaderMaterial.new()
	sky_mat.shader = load("res://sky.gdshader")
	var sky := Sky.new()
	sky.sky_material = sky_mat
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.55, 0.6, 0.64)
	env.ambient_light_energy = 0.7
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 1.0
	env.fog_enabled = true
	env.fog_light_color = Color(0.46, 0.5, 0.53)
	env.fog_density = 0.004
	env.fog_sky_affect = 0.15
	env_res = env
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	# an overcast sky: a weak light from high up, behind the squid
	sun = DirectionalLight3D.new()
	sun.light_energy = 0.8
	sun.light_color = Color(0.9, 0.93, 0.96)
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 80.0
	add_child(sun)
	sun.look_at_from_position(Vector3.ZERO, Vector3(0.3, -0.6, 0.75), Vector3.UP)

func _build_water() -> void:
	# the projected grid: vertices are NDC (x, z), well past the screen edges so the waves never open a gap at the
	# bottom when they lift the water near the boat; rows run both ways because the Compatibility renderer flips the
	# projection's Y when it draws into a texture (the web canvas, the movie writer), and denser near the middle
	var nx := 360
	var ny := 520
	var verts := PackedVector3Array()
	var idx := PackedInt32Array()
	for j in ny + 1:
		var v := float(j) / ny
		var yy := signf(v - 0.5) * 3.5 * pow(absf(v - 0.5) * 2.0, 2.0)
		for i in nx + 1:
			verts.append(Vector3(lerpf(-1.8, 1.8, float(i) / nx), 0.0, yy))
	for j in ny:
		for i in nx:
			var a := j * (nx + 1) + i
			idx.append_array([a, a + 1, a + nx + 1, a + 1, a + nx + 2, a + nx + 1])
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = verts
	arr[Mesh.ARRAY_INDEX] = idx
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	m.custom_aabb = AABB(Vector3(-1e5, -1e3, -1e5), Vector3(2e5, 2e3, 2e5))
	water_mat = ShaderMaterial.new()
	water_mat.shader = load("res://water.gdshader")
	water_mat.set_shader_parameter("ripple", load("res://textures/ripple.png"))
	water_mat.set_shader_parameter("foam_tex", load("res://textures/foam.png"))
	water_mat.set_shader_parameter("sun_to", -sun.global_transform.basis.z * -1.0)
	water_mi = MeshInstance3D.new()
	water_mi.mesh = m
	water_mi.material_override = water_mat
	water_mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	water_mi.extra_cull_margin = 16384.0
	add_child(water_mi)

func _build_squid() -> void:
	squid = Node3D.new()
	add_child(squid)
	head = (load("res://models/head.glb") as PackedScene).instantiate()
	squid.add_child(head)
	head.scale = Vector3.ONE * HEAD_S
	head.rotation.y = HEAD_YAW
	_wet(head)
	for c in TENTS:
		var n: Node3D = (load("res://models/tentacle.glb") as PackedScene).instantiate()
		squid.add_child(n)
		_wet(n)
		var sk: Skeleton3D = n.find_child("Skeleton3D", true, false)
		var bones := []
		var rest := []
		for j in sk.get_bone_count():
			bones.append(j)
			rest.append(sk.get_bone_pose_rotation(j))
		tents.append({"node": n, "skel": sk, "bones": bones, "rest": rest, "cfg": c})

# wet skin: the GLB's own colour/normal/roughness, glossier, with a clear wet film over it
func _wet(n: Node) -> void:
	for m in n.find_children("*", "MeshInstance3D", true, false):
		var mi := m as MeshInstance3D
		var mat := (mi.mesh.surface_get_material(0) as StandardMaterial3D).duplicate() as StandardMaterial3D
		mat.transparency = BaseMaterial3D.TRANSPARENCY_DISABLED   # Tripo exports alpha blend: the sea would draw over it
		mat.albedo_color = Color(0.78, 0.66, 0.72)                # toward the reference's dark purple-brown
		mat.roughness = 0.35
		mat.clearcoat_enabled = true
		mat.clearcoat = 1.0
		mat.clearcoat_roughness = 0.1
		mi.material_override = mat

func _build_boat() -> void:
	boat = Node3D.new()
	add_child(boat)
	# the Tripo boat (old wooden fishing boat, docs/大海怪3): long axis along its Z, turned so it lies across the view
	# with the bow off to the left; scaled to BOAT_LEN and sunk to its draft
	var b: Node3D = (load("res://models/boat.glb") as PackedScene).instantiate()
	var pivot := Node3D.new()
	pivot.rotation.y = BOAT_YAW
	boat.add_child(pivot)
	pivot.add_child(b)
	var box := _aabb(b)
	var k := BOAT_LEN / box.size.z
	b.scale = Vector3.ONE * k
	b.position = Vector3(-box.get_center().x * k, -box.position.y * k - BOAT_DRAFT, -box.get_center().z * k)
	pivot.position = BOAT_AT
	# soaked wood (boat.gdshader): photographed planks and timber projected along the hull, Tripo's colour kept only
	# blurred for the grime; opaque (user 2026-10-30)
	for m in b.find_children("*", "MeshInstance3D", true, false):
		var mi := m as MeshInstance3D
		var src := mi.mesh.surface_get_material(0) as StandardMaterial3D
		var bm := ShaderMaterial.new()
		bm.shader = load("res://boat.gdshader")
		bm.set_shader_parameter("albedo_tex", src.albedo_texture)
		for set in ["planks", "timber"]:
			bm.set_shader_parameter(set + "_col", load("res://textures/wood/%s_diff.jpg" % set))
			bm.set_shader_parameter(set + "_nrm", load("res://textures/wood/%s_nor_gl.jpg" % set))
			bm.set_shader_parameter(set + "_rgh", load("res://textures/wood/%s_rough.jpg" % set))
		bm.set_shader_parameter("metres", k)
		mi.material_override = bm

func _aabb(n: Node) -> AABB:
	var box := AABB()
	var first := true
	for m in n.find_children("*", "MeshInstance3D", true, false):
		var mi := m as MeshInstance3D
		var bb: AABB = (n as Node3D).transform.affine_inverse() * _xf_to(mi, n) * mi.get_aabb()
		box = bb if first else box.merge(bb)
		first = false
	return box

# transform of a descendant relative to its ancestor's parent (works before the nodes are in the tree)
func _xf_to(d: Node, anc: Node) -> Transform3D:
	var x := Transform3D.IDENTITY
	var c := d
	while c != null and c != anc.get_parent():
		if c is Node3D:
			x = (c as Node3D).transform * x
		c = c.get_parent()
	return x

func _build_spray() -> void:
	var tex: Texture2D = load("res://textures/spray.png")
	# spray thrown up where the head breaks the water: many small grey-white puffs
	spray = _particles(tex, 1400, 1.6, Vector2(0.2, 0.7), Color(0.72, 0.76, 0.78, 0.4))
	spray.initial_velocity_min = 3.0
	spray.initial_velocity_max = 9.0
	spray.spread = 40.0
	spray.direction = Vector3(0, 1, 0)
	# a low drifting mist over the churn
	mist = _particles(tex, 50, 5.0, Vector2(4.0, 8.0), Color(0.62, 0.66, 0.69, 0.045))
	mist.initial_velocity_min = 0.3
	mist.initial_velocity_max = 1.2
	mist.gravity = Vector3(0.5, 0.15, 0.3)
	# water running and dripping off the head: thin streaks falling from its crown, stretched along their fall
	drips = _particles(load("res://textures/streak.png"), 500, 1.1, Vector2(0.6, 1.4), Color(0.75, 0.8, 0.82, 0.5))
	drips.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE_SURFACE
	drips.emission_sphere_radius = HEAD_R * 0.9
	drips.direction = Vector3(0, -1, 0)
	drips.spread = 25.0
	drips.initial_velocity_min = 0.5
	drips.initial_velocity_max = 2.0
	drips.particle_flag_align_y = true
	var q := drips.mesh as QuadMesh
	q.size = Vector2(0.06, 0.9)
	(q.material as StandardMaterial3D).billboard_mode = BaseMaterial3D.BILLBOARD_FIXED_Y

# the lens: depth of field on the foreground, drops, grade (post.gdshader) over the whole frame
func _build_post() -> void:
	var cl := CanvasLayer.new()
	add_child(cl)
	var r := ColorRect.new()
	r.set_anchors_preset(Control.PRESET_FULL_RECT)
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	post_mat = ShaderMaterial.new()
	post_mat.shader = load("res://post.gdshader")
	r.material = post_mat
	cl.add_child(r)
	r.visible = dbg.find("nopost") < 0

func _particles(tex: Texture2D, n: int, life: float, size: Vector2, col: Color) -> CPUParticles3D:
	var p := CPUParticles3D.new()
	p.amount = n
	p.lifetime = life
	p.local_coords = false
	p.emission_shape = CPUParticles3D.EMISSION_SHAPE_RING
	p.emission_ring_axis = Vector3.UP
	p.emission_ring_height = 0.5
	p.emission_ring_radius = 5.0
	p.emission_ring_inner_radius = 3.5
	p.gravity = Vector3(0, -9.8, 0)
	p.scale_amount_min = size.x
	p.scale_amount_max = size.y
	var curve := Curve.new()
	curve.add_point(Vector2(0, 0.5))
	curve.add_point(Vector2(1, 1.6))
	p.scale_amount_curve = curve
	var ramp := Gradient.new()
	ramp.set_color(0, Color(col.r, col.g, col.b, col.a))
	ramp.set_color(1, Color(col.r, col.g, col.b, 0.0))
	p.color_ramp = ramp
	var q := QuadMesh.new()
	q.size = Vector2.ONE
	var m := StandardMaterial3D.new()
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	m.vertex_color_use_as_albedo = true
	m.albedo_texture = tex
	m.disable_receive_shadows = true
	q.material = m
	p.mesh = q
	p.emitting = false
	add_child(p)
	return p

# ---------------------------------------------------------------- the sea, on the CPU too (the boat rides it)
func _wave_params() -> Array:
	var k := sea_k.v
	var sum_ka := 0.0
	for w in WAVES:
		sum_ka += TAU / w[0] * w[1] * k
	var q := minf(0.32, 0.7 / maxf(sum_ka, 1e-3))
	var wa := PackedVector4Array()
	var wb := PackedVector4Array()
	for i in WAVES.size():
		var w: Array = WAVES[i]
		var ang: float = WIND + w[2]
		wa.append(Vector4(cos(ang), sin(ang), w[0], w[1] * k))
		wb.append(Vector4(q, float(i) * 2.399, 0, 0))
	return [wa, wb]

# height and slope of the sea at a point (the horizontal shift is ignored: good enough for a boat)
func _sea_at(p: Vector2, wa: PackedVector4Array, wb: PackedVector4Array) -> Vector3:
	var h := 0.0
	var sx := 0.0
	var sz := 0.0
	for i in wa.size():
		var a := wa[i]
		var k := TAU / a.z
		var th := k * (a.x * p.x + a.y * p.y) - sqrt(9.81 * k) * t + wb[i].y
		var lee := _lee(p)
		h += a.w * lee * sin(th)
		sx += a.x * k * a.w * lee * cos(th)
		sz += a.y * k * a.w * lee * cos(th)
	var hc := _head_pos()
	var r := p.distance_to(Vector2(hc.x, hc.z))
	var mR := HEAD_R * 2.6
	var mound := heave.v * exp(-r * r / (mR * mR))
	h += mound
	var g := -2.0 * r / (mR * mR) * mound
	var dir := (p - Vector2(hc.x, hc.z)) / maxf(r, 1e-3)
	return Vector3(h, sx + g * dir.x, sz + g * dir.y)

# round the boat the waves are lower (its lee), so the crests don't wall off the view (water.gdshader: the same)
func _lee(p: Vector2) -> float:
	return lerpf(LEE, 1.0, smoothstep(4.0, 16.0, p.length()))

func _head_pos() -> Vector3:
	return HEAD_AT + Basis(Vector3.UP, HEAD_YAW) * (HEAD_C * HEAD_S)

# ---------------------------------------------------------------- state
func _poll() -> void:
	if not OS.has_feature("web"):
		return
	var s = JavaScriptBridge.eval("JSON.stringify(window.wpCtl || {})", true)
	var d = JSON.parse_string(str(s))
	if d is Dictionary:
		state = str(d.get("state", "clear"))
		warp = float(d.get("warp", 0.0))
		if warp > 0.0 and not warped:
			warped = true
			cur = ""
			_enter(state, true)
			for i in int(warp * 30.0):
				_step(1.0 / 30.0)

func _process(dt: float) -> void:
	poll_t -= dt
	if poll_t <= 0.0:
		poll_t = 0.5
		_poll()
	_step(dt)

func _enter(name: String, now := false) -> void:
	var prev := cur
	cur = name
	st_t = 0.0
	lens.to(LENS.get(name, 0.2), 6.0 if name != "clearing" else 1.5)
	match name:
		"clear":
			sea_k.to(0.18, 6.0 if not now else 0.0)
			light_k.to(1.0, 8.0)
			churn.to(0.0, 4.0)
			heave.to(0.0, 4.0)
			arms.to(0.0, 3.0)
			lash.to(0.0, 3.0)
			if sink.v < DOWN:
				sink.to(DOWN, 8.0)
		"overcast":
			sea_k.to(0.7, 8.0)
			light_k.to(0.78, 8.0)
			churn.to(0.0, 4.0)
			heave.to(0.0, 4.0)
			arms.to(0.0, 3.0)
			if sink.v < DOWN:
				sink.to(DOWN, 6.0)
		"storm":
			# the script runs in _storm(); here only what starts at once
			sea_k.to(1.0, 4.0)
			light_k.to(0.62, 3.0)
			if prev == "waiting":
				st_t = 20.0      # already up: straight into the hold
		"waiting":
			sea_k.to(0.85, 6.0)
			light_k.to(0.66, 6.0)
			churn.to(0.45, 4.0)
			heave.to(0.6, 5.0)
			arms.to(0.45, 5.0)
			lash.to(0.2, 5.0)
			sink.to(0.0, 4.0)
		"clearing":
			# it sinks back and the sea goes wild, then settles toward calm
			arms.to(0.0, 1.6)
			lash.set_now(1.0).to(0.0, 2.0)
			sink.to(DOWN, 5.0, 1.2)
			heave.set_now(heave.v).to(-2.2, 2.0, 1.0)
			churn.to(1.0, 0.5)
			sea_k.to(1.15, 2.0)
			light_k.to(0.7, 4.0)
	if now:
		lens.to(LENS.get(name, 0.2), 0.0)
		for tw in [sea_k, light_k, heave, churn, arms, lash, lens]:
			tw.set_now(tw.b)
		if name == "storm" or name == "waiting":
			st_t = 20.0
			sink.set_now(0.0)
			heave.set_now(0.9)
			churn.set_now(0.8 if name == "storm" else 0.45)
			arms.set_now(1.0 if name == "storm" else 0.45)
			lash.set_now(0.6 if name == "storm" else 0.2)
		else:
			sink.set_now(DOWN)

func _storm(dt: float) -> void:
	var T := st_t
	if T < 12.0:
		# 0–2.5 s the sea heaves up over it and tilts; 1.5–4.5 s the eye breaks out; 4–8 s the arms burst up
		heave.set_now(lerpf(0.0, 2.4, smoothstep(0.0, 2.5, T)) - 1.4 * smoothstep(3.0, 7.0, T))
		sink.set_now(lerpf(DOWN, 0.0, pow(smoothstep(1.2, 4.6, T), 0.7)) if sink.v > 0.0 or T < 4.6 else 0.0)
		churn.set_now(smoothstep(2.0, 3.2, T) * (1.0 - 0.3 * smoothstep(6.0, 10.0, T)))
		arms.set_now(smoothstep(4.0, 8.0, T))
		lash.set_now(smoothstep(4.0, 6.0, T) * (1.0 - 0.4 * smoothstep(9.0, 12.0, T)))
	else:
		# the hold: arms curling and lashing on, head and eye out, staring
		heave.v = 1.0 + 0.25 * sin(t * 0.4)
		churn.v = 0.7 + 0.2 * sin(t * 0.7)
		lash.v = 0.6 + 0.3 * sin(t * 0.23)

func _step(dt: float) -> void:
	t += dt
	st_t += dt
	if seq.size() > 0:
		seq_t -= dt
		if seq_t <= 0.0:
			var kv := seq[0].split(":")
			seq.remove_at(0)
			state = kv[0]
			seq_t = float(kv[1]) if kv.size() > 1 else 10.0
	if state != pending:
		pending = state
		debounce_t = DEBOUNCE
	if debounce_t > 0.0:
		debounce_t -= dt
		if debounce_t <= 0.0 and pending != cur:
			_enter(pending)
	if cur == "storm":
		_storm(dt)
	elif cur == "clearing" and st_t > 3.0:
		sea_k.v = lerpf(sea_k.v, 0.18, 1.0 - exp(-dt / 12.0))
		churn.v = lerpf(churn.v, 0.0, 1.0 - exp(-dt / 4.0))
		heave.v = lerpf(heave.v, 0.0, 1.0 - exp(-dt / 3.0))
	for tw in [sea_k, light_k, heave, churn, sink, arms, lash, lens]:
		tw.step(dt)

	# the squid: the head at HEAD_AT, sunk by `sink` (it goes down tipping back), arms rearing out of the water
	var up := sink.v < 0.5
	if up and not was_up:
		ring_t = 0.0
	if not up and was_up:
		ring_t = 0.0
	was_up = up
	ring_t += dt
	squid.visible = sink.v < DOWN - 1.0
	head.position = HEAD_AT - Vector3(0, sink.v, 0) + Vector3(0, 0.15 * sin(t * 0.5), 0)
	head.rotation = Vector3(0.0, HEAD_YAW, -0.2 * smoothstep(0.0, 10.0, sink.v) + 0.03 * sin(t * 0.37))
	_pose_tents()

	if dbg.find("flat") >= 0:
		sea_k.v = 0.0
		heave.v = 0.0
		churn.v = 0.0
	# the sea
	var wp := _wave_params()
	var hp := _head_pos() - Vector3(0, sink.v, 0)
	water_mat.set_shader_parameter("wa", wp[0])
	water_mat.set_shader_parameter("wb", wp[1])
	water_mat.set_shader_parameter("time_s", t)
	water_mat.set_shader_parameter("head_pos", hp)
	water_mat.set_shader_parameter("head_r", HEAD_R * clampf(1.0 - sink.v / 6.0, 0.3, 1.0))
	water_mat.set_shader_parameter("heave", heave.v)
	water_mat.set_shader_parameter("churn", churn.v)
	water_mat.set_shader_parameter("ring_t", ring_t)
	water_mat.set_shader_parameter("foam_k", clampf((sea_k.v - 0.25) / 0.6, 0.0, 1.3))
	water_mat.set_shader_parameter("light_k", light_k.v)
	sky_mat.set_shader_parameter("light_k", light_k.v)
	sky_mat.set_shader_parameter("time_s", t)
	sun.light_energy = 0.9 * light_k.v
	env_res.ambient_light_energy = 0.75 * light_k.v
	env_res.fog_light_color = Color(0.46, 0.5, 0.53) * light_k.v

	# the boat rides the sea; the squid's mound tilts it toward the beast
	var s := _sea_at(Vector2(0, 0), wp[0], wp[1])
	var s2 := _sea_at(Vector2(0, -2.5), wp[0], wp[1])
	var s3 := _sea_at(Vector2(1.2, 0), wp[0], wp[1])
	var pitch := atan2(s2.x - s.x, 2.5) * 0.7
	var roll := atan2(s3.x - s.x, 1.2) * 0.6
	boat.position = Vector3(0, s.x * 0.8, 0)
	boat.rotation = Vector3(pitch, 0.0, -roll)
	# the hull in the boat's own frame: BOAT_AT turned by BOAT_YAW
	var hull_xf := boat.transform * Transform3D(Basis(Vector3.UP, BOAT_YAW + PI / 2), BOAT_AT)
	water_mat.set_shader_parameter("boat_inv", Projection(hull_xf.affine_inverse()))

	# spray where the head breaks the water
	var on := churn.v > 0.15 and squid.visible
	for p in [spray, mist]:
		var cp := p as CPUParticles3D
		cp.emitting = on
		cp.position = Vector3(hp.x, 0.2, hp.z)
		cp.emission_ring_radius = HEAD_R * 1.05
		cp.emission_ring_inner_radius = HEAD_R * 0.75
	# drips only while the head is out and wet: strongest just after it breaks the surface
	drips.emitting = squid.visible and sink.v < 1.0
	drips.position = head.position + Basis(Vector3.UP, HEAD_YAW) * (HEAD_C * HEAD_S) + Vector3(0, 1.2, 0)
	(drips.mesh.surface_get_material(0) as StandardMaterial3D).albedo_color.a = clampf(0.35 + 0.65 * exp(-ring_t * 0.15), 0.0, 1.0) * (1.0 if was_up else 0.0)
	# CPUParticles3D has no amount_ratio: thin the spray out through its material's alpha instead
	(spray.mesh.surface_get_material(0) as StandardMaterial3D).albedo_color.a = clampf(churn.v * 1.2, 0.0, 1.0)
	(mist.mesh.surface_get_material(0) as StandardMaterial3D).albedo_color.a = clampf(churn.v * 0.6, 0.0, 1.0)

	# the lens
	post_mat.set_shader_parameter("drops", lens.v)
	post_mat.set_shader_parameter("time_s", t)

# the arms: each rears up out of the water from its root, curls toward its suckers and lashes; the curl and the lash
# travel from the root to the tip. Bones run along the arm (local Y); BEND bends toward the suckers.
const BEND := Vector3(0, 0, 1)

func _pose_tents() -> void:
	for T in tents:
		var c: Dictionary = T["cfg"]
		var n: Node3D = T["node"]
		var sk: Skeleton3D = T["skel"]
		var a := arms.v
		var ph: float = c["ph"]
		var rise: float = lerpf(-0.25, c["rise"], a) + 0.08 * lash.v * sin(t * 0.8 + ph)
		var b := Basis(Vector3.UP, c["yaw"]) * Basis(Vector3(0, 0, 1), rise) * Basis(Vector3(1, 0, 0), c["roll"])
		# tentacle.glb's origin is mid-length (root at x −0.49): shift it so the root sits at `at`
		var root: Vector3 = c["at"] - Vector3(0, sink.v + (1.0 - a) * 4.0, 0)
		n.transform = Transform3D(b.scaled_local(Vector3(c["len"], c["thick"], c["thick"])), root + b.x * 0.489 * c["len"])
		var nb: int = T["bones"].size()
		for j in nb:
			var u := float(j) / float(nb)
			var curl: float = c["curl"] * a * (0.05 + 0.6 * u + 1.6 * pow(u, 4.0)) * 0.16
			curl *= 1.0 + 0.35 * sin(t * 0.6 + ph)
			var w := lash.v * a
			curl += w * 0.13 * sin(t * 2.1 - u * 6.5 + ph) * (0.3 + u)
			var side := w * 0.09 * sin(t * 1.6 - u * 5.0 + ph * 1.3) * (0.3 + u)
			side += 0.04 * sin(t * 0.7 - u * 4.0 + ph)
			sk.set_bone_pose_rotation(T["bones"][j], T["rest"][j] * Quaternion(Vector3(1, 0, 0), side) * Quaternion(BEND, curl))
