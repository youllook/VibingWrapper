# 沙塵滾滾 — Blender 體積塵序列（docs/沙蟲/05-燈光特效氛圍.md）
# The worm's dust wall as a Cycles volume, rendered from the Godot scene's fixed camera as a seamless RGBA loop.
#
#   blender -b -P plume.py -- [--out DIR] [--frames 60] [--still F] [--scale 50] [--samples 48] [--full] [--save x.blend]
#
# Godot (x, y, z) → Blender (x, −z, y). Everything below is in Blender metres (Z up).
# The dust is a cloud of "billows": spheres that are thrown up and outward from the worm's base, brake, sag and
# fall back (heavy sand, not smoke). Every billow's age is periodic in the loop, and the fine detail boils on a
# circle in 4D noise, so frame N == frame 0 — the sequence loops with no cross-fade.
# Geometry Nodes turns the spheres into a density grid (Points to Volume → dilate → blur); the material erodes
# its soft edge with two noise octaves and lights it with a low warm sun from behind-right (backlit rims, amber cores).
import bpy, math, sys, os
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(name, default):
	if name in argv:
		i = argv.index(name)
		return type(default)(argv[i + 1]) if not isinstance(default, bool) else True
	return default

def vec(name, default):
	return tuple(float(v) for v in arg(name, default).split(","))

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = arg("--out", os.path.join(HERE, "out"))
FRAMES = arg("--frames", 60)          # one loop; played at FPS in Godot
FPS = 12
STILL = arg("--still", -1)            # render just this frame
SCALE = arg("--scale", 60)            # % of 1672×941
SAMPLES = arg("--samples", 24)
FULL = arg("--full", False)           # whole frame (no crop) — for checking the composition
SAVE = arg("--save", "")
# the screen region (target pixels, 1672×941) the dust lands in; Godot's plume card is built from the same numbers
# (sand/plume.gd CROP). Keep them in sync.
CROP = (300, 250, 1420, 710)          # x0, y0, x1, y1

VP = (1672, 941)
FOV = 50.0
EYE = 25.0
PITCH = math.asin(0.073636)           # the Godot camera looks 4.22° up

def gd(x, y, z):                      # Godot → Blender
	return Vector((x, -z, y))

WORM_BASE = gd(43.8, 0, -270.3)
MAW = gd(41.0, 81.5, -248.5)
SUN_TO = gd(0.555, 0.08, -0.83).normalized()

# ---------------------------------------------------------------- scene
def reset():
	bpy.ops.wm.read_factory_settings(use_empty=True)
	sc = bpy.context.scene
	sc.render.engine = "CYCLES"
	prefs = bpy.context.preferences.addons["cycles"].preferences
	prefs.compute_device_type = "CUDA"
	prefs.get_devices()
	for d in prefs.devices:
		d.use = d.type == "CUDA"
	sc.cycles.device = "GPU"
	sc.cycles.samples = SAMPLES
	sc.cycles.use_denoising = True
	sc.cycles.denoiser = "OPENIMAGEDENOISE"
	sc.cycles.max_bounces = 6
	sc.cycles.volume_bounces = arg("--vb", 2)
	sc.cycles.volume_step_rate = 1.0
	sc.cycles.volume_max_steps = 512
	sc.cycles.use_adaptive_sampling = True
	sc.render.film_transparent = True
	sc.render.resolution_x, sc.render.resolution_y = VP
	sc.render.resolution_percentage = SCALE
	sc.render.image_settings.file_format = "PNG"
	sc.render.image_settings.color_mode = "RGBA"
	sc.render.image_settings.color_depth = "16"
	sc.view_settings.view_transform = "Standard"
	sc.view_settings.look = "None"
	sc.view_settings.exposure = arg("--exp", 0.7)
	if not FULL:
		sc.render.use_border = True
		sc.render.use_crop_to_border = True
		x0, y0, x1, y1 = CROP
		sc.render.border_min_x = x0 / VP[0]
		sc.render.border_max_x = x1 / VP[0]
		sc.render.border_min_y = 1.0 - y1 / VP[1]   # Blender's border is bottom-up
		sc.render.border_max_y = 1.0 - y0 / VP[1]
	return sc

