extends Node3D
# 沙蟲 — from under a natural sandstone arch, out over a plain of dunes and rock spires toward a low sunset sun. While
# Claude works, a colossal worm bursts out of the sand in the distance, arches over and opens its four lips; when the
# work is done it dives back in. Composition from the user's target images (2026-10-28, arch_v2a / arch_v2b).
#   clear     待命  — still dunes, a light wind
#   overcast  思考  — the wind gets up, dust devils, the sand out there trembles
#   storm     執行  — the sand heaves and bursts; the worm rises, arches toward you, its lips peel open
#   waiting   等你  — it stays up, swaying slowly, lips wide
#   clearing  收尾  — the lips close, it curls over and dives back; a wall of dust, then calm
#
# Models (Tripo → Blender, E:\tmp\sandworm_angles\blender\process.py), all in metres:
#   sandworm_rigged.glb  118 m above the sand + 24 m below; bones spine_00…spine_08, head, lip_front/back/left/right.
#                        The mouth faces +Z. Lip bones: + about local X opens them.
#   stone_arch.glb       60 m high, opening 47 m
#   rock_spires.glb      rock_spire_01…06, 34–70 m, origins at their base

# Tunable in the inspector (select Main). Defaults are the shipped look; the command line's bend= / up= / yaw= /
# glow= still override them. When a value is read:
#   built once in _ready — change it, then re-run the scene:  ARCH_AT, ARCH_YAW, ARCH_STRETCH, WORM_S (model scale),
#     SUN_DIR, DUST_GLOW, CAM_FOV; WORM_AT for the dunes' flattening and the rocks' footing
#   read every frame — live from the Remote tree while it runs:  CAM_AT, CAM_LOOK, WORM_AT (worm, crater, dust),
#     BEND_UP, UP_SINK, WORM_YAW, the LIP_* angles (from the next state change, or at once in the storm and its hold)
@export_group("結構")
@export var ARCH_AT := Vector3(0, -1.5, 0)
# the arch's legs stand at (−22.6, 16.0) and (21.9, −15.8): turn that line square to the view, then stretch it along
# the line — its own opening is tall and narrow (≈ 28 × 47 m), the target's is wide; the strata run level, so a
# sideways stretch doesn't show
@export_range(-180.0, 180.0, 0.5, "radians_as_degrees") var ARCH_YAW := -0.62
@export_range(0.5, 4.0, 0.05) var ARCH_STRETCH := 2.1
# layout (Fable's pass, 2026-10-28): behind the arch so its legs touch the frame's sides and its span the top,
# horizon a little above the middle
@export var CAM_AT := Vector3(4.0, 13.0, 56.0)
@export var CAM_LOOK := Vector3(-2.0, -18.0, -944.0)
@export_range(20.0, 100.0, 0.5) var CAM_FOV := 60.0
# the worm, cheated up 1.8× (Fable: the target's worm fills a quarter of the frame's width) and brought in to about
# 180 m from the camera, its base left of centre
@export_range(0.5, 4.0, 0.05) var WORM_S := 1.8
@export var WORM_AT := Vector3(30.0, 0.0, -124.0)
@export var SUN_DIR := Vector3(0.56, 0.045, -0.83)  # toward the sun: low, in the right fifth of the frame

@export_group("姿勢")
# rad per upper spine bone; the mouth already faces +Z at rest, so a small lean is enough to turn it square to the
# camera (0.27 curled it down into a horseshoe)
@export_range(-0.3, 0.6, 0.005) var BEND_UP := 0.1
# up, it stays this deep in the sand: only the upper body comes out, so its head sits inside the frame
@export_range(0.0, 250.0, 1.0) var UP_SINK := 135.0
@export_range(-180.0, 180.0, 0.5, "radians_as_degrees") var WORM_YAW := -0.14   # its mouth (local +Z) square to the camera
# rad on each lip bone, + opens
@export_range(-0.6, 1.2, 0.01) var LIP_CLOSED := -0.15   # down in the sand, and where the storm's peel starts
@export_range(-0.6, 1.2, 0.01) var LIP_STORM := 0.55     # open in the storm
@export_range(-0.6, 1.2, 0.01) var LIP_WAIT := 0.75      # wide while it waits on you
@export_range(-0.6, 1.2, 0.01) var LIP_DIVE := -0.2      # shut as it dives
@export_range(0.5, 3.0, 0.05) var DUST_GLOW := 1.0       # the dust's brightness over its albedo

