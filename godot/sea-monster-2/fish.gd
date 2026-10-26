extends MultiMeshInstance3D
# 大海怪2 fish schools — a port of 大海怪's fish.js (docs/研究筆記/11_魚群逃散.md) to the water plane, in metres.
#  - Schooling: Couzin's three zones. Repulsion beats everything; otherwise the mean heading of the orientation zone
#    plus the directions to the attraction zone, a blind cone behind, the nearest ~7. The zone widths give the shape:
#    ball / ring (torus) / band / scatter.
#  - Escape: a C-start — the heading jumps to "away from the threat, turned 30° toward its rear", speed ×4 falling
#    back to ×1.5 over 1.5 s. Only fish near the threat's edge react by themselves; the rest catch it from a
#    neighbour that just bolted, 2–4 frames later: the startle wave.
#  - Waiting: calm fish join a ring round the boat.
# Positions are Vector2(x, z) on the water; targets are world points (the camera never moves).

const BL := 0.7                 # body length used for spacing (m); a fish is drawn DRAW × this
const DRAW := 2.4
const SPREAD := 2.0             # spacing multiplier (user 2026-10-26: twice as spread out)
const PACE := 1.6               # cruise-speed multiplier
const MAXF := 420
const SAMPLE := 10              # schoolmates each fish looks at per frame (a rolling sample, not a full scan: GDScript
                                # on the web can't afford fish.js's grid; 60 fish cost 4 ms native that way)
const BLIND := -0.866           # cos 150°: a 60° blind cone behind
const ESC_ANGLE := deg_to_rad(30.0)

const SHAPES := {
	"ball":    {"zr": 1.0, "dzo": 0.5, "dza": 6.0,  "speed": 2.2, "goal": 0.55, "turn": 2.6, "R": 0.5},
	"ring":    {"zr": 1.0, "dzo": 1.8, "dza": 12.0, "speed": 2.8, "goal": 0.40, "turn": 1.6, "R": 0.75},
	"band":    {"zr": 1.0, "dzo": 9.0, "dza": 12.0, "speed": 4.5, "goal": 0.45, "turn": 2.0, "R": 0.9},
	"scatter": {"zr": 2.4, "dzo": 0.8, "dza": 4.0,  "speed": 1.8, "goal": 0.55, "turn": 2.6, "R": 1.3},
}

class School:
	var shape: String
	var S: Dictionary
	var target := Vector2.ZERO
	var life := 40.0
	var age := 0.0
	var leaving := false
	var fled := false
	var through := false
	var emerge := false
	var dep := 0.6
	var n := 0
	var c := Vector2.ZERO
	var h := Vector2.RIGHT
	var R := 1.0

class Fish:
	var p := Vector2.ZERO
	var h := Vector2.RIGHT
	var sp := 0.0
	var sc: School
	var k := 1.0
	var fear := 0.0
	var esc := 99.0
	var pend := -1.0
	var jt := false
	var flash := 0.0
	var alpha := 0.0
	var ph := 0.0
	var ring := false
	var far := false
	var yaw := 0.0
	var roll := 0.0
	var roll0 := 0.0
	var tp := 0.0
	var size := 1.0
	var dep := 0.0
	var rise := 0.0
	var soc := Vector2.RIGHT     # last social direction (re-looked every other frame)

var fish: Array[Fish] = []
var schools: Array[School] = []
var frame := 0
var buf := PackedFloat32Array()
var cam: Camera3D
var t := 0.0
var fish_mat: ShaderMaterial

func setup(camera: Camera3D) -> void:
	cam = camera
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_custom_data = true
	mm.mesh = _fish_mesh()
	mm.instance_count = MAXF
	mm.visible_instance_count = 0
	multimesh = mm
	fish_mat = ShaderMaterial.new()
	fish_mat.shader = load("res://fish.gdshader")
	material_override = fish_mat
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF

# ---------------------------------------------------------------- view helpers (screen fractions, 0,0 top left)
func water_at(frac: Vector2) -> Vector2:
	var vs := get_viewport().get_visible_rect().size
	var sp := frac * vs
	var o := cam.project_ray_origin(sp)
	var d := cam.project_ray_normal(sp)
	var k := -o.y / minf(d.y, -0.05)
	return Vector2(o.x + d.x * k, o.z + d.z * k)

func screen_frac(p: Vector2) -> Vector2:
	return cam.unproject_position(Vector3(p.x, 0, p.y)) / get_viewport().get_visible_rect().size

