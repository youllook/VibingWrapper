# 沙蟲（SOP 重跑）— the composed scene. Families deliver reusable pieces (rocks/, worm/, sand/, sky/); this file
# places them, puts each under its depth layer, and owns the camera. Spec: docs/沙蟲/02-素材盤點.md.
# Layout is read straight off the target (docs/沙蟲/target.png, 1672×941): things are placed by the pixel their
# base or centre sits at, through ground_at() / at_px().
extends Node3D

const SKY := preload("res://sky/backdrop.tscn")
const WORM := preload("res://worm/worm.tscn")
const DUNES := preload("res://sand/dunes.tscn")
const DUST := preload("res://sand/dust.tscn")
const DEVIL := preload("res://sand/devil_fb.tscn")   # Blender flow-guide loop (sand/devil.tscn is the procedural one)
const PLUME := preload("res://sand/plume.tscn")
const ARCH := preload("res://rocks/arch.tscn")
const LEDGE := preload("res://rocks/ledge.tscn")

const VP := Vector2(1672, 941)
const FOV := 50.0
# the backdrop's horizon sits on row 545: pitch the camera up until a level ray lands there
const HORIZON_PX := 545.0
const EYE := 25.0                      # up on the rocks, looking out over the plain

# the worm: its mouth centre at this pixel, this far out, scaled so the open lips span the target's head
const MAW_PX := Vector2(1000, 318)
const WORM_DIST := 252.0
const WORM_S := 2.0
const WORM_LIP := 0.8
const WORM_BEND := 0.1

# spires: [base pixel, top row, which of the six, yaw]
const SPIRES := [
	[Vector2(372, 652), 440.0, 3, 0.3], [Vector2(425, 660), 548.0, 1, 1.2], [Vector2(535, 706), 660.0, 2, 0.4],
	[Vector2(606, 640), 560.0, 4, 2.0], [Vector2(700, 628), 598.0, 0, 0.9], [Vector2(1022, 690), 668.0, 5, 0.2],
	[Vector2(1226, 742), 668.0, 1, 2.6], [Vector2(1380, 736), 668.0, 4, 0.6], [Vector2(1536, 690), 608.0, 3, 1.7],
	[Vector2(1600, 612), 570.0, 0, 2.2], [Vector2(480, 600), 575.0, 2, 1.0], [Vector2(1470, 600), 580.0, 5, 0.5],
]
# extra dust billows left of the worm: [base pixel, radius, wall height]
const LEFT_PLUMES := [[Vector2(620, 610), 90.0, 80.0]]
# dust devils: [base pixel, top row]
const DEVILS := [[Vector2(905, 722), 560.0], [Vector2(1160, 770), 660.0], [Vector2(1420, 780), 690.0]]

var near := Node3D.new()
var midnear := Node3D.new()
var mid := Node3D.new()
var far := Node3D.new()
var cam := Camera3D.new()
var worm: Node3D
var dunes: Node3D
var dust_look := []   # [tint, shade, glow] for the dust in the normal look (set by _light)

func _ready() -> void:
	for p in [[near, "Near"], [midnear, "MidNear"], [mid, "Mid"], [far, "Far"]]:
		p[0].name = p[1]
		add_child(p[0])
	cam.fov = FOV
	cam.near = 0.5
	cam.far = 20000.0
	cam.position = Vector3(0, EYE, 0)
	var f := (VP.y * 0.5) / tan(deg_to_rad(FOV * 0.5))
	cam.rotation.x = atan((HORIZON_PX - VP.y * 0.5) / f)
	add_child(cam)
	var sky := SKY.instantiate()
	sky.fov = FOV
	cam.add_child(sky)
	var md := Look.mode()
	_layout()
	if md == "":
		_light()
	else:
		Look.plain_env(self, md)
	await get_tree().process_frame
	await get_tree().process_frame
	_aim_worm()
	_no_haze_shadows()
	if Look.args().has("dump"):   # layout numbers for outside tools (Blender flipbooks render from this camera)
		print("DUMP cam ", cam.global_transform, " fov ", cam.fov)
		print("DUMP worm ", worm.global_position, " scale ", worm.scale.x, " maw ", worm.maw().global_position)
		for d in mid.get_children():
			if d.get("wall_height") != null:
				print("DUMP dust ", d.global_position, " r ", d.radius, " h ", d.wall_height)
		for d in midnear.get_children():
			if d is SandDevilFB:
				print("DUMP devil ", d.global_position, " h ", d.height)
	for p in [[near, "near"], [midnear, "midnear"], [mid, "mid"], [far, "far"]]:
		Look.apply(p[0], md, p[1])
	Look.apply(sky, md, "far")

