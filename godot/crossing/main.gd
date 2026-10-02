extends Node3D
# 平交道 — a rural Taiwan railway level crossing beside rice paddies, driven by Claude Code's state (VibingWrapper theme).
# The whole scene is built in code. The page (shell.html) owns state.json polling, the clock, the 30 fps cap and pause;
# this script reads window.wpCtl through JavaScriptBridge.
#
# World: the single track runs along X (trains travel +X), the road along Z, crossing at the origin.
# The camera stands on the road shoulder looking up the line, so the track recedes into the paddies on the left.
#
# Claude state → crossing:
#   clear     idle: lamps dark, barriers up
#   overcast  thinking: a train creeps in from afar and waits short of the crossing; lamps flash, barriers down
#   storm     working: the train runs through — endless, as long as the work lasts
#   clearing  done: the last car passes, the lamps stop, the barriers rise
#   waiting   needs you: the train stands across the crossing, lamps flashing

const TEX := "res://textures/"
const GAUGE := 1.067                 # TRA narrow gauge (m)
const RAIL_TOP := 0.62
const SLEEPER_TOP := 0.47
const CAR_LEN := 20.0
const CAR_GAP := 0.7
const RUN_SPEED := 19.0              # ≈ 70 km/h
const VIEW_FAR := -330.0             # cars beyond this (up the line) are not drawn
const VIEW_NEAR := 170.0
const TRACK_MIN := -900.0
const TRACK_MAX := 400.0
const TRAIN_CARS := 6                # several sessions working: each one's train is this long
const HEADWAY := 55.0                # gap between consecutive trains (m)
# one livery per session slot: [replaces the teal band, replaces the orange band]; null = the painted original
const LIVERIES := [[null, null], [Vector3(0.10, 0.24, 0.62), Vector3(0.95, 0.76, 0.16)], [Vector3(0.66, 0.08, 0.09), Vector3(0.86, 0.86, 0.84)],
	[Vector3(0.10, 0.44, 0.20), Vector3(0.66, 0.80, 0.22)], [Vector3(0.40, 0.16, 0.56), Vector3(0.96, 0.52, 0.16)]]

var cam: Camera3D
var sun: DirectionalLight3D
var env: Environment
var sky_mat: ShaderMaterial
var mountain_mat: ShaderMaterial
var cloud_mat: ShaderMaterial
var cloud_cover := 0.42
var paddy_mat: ShaderMaterial
var foliage_mat: ShaderMaterial
var foliage_count := 0
var gust := 0.0                      # the passing train's wind on the plants by the line

# crossing
var lamp_mats := []                  # [left, right] emissive lens materials (shared by both posts)
var halo_mats := []                  # [left, right]
var lamp_lights := []                # one OmniLight3D per post, hops between the lamp sides
var arm_pivots := []                 # [{node, sign}]
var gate := 0.0                      # 0 = up, 1 = down
var alarm_time := 0.0                # seconds the alarm has been ringing (0 = off)
var street_light: OmniLight3D
var street_mat: StandardMaterial3D

# train
var pool := []                       # car nodes, each {node, nose, tail, head_l, head_r}
var car_side_mats := []            # one weathered side material per pool slot (each its own dirt)
var head_mat: StandardMaterial3D
var head_halo_mat: StandardMaterial3D
var head_spot: SpotLight3D
var train_on := false
var head_x := 0.0                    # front of the train
var sets := []                       # the procession: trains nose to tail, {off: front behind head_x, n: cars (-1 = endless), base: serial of its first car, liv}
var closing := false                 # no more trains will join the procession
var rot := 0                         # whose turn it is among the working sessions
var car_serial := 0
var sessions := []                   # Claude session states from state.json (5 slots)
var moon_phase := 0.5
var applied_hours := -99.0
var moon_light: DirectionalLight3D
var speed := 0.0

var state := "clear"
var hours := 17.5
var t := 0.0
var poll_t := 0.0
var night := 0.0
var warp := 0.0
var dbg := ""

func _ready() -> void:
	_build_environment()
	_build_clouds()
	_build_ground()
	_build_track()
	_build_catenary()
	_build_crossing()
	_build_street()
	_build_train_pool()
	_build_foliage()
	cam = Camera3D.new()
	cam.fov = 40.0
	cam.near = 0.1
	cam.far = 9000.0
	add_child(cam)
	# standing on the farm path beside the line, looking up it: the crossing just right of centre, the track
	# receding left of centre, so a train is seen from far off as it comes on
	cam.position = Vector3(16.0, 1.5, 7.5)
	cam.look_at(Vector3(-30.0, 2.4, -1.5), Vector3.UP)
	_poll()
	_apply_time()
	# ?warp=N (tests / screenshots): fast-forward N seconds of the state machine
	for i in int(warp * 30.0):
		_drive_train(1.0 / 30.0)
		_drive_crossing(1.0 / 30.0)
		t += 1.0 / 30.0
	# ?dbg=cam=x,y,z,lx,ly,lz (tests): another viewpoint
	if dbg.find("cam=") >= 0:
		var v := dbg.get_slice("cam=", 1).get_slice(";", 0).split_floats(",")
		if v.size() == 6:
			cam.position = Vector3(v[0], v[1], v[2])
			cam.look_at(Vector3(v[3], v[4], v[5]), Vector3.UP)
	if dbg.find("mtn") >= 0:
		mountain_mat.set_shader_parameter("debug_red", 1.0)
	if dbg.find("trace") >= 0:
		var vis := []
		for c in pool:
			if c["node"].visible:
				vis.append(int(c["node"].position.x))
		push_error("trace state=%s train_on=%s head_x=%.1f speed=%.1f sets=%s vis=%s foliage=%d" % [state, train_on, head_x, speed, str(sets), str(vis), foliage_count])

# ---------------------------------------------------------------- helpers
func tex(name: String) -> Texture2D:
	var p := TEX + name
	return load(p) if ResourceLoader.exists(p) else null

func mat(col: Color, rough := 0.85, metal := 0.0, t2: Texture2D = null, tri := 0.0) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = col
	m.roughness = rough
	m.metallic = metal
	if t2:
		m.albedo_texture = t2
		m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	if tri > 0.0:
		m.uv1_triplanar = true
		m.uv1_world_triplanar = true
		m.uv1_scale = Vector3(tri, tri, tri)
	return m

# weathering: one shared shader, a material per use. Procedural grime in OBJECT space (so it travels with a moving car):
# blotchy dirt, rain streaks running down, mud splashed up from the ground (world height), rust spots and chipped paint.
var _grime_shader: Shader

func grime(base: Color, o := {}) -> ShaderMaterial:
	if _grime_shader == null:
		_grime_shader = Shader.new()
		_grime_shader.code = """
shader_type spatial;
uniform sampler2D tex_alb : source_color, filter_linear_mipmap_anisotropic;
uniform bool use_tex = false;
uniform sampler2D tex_em : source_color, filter_linear_mipmap;
uniform bool use_em = false;
uniform float em_energy = 0.0;
uniform vec3 base = vec3(0.7);
uniform vec2 uv_scale = vec2(1.0);
uniform float stripes = 0.0;
uniform float rough = 0.8;
uniform float metal = 0.0;
uniform float dirt = 0.5;
uniform float streaks = 0.5;
uniform float splash = 0.0;
uniform float splash_h = 0.6;
uniform float rust = 0.0;
uniform float scale = 1.0;
uniform float seed = 0.0;
uniform bool recolor = false;
uniform vec3 stripe_a = vec3(0.0);
uniform vec3 stripe_b = vec3(0.0);
uniform sampler2D grime_tex : source_color, filter_linear_mipmap_anisotropic;
uniform bool use_grime = false;
uniform float grime_amt = 1.0;
uniform bool glass = false;
uniform vec3 env_top = vec3(0.22, 0.42, 0.78);
uniform vec3 env_hor = vec3(0.68, 0.78, 0.88);
uniform vec3 env_gnd = vec3(0.16, 0.17, 0.12);
uniform vec3 env_sun_dir = vec3(0.0, 1.0, 0.0);
uniform vec3 env_sun_col = vec3(1.0);
uniform float top_y = 99.0;
uniform float top_dirt = 0.0;
varying vec3 lp;
varying vec3 wpos;
varying vec3 wnrm;
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x) {
	vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
	           mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
const mat3 RT = mat3(vec3(0.00, 0.80, 0.60), vec3(-0.80, 0.36, -0.48), vec3(-0.60, -0.48, 0.64));   // turn each octave off the grid
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int k = 0; k < 4; k++) { s += a * n3(p); p = RT * p * 2.07; a *= 0.5; } return s; }
void vertex() { lp = VERTEX; wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; wnrm = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz); }
void fragment() {
	vec3 c = base;
	if (use_tex) {
		vec3 tx = texture(tex_alb, UV * uv_scale).rgb;
		if (recolor) {
			// another session's livery: the saturated stripes take its colours (teal → a, orange → b)
			float mx = max(tx.r, max(tx.g, tx.b)), mn = min(tx.r, min(tx.g, tx.b));
			float sat = (mx - mn) / (mx + 1e-3);
			vec3 to = (tx.b > tx.r ? stripe_a : stripe_b) * (0.35 + 0.8 * mx);
			tx = mix(tx, to, smoothstep(0.22, 0.42, sat));
		}
		c *= tx;
	}
	if (stripes > 0.0) c *= mix(vec3(0.035), vec3(0.82, 0.62, 0.06), step(0.5, fract(UV.y * stripes)));
	vec3 p = lp * scale + vec3(seed * 17.31, seed * 5.7, seed * 11.3);
	float fine = n3(p * 11.0);
	// blotchy grime
	float d = smoothstep(0.42, 0.78, fbm(RT * p * 1.4)) * dirt;
	// rain streaks: noise stretched downward, heavier just below edges (top of the object)
	float st = n3(vec3(p.x * 18.0, p.y * 0.45, p.z * 18.0)) * (0.7 + 0.3 * fine);
	st = smoothstep(0.58, 0.9, st) * streaks;
	// mud splashed up from the ground
	float sp = (1.0 - smoothstep(0.0, splash_h, wpos.y + (fine - 0.5) * 0.25 * splash_h)) * splash;
	vec3 grime_col = vec3(0.30, 0.26, 0.20);
	c = mix(c, c * 0.45 + grime_col * 0.25, clamp(d * 0.7 + st * 0.55, 0.0, 1.0));
	c = mix(c, vec3(0.30, 0.25, 0.19) * (0.8 + 0.4 * fine), clamp(sp, 0.0, 1.0) * 0.8);
	// drip band under a top edge (a car roof): dark water stains running down from it
	float drip = smoothstep(top_y - 0.35 - 0.5 * st, top_y, lp.y) * top_dirt;
	c = mix(c, c * 0.5 + grime_col * 0.2, clamp(drip, 0.0, 1.0));
	// painted weathering overlay (Codex; aligned to the texture layout): streaks, brake dust, scratches, dents
	if (use_grime) {
		vec4 gr = texture(grime_tex, UV * uv_scale);
		float ga = clamp(pow(gr.a, 0.75) * grime_amt * 2.0, 0.0, 1.0);          // the painted alpha is faint (max ~0.5): lift it
		c = mix(c, gr.rgb, ga);
		d = max(d, ga * 0.6);
	}
	// rust blooms and chipped paint (bare grey primer / steel)
	float r = smoothstep(0.70, 0.80, n3(p * 5.0 + 7.0) * 0.7 + fine * 0.3) * rust;
	float chip = smoothstep(0.80, 0.84, n3(p * 22.0 + 3.0)) * rust;
	c = mix(c, vec3(0.30, 0.14, 0.06) * (0.7 + 0.6 * fine), clamp(r, 0.0, 1.0));
	c = mix(c, vec3(0.42, 0.41, 0.39), clamp(chip, 0.0, 1.0) * 0.8);
	if (glass && use_tex) {
		// stainless side panels: relief from the horizontal ribs / seams painted in the texture (no tangents needed:
		// the side is a vertical quad, so perturb its world normal up/down and turn it back to view space)
		float e = 1.0 / 512.0;
		float l0 = dot(texture(tex_alb, UV * uv_scale + vec2(0.0, -e)).rgb, vec3(0.333));
		float l1 = dot(texture(tex_alb, UV * uv_scale + vec2(0.0, e)).rgb, vec3(0.333));
		vec3 n = normalize(wnrm + vec3(0.0, (l1 - l0) * 6.0, 0.0));
		NORMAL = normalize((VIEW_MATRIX * vec4(n, 0.0)).xyz);
	}
	ALBEDO = c;
	ROUGHNESS = clamp(rough + d * 0.25 + sp * 0.3 + r * 0.35 + st * 0.15, 0.0, 1.0);
	METALLIC = metal * clamp(1.0 - d * 0.7 - sp - r, 0.0, 1.0);
	if (use_em) EMISSION = texture(tex_em, UV * uv_scale).rgb * em_energy;
	if (glass && use_em) {
		// window glass: a mirror of sky / horizon / ground, Fresnel-weighted (head-on you see in, along the train it
		// turns to a mirror), dimmed by the grime on it
		float wm = smoothstep(0.03, 0.14, dot(texture(tex_em, UV * uv_scale).rgb, vec3(0.333)));
		vec3 v = normalize(CAMERA_POSITION_WORLD - wpos);
		vec3 rw = reflect(-v, wnrm);
		vec3 env = rw.y > 0.0 ? mix(env_hor, env_top, pow(rw.y, 0.45)) * 0.6 : mix(env_hor * 0.45, env_gnd, clamp(-rw.y * 5.0, 0.0, 1.0));
		env = mix(env, env_gnd * 1.2, smoothstep(0.0, 0.004, rw.y) * (1.0 - smoothstep(0.03, 0.045, rw.y)) * 0.85);  // far treeline, crisp
		env += env_hor * 0.25 * (1.0 - smoothstep(0.0, 0.02, abs(rw.y)));                                                // bright horizon line
		// the sun: a hard glint and a soft bloom around it
		float sd = max(dot(rw, env_sun_dir), 0.0);
		env += env_sun_col * (pow(sd, 900.0) * 14.0 + pow(sd, 40.0) * 0.6);
		float fres = 0.08 + 0.92 * pow(1.0 - max(dot(v, wnrm), 0.0), 4.0);
		float refl = wm * mix(0.45, 0.9, fres) * (1.0 - 0.35 * d);
		ALBEDO = mix(ALBEDO, ALBEDO * 0.25, refl);                              // what is behind the glass hides under the mirror
		EMISSION += env * refl;
		SPECULAR = mix(SPECULAR, 0.0, wm);                                      // the glass gets its light from the mirror above only
		ROUGHNESS = mix(ROUGHNESS, 0.08, wm);
		METALLIC = mix(METALLIC, 0.0, wm);
	}
}
"""
	var m := ShaderMaterial.new()
	m.shader = _grime_shader
	m.set_shader_parameter("base", Vector3(base.r, base.g, base.b))
	var t2: Texture2D = o.get("tex")
	if t2:
		m.set_shader_parameter("tex_alb", t2)
		m.set_shader_parameter("use_tex", true)
	var g2: Texture2D = o.get("grime")
	if g2:
		m.set_shader_parameter("grime_tex", g2)
		m.set_shader_parameter("use_grime", true)
	var e2: Texture2D = o.get("em")
	if e2:
		m.set_shader_parameter("tex_em", e2)
		m.set_shader_parameter("use_em", true)
	for k in ["grime_amt", "glass", "top_y", "top_dirt", "uv_scale", "stripes", "rough", "metal", "dirt", "streaks", "splash", "splash_h", "rust", "scale", "seed"]:
		if o.has(k):
			m.set_shader_parameter(k, o[k])
	return m