var WORM_UP: float:                       # its height above the sand when up
	get: return 118.0 * WORM_S
var WORM_R: float:                        # its radius at the sand line
	get: return 13.0 * WORM_S
var DOWN: float:                          # sunk out of sight
	get: return 150.0 * WORM_S
const DEBOUNCE := 0.3
const SPINE := ["spine_00", "spine_01", "spine_02", "spine_03", "spine_04", "spine_05", "spine_06", "spine_07", "spine_08", "head"]
const LIPS := ["lip_front", "lip_back", "lip_left", "lip_right"]
# the rock spires: [model 1…6, x, z, scale, yaw]
const ROCKS := [
	[4, -150.0, -260.0, 1.0, 0.3], [2, -95.0, -420.0, 0.8, 1.9], [6, 120.0, -380.0, 0.9, 4.0], [1, 180.0, -230.0, 0.7, 2.2],
	[5, -260.0, -520.0, 1.2, 0.8], [3, 70.0, -560.0, 0.8, 5.1], [4, 260.0, -620.0, 1.3, 3.3], [2, -380.0, -700.0, 1.1, 1.2],
	[6, -40.0, -800.0, 1.4, 2.7], [1, 420.0, -480.0, 1.0, 0.4], [5, 330.0, -900.0, 1.5, 4.6], [3, -520.0, -380.0, 1.0, 3.9],
	[2, 560.0, -760.0, 1.6, 2.0], [4, -640.0, -980.0, 1.7, 5.6], [6, 150.0, -1100.0, 1.6, 1.1], [1, -230.0, -1200.0, 1.9, 0.2],
]
# the foreground ledge: [model, x, y, z, scale, yaw, tilt] — spires lying on their sides between the camera and the arch
const LEDGE := [
	[5, -6.0, -4.0, 30.0, 0.45, 0.4, 0.2], [3, 22.0, -5.0, 34.0, 0.5, 2.6, -0.3], [1, 40.0, -3.0, 24.0, 0.35, 1.2, 0.5],
	[6, -22.0, -2.0, 18.0, 0.4, 4.4, 0.1],
]

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
var st_t := 0.0

var cam: Camera3D
var cam_at := Vector3.ZERO      # dbg cam= pins these; otherwise they follow CAM_AT / CAM_LOOK every frame
var cam_look := Vector3.ZERO
var cam_pinned := false
var sun: DirectionalLight3D
var env_res: Environment
var sky_mat: ShaderMaterial
var sand_mat: ShaderMaterial
var post_mat: ShaderMaterial
var worm: Node3D
var skel: Skeleton3D
var bone_i := {}
var bone_rest := {}
var plume: CPUParticles3D
var burst: CPUParticles3D
var sandfall: CPUParticles3D
var bodyfall: CPUParticles3D
var wall_t := 99.0             # seconds since the last dust wall
var drift: CPUParticles3D
var devils := []

var sink := Tw.new(270.0)       # m below its up pose (DOWN; reset in _ready)
var bend := Tw.new(0.0)         # rad per spine bone (arching over toward the camera)
var open := Tw.new(-0.15)       # rad on each lip bone (+ opens; LIP_CLOSED, reset in _ready)
var mound := Tw.new(0.0)
var rim := Tw.new(0.0)
var quake := Tw.new(0.0)
var dust := Tw.new(0.05)        # blown sand in the air
var wind := Tw.new(0.3)
var plume_k := Tw.new(0.0)
var light_k := Tw.new(1.0)

func _ready() -> void:
	seed(5)
	_read_args()
	sink.set_now(DOWN)
	open.set_now(LIP_CLOSED)
	_build_environment()
	_build_ground()
	_build_arch()
	_build_rocks()
	_build_worm()
	_build_dust()
	_build_post()
	cam = Camera3D.new()
	cam.fov = CAM_FOV
	cam.near = 0.5
	cam.far = 6000.0
	add_child(cam)
	cam.look_at_from_position(CAM_AT, CAM_LOOK, Vector3.UP)
	if dbg.find("cam=") >= 0:
		var v := dbg.get_slice("cam=", 1).get_slice(";", 0).split_floats(",")
		if v.size() == 6:
			cam_at = Vector3(v[0], v[1], v[2])
			cam_look = Vector3(v[3], v[4], v[5])
			cam_pinned = true
	if dbg.find("gray") >= 0:
		_gray()
	if dbg.find("red") >= 0:
		for p in [plume, burst] + devils:
			var m := (p as CPUParticles3D).mesh.surface_get_material(0) as StandardMaterial3D
			m.transparency = BaseMaterial3D.TRANSPARENCY_DISABLED
			m.albedo_texture = null
			m.vertex_color_use_as_albedo = false
			m.albedo_color = Color(1, 0, 0)
	_enter(state, true)
	if then_state != "":
		state = then_state
	for i in int(warp * 30.0):
		_step(1.0 / 30.0)