func _layout() -> void:
	dunes = DUNES.instantiate()
	dunes.clear_center = Vector2.ZERO
	dunes.clear_radius = 60.0
	dunes.dune_amp = 1.6   # the target's near dunes roll deeper than the default
	midnear.add_child(dunes)

	for s in SPIRES:
		var base := ground_at(s[0])
		var d := Vector2(base.x, base.z).length()
		var f := (VP.y * 0.5) / tan(deg_to_rad(FOV * 0.5))
		var h: float = (s[0].y - s[1]) / f * d   # pixel height → metres at that distance (near enough at these small angles)
		var sp := Spires.make(s[2], h, s[3])
		sp.position = Vector3(base.x, dunes.height_at(base.x, base.z) - 2.0, base.z)
		# the ones around the worm's base sit in the mid layer with it
		(mid if d > WORM_DIST * 0.8 and absf(base.x - _maw_world().x) < 150.0 else midnear).add_child(sp)

	for dv in DEVILS:
		var base := ground_at(dv[0])
		var d := Vector2(base.x, base.z).length()
		var f := (VP.y * 0.5) / tan(deg_to_rad(FOV * 0.5))
		var n := DEVIL.instantiate()
		n.height = (dv[0].y - dv[1]) / f * d
		n.seed = base.x
		n.sun_direction = SUN_TO
		n.position = Vector3(base.x, dunes.height_at(base.x, base.z), base.z)
		midnear.add_child(n)

	worm = WORM.instantiate()
	worm.scale = Vector3.ONE * WORM_S
	worm.lip = WORM_LIP
	worm.bend = WORM_BEND
	var m := _maw_world()
	worm.position = Vector3(m.x, 0, m.z)
	mid.add_child(worm)

	var t := tune()
	var arch := ARCH.instantiate()
	arch.position = Vector3(t.arch_x, t.arch_y, t.arch_z)
	arch.rotation.y = t.arch_yaw
	arch.height = t.arch_h
	arch.opening = t.arch_o
	arch.thickness = t.arch_t
	near.add_child(arch)
	var ledge := LEDGE.instantiate()
	ledge.main_pos = Vector3(t.ledge_x, t.ledge_y, t.ledge_z)
	ledge.main_yaw = t.ledge_yaw
	ledge.main_scale = t.ledge_s
	ledge.extras = t.extras > 0.5
	ledge.block_pos = Vector3(t.block_x, t.block_y, t.block_z)
	ledge.block_scale = t.block_s
	ledge.rubble_pos = Vector3(t.rubble_x, t.rubble_y, t.rubble_z)
	near.add_child(ledge)