func _add_normal(m: StandardMaterial3D, file: String, k: float) -> void:
	var t2 := tex(file)
	if t2:
		m.normal_enabled = true
		m.normal_texture = t2
		m.normal_scale = k
	m.metallic_specular = 0.25

func box(size: Vector3, pos: Vector3, m: Material, parent: Node = self) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var b := BoxMesh.new()
	b.size = size
	mi.mesh = b
	mi.material_override = m
	mi.position = pos
	parent.add_child(mi)
	return mi

func cyl(r: float, h: float, pos: Vector3, m: Material, parent: Node = self, segs := 12) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var c := CylinderMesh.new()
	c.top_radius = r
	c.bottom_radius = r
	c.height = h
	c.radial_segments = segs
	c.rings = 1
	mi.mesh = c
	mi.material_override = m
	mi.position = pos
	parent.add_child(mi)
	return mi

func halo_material(col: Color) -> StandardMaterial3D:
	var g := Gradient.new()
	g.set_color(0, Color(1, 1, 1, 1))
	g.set_color(1, Color(1, 1, 1, 0))
	g.add_point(0.18, Color(1, 1, 1, 0.55))
	g.add_point(0.5, Color(1, 1, 1, 0.08))
	var gt := GradientTexture2D.new()
	gt.gradient = g
	gt.fill = GradientTexture2D.FILL_RADIAL
	gt.fill_from = Vector2(0.5, 0.5)
	gt.fill_to = Vector2(1.0, 0.5)
	gt.width = 128
	gt.height = 128
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	m.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	m.no_depth_test = false
	m.disable_fog = true
	m.albedo_texture = gt
	m.albedo_color = col
	return m

func halo(size: float, pos: Vector3, m: Material, parent: Node) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var q := QuadMesh.new()
	q.size = Vector2(size, size)
	mi.mesh = q
	mi.material_override = m
	mi.position = pos
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi)
	return mi

# a prism along X with a trapezoid cross-section (ballast shoulder, embankment)
func prism(length: float, w_bot: float, w_top: float, h: float, pos: Vector3, m: Material) -> MeshInstance3D:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var x0 := -length / 2.0
	var x1 := length / 2.0
	var a := Vector3(0, 0, w_bot / 2.0)
	var b := Vector3(0, h, w_top / 2.0)
	var c := Vector3(0, h, -w_top / 2.0)
	var d := Vector3(0, 0, -w_bot / 2.0)
	var quads := [[a, b], [b, c], [c, d]]
	for q in quads:
		var p0: Vector3 = q[0]
		var p1: Vector3 = q[1]
		var v := [p0 + Vector3(x0, 0, 0), p0 + Vector3(x1, 0, 0), p1 + Vector3(x1, 0, 0), p1 + Vector3(x0, 0, 0)]
		st.add_vertex(v[0]); st.add_vertex(v[2]); st.add_vertex(v[1])
		st.add_vertex(v[0]); st.add_vertex(v[3]); st.add_vertex(v[2])
	st.generate_normals()
	var mi := MeshInstance3D.new()
	mi.mesh = st.commit()
	mi.material_override = m
	mi.position = pos
	add_child(mi)
	return mi