# the layout check: every surface flat grey, the sky flat light grey, no grade — only the silhouettes and depths
func _gray() -> void:
	var g := StandardMaterial3D.new()
	g.albedo_color = Color(0.5, 0.5, 0.5)
	g.roughness = 1.0
	for m in find_children("*", "MeshInstance3D", true, false):
		(m as MeshInstance3D).material_override = g
	sand_mat.set_shader_parameter("gray", true)
	sun.light_color = Color.WHITE
	env_res.fog_light_color = Color(0.8, 0.8, 0.8)
	env_res.ambient_light_color = Color(0.6, 0.6, 0.6)
	sky_mat.set_shader_parameter("gray", true)
	post_mat.set_shader_parameter("gray", true)
	for p in [plume, burst, sandfall, bodyfall, drift] + devils:
		(p as CPUParticles3D).visible = false

func _read_args() -> void:
	for a in OS.get_cmdline_user_args():
		var kv := a.split("=", true, 1)
		if kv.size() == 2:
			match kv[0]:
				"state": state = kv[1]
				"warp": warp = float(kv[1])
				"dbg": dbg = kv[1]
				"then": then_state = kv[1]
				"seq": seq = kv[1].split(",")
				"bend": BEND_UP = float(kv[1])
				"up": UP_SINK = float(kv[1])
				"yaw": WORM_YAW = float(kv[1])
				"glow": DUST_GLOW = float(kv[1])

# ---------------------------------------------------------------- scene
func _build_environment() -> void:
	var env := Environment.new()
	sky_mat = ShaderMaterial.new()
	sky_mat.shader = load("res://sky.gdshader")
	sky_mat.set_shader_parameter("sun_dir", SUN_DIR.normalized())
	var sky := Sky.new()
	sky.sky_material = sky_mat
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.62, 0.47, 0.40)
	env.ambient_light_energy = 0.45
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 1.05
	env.fog_enabled = true
	env.fog_light_color = Color(0.96, 0.74, 0.52)
	env.fog_density = 0.0013
	env.fog_sun_scatter = 0.12
	env.fog_sky_affect = 0.08
	env_res = env
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	sun = DirectionalLight3D.new()
	sun.light_energy = 1.7
	sun.light_color = Color(1.0, 0.72, 0.45)
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 1200.0
	add_child(sun)
	sun.look_at_from_position(Vector3.ZERO, -SUN_DIR, Vector3.UP)

func _build_ground() -> void:
	var pm := PlaneMesh.new()
	pm.size = Vector2(6000, 6000)
	pm.subdivide_width = 700
	pm.subdivide_depth = 700
	sand_mat = ShaderMaterial.new()
	sand_mat.shader = load("res://sand.gdshader")
	sand_mat.set_shader_parameter("worm_pos", WORM_AT)
	sand_mat.set_shader_parameter("worm_r", WORM_R)
	var mi := MeshInstance3D.new()
	mi.mesh = pm
	pm.custom_aabb = AABB(Vector3(-3000, -100, -3000), Vector3(6000, 800, 6000))
	mi.material_override = sand_mat
	add_child(mi)

func _opaque(n: Node, tint := Color(1, 1, 1), rim := 0.0) -> void:
	for m in n.find_children("*", "MeshInstance3D", true, false):
		var mi := m as MeshInstance3D
		for s in mi.mesh.get_surface_count():
			var mat := mi.mesh.surface_get_material(s)
			if mat is StandardMaterial3D:
				var sm := (mat as StandardMaterial3D).duplicate() as StandardMaterial3D
				sm.transparency = BaseMaterial3D.TRANSPARENCY_DISABLED
				sm.albedo_color = tint
				if rim > 0.0:
					# a warm edge where the low sun behind catches it
					sm.rim_enabled = true
					sm.rim = rim
					sm.rim_tint = 0.6
				mi.set_surface_override_material(s, sm)