# after the worm's skeleton has posed: slide it so the mouth lands on MAW_PX, then set the crater and dust under it
func _aim_worm() -> void:
	var mw: Node3D = worm.maw()
	var off := _maw_world() - mw.global_position
	worm.position += off
	# turn it so the mouth looks at the camera
	var to_cam := cam.global_position - mw.global_position
	worm.rotation.y = atan2(to_cam.x, to_cam.z)
	worm.position += _maw_world() - mw.global_position
	var base := Vector2(worm.position.x, worm.position.z)
	dunes.crater_center = base
	dunes.crater_radius = 70.0
	# 沙塵滾滾: the billows are a Blender volume flipbook rendered from this camera (sand/plume.gd); the particle
	# dust keeps only its grains and sand sheets. plume=0 on the command line brings the old particle billows back.
	var use_plume: bool = Look.args().get("plume", "1") != "0"
	if use_plume:
		var pl: SandPlume = PLUME.instantiate()
		pl.name = "Plume"
		mid.add_child(pl)
		pl.build(cam.global_transform, cam.fov)
		var a := Look.args()
		for k in ["exposure", "saturation", "gamma", "depth", "ground_h", "intensity"]:
			if a.has("plume_" + k):
				pl.set(k, float(a["plume_" + k]))
		if a.has("plume_depth") or a.has("plume_ground_h"):
			pl.build(cam.global_transform, cam.fov)
	var dust := DUST.instantiate()
	dust.billows = not use_plume
	if use_plume:
		dust.fall_count = 0   # the plume carries its own pouring sand; the old strips read as pale rain over it
	dust.position = Vector3(base.x - 45.0, 0, base.y)   # the target's dust leans left of the worm, stops short on its right
	dust.radius = 100.0
	dust.wall_height = 120.0
	dust.fall_height = mw.global_position.y - 20.0
	dust.fall_radius = 45.0
	dust.ground_y = 0.0
	mid.add_child(dust)
	_dust_look(dust)
	# the target's dust dome runs well left of the worm (x 330–1340 at its base): a lower billow there
	for lp in LEFT_PLUMES:
		var g := ground_at(lp[0])
		var d2 := DUST.instantiate()
		d2.position = Vector3(g.x, 0, g.z)
		d2.radius = lp[1]
		d2.wall_height = lp[2]
		d2.fall_count = 0
		d2.billows = not use_plume
		mid.add_child(d2)
		_dust_look(d2)

# stage 4 light (docs/沙蟲/04-貼圖材質環境光.md): a low sun ahead-right behind the worm, so most of what faces the
# camera is in its own shadow; a warm fill from the sky and the sand keeps those faces readable (mood over optics)
const SUN_TO := Vector3(0.555, 0.08, -0.83)   # toward the sun: matches the plate's sun at (1511, 445)
const LIGHT := {
	"sun_e": 2.0, "sun_c": Color(1.0, 0.72, 0.45),
	"fill_e": 0.45, "fill_c": Color(1.0, 0.66, 0.42),
	"amb_e": 0.22, "amb_c": Color(0.95, 0.6, 0.38),
	"fog_c": Color(0.96, 0.62, 0.36), "fog_begin": 60.0, "fog_end": 1600.0, "fog_curve": 1.2, "fog_max": 0.85,
	"exposure": 0.85, "glow": 0.35,
	"shadow_k": 0.45,
	"rock_k": 0.45,
	"spire_k": 0.55,
	"sand_c": Color(0.86, 0.64, 0.46), "trough_c": Color(0.56, 0.35, 0.23), "crest_c": Color(1.0, 0.84, 0.66),                              # the Tripo rocks were made under flat daylight: darken their albedo
	"bounce_e": 5.0, "bounce_c": Color(1.0, 0.6, 0.3), "bounce_r": 95.0,
	"dust_tint": Color(0.8, 0.5, 0.26), "dust_shade": Color(0.56, 0.32, 0.17), "dust_glow": Color(0.98, 0.66, 0.36),
}

