# The procedural maw, built once onto the worm's Skeleton3D (worm.gd calls Maw.build). Everything lives in a
# "mouth frame": origin at the centre of the mouth opening, +Z out of the mouth (toward whoever it faces), −Z down
# the throat, +X toward lip_right. The frame is derived from the four lip bones' rest positions and hung on the
# head bone (BoneAttachment3D), so the rings and the funnel follow bend / sink / yaw.
@tool
extends RefCounted

# --- tuning (metres, in the mouth frame) ---
const RIM_R := 8.0         # radius of the pink flesh ring at the lip roots
const FRAME_PUSH := -1.5   # mouth-frame origin moved along +Z from the lip-root centroid
const RINGS := 5
const DEEP := 16.0         # funnel bottom (deeper would poke out of the back of the head)

static var _tooth: ArrayMesh
static var _spine: ArrayMesh

# returns the mouth frame in skeleton space (rest pose)
static func build(skel: Skeleton3D) -> Transform3D:
	var g := {}
	for n in ["head", "lip_front", "lip_back", "lip_left", "lip_right"]:
		g[n] = skel.get_bone_global_rest(skel.find_bone(n))
	var lf: Vector3 = g["lip_front"].origin
	var lb: Vector3 = g["lip_back"].origin
	var ll: Vector3 = g["lip_left"].origin
	var lr: Vector3 = g["lip_right"].origin
	var x := (lr - ll).normalized()
	var z := x.cross((lb - lf).normalized()).normalized()
	var y := z.cross(x).normalized()
	x = y.cross(z)
	var c := (lf + lb + ll + lr) * 0.25 + z * FRAME_PUSH
	var frame := Transform3D(Basis(x, y, z), c)
	_trim_lips(skel, frame)

	var att := BoneAttachment3D.new()
	att.name = "MawAttach"
	att.bone_name = "head"
	skel.add_child(att)
	var maw := Node3D.new()
	maw.name = "Maw"
	maw.transform = (g["head"] as Transform3D).affine_inverse() * frame
	att.add_child(maw)
	_build_maw(maw)

	# spines on the inner faces of the lips, each set riding its own lip bone
	for n in ["lip_front", "lip_back", "lip_left", "lip_right"]:
		var mi: MeshInstance3D = null
		for m in skel.find_children("*", "MeshInstance3D", true, false):
			if m.name.ends_with(n.trim_prefix("lip_")) and m.name.contains("lip"):
				mi = m
		if mi == null:
			continue
		var la := BoneAttachment3D.new()
		la.name = "Spines_" + n
		la.bone_name = n
		skel.add_child(la)
		var mm := _lip_spines(mi, g[n], frame, hash(n))
		if mm:
			la.add_child(mm)
	return frame

# The Tripo lips carry flaps that reach inside the mouth; opening the lips swings them across the maw. Drop every lip
# triangle whose rest-pose centre lies inside the mouth cylinder (radius TRIM_R, not far out in front of the rim).
const TRIM_R := 9.0
static func _trim_lips(skel: Skeleton3D, frame: Transform3D) -> void:
	var inv := frame.affine_inverse()
	for mi: MeshInstance3D in skel.find_children("*lip*", "MeshInstance3D", true, false):
		var src: ArrayMesh = mi.mesh
		var out := ArrayMesh.new()
		for si in src.get_surface_count():
			var arr := src.surface_get_arrays(si)
			var vs: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
			var idx: PackedInt32Array = arr[Mesh.ARRAY_INDEX]
			var keep := PackedInt32Array()
			for t in range(0, idx.size(), 3):
				var p: Vector3 = inv * (mi.transform * ((vs[idx[t]] + vs[idx[t + 1]] + vs[idx[t + 2]]) / 3.0))
				if Vector2(p.x, p.y).length() < TRIM_R and p.z < 5.0:
					continue
				keep.append(idx[t]); keep.append(idx[t + 1]); keep.append(idx[t + 2])
			arr[Mesh.ARRAY_INDEX] = keep
			var flags := src.surface_get_format(si) & Mesh.ARRAY_FLAG_USE_8_BONE_WEIGHTS
			out.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr, [], {}, flags)
			out.surface_set_material(si, src.surface_get_material(si))
		mi.mesh = out