func _build_arch() -> void:
	var a: Node3D = (load("res://models/stone_arch.glb") as PackedScene).instantiate()
	var pivot := Node3D.new()
	add_child(pivot)
	pivot.position = ARCH_AT
	pivot.scale = Vector3(ARCH_STRETCH, 1.0, 1.0)
	pivot.add_child(a)
	a.rotation.y = ARCH_YAW
	_opaque(a, Color(0.09, 0.065, 0.05), 0.35)

func _build_rocks() -> void:
	var src: Node3D = (load("res://models/rock_spires.glb") as PackedScene).instantiate()
	for r in ROCKS:
		var n := src.find_child("rock_spire_%02d" % int(r[0]), true, false) as Node3D
		if n == null:
			continue
		var c := n.duplicate() as Node3D
		add_child(c)
		var p := Vector2(r[1], r[2])
		c.position = Vector3(p.x, ground_at(p) - 2.0, p.y)
		c.rotation = Vector3(0, r[4], 0)
		c.scale = Vector3.ONE * float(r[3])
		_opaque(c, Color(0.95, 0.85, 0.78))
	# the ledge under the arch in the foreground: spires laid on their sides, half buried, framing the bottom edge
	for r in LEDGE:
		var n := src.find_child("rock_spire_%02d" % int(r[0]), true, false) as Node3D
		var c := n.duplicate() as Node3D
		add_child(c)
		c.position = Vector3(r[1], r[2], r[3])
		c.rotation = Vector3(r[6], r[5], PI / 2.0)
		c.scale = Vector3.ONE * float(r[4])
		_opaque(c, Color(0.1, 0.07, 0.055), 0.35)
	src.free()

func _build_worm() -> void:
	worm = (load("res://models/sandworm_rigged.glb") as PackedScene).instantiate()
	add_child(worm)
	worm.scale = Vector3.ONE * WORM_S
	_opaque(worm, Color(0.95, 0.86, 0.78), 0.35)
	# no shadow from it: under the low sun it would lay a long dark band over the sand in the window (the target keeps
	# that sand lit — mood over optics)
	for m in worm.find_children("*", "MeshInstance3D", true, false):
		(m as MeshInstance3D).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	skel = worm.find_child("Skeleton3D", true, false)
	for n in SPINE + LIPS:
		var i := skel.find_bone(n)
		bone_i[n] = i
		bone_rest[n] = skel.get_bone_pose_rotation(i)