func _light() -> void:
	var L := LIGHT.duplicate()
	var a := Look.args()
	for k in L:
		if a.has(k) and not (L[k] is Color):
			L[k] = float(a[k])
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = L.fog_c
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = L.amb_c
	env.ambient_light_energy = L.amb_e
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = L.exposure
	env.fog_enabled = true
	env.fog_mode = Environment.FOG_MODE_DEPTH
	env.fog_light_color = L.fog_c
	env.fog_depth_begin = L.fog_begin
	env.fog_depth_end = L.fog_end
	env.fog_depth_curve = L.fog_curve
	env.fog_density = L.fog_max
	env.glow_enabled = L.glow > 0.0
	env.glow_intensity = L.glow
	env.glow_hdr_threshold = 1.0
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	var sun := DirectionalLight3D.new()
	sun.name = "Sun"
	sun.light_color = L.sun_c
	sun.light_energy = L.sun_e
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 600.0
	sun.shadow_opacity = L.shadow_k   # the air is thick with dust: long sunset shadows, but soft and pale
	add_child(sun)
	sun.look_at_from_position(Vector3.ZERO, -SUN_TO, Vector3.UP)
	# fill: from behind the camera, left and a little above — the sky's and the lit sand's bounce
	var fill := DirectionalLight3D.new()
	fill.name = "Fill"
	fill.light_color = L.fill_c
	fill.light_energy = L.fill_e
	add_child(fill)
	fill.look_at_from_position(Vector3.ZERO, Vector3(0.25, -0.9, -0.5), Vector3.UP)
	# bounce: the bright sand and sky beyond the arch light its inner edges (the target's glowing rim of the opening)
	var t := tune()
	var bounce := OmniLight3D.new()
	bounce.name = "Bounce"
	bounce.light_color = L.bounce_c
	bounce.light_energy = L.bounce_e
	bounce.omni_range = L.bounce_r
	bounce.position = Vector3(t.arch_x, 22.0, t.arch_z - 8.0)
	add_child(bounce)
	_rockify(near, Color(L.rock_k, L.rock_k * 0.92, L.rock_k * 0.88), Vector3(t.arch_x, 22.0, t.arch_z - 8.0))
	# the spires stand against the sun: darker, toward silhouettes
	for sp in find_children("Spire*", "", true, false):
		_tint_tree(sp, Color(L.spire_k, L.spire_k * 0.9, L.spire_k * 0.85))
	_skin(worm)
	var sm: ShaderMaterial = dunes.get("_mat")
	if sm:
		sm.set_shader_parameter("sand", L.sand_c)
		sm.set_shader_parameter("sand_trough", L.trough_c)
		sm.set_shader_parameter("sand_crest", L.crest_c)
	dunes.haze_max = 0.0   # the environment's depth fog does the haze now (one, not two)
	dust_look = [L.dust_tint, L.dust_shade, L.dust_glow]

# dust and devils are light-catching haze, not solids: no shadows (run again once the worm's dust exists)
func _no_haze_shadows() -> void:
	for g in find_children("*", "GeometryInstance3D", true, false):
		var p := String(g.get_path())
		if g is CPUParticles3D or g is MultiMeshInstance3D or p.contains("Dust") or p.contains("Devil"):
			(g as GeometryInstance3D).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF

# swap the near rocks' Tripo materials for rocks/rock_detail.gdshader (world-space strata, cracks, grit, rim),
# keeping their colour and normal maps
func _rockify(n: Node, c: Color, opening: Vector3) -> void:
	var sh: Shader = load("res://rocks/rock_detail.gdshader")
	var made := {}
	for mi in n.find_children("*", "MeshInstance3D", true, false):
		var m3 := mi as MeshInstance3D
		if m3.mesh == null:
			continue
		for i in m3.mesh.get_surface_count():
			var src := m3.get_active_material(i)
			if not (src is BaseMaterial3D):
				continue
			if not made.has(src):
				var b := src as BaseMaterial3D
				var sm := ShaderMaterial.new()
				sm.shader = sh
				sm.set_shader_parameter("albedo_tex", b.albedo_texture)
				sm.set_shader_parameter("tint", b.albedo_color * c)
				if b.normal_enabled and b.normal_texture:
					sm.set_shader_parameter("normal_tex", b.normal_texture)
					sm.set_shader_parameter("has_normal", true)
				sm.set_shader_parameter("rim_pos", opening)
				made[src] = sm
			if m3.material_override == src:
				m3.material_override = made[src]
			else:
				m3.set_surface_override_material(i, made[src])