# ---------------------------------------------------------------- the maw: flesh ring, funnel, teeth rings
# ring i sits on a gum ridge at radius _ring_r(i), depth _ring_d(i); inside the last ring the funnel drops to black
static func _ring_r(i: int) -> float:
	return RIM_R * (0.9 - 0.085 * i)

static func _ring_d(i: int) -> float:
	return 0.5 + 1.5 * i

static func _flesh_mat() -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.vertex_color_use_as_albedo = true
	m.roughness = 0.45
	m.metallic_specular = 0.35
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	return m

static func _build_maw(maw: Node3D) -> void:
	var flesh := _flesh_mat()
	var last := RINGS - 1
	var hole_r := _ring_r(last) * 0.9

	# funnel: terraces through the rings, then a steep black throat
	var prof := [[-0.6, RIM_R * 1.02]]
	for i in RINGS:
		prof.append([_ring_d(i) - 0.2, _ring_r(i) + 0.25])
		prof.append([_ring_d(i) + 0.9, _ring_r(i) - 0.35])
	prof.append([_ring_d(last) + 2.5, hole_r * 0.85])
	prof.append([DEEP, hole_r * 0.3])
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var seg := 40
	var rows := 40
	for j in rows + 1:
		var d := lerpf(-0.6, DEEP, pow(float(j) / rows, 1.6))
		var r := _prof_r(prof, d)
		var col := _depth_col(d)
		for k in seg + 1:
			var a := TAU * k / seg
			var wob := 1.0 + 0.03 * sin(a * 7.0 + d) + 0.02 * sin(a * 13.0 - d * 2.0)
			st.set_color(col)
			st.set_normal(Vector3(-cos(a), -sin(a), 0.5).normalized())
			st.add_vertex(Vector3(cos(a) * r * wob, sin(a) * r * wob, -d))
	for j in rows:
		for k in seg:
			var i0 := j * (seg + 1) + k
			var i1 := i0 + seg + 1
			st.add_index(i0); st.add_index(i1); st.add_index(i0 + 1)
			st.add_index(i0 + 1); st.add_index(i1); st.add_index(i1 + 1)
	var funnel := MeshInstance3D.new()
	funnel.name = "Funnel"
	funnel.mesh = st.commit()
	funnel.material_override = flesh
	funnel.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	maw.add_child(funnel)

	# the throat: an unshaded black cone just inside the last ring, so the middle is a true hole in any light
	var hole := MeshInstance3D.new()
	hole.name = "Hole"
	var cyl := CylinderMesh.new()
	cyl.top_radius = hole_r * 0.92
	cyl.bottom_radius = 0.05
	cyl.height = DEEP - _ring_d(last) - 1.0
	cyl.radial_segments = 24
	cyl.rings = 1
	cyl.cap_top = false
	cyl.cap_bottom = false
	hole.mesh = cyl
	var black := StandardMaterial3D.new()
	black.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	black.albedo_color = Color.BLACK
	black.cull_mode = BaseMaterial3D.CULL_DISABLED
	hole.material_override = black
	hole.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	hole.rotation = Vector3(PI / 2, 0, 0)   # cylinder +Y → frame +Z: wide end toward the mouth
	hole.position = Vector3(0, 0, -(_ring_d(last) + 1.0) - cyl.height * 0.5)
	maw.add_child(hole)

	# the flesh ring at the rim (lumpy, ribbed) and a gum ridge under every tooth ring
	st = SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	_torus(st, RIM_R + RIM_R * 0.04, RIM_R * 0.14, 0.0, 64, 10, Color(0.68, 0.36, 0.34), 0.18)
	for i in RINGS:
		_torus(st, _ring_r(i) + 0.15, 0.38 - 0.03 * i, -_ring_d(i), 48, 6, _depth_col(_ring_d(i)) * 1.15, 0.1)
	var ring := MeshInstance3D.new()
	ring.name = "FleshRings"
	ring.mesh = st.commit()
	ring.material_override = flesh
	maw.add_child(ring)

	# teeth: one MultiMesh, rings smaller and deeper, every tooth leaning out of the mouth and hooked down the throat
	var tooth_mat := StandardMaterial3D.new()
	tooth_mat.vertex_color_use_as_albedo = true
	tooth_mat.roughness = 0.35
	tooth_mat.metallic_specular = 0.6
	var xs: Array[Transform3D] = []
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	for i in RINGS:
		var n := 24 - 2 * i
		var r := _ring_r(i)
		var d := _ring_d(i)
		var ln := RIM_R * 0.17 * (1.0 - 0.08 * i)
		for k in n:
			var a := TAU * (k + 0.5 * (i % 2)) / n + rng.randf_range(-0.05, 0.05)
			var u := Vector3(cos(a), sin(a), 0)
			var yt := (-u * 0.8 + Vector3(0, 0, 0.6)).normalized()
			var zt := (Vector3(0, 0, 1) - yt * yt.z).normalized()
			var xt := yt.cross(zt)
			var s := ln * rng.randf_range(0.8, 1.2)
			xs.append(Transform3D(Basis(xt, yt, zt).scaled(Vector3(s, s, s)), u * r - Vector3(0, 0, d)))
	maw.add_child(_mm("Teeth", _tooth_mesh(), xs, tooth_mat))

