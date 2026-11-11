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
	var scare_after := INF   # seconds in the frame before the threat startles it anyway (running: visits)
	var seen_t := 0.0
	var seen := false     # its middle has been in the frame: only then does it take fright by itself
	var dep := 0.6
	var n := 0
	var c := Vector2.ZERO
	var h := Vector2.RIGHT
	var R := 1.0
	# its shape's numbers, read out of S once (the per-fish loop looked them up by name every frame)
	var zr := 0.0
	var zo := 0.0
	var za := 0.0
	var goal := 0.0
	var turn := 0.0
	var cruise := 0.0
	var band := false
	var scatter := false
	var ringy := false
	var mates: Array[Fish] = []     # its fish, while a step runs (emptied after: a fish and its school must not hold each other)

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
var bolts := 0                 # C-starts this step (main.gd: the squid's pupil flinches)
var buf := PackedFloat32Array()
var cam: Camera3D
var t := 0.0
var fish_mat: ShaderMaterial
# the threat of this step, flattened (2026-11-11: _near() walked a Dictionary per squid for every fish, two or three
# times a frame — the largest part of the script's time while Claude runs): per shape a point (circle) or a segment
# (capsule: a, a→b and its squared length; -1 marks a circle) and its reach
var th_n := 0
var th_a := PackedVector2Array()
var th_v := PackedVector2Array()
var th_l2 := PackedFloat64Array()
var th_r := PackedFloat64Array()
var near_e := INF              # _near2's answer: distance past the nearest edge …
var near_u := Vector2.RIGHT    # … and the unit direction away from it

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
func spawn(n: int, shape: String, target = null, at = null, life := randf_range(30, 50), emerge := false, scare_after := INF) -> School:
	var sc := School.new()
	sc.shape = shape
	sc.S = SHAPES[shape]
	sc.life = life
	sc.through = shape == "band"
	sc.emerge = emerge
	sc.scare_after = scare_after
	sc.dep = randf_range(0.3, 1.0)
	sc.zr = sc.S.zr * BL * SPREAD
	sc.zo = sc.zr + sc.S.dzo * BL * SPREAD
	sc.za = sc.zo + sc.S.dza * BL * SPREAD
	sc.goal = sc.S.goal
	sc.turn = sc.S.turn
	sc.cruise = sc.S.speed * PACE * BL
	sc.band = shape == "band"
	sc.scatter = shape == "scatter"
	sc.ringy = shape == "ring"
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
		f.sp = sc.cruise
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
# / {kind: "multi", list: [circle|capsule…], rear}
func _set_threat(th) -> void:
	th_n = 0
	th_a.clear()
	th_v.clear()
	th_l2.clear()
	th_r.clear()
	if th == null:
		return
	for one in (th.list if th.kind == "multi" else [th]):
		if one.kind == "circle":
			th_a.append(one.c)
			th_v.append(Vector2.ZERO)
			th_l2.append(-1.0)
		else:
			var v: Vector2 = one.b - one.a
			th_a.append(one.a)
			th_v.append(v)
			th_l2.append(v.length_squared())
		th_r.append(one.r)
	th_n = th_r.size()

# how far p is past the edge of the nearest threat (several squid: the nearest one)
func _edge(p: Vector2) -> float:
	var best := INF
	for i in th_n:
		var q := th_a[i]
		var l2 := th_l2[i]
		if l2 >= 0.0:
			var v := th_v[i]
			q += v * clampf((p - q).dot(v) / l2, 0.0, 1.0)
		var e := maxf((p - q).length(), 1e-4) - th_r[i]
		if e < best:
			best = e
	return best

# the same, and the unit direction away from it: into near_e / near_u
func _near2(p: Vector2) -> void:
	near_e = INF
	near_u = Vector2.RIGHT
	for i in th_n:
		var q := th_a[i]
		var l2 := th_l2[i]
		if l2 >= 0.0:
			var v := th_v[i]
			q += v * clampf((p - q).dot(v) / l2, 0.0, 1.0)
		var d := p - q
		var l := maxf(d.length(), 1e-4)
		if l - th_r[i] < near_e:
			near_e = l - th_r[i]
			near_u = d / l