def camera(sc):
	cd = bpy.data.cameras.new("Cam")
	cd.sensor_fit = "VERTICAL"
	cd.angle = math.radians(FOV)
	cd.clip_start = 0.5
	cd.clip_end = 5000
	cam = bpy.data.objects.new("Cam", cd)
	cam.location = (0, 0, EYE)
	cam.rotation_euler = (math.pi / 2 + PITCH, 0, 0)
	sc.collection.objects.link(cam)
	sc.camera = cam

def world(sc):
	w = bpy.data.worlds.new("Sky")
	w.use_nodes = True
	nt = w.node_tree
	bg = nt.nodes["Background"]
	# warm dusty sky, brighter toward the sun: dot(view direction, sun) → ramp
	tc = nt.nodes.new("ShaderNodeTexCoord")
	ramp = nt.nodes.new("ShaderNodeValToRGB")
	ramp.color_ramp.elements[0].color = (0.5, 0.17, 0.05, 1)
	ramp.color_ramp.elements[1].color = (1.5, 0.6, 0.2, 1)
	dot = nt.nodes.new("ShaderNodeVectorMath"); dot.operation = "DOT_PRODUCT"
	dot.inputs[1].default_value = SUN_TO
	nt.links.new(tc.outputs["Generated"], dot.inputs[0])
	mr = nt.nodes.new("ShaderNodeMapRange")
	mr.inputs["From Min"].default_value = -1; mr.inputs["From Max"].default_value = 1
	nt.links.new(dot.outputs["Value"], mr.inputs["Value"])
	nt.links.new(mr.outputs["Result"], ramp.inputs["Fac"])
	nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
	bg.inputs["Strength"].default_value = arg("--sky", 0.7)
	sc.world = w

def sun(sc):
	ld = bpy.data.lights.new("Sun", "SUN")
	ld.energy = arg("--sun", 10.0)
	ld.color = vec("--sun_c", "1.0,0.55,0.25")
	ld.angle = math.radians(1.5)
	o = bpy.data.objects.new("Sun", ld)
	o.rotation_euler = (-SUN_TO).to_track_quat("-Z", "Y").to_euler()
	sc.collection.objects.link(o)
	# fill: the bright sky and sand behind the camera (mood over optics: the target's billows face us lit)
	fd = bpy.data.lights.new("Fill", "SUN")
	fd.energy = arg("--fill", 2.5)
	fd.color = (1.0, 0.68, 0.42)
	fo = bpy.data.objects.new("Fill", fd)
	fo.rotation_euler = (-Vector(vec("--fill_from", "1,-0.4,0.6"))).normalized().to_track_quat("-Z", "Y").to_euler()
	sc.collection.objects.link(fo)

def holdout_mat(name, col):
	"""Camera sees a hole (the Godot scene shows through); light bounces off it like sand / worm skin."""
	m = bpy.data.materials.new(name)
	m.use_nodes = True
	nt = m.node_tree
	out = nt.nodes["Material Output"]
	for n in list(nt.nodes):
		if n != out: nt.nodes.remove(n)
	lp = nt.nodes.new("ShaderNodeLightPath")
	ho = nt.nodes.new("ShaderNodeHoldout")
	df = nt.nodes.new("ShaderNodeBsdfDiffuse")
	df.inputs["Color"].default_value = col
	mx = nt.nodes.new("ShaderNodeMixShader")
	nt.links.new(lp.outputs["Is Camera Ray"], mx.inputs["Fac"])
	nt.links.new(df.outputs[0], mx.inputs[1])
	nt.links.new(ho.outputs[0], mx.inputs[2])
	nt.links.new(mx.outputs[0], out.inputs["Surface"])
	return m