# ---------------------------------------------------------------- environment
func _build_environment() -> void:
	# custom sky: gradient + sun glow, and at night a moon in its real phase, stars, and the warm glow of Kaohsiung
	# low in the west (the camera looks west up the line)
	var ssh := Shader.new()
	ssh.code = """
shader_type sky;
uniform vec3 top_col = vec3(0.22, 0.42, 0.78);
uniform vec3 hor_col = vec3(0.68, 0.78, 0.88);
uniform vec3 gnd_col = vec3(0.3, 0.3, 0.3);
uniform vec3 sun_dir = vec3(0.0, 1.0, 0.0);
uniform vec3 sun_col = vec3(1.0);
uniform float sun_vis = 1.0;
uniform vec3 moon_dir = vec3(0.0, -1.0, 0.0);
uniform float moon_phase = 0.5;          // 0 new, 0.5 full
uniform float night = 0.0;
uniform vec3 glow_dir = vec3(-1.0, 0.0, 0.0);
uniform vec3 glow_col = vec3(0.30, 0.17, 0.08);
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(h3(vec3(i, 1.0)), h3(vec3(i + vec2(1, 0), 1.0)), f.x), mix(h3(vec3(i + vec2(0, 1), 1.0)), h3(vec3(i + vec2(1, 1), 1.0)), f.x), f.y); }
void sky() {
	vec3 d = EYEDIR;
	float y = d.y;
	vec3 c = mix(hor_col, top_col, pow(clamp(y, 0.0, 1.0), 0.45));
	if (y < 0.0) c = mix(hor_col, gnd_col, clamp(-y * 6.0, 0.0, 1.0));
	float sd = max(dot(d, sun_dir), 0.0);
	c += sun_col * (pow(sd, 5.0) * 0.30 + pow(sd, 48.0) * 0.55) * sun_vis;
	c += sun_col * smoothstep(0.99955, 0.9998, sd) * 6.0 * sun_vis;
	// light pollution over the towns
	vec3 hz = normalize(vec3(d.x, 0.0, d.z) + 1e-5);
	float az = max(dot(hz, glow_dir), 0.0);
	float poll = exp(-max(y, 0.0) * 11.0) * (0.25 + 0.75 * az * az);
	c += glow_col * night * poll;
	if (!AT_CUBEMAP_PASS && y > -0.02) {
		// stars: one candidate per cell of a direction grid, fading toward the glowing horizon
		vec3 p = d * 300.0;
		vec3 cell = floor(p);
		float r = h3(cell);
		vec3 ctr = cell + 0.5 + (vec3(h3(cell + 3.1), h3(cell + 7.7), h3(cell + 11.3)) - 0.5) * 0.7;
		float st = smoothstep(0.16, 0.0, length(p - ctr)) * step(0.985, r) * (0.4 + 2.2 * pow(h3(cell + 5.0), 6.0));
		st *= night * smoothstep(0.03, 0.25, y) * (1.0 - 0.7 * poll);
		c += vec3(0.85, 0.9, 1.0) * st;
		// the moon: a lit sphere, its terminator from the phase; a faint halo
		float md = dot(d, moon_dir);
		if (moon_dir.y > -0.05) {
			float R = 0.0085;
			vec3 rt = normalize(cross(moon_dir, vec3(0.0, 1.0, 0.0)));
			vec3 up = cross(rt, moon_dir);
			vec2 uv = vec2(dot(d, rt), dot(d, up)) / R;
			float rr = dot(uv, uv);
			float lit_frac = 0.5 - 0.5 * cos(moon_phase * 6.2831853);
			c += vec3(0.55, 0.62, 0.8) * pow(max(md, 0.0), 900.0) * 0.35 * lit_frac * (0.3 + 0.7 * night);
			if (rr < 1.2 && md > 0.0) {
				vec3 n = vec3(uv, sqrt(max(1.0 - rr, 0.0)));
				// lit from the real sun direction (the terminator faces it), in the disc frame: x right, y up, z toward us
				vec3 L = normalize(vec3(dot(sun_dir, rt), dot(sun_dir, up), -dot(sun_dir, moon_dir)));
				float lit = smoothstep(-0.04, 0.12, dot(n, L));
				float maria = 0.75 + 0.25 * n2(uv * 2.3 + 4.0) + 0.1 * n2(uv * 7.0);
				vec3 mc = vec3(0.95, 0.94, 0.88) * maria * (lit * 1.7 + 0.03);
				float edge = smoothstep(1.0, 0.92, sqrt(rr));
				c += mc * edge * (0.35 + 0.65 * night);                // the air in front still glows: add, never darken
			}
		}
	}
	COLOR = c;
}
"""
	sky_mat = ShaderMaterial.new()
	sky_mat.shader = ssh
	var sky := Sky.new()
	sky.radiance_size = Sky.RADIANCE_SIZE_64
	sky.sky_material = sky_mat
	env = Environment.new()
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_sky_contribution = 0.55                          # the rest is a neutral ambient: less blue cast on the ground
	env.ambient_light_color = Color(0.62, 0.6, 0.56)
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.fog_enabled = true
	env.fog_density = 0.0016
	env.fog_sky_affect = 0.0
	env.fog_aerial_perspective = 0.35
	env.glow_enabled = true
	env.glow_intensity = 0.9
	env.glow_strength = 1.0
	env.glow_bloom = 0.0
	env.glow_hdr_threshold = 1.4
	env.glow_blend_mode = Environment.GLOW_BLEND_MODE_ADDITIVE
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	sun = DirectionalLight3D.new()
	sun.shadow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	sun.directional_shadow_max_distance = 90.0
	add_child(sun)
	moon_light = DirectionalLight3D.new()
	moon_light.light_color = Color(0.62, 0.72, 1.0)
	moon_light.shadow_enabled = true
	moon_light.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	moon_light.directional_shadow_max_distance = 70.0
	moon_light.light_energy = 0.0
	add_child(moon_light)

	# distant blue ranges on an inward-facing cylinder (Pingtung: the Central Range to the east, hills to the north)
	var sh := Shader.new()
	sh.code = """
shader_type spatial;
render_mode unshaded, cull_disabled, fog_disabled, shadows_disabled, blend_mix, depth_draw_always;
uniform vec3 haze = vec3(0.55, 0.62, 0.72);
uniform vec3 far_col = vec3(0.32, 0.40, 0.52);
uniform vec3 near_col = vec3(0.22, 0.30, 0.38);
uniform float debug_red = 0.0;
float h1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
float n1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
float fbm(float x) { float a = 0.5, s = 0.0; for (int k = 0; k < 5; k++) { s += a * n1(x); x *= 2.03; a *= 0.5; } return s; }
varying vec3 wp;
void vertex() { wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; }
void fragment() {
	// world space: CylinderMesh's side UVs do not span 0..1 vertically
	float u = (atan(wp.x, wp.z) / 6.2831853 + 0.5) * 64.0;
	float y = wp.y / 900.0;                                 // height as a fraction of 900 m
	float far_r = 0.045 + 0.20 * pow(fbm(u * 0.9 + 3.0), 2.0) + 0.012 * n1(u * 14.0) + 0.003 * n1(u * 60.0);
	float near_r = 0.025 + 0.10 * pow(fbm(u * 1.6 + 11.0), 2.2) + 0.008 * n1(u * 20.0) + 0.002 * n1(u * 80.0);
	// anti-aliased silhouettes: coverage from the distance to the ridge in pixels (a hard discard stair-steps at half res)
	float px = max(fwidth(y - far_r), 1e-6);
	float cover_far = clamp((far_r - y) / px + 0.5, 0.0, 1.0);
	if (cover_far <= 0.0) discard;
	float pxn = max(fwidth(y - near_r), 1e-6);
	float on_near = clamp((near_r - y) / pxn + 0.5, 0.0, 1.0);
	vec3 c = mix(far_col, near_col, on_near);
	c = mix(c, haze, 0.35 + 0.25 * (1.0 - y / max(far_r, 0.01)) * (1.0 - on_near));
	ALBEDO = c;
	ALPHA = cover_far;
	if (debug_red > 0.5) ALBEDO = vec3(1.0, 0.0, 0.0);
}
"""
	mountain_mat = ShaderMaterial.new()
	mountain_mat.shader = sh
	mountain_mat.render_priority = 1                                   # over the clouds, which sink behind the ranges
	var mi := MeshInstance3D.new()
	var c := CylinderMesh.new()
	c.top_radius = 4200.0
	c.bottom_radius = 4200.0
	c.height = 900.0
	c.radial_segments = 96
	c.rings = 1
	c.cap_top = false
	c.cap_bottom = false
	mi.mesh = c
	mi.material_override = mountain_mat
	mi.position = Vector3(0, 450.0 - 6.0, 0)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)

# ---------------------------------------------------------------- clouds
func _build_clouds() -> void:
	var sh := Shader.new()
	sh.code = """
shader_type spatial;
render_mode unshaded, cull_disabled, blend_mix, depth_draw_never, fog_disabled, shadows_disabled;
uniform float cover = 0.42;
uniform vec3 sun_dir = vec3(0.0, 1.0, 0.0);
uniform vec3 lit_col = vec3(1.0);
uniform vec3 shade_col = vec3(0.55, 0.6, 0.68);
uniform vec3 haze_col = vec3(0.7, 0.78, 0.86);
uniform float night = 0.0;
uniform vec3 glow_col = vec3(0.30, 0.17, 0.08);
uniform vec3 glow_dir = vec3(-1.0, 0.0, 0.0);
uniform vec2 wind = vec2(5.0, 1.8);
varying vec3 wp;
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float a = 0.5, s = 0.0; mat2 r = mat2(vec2(0.8, 0.6), vec2(-0.6, 0.8));
	for (int k = 0; k < 5; k++) { s += a * n2(p); p = r * p * 2.03; a *= 0.5; } return s; }
void vertex() { wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; }
void fragment() {
	vec2 p = (wp.xz + wind * TIME) * 0.0009;
	float dens = fbm(p) * 0.75 + fbm(p * 4.0 + 7.0) * 0.25;
	float a = smoothstep(1.0 - cover, 1.0 - cover + 0.2, dens);
	if (a < 0.003) discard;
	// self-shadow: thinner toward the sun = lit side
	vec2 ps = p + normalize(sun_dir.xz + 1e-4) * 0.05;
	float toward = fbm(ps) * 0.75 + fbm(ps * 4.0 + 7.0) * 0.25;
	float lit = clamp((dens - toward) * 4.0 + 0.55, 0.0, 1.0);
	vec3 c = mix(shade_col, lit_col, lit);
	c = mix(c, lit_col, (1.0 - a) * 0.45);                                   // thin edges let the light through
	vec3 vdir = normalize(wp - CAMERA_POSITION_WORLD);
	c += lit_col * pow(max(dot(vdir, sun_dir), 0.0), 6.0) * (1.0 - a) * 0.9;  // silver / golden lining toward the sun
	float az = max(dot(normalize(vec3(vdir.x, 0.0, vdir.z)), glow_dir), 0.0);
	c += glow_col * night * (0.45 + 0.9 * az * az);                          // the towns light the bases at night
	float dist = length(wp.xz - CAMERA_POSITION_WORLD.xz);
	c = mix(c, haze_col, smoothstep(1200.0, 7000.0, dist) * 0.75);
	ALBEDO = c;
	ALPHA = a * (1.0 - smoothstep(4000.0, 8000.0, dist)) * 0.96;
}
"""
	cloud_mat = ShaderMaterial.new()
	cloud_mat.shader = sh
	var mi := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(17000, 17000)
	mi.mesh = pm
	mi.material_override = cloud_mat
	mi.position = Vector3(0, 650.0, 0)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)

# ---------------------------------------------------------------- ground, paddies, road
func _build_ground() -> void:
	var verge := mat(Color(0.62, 0.6, 0.54), 0.97, 0.0, tex("verge.png"), 0.5)
	_add_normal(verge, "verge_n.png", 1.0)
	var g := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(3000, 3000)
	g.mesh = pm
	g.material_override = verge
	add_child(g)

	# rice paddies: four fields around the crossing, a shader of rows and patchy tone
	var sh := Shader.new()
	sh.code = """
shader_type spatial;
render_mode diffuse_lambert_wrap;
uniform vec3 young = vec3(0.13, 0.22, 0.06);
uniform vec3 ripe = vec3(0.26, 0.29, 0.09);
uniform float wind_t = 0.0;
varying vec3 wp;
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
void vertex() { wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; }
void fragment() {
	float d = length(wp - CAMERA_POSITION_WORLD);
	float big = n2(wp.xz * 0.012) * 0.6 + n2(wp.xz * 0.05) * 0.4;
	float fine = n2(wp.xz * 2.5) * 0.5 + n2(wp.xz * 9.0) * 0.5;
	fine = mix(fine, 0.5, smoothstep(8.0, 60.0, d));
	float rows = 0.5 + 0.5 * sin(wp.x * 6.2831 / 0.30);
	rows = mix(rows, 0.5, smoothstep(4.0, 30.0, d));
	float wave = n2(vec2(wp.x * 0.04 - wind_t * 0.25, wp.z * 0.06)) ;            // wind sheen rolling over the field
	vec3 c = mix(young, ripe, smoothstep(0.35, 0.8, big));
	c *= 0.75 + 0.35 * fine;
	c *= 0.85 + 0.18 * rows;
	ALBEDO = c;
	c *= 1.0 + 0.12 * smoothstep(0.55, 0.8, wave);
	ALBEDO = c;
	ROUGHNESS = 1.0;
	SPECULAR = 0.05;              // a leaf canopy, not water: only a faint wind sheen
}
"""
	paddy_mat = ShaderMaterial.new()
	paddy_mat.shader = sh
	for qx in [-1, 1]:
		for qz in [-1, 1]:
			var x0 := 5.5 if qx > 0 else -5.5
			var z0 := (10.0 if qx > 0 else 6.0) if qz > 0 else -6.0           # a farm path where the camera stands
			var w := 1400.0
			var f := MeshInstance3D.new()
			var p := PlaneMesh.new()
			p.size = Vector2(w, w)
			f.mesh = p
			f.material_override = paddy_mat
			f.position = Vector3(x0 + qx * w / 2.0, 0.03, z0 + qz * w / 2.0)
			add_child(f)

	# the road: raised to rail level over the crossing, ramping down to the fields
	var asphalt := mat(Color(0.72, 0.71, 0.7), 0.95, 0.0, tex("asphalt.png"), 0.5)
	_add_normal(asphalt, "asphalt_n.png", 0.8)
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var hw := 3.0
	var zs := []
	var z := -400.0
	while z <= 400.0:
		zs.append(z)
		z += 20.0 if absf(z) > 40.0 else 1.0
	for i in range(zs.size() - 1):
		var za: float = zs[i]
		var zb: float = zs[i + 1]
		var ya := _road_y(za)
		var yb := _road_y(zb)
		st.add_vertex(Vector3(-hw, ya, za)); st.add_vertex(Vector3(hw, ya, za)); st.add_vertex(Vector3(hw, yb, zb))
		st.add_vertex(Vector3(-hw, ya, za)); st.add_vertex(Vector3(hw, yb, zb)); st.add_vertex(Vector3(-hw, yb, zb))
		# the road's earth shoulders
		for s in [-1.0, 1.0]:
			var o := hw + 0.25 + maxf(ya, 0.05) * 2.0
			var o2 := hw + 0.25 + maxf(yb, 0.05) * 2.0
			var A := Vector3(s * hw, ya, za)
			var B := Vector3(s * hw, yb, zb)
			var C := Vector3(s * o2, 0.0, zb)
			var D := Vector3(s * o, 0.0, za)
			if s > 0:
				st.add_vertex(A); st.add_vertex(D); st.add_vertex(C)
				st.add_vertex(A); st.add_vertex(C); st.add_vertex(B)
			else:
				st.add_vertex(A); st.add_vertex(C); st.add_vertex(D)
				st.add_vertex(A); st.add_vertex(B); st.add_vertex(C)
	st.generate_normals()
	var road := MeshInstance3D.new()
	road.mesh = st.commit()
	road.material_override = asphalt
	add_child(road)
	# paint: edge lines and the stop lines before the crossing
	var paint := grime(Color(0.58, 0.58, 0.55), {"rough": 0.8, "dirt": 0.8, "streaks": 0.0, "rust": 0.0, "scale": 2.5})   # worn road paint
	for s in [-1.0, 1.0]:
		for seg in [[-400.0, -6.0], [6.0, 400.0]]:
			var a: float = seg[0]
			var b: float = seg[1]
			var mid := (a + b) / 2.0
			box(Vector3(0.12, 0.01, b - a), Vector3(s * (hw - 0.2), _road_y(mid) + 0.012, mid), paint)
	# stop lines: thin, and tilted to the ramp they sit on (flat, one edge floated above the asphalt)
	for z_stop in [9.0, -9.0]:
		var slope := atan2(_road_y(z_stop + 0.2) - _road_y(z_stop - 0.2), 0.4)
		var sl := box(Vector3(hw, 0.004, 0.35), Vector3(hw / 2.0 * signf(z_stop), _road_y(z_stop) + 0.004, z_stop), paint)
		sl.rotation.x = -slope