# the worm's Tripo body surfaces (the textured ones; the maw's flesh, teeth and black throat keep theirs) get worm/skin.gdshader
func _skin(n: Node) -> void:
	var sh: Shader = load("res://worm/skin.gdshader")
	var made := {}
	for mi in n.find_children("*", "MeshInstance3D", true, false):
		var m3 := mi as MeshInstance3D
		if m3.mesh == null or m3.material_override != null:
			continue
		for i in m3.mesh.get_surface_count():
			var src := m3.get_active_material(i)
			if not (src is BaseMaterial3D) or (src as BaseMaterial3D).albedo_texture == null:
				continue
			if not made.has(src):
				var b := src as BaseMaterial3D
				var sm := ShaderMaterial.new()
				sm.shader = sh
				sm.set_shader_parameter("albedo_tex", b.albedo_texture)
				if b.normal_enabled and b.normal_texture:
					sm.set_shader_parameter("normal_tex", b.normal_texture)
					sm.set_shader_parameter("has_normal", true)
				sm.set_shader_parameter("sun_to", SUN_TO)
				made[src] = sm
			m3.set_surface_override_material(i, made[src])

# multiply the albedo of every StandardMaterial3D under `n`, in memory (the imported rock materials are used
# nowhere else; duplicating them instead left null material RIDs in the Compatibility renderer)
func _tint_tree(n: Node, c: Color) -> void:
	var done := {}
	for mi in n.find_children("*", "MeshInstance3D", true, false):
		var m3 := mi as MeshInstance3D
		if m3.mesh == null:
			continue
		for i in m3.mesh.get_surface_count():
			var src := m3.get_active_material(i)
			if src is StandardMaterial3D and not done.has(src):
				done[src] = true
				(src as StandardMaterial3D).albedo_color *= c

# near-layer placement; each key can be overridden on the command line (arch_z=-40 …) for tools/sweep.sh
const TUNE := {
	"arch_x": 3.0, "arch_y": 0.0, "arch_z": -44.0, "arch_yaw": 0.0, "arch_h": 72.0, "arch_o": 67.2, "arch_t": 1.0,
	"ledge_x": -15.0, "ledge_y": 6.0, "ledge_z": -26.0, "ledge_yaw": 0.0, "ledge_s": 1.2, "extras": 1.0,
	"block_x": 18.0, "block_y": 15.0, "block_z": -16.0, "block_s": 1.1, "rubble_x": 0.0, "rubble_y": 15.0, "rubble_z": -20.0,
}

func tune() -> Dictionary:
	var t := TUNE.duplicate()
	var a := Look.args()
	for k in t:
		if a.has(k):
			t[k] = float(a[k])
	return t

func _dust_look(d: Node) -> void:
	if dust_look.is_empty():
		return
	d.tint = dust_look[0]
	d.shade = dust_look[1]
	d.glow = dust_look[2]
	d.sun_direction = SUN_TO

func _maw_world() -> Vector3:
	return at_px(MAW_PX, WORM_DIST)

# the point on the ray through target pixel `px` that is `dist` metres out along the view's forward axis
func at_px(px: Vector2, dist: float) -> Vector3:
	var o := cam.project_ray_origin(px * get_viewport().get_visible_rect().size / VP)
	var d := cam.project_ray_normal(px * get_viewport().get_visible_rect().size / VP)
	var fwd := -cam.global_transform.basis.z
	return o + d * (dist / d.dot(fwd))

# where the ray through target pixel `px` meets the sand plane y = h
func ground_at(px: Vector2, h: float = 0.0) -> Vector3:
	var o := cam.project_ray_origin(px * get_viewport().get_visible_rect().size / VP)
	var d := cam.project_ray_normal(px * get_viewport().get_visible_rect().size / VP)
	return o + d * ((h - o.y) / d.y)