def blockers(sc):
	sand = holdout_mat("SandHold", (0.8, 0.55, 0.35, 1))
	bpy.ops.mesh.primitive_plane_add(size=4000, location=(0, 0, 0))
	g = bpy.context.object; g.name = "Ground"; g.data.materials.append(sand)
	g.visible_camera = False   # bounce light only; the dust's foot fades out in the material instead of a hard cut
	skin = holdout_mat("WormHold", (0.75, 0.62, 0.48, 1))
	# body: a slightly leaning cylinder from below the sand up into the head
	a = WORM_BASE + Vector((0, 0, -10)); b = Vector((MAW.x, MAW.y + 8, MAW.z - 10))
	mid = (a + b) / 2; d = b - a
	bpy.ops.mesh.primitive_cylinder_add(radius=arg("--body_r", 15.0), depth=d.length, location=mid, vertices=48)
	c = bpy.context.object; c.name = "Body"
	c.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
	c.data.materials.append(skin)
	c.visible_camera = False   # shadow / bounce only: Godot draws the real worm, depth-sorted against the plume card
	# head: a flattened ellipsoid round the mouth (the flaps, the maw) — off by default (--head 1): its shadow
	# read as a dark hole next to the lower lip
	if not arg("--head", False):
		return
	bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=MAW + Vector((0, 6, 0)), segments=48, ring_count=24)
	h = bpy.context.object; h.name = "Head"
	h.scale = (arg("--head_r", 34.0), 14.0, arg("--head_r", 34.0) * 1.05)
	h.data.materials.append(skin)
	h.visible_camera = False

# ---------------------------------------------------------------- billows
rng = np.random.default_rng(7)

def group(n, src, src_r, ang, dist, peak, rad, life=1, xlim=(-1e9, 1e9), ymin=-1e9):
	"""n billows thrown from a ring round `src` (Blender xy). ang: (centre°, spread°) of the outward direction,
	0° = +x (screen right), 90° = +y (away from the camera), -90° = toward the camera."""
	g = {}
	a = np.radians(ang[0] + rng.uniform(-ang[1], ang[1], n))
	rr = src_r[0] + (src_r[1] - src_r[0]) * np.sqrt(rng.uniform(0, 1, n))
	g["sx"] = src[0] + np.cos(a) * rr
	g["sy"] = src[1] + np.sin(a) * rr
	g["ux"], g["uy"] = np.cos(a), np.sin(a)
	g["dist"] = rng.uniform(*dist, n)
	# keep the landing spot inside the target's dust extent (x) and no nearer the camera than ymin
	ex = g["sx"] + g["ux"] * g["dist"]
	g["dist"] = np.where(ex > xlim[1], np.maximum((xlim[1] - g["sx"]) / np.where(g["ux"] > 1e-3, g["ux"], 1), 0), g["dist"])
	ex = g["sx"] + g["ux"] * g["dist"]
	g["dist"] = np.where(ex < xlim[0], np.maximum((xlim[0] - g["sx"]) / np.where(g["ux"] < -1e-3, g["ux"], -1), 0), g["dist"])
	ey = g["sy"] + g["uy"] * g["dist"]
	g["dist"] = np.where(ey < ymin, np.maximum((ymin - g["sy"]) / np.where(g["uy"] < -1e-3, g["uy"], -1), 0), g["dist"])
	g["peak"] = rng.uniform(*peak, n)
	g["rad"] = rng.uniform(*rad, n)
	g["life"] = np.full(n, float(life))          # loops per cycle (1 or 2): keeps every billow periodic
	g["phase"] = rng.uniform(0, 1, n)
	g["spin"] = rng.uniform(-1, 1, n)
	return g