func off_screen(p: Vector2, m := 0.06) -> bool:
	var f := screen_frac(p)
	return f.x < -m or f.x > 1.0 + m or f.y < -m or f.y > 1.0 + m

# ---------------------------------------------------------------- schools
# a school enters from just outside the frame (or appears at `at`) and heads for `target`; after `life` it leaves
func spawn(n: int, shape: String, target = null, at = null, life := randf_range(30, 50), emerge := false) -> School:
	var sc := School.new()
	sc.shape = shape
	sc.S = SHAPES[shape]
	sc.life = life
	sc.through = shape == "band"
	sc.emerge = emerge
	sc.dep = randf_range(0.3, 1.0)
	var rad := sqrt(n) * BL * 0.9 * SPREAD
	var from: Vector2
	var side := randi() % 4
	if at != null:
		from = at
	else:
		# a point just past a random edge, pushed out by the school's own radius
		var e: Vector2 = [Vector2(-0.1, randf_range(0.15, 0.85)), Vector2(1.1, randf_range(0.15, 0.85)),
			Vector2(randf_range(0.15, 0.85), -0.1), Vector2(randf_range(0.15, 0.85), 1.1)][side]
		from = water_at(e)
		var mid := water_at(Vector2(0.5, 0.5))
		from += (from - mid).normalized() * rad
	if target != null:
		sc.target = target
	elif shape == "band":       # a band crosses to the far side
		var e2: Vector2 = [Vector2(1.3, randf_range(0.2, 0.8)), Vector2(-0.3, randf_range(0.2, 0.8)),
			Vector2(randf_range(0.2, 0.8), 1.3), Vector2(randf_range(0.2, 0.8), -0.3)][side]
		sc.target = water_at(e2)
	else:
		sc.target = water_at(Vector2(randf_range(0.3, 0.75), randf_range(0.25, 0.75)))
	schools.append(sc)
	var a0 := (sc.target - from).angle()
	for i in n:
		if fish.size() >= MAXF:
			break
		var f := Fish.new()
		f.p = from + Vector2.from_angle(randf() * TAU) * sqrt(randf()) * rad
		f.h = Vector2.from_angle(a0 + randf_range(-0.3, 0.3))
		f.sp = sc.S.speed * PACE * BL
		f.sc = sc
		f.k = randf_range(0.85, 1.18) if shape == "band" else randf_range(0.95, 1.05)
		f.ph = randf() * TAU
		f.roll0 = randf_range(-0.35, 0.35)
		f.size = randf_range(0.8, 1.2)
		f.dep = sc.dep + pow(randf(), 1.6) * 1.4
		f.rise = 1.0 if emerge else 0.0
		fish.append(f)
	return sc

func claim_ring(n: int, at: Vector2) -> void:     # waiting: whoever is calm joins the ring; bring a school if too few
	var k := 0
	for f in fish:
		if f.fear < 0.3:
			f.ring = true
			k += 1
	if k < n * 0.6:
		var sc := spawn(n - k, "ring", at, null, 1e9)
		for f in fish:
			if f.sc == sc:
				f.ring = true
	for sc in schools:
		sc.life = 1e9

func release_ring() -> void:
	for f in fish:
		f.ring = false
	for sc in schools:
		sc.leaving = false
		sc.life = sc.age + randf_range(6, 14)

# ---------------------------------------------------------------- threats: {kind: "circle", c, r, rear} / {kind: "capsule", a, b, r, rear}
func _near(th: Dictionary, p: Vector2) -> Array:      # [distance past the edge, unit direction away]
	var q: Vector2
	if th.kind == "circle":
		q = th.c
	else:
		var v: Vector2 = th.b - th.a
		q = th.a + v * clampf((p - th.a).dot(v) / v.length_squared(), 0.0, 1.0)
	var d := p - q
	var l := maxf(d.length(), 1e-4)
	return [l - th.r, d / l]

func _cstart(f: Fish, th: Dictionary) -> void:
	var u: Vector2 = _near(th, f.p)[1]
	var a1 := u.rotated(ESC_ANGLE)
	var a2 := u.rotated(-ESC_ANGLE)
	var rear: Vector2 = th.get("rear", Vector2(0, 1))
	var a := a1 if a1.dot(rear) > a2.dot(rear) else a2
	var turn := f.h.angle_to(a)
	f.yaw = turn * 6.0
	f.h = a
	f.esc = 0.0
	f.fear = 1.0
	f.jt = true
	f.pend = -1.0
	f.ring = false
	f.flash = minf(1.0, absf(turn) / 1.2 + 0.3)