func _road_y(z: float) -> float:
	var a := absf(z)
	return lerpf(RAIL_TOP - 0.02, 0.06, smoothstep(2.2, 10.0, a))

# ---------------------------------------------------------------- track
func _build_track() -> void:
	var length := TRACK_MAX - TRACK_MIN
	var cx := (TRACK_MIN + TRACK_MAX) / 2.0
	var bsh := _ground_shader()
	var formation := ShaderMaterial.new()
	formation.shader = bsh
	formation.set_shader_parameter("alb", tex("verge.png"))
	formation.set_shader_parameter("nrm", tex("verge_n.png"))
	formation.set_shader_parameter("scale", 0.5)
	formation.set_shader_parameter("tint", Vector3(0.55, 0.52, 0.45))
	formation.set_shader_parameter("rust", 0.0)
	prism(length, 6.4, 4.6, 0.30, Vector3(cx, 0, 0), formation)                                   # earth formation
	var ballast := ShaderMaterial.new()
	ballast.shader = bsh
	ballast.set_shader_parameter("alb", tex("ballast.png"))
	ballast.set_shader_parameter("nrm", tex("ballast_n.png"))
	ballast.set_shader_parameter("scale", 0.85)
	ballast.set_shader_parameter("tint", Vector3(0.78, 0.76, 0.74))
	ballast.set_shader_parameter("rust", 1.0)
	_ballast_bed(ballast)

	# sleepers (PC, 2.0 m, every 0.6 m): concrete blocks + a textured, normal-mapped top; they stand ~3 cm proud
	var sleeper_top := mat(Color(0.72, 0.71, 0.68), 0.92, 0.0, tex("sleeper.png"))
	var sn := tex("sleeper_n.png")
	if sn:
		sleeper_top.normal_enabled = true
		sleeper_top.normal_texture = sn
		sleeper_top.normal_scale = 1.2
	var sleeper_body := mat(Color(0.42, 0.41, 0.39), 0.92)
	var n := int(length / 0.6)
	var bm := BoxMesh.new()
	bm.size = Vector3(0.22, 0.16, 2.0)
	var qm := QuadMesh.new()
	qm.size = Vector2(2.0, 0.22)
	var mm_body := MultiMesh.new()
	mm_body.transform_format = MultiMesh.TRANSFORM_3D
	mm_body.mesh = bm
	mm_body.instance_count = n
	var mm_top := MultiMesh.new()
	mm_top.transform_format = MultiMesh.TRANSFORM_3D
	mm_top.mesh = qm
	mm_top.instance_count = n
	var top_basis := Basis(Vector3.UP, PI / 2.0) * Basis(Vector3.RIGHT, -PI / 2.0)   # quad flat, its long side along Z
	var rng := RandomNumberGenerator.new()
	rng.seed = 1067
	var xs := []
	for i in n:
		var x := TRACK_MIN + 0.3 + i * 0.6
		var skip := absf(x) < 3.4                                                   # the crossing deck covers these
		if not skip:
			xs.append(x)
		var y := SLEEPER_TOP - 0.08 + (-10.0 if skip else 0.0)
		var wob := Basis(Vector3.UP, rng.randf_range(-0.012, 0.012))               # laid by hand, never quite square
		mm_body.set_instance_transform(i, Transform3D(wob, Vector3(x, y, 0)))
		mm_top.set_instance_transform(i, Transform3D(wob * top_basis, Vector3(x, y + 0.0805, 0)))
	for pair in [[mm_body, sleeper_body], [mm_top, sleeper_top]]:
		var mmi := MultiMeshInstance3D.new()
		mmi.multimesh = pair[0]
		mmi.material_override = pair[1]
		add_child(mmi)

	# rails (50 kg-ish, 150 mm): a polished running band on a dark steel head, rusty web and foot
	var rust := mat(Color(0.48, 0.38, 0.33), 0.85, 0.2, tex("rail_rust.png"), 1.0)
	var head_side := mat(Color(0.30, 0.28, 0.27), 0.45, 0.75)
	var shine := mat(Color(0.86, 0.86, 0.88), 0.16, 1.0)
	for s in [-1.0, 1.0]:
		var z: float = s * GAUGE / 2.0
		box(Vector3(length, 0.045, 0.064), Vector3(cx, RAIL_TOP - 0.0235, z), head_side)
		box(Vector3(length, 0.004, 0.044), Vector3(cx, RAIL_TOP - 0.0005, z), shine)
		var web_h := RAIL_TOP - 0.045 - SLEEPER_TOP - 0.012
		box(Vector3(length, web_h, 0.017), Vector3(cx, SLEEPER_TOP + 0.012 + web_h / 2.0, z), rust)
		box(Vector3(length, 0.013, 0.13), Vector3(cx, SLEEPER_TOP + 0.0065, z), rust)

	# fastenings near the camera: a rubber pad and two spring clips per rail seat (one MultiMesh each)
	var near_xs := []
	for x in xs:
		if x > -220.0 and x < 60.0:
			near_xs.append(x)
	var pad_m := BoxMesh.new()
	pad_m.size = Vector3(0.17, 0.008, 0.19)
	var clip_m := BoxMesh.new()
	clip_m.size = Vector3(0.09, 0.03, 0.05)
	var mm_pad := MultiMesh.new()
	mm_pad.transform_format = MultiMesh.TRANSFORM_3D
	mm_pad.mesh = pad_m
	mm_pad.instance_count = near_xs.size() * 2
	var mm_clip := MultiMesh.new()
	mm_clip.transform_format = MultiMesh.TRANSFORM_3D
	mm_clip.mesh = clip_m
	mm_clip.instance_count = near_xs.size() * 4
	var k := 0
	var c := 0
	for x in near_xs:
		for s in [-1.0, 1.0]:
			var z: float = s * GAUGE / 2.0
			mm_pad.set_instance_transform(k, Transform3D(Basis(), Vector3(x, SLEEPER_TOP + 0.002, z)))
			k += 1
			for side in [-1.0, 1.0]:
				var tilt := Basis(Vector3.RIGHT, side * 0.35)
				mm_clip.set_instance_transform(c, Transform3D(tilt, Vector3(x, SLEEPER_TOP + 0.02, z + side * 0.085)))
				c += 1
	for pair in [[mm_pad, mat(Color(0.05, 0.05, 0.05), 0.9)], [mm_clip, mat(Color(0.22, 0.17, 0.13), 0.6, 0.5)]]:
		var mmi := MultiMeshInstance3D.new()
		mmi.multimesh = pair[0]
		mmi.material_override = pair[1]
		mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(mmi)

# ballast bed: a lumpy grid (crib level just under the sleeper tops, shoulders sloping to the formation), finer near
# the camera; its tone, stains and stone relief come from _ground_shader
func _ballast_bed(m: Material) -> void:
	var noise := FastNoiseLite.new()
	noise.seed = 7
	noise.frequency = 0.9
	var prof := [-2.35, -2.05, -1.75, -1.5, -1.25, -1.0, -0.75, -0.5, -0.25, 0.0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.05, 2.35]
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var xs := []
	var x := TRACK_MIN
	while x < TRACK_MAX:
		xs.append(x)
		x += 0.4 if (x > -160.0 and x < 50.0) else 4.0
	xs.append(TRACK_MAX)
	for i in range(xs.size() - 1):
		var x0: float = xs[i]
		var x1: float = xs[i + 1]
		for j in range(prof.size() - 1):
			var z0: float = prof[j]
			var z1: float = prof[j + 1]
			var a := Vector3(x0, _bed_y(noise, x0, z0), z0)
			var b := Vector3(x1, _bed_y(noise, x1, z0), z0)
			var cc := Vector3(x1, _bed_y(noise, x1, z1), z1)
			var d := Vector3(x0, _bed_y(noise, x0, z1), z1)
			st.add_vertex(a); st.add_vertex(b); st.add_vertex(cc)
			st.add_vertex(a); st.add_vertex(cc); st.add_vertex(d)
	st.generate_normals()
	var mi := MeshInstance3D.new()
	mi.mesh = st.commit()
	mi.material_override = m
	add_child(mi)

func _bed_y(noise: FastNoiseLite, px: float, pz: float) -> float:
	var az := absf(pz)
	var top := SLEEPER_TOP - 0.035
	var y := top if az < 1.45 else lerpf(top, 0.29, clampf((az - 1.45) / 0.9, 0.0, 1.0))
	var lump := noise.get_noise_2d(px * 3.0, pz * 3.0) * 0.018 + noise.get_noise_2d(px * 0.4, pz * 0.4) * 0.02
	return y + (lump if az < 2.2 else 0.0)