def billows():
	W = (WORM_BASE.x, WORM_BASE.y)
	gs = [
		# the dense core hugging the body: thrown highest, this is what swallows the worm's lower half
		group(45, W, (4, 20), (-90, 180), (5, 25), (25, 55), (15, 24), xlim=(-60, 70)),
		# main eruption round the worm's base: rolling out 20–60 m, mostly toward the camera and left
		group(70, W, (10, 30), (-130, 100), (20, 60), (12, 40), (14, 24), xlim=(-100, 70), ymin=205),
		# the tall dome to the left: the worm's buried back erupting (target x 330–700, up to row ~380)
		group(60, (-55, 320), (0, 45), (-150, 80), (10, 35), (25, 60), (16, 28), xlim=(-100, 0), ymin=225),
		# low skirt rolling out along the sand
		group(50, W, (25, 50), (-130, 100), (30, 70), (2, 8), (10, 18), life=2, xlim=(-100, 75), ymin=195),
		group(30, (-60, 300), (20, 50), (-150, 70), (25, 60), (2, 8), (10, 16), life=2, xlim=(-95, 40), ymin=200),
	]
	b = {k: np.concatenate([g[k] for g in gs]) for k in gs[0]}
	# a dome, not a flat bank: full height between x −90 and 60, sloping down toward both ends of the dust
	f = np.minimum(np.clip(1 - (b["sx"] - 60) / 50, 0, 1), np.clip(1 - (-90 - b["sx"]) / 50, 0, 1))
	b["peak"] *= 0.4 + 0.6 * f
	return b

def streams():
	"""Sand pouring off the head's flaps: columns of small blobs falling at ~terminal speed (loop-periodic)."""
	cols = [(66, 0.0), (74, 0.3), (81, 0.55), (88, 0.15), (95, 0.7), (102, 0.4), (58, 0.85), (-8, 0.4), (-18, 0.65), (10, 0.2)]   # x, phase
	pts = []
	per = 40
	for x, ph in cols:
		top = MAW.z - 12 - abs(x - MAW.x) * 0.15
		for k in range(per):
			pts.append((x + rng.uniform(-3, 3), MAW.y - 14 + rng.uniform(-4, 4), top, ph + k / per, rng.uniform(1.8, 3.2)))
	return np.array(pts)

B = None
S = None
def positions(t):
	"""t in [0, 1): one loop. Returns xyz (n,3) and radius (n,)."""
	a = np.mod(t * B["life"] + B["phase"], 1.0)
	# outward roll: fast then braking (drag)
	k = 3.0
	h = (1 - np.exp(-k * a)) / (1 - np.exp(-k))
	x = B["sx"] + B["ux"] * B["dist"] * h
	y = B["sy"] + B["uy"] * B["dist"] * h
	# thrown up hard, braked, then sagging back down: peak at a ≈ 0.35, the fall is slower and heavier
	z = B["peak"] * np.sin(np.pi * np.power(a, 0.72))
	# grows as it rolls out; born and dying small (dies at the sand)
	r = B["rad"] * (0.45 + 0.55 * np.power(a, 0.5))
	w = np.clip(a / 0.12, 0, 1) * np.clip((1 - a) / 0.18, 0, 1)
	r = r * (0.25 + 0.75 * w * w * (3 - 2 * w))
	z = z + r * 0.15
	# falling sand columns: drop from `top` to the sand once per loop
	sa = np.mod(t + S[:, 3], 1.0)
	sz = S[:, 2] * (1 - sa) + 4.0 * sa
	sx = S[:, 0]; sy = S[:, 1]
	sr = S[:, 4] * (0.7 + 0.6 * sa)
	xyz = np.concatenate([np.stack([x, y, z], 1), np.stack([sx, sy, sz], 1)])
	return xyz, np.concatenate([r, sr])