func _build_dust() -> void:
	var puff: Texture2D = load("res://textures/dust.png")
	var streak: Texture2D = load("res://textures/streak.png")
	var col := Color(1.0, 0.8, 0.56)
	# the dust round the worm's base: huge slow billows rolling out and up (Fable: most of what reads as "the worm" in
	# the target is dust)
	plume = _particles(puff, 420, 10.0, Vector2(30.0, 75.0), Color(col.r, col.g, col.b, 0.6))
	plume.emission_shape = CPUParticles3D.EMISSION_SHAPE_RING
	plume.emission_ring_axis = Vector3.UP
	plume.emission_ring_height = 10.0
	plume.direction = Vector3(0, 1, 0)
	plume.spread = 80.0
	plume.initial_velocity_min = 3.0
	plume.initial_velocity_max = 12.0
	plume.gravity = Vector3(2.5, 1.2, 0.0)
	plume.damping_min = 0.5
	plume.damping_max = 1.5
	# the dust wall: thrown outward fast when it breaks out and when it dives back
	burst = _particles(puff, 320, 5.0, Vector2(25.0, 60.0), Color(col.r, col.g * 0.95, col.b * 0.92, 0.7))
	burst.emission_shape = CPUParticles3D.EMISSION_SHAPE_RING
	burst.emission_ring_axis = Vector3.UP
	burst.emission_ring_height = 6.0
	burst.direction = Vector3(1, 0.35, 0)
	burst.spread = 180.0
	burst.flatness = 0.85
	burst.initial_velocity_min = 25.0
	burst.initial_velocity_max = 60.0
	burst.gravity = Vector3(0, 2.0, 0)
	burst.damping_min = 8.0
	burst.damping_max = 14.0
	# sand pouring off the head and lips: long curtains falling the whole height of the beast
	sandfall = _particles(streak, 600, 4.5, Vector2(1.0, 2.0), Color(0.9, 0.66, 0.42, 0.75))
	sandfall.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	sandfall.direction = Vector3(0, -1, 0)
	sandfall.spread = 6.0
	sandfall.initial_velocity_min = 4.0
	sandfall.initial_velocity_max = 14.0
	sandfall.gravity = Vector3(0, -9.8, 0)
	sandfall.particle_flag_align_y = true
	var q := sandfall.mesh as QuadMesh
	q.size = Vector2(5.0, 34.0)
	(q.material as StandardMaterial3D).billboard_mode = BaseMaterial3D.BILLBOARD_FIXED_Y
	# and running off its body lower down
	bodyfall = _particles(streak, 300, 3.5, Vector2(1.0, 1.8), Color(0.9, 0.66, 0.42, 0.55))
	bodyfall.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	bodyfall.direction = Vector3(0, -1, 0)
	bodyfall.spread = 5.0
	bodyfall.initial_velocity_min = 2.0
	bodyfall.initial_velocity_max = 8.0
	bodyfall.gravity = Vector3(0, -9.8, 0)
	bodyfall.particle_flag_align_y = true
	var q2 := bodyfall.mesh as QuadMesh
	q2.size = Vector2(4.0, 26.0)
	(q2.material as StandardMaterial3D).billboard_mode = BaseMaterial3D.BILLBOARD_FIXED_Y
	# sand blowing low across the plain toward the right
	drift = _particles(puff, 160, 9.0, Vector2(6.0, 16.0), Color(col.r, col.g, col.b, 0.16))
	drift.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	drift.emission_box_extents = Vector3(400, 2, 300)
	drift.position = Vector3(-120, 2, -260)
	drift.direction = Vector3(1, 0.05, 0.2)
	drift.spread = 10.0
	drift.initial_velocity_min = 10.0
	drift.initial_velocity_max = 22.0
	drift.gravity = Vector3.ZERO
	drift.emitting = true
	# dust devils: narrow twisting columns out on the plain, tall enough to read against the haze
	for d in [Vector3(-170, 0, -330), Vector3(150, 0, -420), Vector3(-60, 0, -560), Vector3(260, 0, -300)]:
		var p := _particles(puff, 200, 8.0, Vector2(4.0, 12.0), Color(col.r, col.g, col.b, 0.3))
		p.emission_shape = CPUParticles3D.EMISSION_SHAPE_RING
		p.emission_ring_axis = Vector3.UP
		p.emission_ring_radius = 4.0
		p.emission_ring_inner_radius = 2.0
		p.emission_ring_height = 1.0
		p.direction = Vector3(0, 1, 0)
		p.spread = 5.0
		p.initial_velocity_min = 10.0
		p.initial_velocity_max = 16.0
		p.gravity = Vector3(1.5, 0.5, 0)
		p.tangential_accel_min = 6.0
		p.tangential_accel_max = 10.0
		p.position = Vector3(d.x, ground_at(Vector2(d.x, d.z)), d.z)
		devils.append(p)
	# the dust is lit from behind by the low sun and glows; at albedo 1 it sat under the filmic curve while the hazy sky
	# round it went brighter, so the thick billows at the base read as a dark boulder
	for p in [plume, burst, drift] + devils:
		var m := (p as CPUParticles3D).mesh.surface_get_material(0) as StandardMaterial3D
		m.albedo_color = Color(DUST_GLOW, DUST_GLOW, DUST_GLOW, 1.0)
		m.disable_fog = dbg.find("dustfog") < 0

func _particles(tex: Texture2D, n: int, life: float, size: Vector2, col: Color) -> CPUParticles3D:
	var p := CPUParticles3D.new()
	p.amount = n
	p.lifetime = life
	p.local_coords = false
	# the size lives in the quad (scale_amount alone left them at 1 m here); scale only varies it
	p.scale_amount_min = size.x / size.y
	p.scale_amount_max = 1.0
	var curve := Curve.new()
	curve.add_point(Vector2(0, 0.5))
	curve.add_point(Vector2(1, 1.6))
	p.scale_amount_curve = curve
	var ramp := Gradient.new()
	ramp.set_color(0, Color(col.r, col.g, col.b, col.a))
	ramp.set_color(1, Color(col.r, col.g, col.b, 0.0))
	p.color_ramp = ramp
	var q := QuadMesh.new()
	q.size = Vector2.ONE * size.y
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

# ---------------------------------------------------------------- the ground on the CPU (sand.gdshader height(),
# without the worm's mound): the rocks and dust devils stand on it
func _h21(p: Vector2) -> float:
	var p3 := Vector3(p.x, p.y, p.x) * 0.1031
	p3 = Vector3(p3.x - floorf(p3.x), p3.y - floorf(p3.y), p3.z - floorf(p3.z))
	var dd := p3.dot(Vector3(p3.y, p3.z, p3.x) + Vector3.ONE * 33.33)
	p3 += Vector3.ONE * dd
	var r := (p3.x + p3.y) * p3.z
	return r - floorf(r)