# env: {threat: Dictionary|null, ring: {c, r}|null, boat: {p, h, len, beam}|null, murk}
func step(dt: float, env: Dictionary) -> void:
	t += dt
	var threat = env.get("threat")
	var ring = env.get("ring")
	var boat = env.get("boat")
	frame += 1
	var members := {}
	for f in fish:
		if not members.has(f.sc):
			members[f.sc] = []
		members[f.sc].append(f)
	for sc in schools:
		sc.n = 0
		sc.c = Vector2.ZERO
		sc.h = Vector2.ZERO
	for f in fish:
		if f.fear == 0.0:
			f.sc.n += 1
			f.sc.c += f.p
			f.sc.h += f.h
	for sc in schools:
		if sc.n > 0:
			sc.c /= sc.n
		sc.h = sc.h.normalized() if sc.h.length() > 1e-5 else Vector2.RIGHT
		sc.R = sqrt(maxi(sc.n, 1)) * BL * sc.S.R * SPREAD
		sc.age += dt
		if not sc.leaving and sc.age > sc.life:          # time to go: off the nearest side, away from the middle
			sc.leaving = true
			var f0 := screen_frac(sc.c)
			var out := Vector2(-0.35 if f0.x < 0.5 else 1.35, f0.y) if absf(f0.x - 0.5) > absf(f0.y - 0.5) else Vector2(f0.x, -0.35 if f0.y < 0.5 else 1.35)
			sc.target = water_at(out)
	for idx in fish.size():
		var f := fish[idx]
		var S: Dictionary = f.sc.S
		var zr: float = S.zr * BL * SPREAD
		var zo: float = zr + S.dzo * BL * SPREAD
		var za: float = zo + S.dza * BL * SPREAD
		# a rolling sample of schoolmates: repulsion inside zr, else align inside zo, else attract inside za
		var mates: Array = members[f.sc]
		var nm := mates.size()
		var rep := Vector2.ZERO
		var o := Vector2.ZERO
		var startled := false
		var fresh := (idx + frame) % 2 == 0 or f.esc < 0.5     # half the fish look round each frame; the rest keep their last look
		for q in (mini(SAMPLE, nm - 1) if fresh else 0):
			var g: Fish = mates[(idx * 7 + frame * 3 + q * 13 + 1) % nm]
			if g == f:
				continue
			var dv: Vector2 = g.p - f.p
			var d2 := dv.length_squared()
			if d2 >= za * za:
				continue
			var d := maxf(sqrt(d2), 1e-4)
			if d < zr:
				rep -= dv / d
				continue
			if f.h.dot(dv) < BLIND * d:                  # behind: can't see it
				continue
			if g.jt and not f.jt and f.esc > 2.0:         # a neighbour just bolted
				startled = true
			o += g.h if d < zo else dv / d
		var want: Vector2
		if not fresh:
			want = f.soc
		elif rep != Vector2.ZERO:
			want = rep
		else:
			want = (o.normalized() if o.length() > 1e-5 else f.h) + f.h * 0.6
		f.soc = want
		want = want.normalized()
		var sc := f.sc
		var gv := sc.target - f.p
		var gd := maxf(gv.length(), 1e-3)
		var gw: float = (1.0 if sc.leaving or sc.through else minf(1.0, gd / 10.0)) * S.goal * maxf(1.0 - f.fear, 0.7 if sc.fled else 0.0)
		want += gv / gd * gw
		if f.fear == 0.0 and sc.n > 3:
			var cv := sc.c - f.p
			var cd := maxf(cv.length(), 1e-4)
			if sc.shape == "band":          # pulled onto the school's axis, free along it
				var lat := -cv.x * sc.h.y + cv.y * sc.h.x
				var lon := cv.dot(sc.h)
				var W := 3.0 * BL * SPREAD
				var pl := 0.9 * clampf(lat / W, -1, 1) * (1.0 if absf(lat) > W else absf(lat) / W)
				want += Vector2(-sc.h.y, sc.h.x) * pl
				want += sc.h * 0.5 * maxf(0.0, absf(lon) - sc.R * 4.0) / sc.R * signf(lon)
			else:
				var pull := (0.25 if sc.shape == "scatter" else 0.6) * clampf((cd - sc.R) / sc.R, 0.0, 1.0)
				want += cv / cd * pull
			if sc.shape == "ring" and not f.ring:
				var Rr := sc.R * 1.4
				var e := (cd - Rr) / Rr
				want += Vector2(-cv.y, cv.x) / cd * 0.9 + cv / cd * e * 1.2
		if boat != null:                     # swim round the hull
			var bx: Vector2 = f.p - boat.p
			var along := clampf(bx.dot(boat.h), -boat.len / 2.0, boat.len / 2.0)
			var pv: Vector2 = f.p - (boat.p + boat.h * along)
			var pd := maxf(pv.length(), 1e-4)
			var Rb: float = boat.beam * 0.5 + 4.0 * BL
			if pd < Rb:
				want += pv / pd * 2.5 * (1.0 - pd / Rb)
		if ring != null and f.fear == 0.0 and f.ring:    # waiting: circle the boat
			var qv: Vector2 = f.p - ring.c
			var qd := maxf(qv.length(), 1e-4)
			var e2: float = (ring.r - qd) / ring.r
			f.far = absf(qd - ring.r) > 4.0
			want += Vector2(-qv.y, qv.x) / qd * 1.2 + qv / qd * e2 * 2.5
		if threat != null and f.fear > 0.0:              # keep running while it's close
			var nr := _near(threat, f.p)
			want += nr[1] * f.fear * 1.5 * maxf(0.0, 1.0 - nr[0] / 25.0)
		want = want.normalized()
		# startle: by itself near the threat's edge, or caught from a neighbour 2–4 frames later
		if f.pend > 0.0:
			f.pend -= dt
			if f.pend <= 0.0 and threat != null:
				_cstart(f, threat)
				continue
		elif threat != null and f.esc > 2.0:
			if _near(threat, f.p)[0] < 2.0 * BL:
				_cstart(f, threat)
				continue
			if startled:
				f.pend = randf_range(2, 4) / 30.0
		var maxT: float = S.turn * (2.5 if f.esc < 1.5 else 1.0) * dt
		var turn := clampf(f.h.angle_to(want), -maxT, maxT)
		f.h = f.h.rotated(turn)
		f.yaw = turn / dt
		f.flash = maxf(f.flash - dt * 2.5, minf(1.0, absf(turn) / dt / 6.0))
	for f in fish:
		var cruise: float = f.sc.S.speed * PACE * BL * f.k * (3.0 if f.ring and f.far else 1.0)
		var burst := 1.5 + 2.5 * pow(1.0 - f.esc / 1.5, 2) if f.esc < 1.5 else 1.0 + 0.5 * f.fear
		f.sp += (cruise * burst - f.sp) * minf(1.0, (30.0 if f.esc < 0.1 else 2.0) * dt)
		if f.esc < 0.1:
			f.sp = cruise * burst
		f.p += f.h * f.sp * dt
		f.esc += dt
		f.jt = f.esc < dt * 1.01
		if threat == null or _near(threat, f.p)[0] > 20.0:
			f.fear = maxf(0.0, f.fear - dt * 0.15)
		f.alpha = minf(1.0, f.alpha + dt * 1.5)
	# a school that took fright doesn't come back: it heads out of the frame, away from where the fright was
	if threat != null:
		for sc in schools:
			if sc.fled:
				continue
			var k := 0
			var s := Vector2.ZERO
			for f in fish:
				if f.sc == sc and f.fear > 0.0:
					k += 1
					s += f.p
			if k < 3:
				continue
			s /= k
			sc.target = s + (_near(threat, s)[1] as Vector2) * 200.0
			sc.fled = true
			sc.leaving = true
	# gone: off the frame and done with it
	for i in range(fish.size() - 1, -1, -1):
		var f := fish[i]
		if (i + frame) % 8 == 0 and (f.fear > 0.0 or f.sc.leaving or f.sc.through or f.sc.age > 20.0) and off_screen(f.p, 0.12):   # every 8th frame
			fish.remove_at(i)
	var alive := {}
	for f in fish:
		alive[f.sc] = true
	schools.assign(schools.filter(func(s): return alive.has(s)))
	_draw(dt, env.get("murk", 0.0))