def dust_object(sc):
	n = len(B["sx"]) + len(S)
	me = bpy.data.meshes.new("Billows")
	me.vertices.add(n)
	me.attributes.new("radius", "FLOAT", "POINT")
	ob = bpy.data.objects.new("Billows", me)
	sc.collection.objects.link(ob)
	ng = bpy.data.node_groups.new("BillowsGN", "GeometryNodeTree")
	ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
	ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
	N = ng.nodes; L = ng.links
	gi = N.new("NodeGroupInput"); go = N.new("NodeGroupOutput")
	ra = N.new("GeometryNodeInputNamedAttribute"); ra.data_type = "FLOAT"; ra.inputs["Name"].default_value = "radius"
	m2p = N.new("GeometryNodeMeshToPoints")
	L.new(gi.outputs[0], m2p.inputs["Mesh"]); L.new(ra.outputs["Attribute"], m2p.inputs["Radius"])
	p2v = N.new("GeometryNodePointsToVolume")
	p2v.inputs["Resolution Mode"].default_value = "Size"
	p2v.inputs["Voxel Size"].default_value = arg("--voxel", 1.0)
	p2v.inputs["Density"].default_value = 1.0
	rb = N.new("GeometryNodeInputRadius")
	L.new(m2p.outputs[0], p2v.inputs["Points"]); L.new(rb.outputs[0], p2v.inputs["Radius"])
	get = N.new("GeometryNodeGetNamedGrid"); get.inputs["Name"].default_value = "density"; get.inputs["Remove"].default_value = True
	L.new(p2v.outputs[0], get.inputs["Volume"])
	dil = N.new("GeometryNodeGridDilateAndErode"); dil.inputs["Steps"].default_value = arg("--dil", 7)
	L.new(get.outputs["Grid"], dil.inputs["Grid"])
	mean = N.new("GeometryNodeGridMean"); mean.inputs["Width"].default_value = 3; mean.inputs["Iterations"].default_value = arg("--blur", 3)
	L.new(dil.outputs[0], mean.inputs["Grid"])
	st = N.new("GeometryNodeStoreNamedGrid"); st.inputs["Name"].default_value = "density"
	L.new(get.outputs["Volume"], st.inputs["Volume"]); L.new(mean.outputs[0], st.inputs["Grid"])
	sm = N.new("GeometryNodeSetMaterial"); sm.inputs["Material"].default_value = dust_mat()
	L.new(st.outputs[0], sm.inputs["Geometry"]); L.new(sm.outputs[0], go.inputs[0])
	mod = ob.modifiers.new("GN", "NODES"); mod.node_group = ng
	return ob