# world-space triplanar ground: stone relief from a normal map (no tangents needed), crevices darkened from the albedo,
# and the brown iron dust that collects along and between the rails
func _ground_shader() -> Shader:
	var sh := Shader.new()
	sh.code = """
shader_type spatial;
render_mode diffuse_lambert_wrap;
uniform sampler2D alb : source_color, filter_linear_mipmap_anisotropic;
uniform sampler2D nrm : hint_normal, filter_linear_mipmap_anisotropic;
uniform float scale = 1.0;
uniform vec3 tint = vec3(1.0);
uniform float rust = 0.0;
uniform float gauge = 1.067;
varying vec3 wp;
varying vec3 wn;
void vertex() { wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; wn = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz); }
vec3 tri(sampler2D t, vec3 w) {
	return texture(t, wp.zy * scale).rgb * w.x + texture(t, wp.xz * scale).rgb * w.y + texture(t, wp.xy * scale).rgb * w.z;
}
void fragment() {
	vec3 bw = pow(abs(wn), vec3(4.0)); bw /= bw.x + bw.y + bw.z;
	vec3 a = tri(alb, bw);
	// a second, larger and rotated sample breaks the tiling at a distance
	vec2 r = mat2(vec2(0.8, 0.6), vec2(-0.6, 0.8)) * wp.xz * scale * 0.37;
	a = mix(a, texture(alb, r).rgb, 0.35 * bw.y);
	float lum = dot(a, vec3(0.333));
	a *= mix(0.5, 1.05, smoothstep(0.18, 0.62, lum));                      // shadowed gaps between stones
	float d = length(wp - CAMERA_POSITION_WORLD);
	// iron dust: brown along the rails, a little all over the crib
	float along = exp(-pow((abs(wp.z) - gauge * 0.5) / 0.22, 2.0)) + 0.35 * step(abs(wp.z), gauge * 0.5);
	a = mix(a, a * vec3(0.72, 0.52, 0.38), clamp(along, 0.0, 1.0) * rust * 0.75);
	ALBEDO = a * tint;
	// relief: tilt the world normal by the top projection normal map
	vec3 nm = texture(nrm, wp.xz * scale).rgb * 2.0 - 1.0;
	float k = bw.y * (1.0 - smoothstep(10.0, 45.0, d));
	vec3 n = normalize(wn + vec3(nm.x, 0.0, -nm.y) * 0.9 * k);
	NORMAL = normalize((VIEW_MATRIX * vec4(n, 0.0)).xyz);
	ROUGHNESS = 0.95;
	SPECULAR = 0.25;
}
"""
	return sh

	# the crossing deck between and beside the rails
	var deck := mat(Color(0.62, 0.62, 0.62), 0.97, 0.0, tex("crossing_panel.png"), 0.8)
	deck.metallic_specular = 0.2
	box(Vector3(6.6, 0.12, 0.88), Vector3(0, RAIL_TOP - 0.065, 0), deck)
	for s in [-1.0, 1.0]:
		box(Vector3(6.6, 0.12, 0.9), Vector3(0, RAIL_TOP - 0.065, s * (GAUGE / 2.0 + 0.53)), deck)

# ---------------------------------------------------------------- overhead line (屏東線 is electrified)
func _build_catenary() -> void:
	var steel := grime(Color(0.48, 0.5, 0.5), {"rough": 0.6, "metal": 0.5, "dirt": 0.4, "streaks": 0.8, "rust": 0.6, "splash": 0.6, "splash_h": 0.8, "scale": 1.5})
	var wire := mat(Color(0.12, 0.1, 0.08), 0.5, 0.8)
	var x := TRACK_MIN + 20.0
	while x < TRACK_MAX:
		if absf(x) > 8.0:
			box(Vector3(0.28, 7.6, 0.28), Vector3(x, 3.8, -3.1), steel)
			box(Vector3(0.09, 0.09, 3.4), Vector3(x, 6.45, -1.5), steel)              # cantilever
			box(Vector3(0.06, 1.3, 0.06), Vector3(x, 5.85, -0.15), steel)             # dropper tube
		x += 48.0
	var length := TRACK_MAX - TRACK_MIN
	var cx := (TRACK_MIN + TRACK_MAX) / 2.0
	for p in [[5.3, 0.016], [6.4, 0.02]]:
		var w := box(Vector3(length, p[1], p[1]), Vector3(cx, p[0], 0.0), wire)
		w.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF

	# roadside concrete power poles along the road, wires between them
	var concrete := grime(Color(0.62, 0.62, 0.6), {"rough": 0.9, "dirt": 0.7, "streaks": 0.9, "splash": 0.8, "splash_h": 1.0, "scale": 1.2})
	var zz := -380.0
	while zz < 120.0:
		if absf(zz) > 12.0:
			cyl(0.13, 10.0, Vector3(-5.2, 5.0, zz), concrete, self, 8)
			box(Vector3(1.6, 0.1, 0.1), Vector3(-5.2, 9.3, zz), concrete)
		zz += 36.0
	for wx in [-5.85, -4.55]:
		var w2 := box(Vector3(0.018, 0.018, 500.0), Vector3(wx, 9.25, -130.0), wire)
		w2.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF

# ---------------------------------------------------------------- the crossing: alarm posts + barriers
func _build_crossing() -> void:
	var red_on := Color(1.0, 0.12, 0.05)
	for i in 2:
		var m := StandardMaterial3D.new()
		m.albedo_color = Color(0.25, 0.02, 0.02)
		m.emission_enabled = true
		m.emission = red_on
		m.emission_energy_multiplier = 0.0
		m.roughness = 0.3
		lamp_mats.append(m)
		halo_mats.append(halo_material(Color(1.0, 0.18, 0.08, 0.0)))
	# near post on the camera's side (right of the road), far post across the track (left of the road)
	_post(Vector3(3.75, 0, 3.4), -1.0)
	_post(Vector3(-3.75, 0, -3.4), 1.0)

func _post(base: Vector3, arm_sign: float) -> void:
	var root := Node3D.new()
	root.position = base
	add_child(root)
	var sh := Shader.new()
	sh.code = """
shader_type spatial;
void fragment() { float b = step(0.5, fract(UV.y * 12.0)); ALBEDO = mix(vec3(0.02), vec3(0.85, 0.62, 0.04), b); ROUGHNESS = 0.55; }
"""
	var seed := base.x * 3.1
	var stripe := grime(Color(1, 1, 1), {"stripes": 12.0, "rough": 0.6, "dirt": 0.55, "streaks": 0.5, "splash": 0.9, "splash_h": 0.7, "rust": 0.55, "scale": 2.0, "seed": seed})
	var black := grime(Color(0.035, 0.035, 0.035), {"rough": 0.6, "dirt": 0.3, "rust": 0.3, "scale": 3.0, "seed": seed})
	var yellow := grime(Color(0.82, 0.63, 0.06), {"rough": 0.55, "dirt": 0.6, "streaks": 0.6, "rust": 0.45, "scale": 3.0, "seed": seed + 1.0})
	cyl(0.075, 3.9, Vector3(0, 1.95, 0), stripe, root)
	box(Vector3(0.4, 0.12, 0.4), Vector3(0, 0.06, 0), grime(Color(0.5, 0.5, 0.48), {"rough": 0.95, "dirt": 0.8, "splash": 1.0, "splash_h": 0.3, "scale": 3.0, "seed": seed}), root)
	# crossbuck
	for a in [0.62, -0.62]:
		var bk := box(Vector3(1.3, 0.2, 0.03), Vector3(0, 3.62, 0.0), black, root)
		bk.rotation.z = a
		var yl := box(Vector3(1.24, 0.14, 0.035), Vector3(0, 3.62, 0.0), yellow, root)
		yl.rotation.z = a
	# lamp bar with two lamps per face, both faces; turned toward the line (as many rural crossings are), which also
	# shows the lamps to the camera standing beside the track
	var head := Node3D.new()
	head.rotation.y = 0.7
	root.add_child(head)
	box(Vector3(1.0, 0.07, 0.07), Vector3(0, 2.62, 0), black, head)
	for side in 2:
		var lx := -0.38 if side == 0 else 0.38
		for face in [-1.0, 1.0]:
			var back := cyl(0.27, 0.03, Vector3(lx, 2.62, face * 0.07), black, head, 20)
			back.rotation.x = PI / 2.0
			var lens := cyl(0.115, 0.05, Vector3(lx, 2.62, face * 0.1), lamp_mats[side], head, 16)
			lens.rotation.x = PI / 2.0
			var hood := box(Vector3(0.3, 0.025, 0.16), Vector3(lx, 2.76, face * 0.16), black, head)
			hood.rotation.x = -face * 0.25
			halo(1.9, Vector3(lx, 2.62, face * 0.2), halo_mats[side], head)
	var ol := OmniLight3D.new()
	ol.light_color = Color(1.0, 0.15, 0.05)
	ol.omni_range = 8.0
	ol.light_energy = 0.0
	ol.position = Vector3(0, 2.4, 0.6)
	root.add_child(ol)
	lamp_lights.append(ol)
	# barrier: machine box, pivot, striped arm with a counterweight
	box(Vector3(0.36, 0.75, 0.32), Vector3(arm_sign * 0.32, 0.55, 0.0), grime(Color(0.72, 0.66, 0.2), {"rough": 0.6, "dirt": 0.7, "streaks": 0.8, "splash": 1.0, "splash_h": 0.65, "rust": 0.5, "scale": 3.0, "seed": seed + 2.0}), root)
	var piv := Node3D.new()
	piv.position = Vector3(arm_sign * 0.32, 0.8, 0.2)
	root.add_child(piv)
	var arm_m := grime(Color(1, 1, 1), {"tex": tex("barrier_stripe.png"), "uv_scale": Vector2(3.0, 1.0), "rough": 0.6, "dirt": 0.5, "streaks": 0.3, "rust": 0.25, "scale": 2.5, "seed": seed + 3.0})
	var arm_len := 4.2
	var arm := box(Vector3(arm_len, 0.09, 0.09), Vector3(arm_sign * (arm_len / 2.0 + 0.04), 0, 0), arm_m, piv)
	var iron := grime(Color(0.2, 0.2, 0.2), {"rough": 0.7, "dirt": 0.5, "rust": 0.6, "scale": 4.0, "seed": seed})
	# the hub on the machine's shaft, a clamp plate holding the arm, and a short counterweight on the other side
	var hub := cyl(0.085, 0.14, Vector3(0, 0, -0.06), iron, piv, 14)
	hub.rotation.x = PI / 2.0
	box(Vector3(0.34, 0.14, 0.03), Vector3(arm_sign * 0.12, 0, 0.055), iron, piv)
	box(Vector3(0.26, 0.15, 0.1), Vector3(-arm_sign * 0.2, 0, 0), iron, piv)
	arm_pivots.append({"node": piv, "sign": arm_sign})