func _draw(dt: float, murk: float) -> void:
	var n := mini(fish.size(), MAXF)
	if buf.size() != MAXF * 16:
		buf.resize(MAXF * 16)
	for i in n:
		var f := fish[i]
		f.tp = fmod(f.tp + (3.0 if f.esc < 1.5 else 2.0) * (0.9 + 0.2 * fmod(f.ph * 7.3, 1.0)) * dt, 1.0)   # two tail beats a second, three bolting
		# roll: a little at random, hard into a sharp turn (the flank flashes)
		var glint := 0.5 * pow(maxf(0.0, sin(t * 2.3 + f.ph * 9.7)), 32)
		var roll_to := f.roll0 + clampf(-f.yaw * 0.3, -1.3, 1.3) + glint * 0.9 * signf(f.roll0 if f.roll0 != 0.0 else 1.0)
		f.roll += (roll_to - f.roll) * minf(1.0, dt * 8.0)
		f.rise = maxf(0.0, f.rise - dt / 3.0)       # bolting omen schools rise out of the deep over ~3 s
		# yaw to the heading (hx, hz), then roll about the body axis, scaled to length L — written straight into the buffer
		var L := BL * DRAW * f.size * f.alpha
		var hx := f.h.x
		var hz := f.h.y
		var cr := cos(f.roll)
		var sr := sin(f.roll)
		var o := i * 16
		# rows of [X Y Z | origin]: X = (hx, 0, hz), Y = (-hz·sr, cr, hx·sr), Z = (-hz·cr, -sr, hx·cr) … ×L
		buf[o] = hx * L;        buf[o + 1] = -hz * sr * L; buf[o + 2] = -hz * cr * L; buf[o + 3] = f.p.x
		buf[o + 4] = 0.0;       buf[o + 5] = cr * L;       buf[o + 6] = -sr * L;      buf[o + 7] = -(f.dep + 6.0 * f.rise * f.rise)
		buf[o + 8] = hz * L;    buf[o + 9] = hx * sr * L;  buf[o + 10] = hx * cr * L; buf[o + 11] = f.p.y
		buf[o + 12] = f.tp;     buf[o + 13] = f.flash;     buf[o + 14] = 0.0;         buf[o + 15] = 0.0
	multimesh.buffer = buf      # one upload instead of two calls per fish
	multimesh.visible_instance_count = n
	fish_mat.set_shader_parameter("murk", murk)