func _vn(p: Vector2) -> float:
	var i := p.floor()
	var f := p - i
	f = f * f * (Vector2(3, 3) - 2.0 * f)
	return lerpf(lerpf(_h21(i), _h21(i + Vector2(1, 0)), f.x), lerpf(_h21(i + Vector2(0, 1)), _h21(i + Vector2(1, 1)), f.x), f.y)

func _fbm(p: Vector2) -> float:
	return _vn(p) * 0.5 + _vn(p * 2.03 + Vector2(1.7, 1.7)) * 0.25 + _vn(p * 4.01 - Vector2(3.1, 3.1)) * 0.125 + _vn(p * 8.07 + Vector2(5.3, 5.3)) * 0.0625

func ground_at(p: Vector2) -> float:
	var q := p + 260.0 * Vector2(_fbm(p * 0.0016), _fbm(p * 0.0016 + Vector2(7.3, 7.3)))
	var a := 1.0 - absf(sin(q.dot(Vector2(0.94, 0.34)) * 0.0105))
	var b := 1.0 - absf(sin(q.dot(Vector2(0.3, 0.95)) * 0.0062 + 1.3))
	var d := 15.0 * a * a + 22.0 * b * b * b + 8.0 * _fbm(p * 0.01)
	var flat_k := smoothstep(55.0, 170.0, p.length()) * smoothstep(WORM_R * 3.0, WORM_R * 10.0, p.distance_to(Vector2(WORM_AT.x, WORM_AT.z)))
	var h := d * flat_k
	var far := smoothstep(1400.0, 2600.0, p.length())
	var ridge := 1.0 - absf(_fbm(p * 0.0011) * 2.0 - 1.0)
	return h + far * (35.0 + 150.0 * ridge * ridge)

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
	match name:
		"clear":
			wind.to(0.3, 6.0)
			dust.to(0.05, 8.0)
			quake.to(0.0, 3.0)
			mound.to(0.0, 6.0)
			rim.to(0.0, 20.0)
			plume_k.to(0.0, 4.0)
			light_k.to(1.0, 8.0)
			if sink.v < DOWN:
				_dive()
		"overcast":
			wind.to(0.8, 6.0)
			dust.to(0.25, 8.0)
			quake.to(0.25, 4.0)
			light_k.to(0.92, 8.0)
			plume_k.to(0.12, 4.0)
			if sink.v < DOWN:
				_dive()
		"storm":
			# the eruption runs in _storm(); here only what starts at once
			wind.to(1.0, 3.0)
			dust.to(0.45, 4.0)
			light_k.to(0.85, 4.0)
			if prev == "waiting":
				st_t = 20.0
		"waiting":
			wind.to(0.6, 6.0)
			dust.to(0.3, 6.0)
			quake.to(0.0, 3.0)
			plume_k.to(0.25, 4.0)
			sink.to(0.0, 4.0)
			bend.to(BEND_UP, 6.0)
			open.to(LIP_WAIT, 8.0)
		"clearing":
			_dive()
	if now:
		for tw in [wind, dust, quake, mound, rim, plume_k, light_k, bend, open]:
			tw.set_now(tw.b)
		if name == "storm" or name == "waiting":
			st_t = 20.0
			sink.set_now(0.0)
			rim.set_now(5.0)
			bend.set_now(BEND_UP)
			open.set_now(LIP_STORM if name == "storm" else LIP_WAIT)
			plume_k.set_now(0.4 if name == "storm" else 0.25)
		else:
			sink.set_now(DOWN)
			open.set_now(LIP_CLOSED)
			bend.set_now(0.0)

# the lips close, it curls over toward the camera and goes down head first; a wall of dust, then it settles
func _dive() -> void:
	wall_t = -1.5           # the wall goes out as its head goes in
	open.to(LIP_DIVE, 1.4)
	bend.to(BEND_UP + 0.15, 2.5, 0.3)
	sink.to(DOWN, 4.5, 0.8)       # down fast: slow, its backlit crown hung there like a dark boulder
	plume_k.set_now(maxf(plume_k.v, 0.5)).to(1.0, 1.5, 1.5)
	quake.to(0.8, 1.5)
	dust.to(0.6, 3.0)
	wind.to(0.9, 2.0)