# a torus around the frame's Z axis at depth z; lump = how much the tube radius wobbles
static func _torus(st: SurfaceTool, major: float, minor: float, z: float, ts: int, tr: int, col: Color, lump: float) -> void:
	var verts := []
	for k in ts + 1:
		var a := TAU * k / ts
		var lu := 1.0 + lump * sin(a * 23.0) * sin(a * 5.0 + 1.0)
		var ctr := Vector3(cos(a) * major, sin(a) * major, z)
		for m in tr + 1:
			var b := TAU * m / tr
			var nrm := (Vector3(cos(a), sin(a), 0) * cos(b) + Vector3(0, 0, 1) * sin(b)).normalized()
			var ridge := 0.85 + 0.15 * sin(a * 90.0)
			verts.append([ctr + nrm * minor * lu, nrm, col * ridge])
	# SurfaceTool without indices: emit triangles directly
	for k in ts:
		for m in tr:
			var i0 := k * (tr + 1) + m
			var i1 := i0 + tr + 1
			for idx in [i0, i0 + 1, i1, i0 + 1, i1 + 1, i1]:
				var v: Array = verts[idx]
				st.set_color(v[2])
				st.set_normal(v[1])
				st.add_vertex(v[0])

static func _prof_r(prof: Array, d: float) -> float:
	if d <= prof[0][0]:
		return prof[0][1]
	for i in prof.size() - 1:
		var a: Array = prof[i]
		var b: Array = prof[i + 1]
		if d <= b[0]:
			return lerpf(a[1], b[1], smoothstep(a[0], b[0], d))
	return prof[-1][1]

static func _depth_col(d: float) -> Color:
	var pink := Color(0.74, 0.38, 0.38)
	var red := Color(0.36, 0.08, 0.09)
	var t1 := _ring_d(2)
	var t2 := _ring_d(RINGS - 1) + 1.5
	if d < t1:
		return pink.lerp(red, smoothstep(0.0, t1, d))
	return red.lerp(Color(0.02, 0.0, 0.0), smoothstep(t1, t2, d))

static func _mm(nm: String, mesh: Mesh, xs: Array[Transform3D], mat: Material) -> MultiMeshInstance3D:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = mesh
	mm.instance_count = xs.size()
	for i in xs.size():
		mm.set_instance_transform(i, xs[i])
	var mmi := MultiMeshInstance3D.new()
	mmi.name = nm
	mmi.multimesh = mm
	mmi.material_override = mat
	return mmi