# ---------------------------------------------------------------- mesh: a fusiform body lofted along +X (snout at +0.5),
# a forked tail fin standing up, a pair of pectoral fins sloping out and down
func _fish_mesh() -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var NS := 10
	var NR := 8
	var rings := []
	for i in NS + 1:
		var u := float(i) / NS                       # 0 tail … 1 snout
		var x := -0.42 + u * 0.92
		var w := 0.11 * pow(sin(PI * pow(u, 0.8)), 0.8) * (1.0 if u > 0.15 else 0.6 + u * 2.6)
		var ring := []
		for j in NR:
			var a := TAU * j / NR
			ring.append(Vector3(x, cos(a) * w * 1.15, sin(a) * w * 0.85))
		rings.append(ring)
	for i in NS:
		for j in NR:
			var a: Vector3 = rings[i][j]
			var b: Vector3 = rings[i][(j + 1) % NR]
			var c: Vector3 = rings[i + 1][j]
			var d: Vector3 = rings[i + 1][(j + 1) % NR]
			st.add_vertex(a); st.add_vertex(c); st.add_vertex(b)
			st.add_vertex(b); st.add_vertex(c); st.add_vertex(d)
	# tail fin (forked, vertical) and pectoral fins
	var tail := [[Vector3(-0.40, 0, 0), Vector3(-0.62, 0.2, 0), Vector3(-0.52, 0, 0)], [Vector3(-0.40, 0, 0), Vector3(-0.52, 0, 0), Vector3(-0.62, -0.2, 0)]]
	var pecs := [[Vector3(0.18, -0.02, 0.07), Vector3(0.02, -0.06, 0.22), Vector3(0.06, -0.02, 0.07)], [Vector3(0.18, -0.02, -0.07), Vector3(0.06, -0.02, -0.07), Vector3(0.02, -0.06, -0.22)]]
	for tri in tail + pecs:
		st.add_vertex(tri[0]); st.add_vertex(tri[1]); st.add_vertex(tri[2])
		st.add_vertex(tri[0]); st.add_vertex(tri[2]); st.add_vertex(tri[1])
	st.generate_normals()
	return st.commit()