# ---------------------------------------------------------------- street lamp (on at night)
func _build_street() -> void:
	var grey := grime(Color(0.55, 0.56, 0.55), {"rough": 0.6, "metal": 0.3, "dirt": 0.5, "streaks": 0.7, "rust": 0.35, "splash": 0.7, "splash_h": 0.8, "scale": 1.5})
	cyl(0.09, 7.0, Vector3(-4.6, 3.5, 7.5), grey, self, 10)
	box(Vector3(1.8, 0.08, 0.08), Vector3(-3.8, 6.95, 7.5), grey)
	street_mat = StandardMaterial3D.new()
	street_mat.albedo_color = Color(0.3, 0.25, 0.2)
	street_mat.emission_enabled = true
	street_mat.emission = Color(1.0, 0.72, 0.38)
	street_mat.emission_energy_multiplier = 0.0
	box(Vector3(0.5, 0.1, 0.22), Vector3(-3.0, 6.9, 7.5), street_mat)
	street_light = OmniLight3D.new()
	street_light.light_color = Color(1.0, 0.72, 0.42)
	street_light.omni_range = 16.0
	street_light.light_energy = 0.0
	street_light.position = Vector3(-3.0, 6.6, 7.5)
	add_child(street_light)

# ---------------------------------------------------------------- the train
func _build_train_pool() -> void:
	var side_opts := {"tex": tex("emu_side.png"), "em": tex("emu_side_emissive.png"), "rough": 0.62, "metal": 0.18,
		"dirt": 0.5, "streaks": 0.9, "splash": 1.5, "splash_h": 2.5, "rust": 0.08, "scale": 0.8, "top_y": 1.5, "top_dirt": 0.8, "glass": true}
	var grimes := [tex("emu_grime_a.png"), tex("emu_grime_b.png")]
	if grimes[0]:
		side_opts.merge({"dirt": 0.12, "streaks": 0.15, "splash": 0.5, "rust": 0.0, "top_dirt": 0.25}, true)
	var body := grime(Color(0.62, 0.64, 0.66), {"rough": 0.62, "metal": 0.25, "dirt": 0.6, "streaks": 0.7, "splash": 1.0, "splash_h": 2.0, "scale": 1.0})
	var roof := grime(Color(0.42, 0.42, 0.42), {"rough": 0.75, "metal": 0.3, "dirt": 0.9, "streaks": 0.4, "rust": 0.35, "scale": 1.5})
	var under := mat(Color(0.07, 0.07, 0.07), 0.8, 0.2)
	head_mat = StandardMaterial3D.new()
	head_mat.albedo_color = Color(1, 1, 0.9)
	head_mat.emission_enabled = true
	head_mat.emission = Color(1.0, 0.95, 0.85)
	head_mat.emission_energy_multiplier = 4.0
	head_halo_mat = halo_material(Color(1.0, 0.92, 0.8, 0.6))
	var tail_mat := StandardMaterial3D.new()
	tail_mat.albedo_color = Color(0.4, 0, 0)
	tail_mat.emission_enabled = true
	tail_mat.emission = Color(1, 0.05, 0.02)
	tail_mat.emission_energy_multiplier = 3.0
	var body_len := CAR_LEN - CAR_GAP

	# one merged mesh per car type (a surface per material) instead of ~10 boxes per car: far fewer draw calls
	var car_meshes := []
	for variant in 2:
		var parts := {body: [], roof: [], under: []}
		parts[body].append([Vector3(body_len, 3.0, 2.86), Vector3(0, 2.7, 0), 0.0])
		parts[roof].append([Vector3(body_len, 0.18, 2.6), Vector3(0, 4.27, 0), 0.0])
		parts[roof].append([Vector3(3.2, 0.35, 1.6), Vector3(-body_len * 0.25, 4.5, 0), 0.0])          # roof AC unit
		if variant == 0:
			parts[roof].append([Vector3(1.8, 0.3, 1.2), Vector3(body_len * 0.28, 4.5, 0), 0.0])
		parts[under].append([Vector3(CAR_LEN - 0.02, 2.5, 1.3), Vector3(0, 2.55, 0), 0.0])            # gangways show in the gaps
		parts[under].append([Vector3(body_len - 4.0, 0.55, 2.3), Vector3(0, 0.95, 0), 0.0])
		for bx in [-1.0, 1.0]:
			parts[under].append([Vector3(2.7, 0.62, 2.2), Vector3(bx * (body_len / 2.0 - 2.6), 0.95, 0), 0.0])
		car_meshes.append(_merged(parts))

	# the cab (both ends of the set): a vertical lower front with a black headlight band, a windscreen raked back,
	# a lit destination sign. Built facing +X from x = 0 (the body end).
	var cab_white := grime(Color(0.80, 0.80, 0.78), {"rough": 0.45, "metal": 0.2, "dirt": 0.55, "streaks": 0.8, "splash": 1.4, "splash_h": 2.3, "scale": 1.2})
	var cab_black := grime(Color(0.03, 0.03, 0.035), {"rough": 0.3, "dirt": 0.35, "splash": 0.8, "splash_h": 2.0, "scale": 1.5})
	var cab_glass := mat(Color(0.015, 0.02, 0.03), 0.03, 0.6)
	var rake := 0.30
	var cab_parts := {cab_white: [], cab_black: [], cab_glass: []}
	cab_parts[cab_white].append([Vector3(0.42, 1.30, 2.86), Vector3(0.21, 1.85, 0), 0.0])            # lower front
	cab_parts[cab_white].append([Vector3(0.14, 1.85, 2.84), Vector3(0.20, 3.38, 0), rake])           # raked upper front
	cab_parts[cab_white].append([Vector3(0.30, 1.85, 2.86), Vector3(0.0, 3.35, 0), 0.0])             # fills behind it
	cab_parts[cab_black].append([Vector3(0.44, 0.42, 2.88), Vector3(0.22, 1.72, 0), 0.0])            # headlight band
	cab_parts[cab_black].append([Vector3(0.44, 0.10, 2.88), Vector3(0.22, 1.18, 0), 0.0])            # skirt edge
	cab_parts[cab_glass].append([Vector3(0.03, 1.15, 2.5), Vector3(0.30, 3.28, 0), rake])            # windscreen
	var cab_mesh := _merged(cab_parts)
	var sign_mat := StandardMaterial3D.new()
	sign_mat.albedo_color = Color(0.1, 0.08, 0.05)
	sign_mat.emission_enabled = true
	sign_mat.emission = Color(1.0, 0.62, 0.25)
	sign_mat.emission_energy_multiplier = 1.5

	var count := int(ceil((VIEW_NEAR - VIEW_FAR) / CAR_LEN)) + 2
	for i in count:
		var car := Node3D.new()
		car.visible = false
		add_child(car)
		var mi := MeshInstance3D.new()
		mi.mesh = car_meshes[i % 2]
		car.add_child(mi)
		var side := MeshInstance3D.new()
		var q := QuadMesh.new()
		q.size = Vector2(body_len, 3.0)
		side.mesh = q
		var per := {"seed": float(i) * 1.73}
		if grimes[0]:
			per["grime"] = grimes[i % 2] if grimes[1] else grimes[0]
			per["grime_amt"] = 1.0 + 0.35 * fposmod(float(i) * 0.618, 1.0)
		var sm := grime(Color(1, 1, 1), side_opts.merged(per))
		car_side_mats.append(sm)
		side.material_override = sm
		side.position = Vector3(0, 2.7, 1.435)
		side.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF          # the body box already casts it
		car.add_child(side)
		# leading cab: headlights + their halos, destination sign
		var nose := Node3D.new()
		nose.position = Vector3(body_len / 2.0, 0, 0)
		car.add_child(nose)
		var nm := MeshInstance3D.new()
		nm.mesh = cab_mesh
		nose.add_child(nm)
		for z in [-0.95, 0.95]:
			box(Vector3(0.04, 0.16, 0.36), Vector3(0.45, 1.72, z), head_mat, nose)
			halo(2.6, Vector3(0.75, 1.72, z), head_halo_mat, nose)
		var sg := box(Vector3(0.02, 0.2, 0.9), Vector3(0.47, 4.02, 0), sign_mat, nose)
		sg.rotation.z = rake
		# trailing cab (the last car of a finished train): same cab turned round, red tail lights
		var tail := Node3D.new()
		tail.position = Vector3(-body_len / 2.0, 0, 0)
		tail.rotation.y = PI
		car.add_child(tail)
		var tm := MeshInstance3D.new()
		tm.mesh = cab_mesh
		tail.add_child(tm)
		for z in [-0.95, 0.95]:
			box(Vector3(0.04, 0.12, 0.24), Vector3(0.45, 1.72, z), tail_mat, tail)
		pool.append({"node": car, "nose": nose, "tail": tail})
	head_spot = SpotLight3D.new()
	head_spot.light_color = Color(1.0, 0.94, 0.82)
	head_spot.spot_range = 45.0
	head_spot.spot_angle = 14.0
	head_spot.light_energy = 0.0
	head_spot.shadow_enabled = false
	add_child(head_spot)
	head_spot.rotation = Vector3(0, -PI / 2.0, 0)                    # SpotLight shines along -Z → rotate to +X
	head_spot.rotate_object_local(Vector3.RIGHT, -0.05)

# boxes grouped by material → one ArrayMesh with a surface per material. part = [size, centre, roll about Z]
func _merged(parts: Dictionary) -> ArrayMesh:
	var am := ArrayMesh.new()
	for m in parts:
		var st := SurfaceTool.new()
		st.begin(Mesh.PRIMITIVE_TRIANGLES)
		for p in parts[m]:
			var bm := BoxMesh.new()
			bm.size = p[0]
			st.append_from(bm, 0, Transform3D(Basis(Vector3.BACK, p[2]), p[1]))
		st.commit(am)
		am.surface_set_material(am.get_surface_count() - 1, m)
	return am