func _cstart(f: Fish, th: Dictionary) -> void:
	_near2(f.p)
	var u := near_u
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
	bolts += 1

# env: {threat: Dictionary|null, ring: {c, r}|null, boat: {p, h, len, beam}|null, murk}
func step(dt: float, env: Dictionary) -> void:
	t += dt
	var threat = env.get("threat")
	var ring = env.get("ring")
	var boat = env.get("boat")
	frame += 1
	_set_threat(threat)
	for sc in schools:
		sc.n = 0
		sc.c = Vector2.ZERO
		sc.h = Vector2.ZERO
	for f in fish:
		f.sc.mates.append(f)
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
		if not sc.seen and sc.n > 0 and not off_screen(sc.c, -0.05):
			sc.seen = true
		if sc.seen:
			sc.seen_t += dt
		# a visit that never brushed the threat: it stirs and the whole school goes, a few fish first, the rest catching it
		if threat != null and not sc.fled and sc.seen_t > sc.scare_after:
			sc.scare_after = INF
			for f in fish:
				if f.sc == sc and f.esc > 2.0 and f.pend <= 0.0:
					f.pend = randf_range(0.01, 0.08) if randf() < 0.15 else randf_range(0.15, 0.5)
		if not sc.leaving and sc.age > sc.life:          # time to go: off the nearest side, away from the middle
			sc.leaving = true
			var f0 := screen_frac(sc.c)
			var out := Vector2(-0.35 if f0.x < 0.5 else 1.35, f0.y) if absf(f0.x - 0.5) > absf(f0.y - 0.5) else Vector2(f0.x, -0.35 if f0.y < 0.5 else 1.35)
			sc.target = water_at(out)
	var has_threat := threat != null
	var has_boat := boat != null
	var boat_p := Vector2.ZERO
	var boat_h := Vector2.RIGHT
	var boat_half := 0.0
	var Rb := 1.0
	if has_boat:
		boat_p = boat.p
		boat_h = boat.h
		boat_half = boat.len / 2.0
		Rb = boat.beam * 0.5 + 4.0 * BL
	var has_ring := ring != null
	var ring_c := Vector2.ZERO
	var ring_r := 1.0
	if has_ring:
		ring_c = ring.c
		ring_r = ring.r
	for idx in fish.size():
		var f := fish[idx]
		var sc := f.sc
		var zr := sc.zr
		var zo := sc.zo
		var za := sc.za
		# a rolling sample of schoolmates: repulsion inside zr, else align inside zo, else attract inside za
		var mates := sc.mates
		var nm := mates.size()
		var rep := Vector2.ZERO
		var o := Vector2.ZERO
		var startled := false
		var fresh := (idx + frame) % 2 == 0 or f.esc < 0.5     # half the fish look round each frame; the rest keep their last look
		for q in (mini(SAMPLE, nm - 1) if fresh else 0):
			var g := mates[(idx * 7 + frame * 3 + q * 13 + 1) % nm]
			if g == f:
				continue
			var dv := g.p - f.p
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
		var gv := sc.target - f.p
		var gd := maxf(gv.length(), 1e-3)
		var gw: float = (1.0 if sc.leaving or sc.through else minf(1.0, gd / 10.0)) * sc.goal * maxf(1.0 - f.fear, 0.7 if sc.fled else 0.0)
		want += gv / gd * gw
		if f.fear == 0.0 and sc.n > 3:
			var cv := sc.c - f.p
			var cd := maxf(cv.length(), 1e-4)
			if sc.band:                     # pulled onto the school's axis, free along it
				var lat := -cv.x * sc.h.y + cv.y * sc.h.x
				var lon := cv.dot(sc.h)
				var W := 3.0 * BL * SPREAD
				var pl := 0.9 * clampf(lat / W, -1, 1) * (1.0 if absf(lat) > W else absf(lat) / W)
				want += Vector2(-sc.h.y, sc.h.x) * pl
				want += sc.h * 0.5 * maxf(0.0, absf(lon) - sc.R * 4.0) / sc.R * signf(lon)
			else:
				var pull := (0.25 if sc.scatter else 0.6) * clampf((cd - sc.R) / sc.R, 0.0, 1.0)
				want += cv / cd * pull
			if sc.ringy and not f.ring:
				var Rr := sc.R * 1.4
				var e := (cd - Rr) / Rr
				want += Vector2(-cv.y, cv.x) / cd * 0.9 + cv / cd * e * 1.2
		if has_boat:                         # swim round the hull
			var bx := f.p - boat_p
			var along := clampf(bx.dot(boat_h), -boat_half, boat_half)
			var pv := f.p - (boat_p + boat_h * along)
			var pd := maxf(pv.length(), 1e-4)
			if pd < Rb:
				want += pv / pd * 2.5 * (1.0 - pd / Rb)
		if has_ring and f.fear == 0.0 and f.ring:        # waiting: circle the boat
			var qv := f.p - ring_c
			var qd := maxf(qv.length(), 1e-4)
			var e2 := (ring_r - qd) / ring_r
			f.far = absf(qd - ring_r) > 4.0
			want += Vector2(-qv.y, qv.x) / qd * 1.2 + qv / qd * e2 * 2.5
		if has_threat and f.fear > 0.0:                  # keep running while it's close
			_near2(f.p)
			want += near_u * f.fear * 1.5 * maxf(0.0, 1.0 - near_e / 25.0)
		want = want.normalized()
		# startle: by itself near the threat's edge, or caught from a neighbour 2–4 frames later
		if f.pend > 0.0:
			f.pend -= dt
			if f.pend <= 0.0 and threat != null:
				_cstart(f, threat)
				continue
		elif has_threat and f.esc > 2.0 and sc.seen:
			if _edge(f.p) < 2.0 * BL:
				_cstart(f, threat)
				continue
			if startled:
				f.pend = randf_range(2, 4) / 30.0
		var maxT := sc.turn * (2.5 if f.esc < 1.5 else 1.0) * dt
		var turn := clampf(f.h.angle_to(want), -maxT, maxT)
		f.h = f.h.rotated(turn)
		f.yaw = turn / dt
		f.flash = maxf(f.flash - dt * 2.5, minf(1.0, absf(turn) / dt / 6.0))
	for sc in schools:
		sc.mates.clear()
	for f in fish:
		var cruise := f.sc.cruise * f.k * (3.0 if f.ring and f.far else 1.0)
		var burst := 1.5 + 2.5 * pow(1.0 - f.esc / 1.5, 2) if f.esc < 1.5 else 1.0 + 0.5 * f.fear
		f.sp += (cruise * burst - f.sp) * minf(1.0, (30.0 if f.esc < 0.1 else 2.0) * dt)
		if f.esc < 0.1:
			f.sp = cruise * burst
		f.p += f.h * f.sp * dt
		f.esc += dt
		f.jt = f.esc < dt * 1.01
		if f.fear > 0.0 and (not has_threat or _edge(f.p) > 20.0):   # (a calm fish has nothing to forget)
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
			_near2(s)
			sc.target = s + near_u * 200.0
			sc.fled = true
			sc.leaving = true
	# gone: off the frame and done with it
	for i in range(fish.size() - 1, -1, -1):
		var f := fish[i]
		# (a school just spawned off screen is still swimming in: a band only counts as passing through after 8 s)
		if (i + frame) % 8 == 0 and (f.fear > 0.0 or f.sc.leaving or (f.sc.through and f.sc.age > 8.0) or f.sc.age > 20.0) and off_screen(f.p, 0.12):   # every 8th frame
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
		buf[o + 4] = 0.0;       buf[o + 5] = cr * L;       buf[o + 6] = -sr * L;      buf[o + 7] = -(f.dep + 6.0 * f.rise * f.rise)   # under a flat sea: fish.gdshader lifts it with the swell
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