func _storm(dt: float) -> void:
	var T := st_t
	if T < 14.0:
		# the beats (Fable, 2026-10-28):
		#   0–1.5 s  omen: the sand heaves, a column of dust goes up early, the frame shivers
		#   1.6 s    the dust wall bursts out first — you see the dust before the worm
		#   1.9–4.1 s it rises fast and eases out, overshoots and settles back; the sand keeps pouring off it ~4 s
		#   4.0–5.5 s it arches toward you, head first, the body following 0.3 s behind (in _step, per bone)
		#   5.3–6.5 s the four lips peel open one after another, 0.1 s apart (in _step)
		mound.set_now(lerpf(0.0, 9.0, smoothstep(0.0, 1.5, T)) * (1.0 - smoothstep(1.6, 2.4, T)))
		rim.set_now(5.0 * smoothstep(1.7, 3.0, T))
		quake.set_now(smoothstep(0.0, 1.0, T) * (1.0 - 0.6 * smoothstep(6.0, 11.0, T)) + 0.6 * exp(-pow((T - 1.7) / 0.35, 2.0)))
		var rise := 1.0 - pow(1.0 - smoothstep(1.9, 4.1, T), 3.0)
		var over := 10.0 * sin(clampf((T - 3.4) / 1.6, 0.0, 1.0) * PI)
		sink.set_now(lerpf(DOWN, 0.0, rise) - over)
		if T > 1.6 and T - dt <= 1.6:
			wall_t = 0.0
		plume_k.set_now(0.25 * smoothstep(0.3, 1.2, T) + 0.75 * smoothstep(1.6, 2.2, T) - 0.5 * smoothstep(8.0, 14.0, T))
		bend.set_now(BEND_UP)
		open.set_now(LIP_STORM)
	else:
		# the hold: swaying, the lips breathing
		plume_k.v = 0.4 + 0.1 * sin(t * 0.5)
		open.v = LIP_STORM - 0.05 + 0.12 * sin(t * 0.7)

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
	elif cur == "clearing" and st_t > 6.0:
		plume_k.v = lerpf(plume_k.v, 0.0, 1.0 - exp(-dt / 4.0))
		quake.v = lerpf(quake.v, 0.0, 1.0 - exp(-dt / 2.0))
		dust.v = lerpf(dust.v, 0.08, 1.0 - exp(-dt / 10.0))
		wind.v = lerpf(wind.v, 0.35, 1.0 - exp(-dt / 10.0))
		rim.v = lerpf(rim.v, 0.0, 1.0 - exp(-dt / 20.0))
	for tw in [sink, bend, open, mound, rim, quake, dust, wind, plume_k, light_k]:
		tw.step(dt)

	# the worm
	var up_k := clampf(1.0 - sink.v / DOWN, 0.0, 1.0)
	worm.visible = sink.v < DOWN - 1.0
	worm.position = WORM_AT - Vector3(0, sink.v + UP_SINK, 0)
	worm.rotation = Vector3(0, WORM_YAW + 0.06 * sin(t * 0.21), 0)
	for i in SPINE.size():
		var n: String = SPINE[i]
		var u := float(i) / float(SPINE.size() - 1)
		var bk := bend.v
		if cur == "storm" and st_t < 14.0:
			# head first, the body following 0.3 s behind
			bk = lerpf(-0.03, BEND_UP, smoothstep(4.0, 5.5, st_t - 0.3 * (1.0 - u)))
		var a := bk * smoothstep(0.35, 0.75, u) + up_k * 0.02 * sin(t * 0.55 - u * 3.0)
		var side := up_k * 0.025 * sin(t * 0.33 - u * 2.5)
		skel.set_bone_pose_rotation(bone_i[n], (bone_rest[n] as Quaternion) * Quaternion(Vector3(1, 0, 0), a) * Quaternion(Vector3(0, 0, 1), side))
	for j in LIPS.size():
		var n: String = LIPS[j]
		var ok := open.v
		if cur == "storm" and st_t < 14.0:
			ok = lerpf(LIP_CLOSED, LIP_STORM, smoothstep(5.3, 6.5, st_t - 0.1 * j))   # one after another
		var o := ok + 0.04 * sin(t * 1.3 + j * 1.7) * up_k
		skel.set_bone_pose_rotation(bone_i[n], (bone_rest[n] as Quaternion) * Quaternion(Vector3(1, 0, 0), o))

	# the sand and the air
	sand_mat.set_shader_parameter("worm_pos", WORM_AT)
	sand_mat.set_shader_parameter("worm_r", WORM_R)
	sand_mat.set_shader_parameter("mound", mound.v)
	sand_mat.set_shader_parameter("rim", rim.v)
	sand_mat.set_shader_parameter("quake", quake.v)
	sand_mat.set_shader_parameter("time_s", t)
	sky_mat.set_shader_parameter("light_k", light_k.v)
	sky_mat.set_shader_parameter("dust", dust.v)
	sky_mat.set_shader_parameter("time_s", t)
	sun.light_energy = 1.7 * light_k.v
	env_res.fog_density = 0.0013 + 0.0005 * dust.v

	var base := Vector3(WORM_AT.x, 0.0, WORM_AT.z)
	plume.emitting = plume_k.v > 0.03
	plume.position = base
	plume.emission_ring_radius = WORM_R * 2.4
	plume.emission_ring_inner_radius = WORM_R * 0.8
	(plume.mesh.surface_get_material(0) as StandardMaterial3D).albedo_color.a = clampf(0.25 + plume_k.v, 0.0, 1.0)
	# the dust wall goes out for a few seconds at the break-out and at the dive
	wall_t += dt
	burst.emitting = wall_t >= 0.0 and wall_t < 2.5
	burst.position = base
	burst.emission_ring_radius = WORM_R * 1.6
	burst.emission_ring_inner_radius = WORM_R * 1.0
	# sand pouring off it: hard while it rises and for a few seconds after (Fable: it keeps falling ~4 s — the sign of
	# its size), then a trickle
	var pour := 0.0
	if worm.visible:
		var fresh := 1.0 if cur == "storm" and st_t < 14.0 else 0.4
		pour = clampf(1.0 - (sink.v) / 60.0, 0.0, 1.0) * fresh
	var head_p := skel.global_transform * skel.get_bone_global_pose(bone_i["head"]).origin
	sandfall.emitting = pour > 0.05
	sandfall.position = head_p
	sandfall.emission_sphere_radius = WORM_R * 1.6
	(sandfall.mesh.surface_get_material(0) as StandardMaterial3D).albedo_color.a = pour
	var mid_p := skel.global_transform * skel.get_bone_global_pose(bone_i["spine_05"]).origin
	bodyfall.emitting = pour > 0.05 and mid_p.y > 5.0
	bodyfall.position = Vector3(mid_p.x, maxf(mid_p.y, 5.0), mid_p.z)
	bodyfall.emission_box_extents = Vector3(WORM_R * 0.9, 6.0, WORM_R * 0.9)
	(bodyfall.mesh.surface_get_material(0) as StandardMaterial3D).albedo_color.a = pour * 0.8
	(drift.mesh.surface_get_material(0) as StandardMaterial3D).albedo_color.a = clampf(0.3 + wind.v, 0.0, 1.0)
	for p in devils:
		(p as CPUParticles3D).emitting = wind.v > 0.55

	burst.visible = dbg.find("noburst") < 0
	plume.visible = dbg.find("noplume") < 0
	sandfall.visible = dbg.find("nofall") < 0
	bodyfall.visible = dbg.find("nofall") < 0
	drift.visible = dbg.find("nodrift") < 0
	if dbg.find("probe") >= 0 and posmod(int(t * 30.0), 30) == 0:
		print("t=%.1f cur=%s st=%.1f sink=%.1f plume=%s/%.2f wall=%.1f/%s pour=%.2f head=%s vis=%s" % [t, cur, st_t, sink.v, plume.emitting, plume_k.v, wall_t, burst.emitting, pour, head_p, worm.visible])
	# the camera: a little drift; it shakes with the quake
	if not cam_pinned:
		cam_at = CAM_AT
		cam_look = CAM_LOOK
	var sh := quake.v * 0.25
	var off := Vector3(sin(t * 23.0) + 0.5 * sin(t * 41.0), sin(t * 29.0 + 1.0), 0) * sh
	cam.look_at_from_position(cam_at + off + Vector3(0.6 * sin(t * 0.05), 0.3 * sin(t * 0.07), 0), cam_look, Vector3.UP)
	post_mat.set_shader_parameter("dust", dust.v)
	post_mat.set_shader_parameter("time_s", t)
	var sp := cam.unproject_position(cam.global_position + SUN_DIR.normalized() * 1000.0)
	var vs := get_viewport().get_visible_rect().size
	post_mat.set_shader_parameter("sun_uv", sp / vs)