# ---------------------------------------------------------------- foreground plants
# Cross-quads (two planes at 90°) cut from Codex's 4x2 foliage atlas, one MultiMesh (one draw call): rice hills in rows
# in the paddies near the camera, weeds on the farm path, along the formation and the road verges. They sway in the
# wind and bow to the gust of a passing train.
func _build_foliage() -> void:
	var atlas := tex("foliage/foliage_atlas.png")
	if atlas == null:
		return
	var sh := Shader.new()
	sh.code = """
shader_type spatial;
render_mode cull_disabled, diffuse_lambert_wrap, specular_disabled;
uniform sampler2D atlas : source_color, filter_linear_mipmap_anisotropic, repeat_disable;
uniform float wind_t = 0.0;
uniform float gust = 0.0;
varying float vh;
varying vec3 vtint;
void vertex() {
	float cell = INSTANCE_CUSTOM.x;
	vec2 c = vec2(mod(cell, 4.0), floor(cell / 4.0));
	UV = (c + UV) / vec2(4.0, 2.0);
	vh = VERTEX.y;
	vtint = COLOR.rgb;
	vec3 wp = (MODEL_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
	float ph = wp.x * 0.13 + wp.z * 0.09 + INSTANCE_CUSTOM.y * 6.2831;
	float sway = sin(wind_t * 1.1 + ph) * 0.6 + sin(wind_t * 2.7 + ph * 1.9) * 0.25;
	float near_line = exp(-abs(wp.z) * 0.18);                                 // the train's wind fades away from the track
	float g = gust * near_line;
	float flutter = sin(wind_t * 11.0 + ph * 3.0) * 0.5 + 0.5;
	float bend = vh * vh * INSTANCE_CUSTOM.z;
	// local space: instances are rotated randomly, so push in world X/Z via the inverse basis
	vec3 push_w = vec3(sway * 0.10 + g * (0.30 + 0.15 * flutter), 0.0, sway * 0.05 - g * 0.12);
	mat3 inv = inverse(mat3(MODEL_MATRIX));
	VERTEX += inv * push_w * bend;
	VERTEX.y -= length(push_w) * bend * 0.35;
	NORMAL = normalize(mix(NORMAL, vec3(0.0, 1.0, 0.0), 0.65));            // light foliage like a canopy, not like cards
}
void fragment() {
	vec4 a = texture(atlas, UV);
	ALBEDO = a.rgb * vtint * mix(0.45, 1.0, smoothstep(0.0, 0.7, vh));      // darker in the clump's base
	ALPHA = a.a;
	ALPHA_SCISSOR_THRESHOLD = 0.45;
	ALPHA_ANTIALIASING_EDGE = 0.25;
	ALPHA_TEXTURE_COORDINATE = UV * vec2(2048.0, 1024.0);
	BACKLIGHT = vec3(0.16, 0.19, 0.06) * a.a * vtint;
	ROUGHNESS = 0.9;
}
"""
	foliage_mat = ShaderMaterial.new()
	foliage_mat.shader = sh
	foliage_mat.set_shader_parameter("atlas", atlas)

	# the cross-quad: base at y = 0, 1 m tall and wide; UV v = 1 at the base
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for k in 2:
		var d := Vector3(0.5, 0, 0) if k == 0 else Vector3(0, 0, 0.5)
		var n := Vector3(0, 0, 1) if k == 0 else Vector3(1, 0, 0)
		var v := [-d, d, d + Vector3(0, 1, 0), -d + Vector3(0, 1, 0)]
		var uv := [Vector2(0, 1), Vector2(1, 1), Vector2(1, 0), Vector2(0, 0)]
		for idx in [0, 1, 2, 0, 2, 3]:
			st.set_normal(n)
			st.set_uv(uv[idx])
			st.add_vertex(v[idx])
	var mesh := st.commit()

	var rng := RandomNumberGenerator.new()
	rng.seed = 20261002
	var items := []                                   # [pos, yaw, scale, cell, sway, tint]
	var campos := Vector2(16.0, 7.5)
	# rice hills in rows (30 cm), within ~26 m of the camera, in the three paddies it can see
	var fields := [Rect2(5.6, 10.2, 16.0, 40.0), Rect2(-60.0, 6.2, 54.4, 46.0), Rect2(5.6, -50.0, 22.0, 43.8)]
	for f in fields:
		var r: Rect2 = f
		var x := r.position.x + 0.15
		while x < r.end.x:
			var z := r.position.y + 0.15
			while z < r.end.y:
				var dcam := Vector2(x, z).distance_to(campos)
				var keep := dcam < 22.0 or (dcam < 45.0 and rng.randf() < 1.0 - (dcam - 22.0) / 23.0)
				if keep and dcam > 2.0:
					var p := Vector3(x + rng.randf_range(-0.04, 0.04), 0.03, z + rng.randf_range(-0.04, 0.04))
					var cell := 0 if rng.randf() < 0.6 else 1
					items.append([p, rng.randf() * TAU, rng.randf_range(0.55, 0.75), cell, 0.9, Color(0.60, 0.64, 0.48).darkened(rng.randf() * 0.25)])
				z += 0.3
			x += 0.3
	# weeds: the farm path, the formation toes, the road verges
	var weed_cells := [2, 2, 3, 3, 4, 5, 6, 7]
	var areas := [[Rect2(4.5, 3.4, 40.0, 6.6), 3.2], [Rect2(-160.0, 2.9, 156.0, 1.3), 0.7], [Rect2(-160.0, -4.2, 156.0, 1.3), 0.7],
		[Rect2(4.5, -6.0, 40.0, 2.6), 1.0], [Rect2(3.3, -40.0, 1.8, 80.0), 0.9], [Rect2(-5.1, -40.0, 1.8, 80.0), 0.9]]
	for a in areas:
		var r: Rect2 = a[0]
		var n := int(r.get_area() * float(a[1]))
		for i in n:
			var p := Vector3(rng.randf_range(r.position.x, r.end.x), 0.0, rng.randf_range(r.position.y, r.end.y))
			var dcam := Vector2(p.x, p.z).distance_to(campos)
			if dcam < 2.5 or dcam > 70.0:
				continue
			if absf(p.x) < 3.6 and absf(p.z) < 12.0:
				continue                                  # keep the crossing and its approaches clear
			var cell: int = weed_cells[rng.randi() % weed_cells.size()]
			var sc := rng.randf_range(0.25, 0.7) * (1.6 if cell == 5 else 1.0)
			items.append([p, rng.randf() * TAU, sc, cell, 1.0, Color(0.85, 0.85, 0.75).darkened(rng.randf() * 0.3)])

	# 10 m blocks, one MultiMesh each: in the Compatibility renderer every light re-draws each object it touches, so a
	# single field-wide MultiMesh was drawn again in full for the headlight, the street lamp and each alarm lamp
	var cells := {}
	for it in items:
		var p: Vector3 = it[0]
		var key := Vector2i(int(floor(p.x / 10.0)), int(floor(p.z / 10.0)))
		if not cells.has(key):
			cells[key] = []
		cells[key].append(it)
	for key in cells:
		var list: Array = cells[key]
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_colors = true
		mm.use_custom_data = true
		mm.mesh = mesh
		mm.instance_count = list.size()
		for i in list.size():
			var it: Array = list[i]
			var b := Basis(Vector3.UP, it[1]).scaled(Vector3.ONE * float(it[2]))
			mm.set_instance_transform(i, Transform3D(b, it[0]))
			mm.set_instance_color(i, it[5])
			mm.set_instance_custom_data(i, Color(float(it[3]), rng.randf(), float(it[4]), 0.0))
		var mmi := MultiMeshInstance3D.new()
		mmi.multimesh = mm
		mmi.material_override = foliage_mat
		mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(mmi)
	foliage_count = items.size()

# ---------------------------------------------------------------- state
func _poll() -> void:
	if not OS.has_feature("web"):
		return
	var s = JavaScriptBridge.eval("JSON.stringify(window.wpCtl || {})", true)
	var d = JSON.parse_string(str(s))
	if d is Dictionary:
		state = str(d.get("state", "clear"))
		hours = float(d.get("hours", 12.0))
		warp = float(d.get("warp", 0.0))
		dbg = str(d.get("dbg", ""))
		var ss = d.get("sessions", [])
		sessions = ss if ss is Array else []
		moon_phase = float(d.get("moon", 0.5))

func _process(dt: float) -> void:
	dt = minf(dt, 0.1)
	t += dt
	poll_t += dt
	if poll_t > 0.5 and dbg.find("nopoll") < 0:
		poll_t = 0.0
		_poll()
		if absf(hours - applied_hours) > 0.01:
			applied_hours = hours
			_apply_time()
	_drive_train(dt)
	_drive_crossing(dt)
	paddy_mat.set_shader_parameter("wind_t", t)
	var cov_target := {"overcast": 0.55, "waiting": 0.5, "storm": 0.48}.get(state, 0.40) as float
	cloud_cover = move_toward(cloud_cover, cov_target, dt * 0.004)          # ~a minute to gather or thin
	cloud_mat.set_shader_parameter("cover", cloud_cover)
	if foliage_mat:
		var g_target := clampf(speed / RUN_SPEED, 0.0, 1.0) if train_on and head_x > -60.0 and _tail_x() < 40.0 else 0.0
		gust = move_toward(gust, g_target, dt * (0.8 if g_target > gust else 0.35))
		foliage_mat.set_shader_parameter("wind_t", t)
		foliage_mat.set_shader_parameter("gust", gust)

func _drive_train(dt: float) -> void:
	var target := 0.0
	var busy := _busy_sessions()
	match state:
		"storm":
			if not train_on:
				_spawn(VIEW_FAR + 5.0, RUN_SPEED)
			closing = false
			_extend_procession(busy)
			target = RUN_SPEED
		"overcast":
			if not train_on:
				_spawn(VIEW_FAR + 5.0, 9.0)
			if not closing and head_x > 0.0:
				_finish_train()
			# creep up and wait short of the crossing (unless it is already through)
			target = clampf((-38.0 - head_x) * 0.22, 0.0, 9.0) if head_x < -30.0 else RUN_SPEED * 0.6
		"waiting":
			if not train_on:
				_spawn(-120.0, 8.0)
				sets[0]["n"] = 9
				closing = true
			# stand across the crossing
			target = clampf((70.0 - head_x) * 0.15, 0.0, 8.0) if head_x < 70.0 else 0.0
			if _tail_x() > -2.0:
				target = RUN_SPEED * 0.5                             # too short to block it: just move on
		_:
			if train_on and not closing:
				_finish_train()
			target = RUN_SPEED * (0.8 if head_x > -40.0 else 1.0)
	if not train_on:
		return
	var accel := 1.6 if target > speed else 2.2
	speed = move_toward(speed, target, accel * dt)
	head_x += speed * dt
	# the leading train has gone by: the next one in the procession leads
	while sets.size() > 0 and int(sets[0]["n"]) > 0 and head_x - int(sets[0]["n"]) * CAR_LEN > VIEW_NEAR + 10.0:
		if sets.size() == 1:
			train_on = false
			sets.clear()
			break
		var d: float = sets[1]["off"]
		head_x -= d
		sets.remove_at(0)
		for s in sets:
			s["off"] = float(s["off"]) - d
	if train_on:
		_place_cars()

# Claude sessions that are working right now (slot numbers 0..4); the whole state stands in when there are none
func _busy_sessions() -> Array:
	var b := []
	for i in sessions.size():
		if str(sessions[i]) == "storm":
			b.append(i)
	if b.is_empty() and state == "storm":
		b.append(0)
	return b

func _next_livery(busy: Array) -> int:
	if busy.is_empty():
		return 0
	rot += 1
	return int(busy[rot % busy.size()])

# One working session: one endless train in its colours. Two or more: short trains (TRAIN_CARS) in each session's
# colours, nose to tail with a short headway, taking turns.
func _extend_procession(busy: Array) -> void:
	var last: Dictionary = sets[sets.size() - 1]
	if int(last["n"]) < 0:
		if busy.size() >= 2:
			last["n"] = maxi(TRAIN_CARS, _cars_to_far(last))
		elif busy.size() == 1 and int(last["liv"]) != int(busy[0]) and _cars_to_far(last) > 1:
			last["n"] = _cars_to_far(last)                       # another session took over: its train follows
	if int(last["n"]) > 0:
		var tail_x := head_x - float(last["off"]) - int(last["n"]) * CAR_LEN
		if tail_x - HEADWAY > VIEW_FAR - 60.0:
			sets.append({"off": float(last["off"]) + int(last["n"]) * CAR_LEN + HEADWAY, "base": int(last["base"]) + int(last["n"]),
				"n": TRAIN_CARS if busy.size() >= 2 else -1, "liv": _next_livery(busy)})