# a unit-length curved cone: base at the origin, growing along +Y, the tip hooked toward −Z
static func _tooth_mesh() -> ArrayMesh:
	if _tooth:
		return _tooth
	_tooth = _cone(6, 5, 0.26, 0.45, Color(0.62, 0.40, 0.36), Color(0.97, 0.94, 0.86))
	return _tooth

static func _spine_mesh() -> ArrayMesh:
	if _spine:
		return _spine
	_spine = _cone(5, 3, 0.12, 0.3, Color(0.55, 0.42, 0.34), Color(0.92, 0.88, 0.78))
	return _spine

static func _cone(rs: int, ls: int, rad: float, hook: float, cb: Color, ct: Color) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for j in ls + 1:
		var t := float(j) / ls
		var p := Vector3(0, t, -hook * t * t)
		var tan := Vector3(0, 1, -2.0 * hook * t).normalized()
		var side := Vector3(1, 0, 0)
		var bi := tan.cross(side).normalized()
		var r := rad * pow(1.0 - t, 1.1) + 0.004
		for k in rs + 1:
			var a := TAU * k / rs
			var nrm := (side * cos(a) + bi * sin(a)).normalized()
			st.set_color(cb.lerp(ct, smoothstep(0.0, 0.7, t)))
			st.set_normal(nrm)
			st.add_vertex(p + nrm * r)
	for j in ls:
		for k in rs:
			var i0 := j * (rs + 1) + k
			var i1 := i0 + rs + 1
			st.add_index(i0); st.add_index(i1); st.add_index(i0 + 1)
			st.add_index(i0 + 1); st.add_index(i1); st.add_index(i1 + 1)
	return st.commit()

# ---------------------------------------------------------------- lip spines
static func _lip_spines(mi: MeshInstance3D, bone_g: Transform3D, frame: Transform3D, sd: int) -> MultiMeshInstance3D:
	var mesh := mi.mesh
	if mesh == null:
		return null
	var arr := mesh.surface_get_arrays(0)
	var vs: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
	var ns: PackedVector3Array = arr[Mesh.ARRAY_NORMAL]
	var to_skel := mi.transform   # mesh space → skeleton space (the lip meshes sit straight under the skeleton)
	var axis := frame.basis.z
	var ctr := frame.origin
	var cand: Array[int] = []
	for i in vs.size():
		var p := to_skel * vs[i]
		var nrm := (to_skel.basis * ns[i]).normalized()
		var rad := p - ctr
		rad -= axis * rad.dot(axis)
		var dist := rad.length()
		if dist < RIM_R * 1.15:
			continue
		var s := nrm.dot(axis) - nrm.dot(rad / dist)
		if s > 0.9:
			cand.append(i)
	var rng := RandomNumberGenerator.new()
	rng.seed = sd
	var picked: Array[Vector3] = []
	var xs: Array[Transform3D] = []
	var inv := bone_g.affine_inverse()
	for tries in 4000:
		if cand.is_empty() or xs.size() >= 70:
			break
		var i: int = cand[rng.randi() % cand.size()]
		var p := to_skel * vs[i]
		var far := true
		for q in picked:
			if q.distance_squared_to(p) < 1.3 * 1.3:
				far = false
				break
		if not far:
			continue
		picked.append(p)
		var nrm := (to_skel.basis * ns[i]).normalized()
		var toward := (ctr - p)
		toward -= nrm * toward.dot(nrm)
		var yt := nrm
		var zt := -toward.normalized()   # hook toward the mouth
		var xt := yt.cross(zt).normalized()
		zt = xt.cross(yt)
		var s := rng.randf_range(0.9, 1.7)
		xs.append(inv * Transform3D(Basis(xt, yt, zt).scaled(Vector3(s, s, s)), p - nrm * 0.1))
	if xs.is_empty():
		return null
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.roughness = 0.4
	return _mm("Spines", _spine_mesh(), xs, mat)