PHASE = None   # Value node: loop angle for the 4D boiling
def dust_mat():
	global PHASE
	m = bpy.data.materials.new("Dust")
	m.use_nodes = True
	nt = m.node_tree; N = nt.nodes; L = nt.links
	out = N["Material Output"]
	for n in list(N):
		if n != out: N.remove(n)
	at = N.new("ShaderNodeAttribute"); at.attribute_name = "density"
	geo = N.new("ShaderNodeNewGeometry")
	PHASE = N.new("ShaderNodeValue"); PHASE.name = "Phase"
	def noise(scale, rad, detail, rough):
		# a circle in (z, w): the pattern boils and returns to itself every loop; plus a slow sag (z drifts down)
		cs = N.new("ShaderNodeMath"); cs.operation = "COSINE"; L.new(PHASE.outputs[0], cs.inputs[0])
		sn = N.new("ShaderNodeMath"); sn.operation = "SINE"; L.new(PHASE.outputs[0], sn.inputs[0])
		ms = N.new("ShaderNodeMath"); ms.operation = "MULTIPLY"; ms.inputs[1].default_value = rad
		L.new(cs.outputs[0], ms.inputs[0])
		cmb = N.new("ShaderNodeCombineXYZ"); L.new(ms.outputs[0], cmb.inputs["Z"])
		add = N.new("ShaderNodeVectorMath"); add.operation = "MULTIPLY_ADD"
		add.inputs[1].default_value = (1 / scale, 1 / scale, 1 / scale)
		L.new(geo.outputs["Position"], add.inputs[0]); L.new(cmb.outputs[0], add.inputs[2])
		mw = N.new("ShaderNodeMath"); mw.operation = "MULTIPLY"; mw.inputs[1].default_value = rad
		L.new(sn.outputs[0], mw.inputs[0])
		tx = N.new("ShaderNodeTexNoise"); tx.noise_dimensions = "4D"
		tx.inputs["Scale"].default_value = 1.0
		tx.inputs["Detail"].default_value = detail
		tx.inputs["Roughness"].default_value = rough
		L.new(add.outputs[0], tx.inputs["Vector"]); L.new(mw.outputs[0], tx.inputs["W"])
		return tx.outputs["Fac"]
	n1 = noise(arg("--n1", 7.0), 0.35, 4.0, 0.55)
	n2 = noise(arg("--n2", 2.6), 0.5, 2.0, 0.5)
	def madd(a, b, k):
		s = N.new("ShaderNodeMath"); s.operation = "SUBTRACT"; s.inputs[1].default_value = 0.5
		L.new(b, s.inputs[0])
		mm = N.new("ShaderNodeMath"); mm.operation = "MULTIPLY_ADD"; mm.inputs[1].default_value = k
		L.new(s.outputs[0], mm.inputs[0]); L.new(a, mm.inputs[2])
		return mm.outputs[0]
	d = madd(at.outputs["Fac"], n1, arg("--a1", 1.2))
	d = madd(d, n2, arg("--a2", 0.2))
	mr = N.new("ShaderNodeMapRange"); mr.interpolation_type = "SMOOTHSTEP"
	mr.inputs["From Min"].default_value = arg("--lo", 0.4)
	mr.inputs["From Max"].default_value = arg("--hi", 0.47)
	mr.inputs["To Max"].default_value = arg("--dens", 0.8)
	L.new(d, mr.inputs["Value"])
	# a thin halo outside the dense edge: where the backlight glows through
	hr = N.new("ShaderNodeMapRange"); hr.interpolation_type = "SMOOTHSTEP"
	hr.inputs["From Min"].default_value = arg("--lo", 0.4) - arg("--halo_w", 0.22)
	hr.inputs["From Max"].default_value = arg("--lo", 0.4)
	hr.inputs["To Max"].default_value = arg("--dens", 0.8) * arg("--halo", 0.08)
	L.new(d, hr.inputs["Value"])
	mx = N.new("ShaderNodeMath"); mx.operation = "MAXIMUM"
	L.new(mr.outputs["Result"], mx.inputs[0]); L.new(hr.outputs["Result"], mx.inputs[1])
	# soft foot on the sand
	sep = N.new("ShaderNodeSeparateXYZ"); L.new(geo.outputs["Position"], sep.inputs[0])
	gf = N.new("ShaderNodeMapRange"); gf.inputs["From Min"].default_value = 0.0; gf.inputs["From Max"].default_value = arg("--foot", 9.0)
	L.new(sep.outputs["Z"], gf.inputs["Value"])
	mul = N.new("ShaderNodeMath"); mul.operation = "MULTIPLY"
	L.new(mx.outputs[0], mul.inputs[0]); L.new(gf.outputs["Result"], mul.inputs[1])
	pv = N.new("ShaderNodeVolumePrincipled")
	pv.inputs["Color"].default_value = vec("--col", "1.0,0.42,0.16") + (1,)             # sand scatter
	pv.inputs["Absorption Color"].default_value = vec("--abs", "0.75,0.35,0.12") + (1,)  # amber in the cores
	pv.inputs["Anisotropy"].default_value = arg("--g", 0.25)            # forward scatter: backlit rims glow
	pv.inputs["Density Attribute"].default_value = ""
	L.new(mul.outputs[0], pv.inputs["Density"])
	L.new(pv.outputs[0], out.inputs["Volume"])
	return m

def set_frame(ob, f):
	t = f / FRAMES
	xyz, r = positions(t)
	ob.data.vertices.foreach_set("co", xyz.astype(np.float32).ravel())
	ob.data.attributes["radius"].data.foreach_set("value", r.astype(np.float32))
	ob.data.update()
	PHASE.outputs[0].default_value = 2 * math.pi * t

def main():
	global B, S
	sc = reset()
	camera(sc); world(sc); sun(sc); blockers(sc)
	B = billows(); S = streams()
	ob = dust_object(sc)
	os.makedirs(OUT, exist_ok=True)
	frames = [STILL] if STILL >= 0 else range(FRAMES)
	for f in frames:
		set_frame(ob, f)
		sc.frame_set(f)
		sc.render.filepath = os.path.join(OUT, "f%03d.png" % f)
		bpy.ops.render.render(write_still=True)
		print("PLUME frame", f, flush=True)
	if SAVE:
		bpy.ops.wm.save_as_mainfile(filepath=SAVE)

main()