# cars from a set's front to just past the far end of the view (so closing it never removes a car on screen)
func _cars_to_far(s: Dictionary) -> int:
	return maxi(1, int(floor((head_x - float(s["off"]) - VIEW_FAR) / CAR_LEN)) + 1)

func _spawn(x: float, v: float) -> void:
	train_on = true
	head_x = x
	speed = v
	closing = false
	car_serial += 1000
	sets = [{"off": 0.0, "n": -1, "base": car_serial, "liv": _next_livery(_busy_sessions())}]

func _finish_train() -> void:
	closing = true
	var last: Dictionary = sets[sets.size() - 1]
	if int(last["n"]) < 0:
		last["n"] = _cars_to_far(last)

func _tail_x() -> float:
	if not train_on or not closing or sets.is_empty():
		return -INF
	var last: Dictionary = sets[sets.size() - 1]
	if int(last["n"]) < 0:
		return -INF
	return head_x - float(last["off"]) - int(last["n"]) * CAR_LEN

# a car keeps its pool slot (and so its own dirt) for as long as it is on screen: slot = serial number mod pool size
func _place_cars() -> void:
	var used := []
	used.resize(pool.size())
	used.fill(false)
	for s in sets:
		var off: float = s["off"]
		var n: int = s["n"]
		var front := head_x - off
		var i0 := maxi(0, int(floor((front - VIEW_NEAR) / CAR_LEN)))
		var i1 := int(floor((front - VIEW_FAR) / CAR_LEN))
		if n > 0:
			i1 = mini(i1, n - 1)
		for i in range(i0, i1 + 1):
			var k: int = (int(s["base"]) + i) % pool.size()
			if used[k]:
				continue
			used[k] = true
			var c: Dictionary = pool[k]
			var node: Node3D = c["node"]
			node.visible = true
			node.position = Vector3(front - (i + 0.5) * CAR_LEN, 0, 0)
			var ph := float(int(s["base"]) + i) * 2.39
			var sway := clampf(speed / RUN_SPEED, 0.0, 1.0)
			node.rotation = Vector3((0.004 + 0.006 * sway * sin(t * 1.7 + ph)) * (1.0 if fposmod(ph, 2.0) > 1.0 else -1.0), 0.0025 * sin(ph * 3.1), 0.0)
			c["nose"].visible = i == 0
			c["tail"].visible = n > 0 and i == n - 1
			var liv: int = s["liv"]
			if int(c.get("liv", -1)) != liv:
				c["liv"] = liv
				var pal: Array = LIVERIES[liv % LIVERIES.size()]
				var sm: ShaderMaterial = car_side_mats[k]
				sm.set_shader_parameter("recolor", pal[0] != null)
				if pal[0] != null:
					sm.set_shader_parameter("stripe_a", pal[0])
					sm.set_shader_parameter("stripe_b", pal[1])
	for j in pool.size():
		if not used[j]:
			pool[j]["node"].visible = false
	head_spot.visible = train_on and head_x < VIEW_NEAR
	head_spot.position = Vector3(head_x + 0.3, 1.7, 0)

func _drive_crossing(dt: float) -> void:
	# the alarm rings while a train is near (approaching within 280 m, or still on the crossing)
	var ringing := train_on and head_x > -280.0 and _tail_x() < 6.0
	alarm_time = alarm_time + dt if ringing else 0.0
	var want_down := alarm_time > 5.0
	gate = move_toward(gate, 1.0 if want_down else 0.0, dt / (6.0 if want_down else 4.5))
	var g := smoothstep(0.0, 1.0, gate)
	for p in arm_pivots:
		p["node"].rotation.z = p["sign"] * 1.45 * (1.0 - g)              # raised = the arm swings up
	# lamps alternate ≈ 45 flashes/min each, with a short incandescent-like ramp
	var on := alarm_time > 0.0
	var ph := fmod(t * 0.75, 1.0)
	var a := smoothstep(0.0, 0.06, ph) * (1.0 - smoothstep(0.46, 0.52, ph))
	var b := smoothstep(0.5, 0.56, ph) * (1.0 - smoothstep(0.96, 1.0, ph))
	if not on:
		a = 0.0
		b = 0.0
	var boost := 2.0 + 4.0 * night
	lamp_mats[0].emission_energy_multiplier = a * boost
	lamp_mats[1].emission_energy_multiplier = b * boost
	halo_mats[0].albedo_color.a = a * (0.35 + 0.65 * night)
	halo_mats[1].albedo_color.a = b * (0.35 + 0.65 * night)
	for i in lamp_lights.size():
		var l: OmniLight3D = lamp_lights[i]
		l.light_energy = (a + b) * (0.6 + 2.4 * night)
		l.position.x = -0.38 if a > b else 0.38

# ---------------------------------------------------------------- time of day
func _apply_time() -> void:
	var a := (hours - 6.0) / 12.0 * PI                                  # 0 at sunrise, PI at sunset
	var el := sin(a) * 1.05                                             # sun elevation (rad), ~60° at noon
	var dir := Vector3(cos(a) * cos(el), sin(el), sin(a) * 0.55 * cos(el)).normalized()
	if dir.y < -0.02:
		dir.y = -0.02
	sun.transform.basis = Basis.looking_at(-dir, Vector3.UP if absf(dir.y) < 0.99 else Vector3.FORWARD)
	var s := sin(el)
	var day := smoothstep(-0.12, 0.25, s)
	var warm := 1.0 - smoothstep(0.03, 0.45, s)
	night = 1.0 - smoothstep(-0.18, 0.04, s)
	var light_col := Color(1.0, 0.97, 0.92).lerp(Color(1.0, 0.55, 0.28), warm * day)
	sun.light_color = light_col
	sun.light_energy = 1.55 * smoothstep(-0.04, 0.12, s)
	sun.visible = s > -0.05
	var top_day := Color(0.22, 0.42, 0.78)
	var hor_day := Color(0.68, 0.78, 0.88)
	var top_dusk := Color(0.20, 0.25, 0.45)
	var hor_dusk := Color(1.0, 0.56, 0.32)
	var top_night := Color(0.015, 0.02, 0.05)
	var hor_night := Color(0.10, 0.09, 0.11)
	var top := top_day.lerp(top_dusk, warm).lerp(top_night, night)
	var hor := hor_day.lerp(hor_dusk, warm).lerp(hor_night, night)
	sky_mat.set_shader_parameter("top_col", Vector3(top.r, top.g, top.b))
	sky_mat.set_shader_parameter("hor_col", Vector3(hor.r, hor.g, hor.b))
	var gnd := hor.darkened(0.6)
	sky_mat.set_shader_parameter("gnd_col", Vector3(gnd.r, gnd.g, gnd.b))
	sky_mat.set_shader_parameter("sun_dir", dir)
	sky_mat.set_shader_parameter("sun_col", Vector3(light_col.r, light_col.g, light_col.b))
	sky_mat.set_shader_parameter("sun_vis", smoothstep(-0.1, 0.02, s))
	sky_mat.set_shader_parameter("night", night)
	# the moon: it transits ~24.8 h × phase after the sun (new moon at noon, full at midnight)
	var mh := fposmod(hours - moon_phase * 24.84, 24.0)
	var ma := (mh - 6.0) / 12.0 * PI
	var mel := sin(ma) * 0.95
	var mdir := Vector3(cos(ma) * cos(mel), sin(mel), sin(ma) * 0.45 * cos(mel)).normalized()
	sky_mat.set_shader_parameter("moon_dir", mdir)
	sky_mat.set_shader_parameter("moon_phase", moon_phase)
	var lit_frac := 0.5 - 0.5 * cos(moon_phase * TAU)
	var mup := smoothstep(0.0, 0.2, mdir.y)
	moon_light.light_energy = 0.32 * lit_frac * mup * night
	moon_light.visible = moon_light.light_energy > 0.005
	if moon_light.visible:
		moon_light.transform.basis = Basis.looking_at(-mdir, Vector3.UP if absf(mdir.y) < 0.99 else Vector3.FORWARD)
	env.ambient_light_color = Color(0.62, 0.6, 0.56).lerp(Color(0.32, 0.38, 0.52), night)
	env.ambient_light_energy = 0.55 + 0.25 * (1.0 - day) + (0.55 + 0.5 * lit_frac * mup) * night
	env.fog_light_color = hor.lerp(top, 0.25)
	mountain_mat.set_shader_parameter("haze", Vector3(hor.r, hor.g, hor.b) * 0.92)
	var mfar := Color(0.30, 0.38, 0.50).lerp(Color(0.32, 0.30, 0.42), warm).lerp(Color(0.03, 0.035, 0.06), night)
	mountain_mat.set_shader_parameter("far_col", Vector3(mfar.r, mfar.g, mfar.b))
	var mnear := mfar.darkened(0.25)
	mountain_mat.set_shader_parameter("near_col", Vector3(mnear.r, mnear.g, mnear.b))
	var cl_lit := Color(1.0, 0.98, 0.95).lerp(Color(1.0, 0.62, 0.36), warm).lerp(Color(0.10, 0.11, 0.15), night)
	var cl_shade := Color(0.56, 0.62, 0.72).lerp(Color(0.36, 0.30, 0.42), warm).lerp(Color(0.025, 0.03, 0.045), night)
	cloud_mat.set_shader_parameter("sun_dir", dir if night < 0.5 else mdir)
	cloud_mat.set_shader_parameter("lit_col", Vector3(cl_lit.r, cl_lit.g, cl_lit.b))
	cloud_mat.set_shader_parameter("shade_col", Vector3(cl_shade.r, cl_shade.g, cl_shade.b))
	cloud_mat.set_shader_parameter("haze_col", Vector3(hor.r, hor.g, hor.b))
	cloud_mat.set_shader_parameter("night", night)
	# the train windows mirror this sky
	var gnd2 := Color(0.16, 0.17, 0.12).lerp(Color(0.12, 0.08, 0.06), warm).lerp(Color(0.01, 0.01, 0.012), night)
	for sm in car_side_mats:
		sm.set_shader_parameter("env_top", Vector3(top.r, top.g, top.b))
		sm.set_shader_parameter("env_hor", Vector3(hor.r, hor.g, hor.b))
		sm.set_shader_parameter("env_gnd", Vector3(gnd2.r, gnd2.g, gnd2.b))
		sm.set_shader_parameter("env_sun_dir", dir if night < 0.5 else mdir)
		var sc := light_col * (1.0 - night) + Color(0.5, 0.55, 0.7) * lit_frac * night
		sm.set_shader_parameter("env_sun_col", Vector3(sc.r, sc.g, sc.b))
	# lights that come on at dusk
	street_mat.emission_energy_multiplier = 3.0 * night
	street_light.light_energy = 1.6 * night
	street_light.visible = night > 0.05
	for sm in car_side_mats:
		sm.set_shader_parameter("em_energy", 0.25 + 1.4 * night)
	head_mat.emission_energy_multiplier = 3.0 + 3.0 * night
	head_halo_mat.albedo_color.a = 0.25 + 0.6 * night
	head_spot.light_energy = 4.0 * night
