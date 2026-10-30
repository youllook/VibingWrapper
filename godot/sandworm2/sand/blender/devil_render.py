# 塵捲風 flipbook（導流線序列）：Blender 背景跑，算一根 25 m 塵捲風的無縫循環，輸出每格 RGBA PNG。
#   blender -b --factory-startup -P sand/blender/devil_render.py -- --variant 0 --out E:/tmp/devil_fb [--frames 72] [--test 1]
# 之後 python sand/blender/devil_atlas.py 把格子拼成 sand/textures/devil_fb_<v>.png。
#
# 做法（"AI agent + Blender: a tornado built with code"）：
#   - 導流線：一組螺旋線，半徑隨高度變寬（R(z)），中心線隨時間擺動（sway）。
#   - 沙粒／小沙團沿導流線繞圈爬升；一部分在半途被甩出，之後只受重力落回；底部另有一圈被踢起再落下的跳沙。
#   - 薄塵套：Cycles 體積，密度＝圍著擺動中心線的空心管 × 螺旋條紋雜訊；條紋在「跟著轉」的座標系取樣
#     （角度 = ωt − κz），轉一圈剛好回到原樣，看起來像條紋往上爬（理髮店旋轉燈），所以循環天生無縫。
#   - 每個粒子的狀態只是 s = frac(k·t/T + φ) 的函數（k 整數）→ 第 T 秒與第 0 秒完全一樣。
#   - 灰階打光（白色塵、白色太陽）：顏色在 Godot 用 tint／shade／glow 上，貼圖只帶明暗＋透明度。
import bpy, math, sys, os, argparse
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--variant", type=int, default=0)
ap.add_argument("--out", default="E:/tmp/devil_fb")
ap.add_argument("--frames", type=int, default=72)
ap.add_argument("--res", type=int, default=2)        # render at res× the atlas cell, downsampled by devil_atlas.py
ap.add_argument("--samples", type=int, default=96)
ap.add_argument("--test", type=int, default=0)       # >0: render only that many frames spread over the loop
A = ap.parse_args(argv)

# ---- shared numbers (devil_fb.gd mirrors CELL / ORTHO / BASE_V) ----
H = 25.0                 # column height (m)
T = 4.0                  # loop length (s)
CELL = (160, 320)        # atlas cell (px)
ORTHO = 30.0             # frame height in metres
PITCH = math.radians(6.0)  # our camera is ~25 m up, ~120 m out: looks down ~6°
DIST = 120.0
SUN_TO = (0.555, 0.83, 0.08)  # toward the sun (Blender: +Y = away from camera, Z up) — ahead-right, low
R0, R1 = 0.7, 2.4        # flow-guide radius at the base / top
OMEGA = 2.0 * math.pi * 2.0 / T   # two turns per loop (0.5 rev/s)
KAPPA = 0.8              # helix twist (rad/m): streaks climb at OMEGA/KAPPA ≈ 3.9 m/s
G = 9.8
PUFF = 1.1              # extra radius at the top: the column opens into a soft head

V = A.variant
SWAY = [1.1, 1.5][V % 2]          # metres at the top
LEAN = [(0.0, 0.0), (-0.5, 0.3)][V % 2]
rng = np.random.default_rng(1234 + 97 * V)
PH = rng.uniform(0, 2 * math.pi, 4)


def sway_at(t):
    """centre offset at the top (x, y) at time t; periodic in T"""
    w = 2 * math.pi / T
    ax = SWAY * (math.sin(w * t + PH[0]) + 0.35 * math.sin(2 * w * t + PH[1])) + LEAN[0]
    ay = 0.6 * SWAY * (math.cos(w * t + PH[2]) + 0.35 * math.sin(2 * w * t + PH[3])) + LEAN[1]
    return ax, ay


def radius_at(z):
    s = np.clip(z / H, 0.0, 1.0)
    puff = np.clip((s - 0.72) / 0.28, 0.0, 1.0)
    return R0 + (R1 - R0) * s ** 0.8 + PUFF * puff * puff * (3 - 2 * puff)


# ---------------------------------------------------------------- scene
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
for dt in ("CUDA", "OPTIX"):   # OptiX kernel fails to compile on this machine (2060S)
    try:
        prefs.compute_device_type = dt
        prefs.get_devices()
        gpus = [d for d in prefs.devices if d.type == dt]
        if gpus:
            for d in prefs.devices:
                d.use = d.type == dt
            sc.cycles.device = "GPU"
            print("GPU", dt, [d.name for d in gpus])
            break
    except TypeError:
        pass
sc.cycles.samples = A.samples
sc.cycles.use_denoising = False
sc.cycles.max_bounces = 4
sc.cycles.volume_bounces = 1
for k, v in (("volume_step_rate", 0.5), ("volume_max_steps", 512)):
    try:
        setattr(sc.cycles, k, v)
    except Exception:
        pass
sc.render.film_transparent = True
sc.render.resolution_x = CELL[0] * A.res
sc.render.resolution_y = CELL[1] * A.res
sc.render.resolution_percentage = 100
sc.render.image_settings.file_format = "PNG"
sc.render.image_settings.color_mode = "RGBA"
sc.render.image_settings.color_depth = "8"
try:
    sc.view_settings.view_transform = "Standard"
except TypeError:
    pass

# world: dim neutral fill (the sky and the lit sand around it)
w = bpy.data.worlds.new("W")
sc.world = w
bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs["Color"].default_value = (0.16, 0.16, 0.16, 1)
bg.inputs["Strength"].default_value = 1.0

# sun: light travels away from SUN_TO
sun_d = bpy.data.lights.new("Sun", "SUN")
sun_d.energy = 3.0
sun_d.angle = math.radians(1.0)
sun = bpy.data.objects.new("Sun", sun_d)
sc.collection.objects.link(sun)
sun.rotation_euler = (-__import__("mathutils").Vector(SUN_TO)).to_track_quat("-Z", "Y").to_euler()

# camera: orthographic, ~120 m out, looking +Y and ~6° down at the column's middle
cam_d = bpy.data.cameras.new("Cam")
cam_d.type = "ORTHO"
cam_d.ortho_scale = ORTHO
cam_d.clip_start = 1.0
cam_d.clip_end = 400.0
cam = bpy.data.objects.new("Cam", cam_d)
sc.collection.objects.link(cam)
sc.camera = cam
aim = (0.0, 0.0, 12.6)
cam.location = (0.0, aim[1] - DIST * math.cos(PITCH), aim[2] + DIST * math.sin(PITCH))
cam.rotation_euler = (math.pi / 2 - PITCH, 0.0, 0.0)
bpy.context.view_layer.update()
from bpy_extras.object_utils import world_to_camera_view
import mathutils
base_uv = world_to_camera_view(sc, cam, mathutils.Vector((0, 0, 0)))
top_uv = world_to_camera_view(sc, cam, mathutils.Vector((0, 0, H)))
print("BASE_V", round(base_uv.y, 4), "TOP_V", round(top_uv.y, 4), "frame width m", ORTHO * CELL[0] / CELL[1])

# ---------------------------------------------------------------- dusty sheath (volume)
mat = bpy.data.materials.new("DevilVol")
nt = mat.node_tree
N = nt.nodes
L = nt.links
for n in list(N):
    N.remove(n)
out = N.new("ShaderNodeOutputMaterial")


def sock(x):
    return x


def _in(node, i, v):
    if isinstance(v, (int, float)):
        node.inputs[i].default_value = v
    else:
        L.new(v, node.inputs[i])


def M(op, a, b=None, clamp=False):
    n = N.new("ShaderNodeMath")
    n.operation = op
    n.use_clamp = clamp
    _in(n, 0, a)
    if b is not None:
        _in(n, 1, b)
    return n.outputs[0]


def value(v):
    n = N.new("ShaderNodeValue")
    n.outputs[0].default_value = v
    return n


def maprange(x, a, b, c=0.0, d=1.0, smooth=True):
    n = N.new("ShaderNodeMapRange")
    n.interpolation_type = "SMOOTHSTEP" if smooth else "LINEAR"
    n.clamp = True
    L.new(x, n.inputs["Value"])
    n.inputs["From Min"].default_value = a
    n.inputs["From Max"].default_value = b
    n.inputs["To Min"].default_value = c
    n.inputs["To Max"].default_value = d
    return n.outputs["Result"]


geo = N.new("ShaderNodeNewGeometry")
sep = N.new("ShaderNodeSeparateXYZ")
L.new(geo.outputs["Position"], sep.inputs[0])
x, y, z = sep.outputs[0], sep.outputs[1], sep.outputs[2]
v_ax, v_ay, v_wt = value(0.0), value(0.0), value(0.0)   # set per frame: sway at the top, ω·t
s = M("DIVIDE", z, H, clamp=True)
sp = M("POWER", s, 1.5)
qx = M("SUBTRACT", x, M("MULTIPLY", v_ax.outputs[0], sp))
qy = M("SUBTRACT", y, M("MULTIPLY", v_ay.outputs[0], sp))
rho = M("SQRT", M("ADD", M("MULTIPLY", qx, qx), M("MULTIPLY", qy, qy)))
R = M("ADD", M("ADD", R0, M("MULTIPLY", R1 - R0, M("POWER", s, 0.8))), M("MULTIPLY", PUFF, maprange(s, 0.72, 1.0)))
u = M("DIVIDE", rho, R)
wall = M("EXPONENT", M("MULTIPLY", -1.0, M("POWER", M("MULTIPLY", M("SUBTRACT", u, 0.62), 2.6), 2.0)))
core = M("MULTIPLY", 0.3, M("EXPONENT", M("MULTIPLY", -1.0, M("POWER", M("MULTIPLY", u, 2.0), 2.0))))
radial = M("ADD", wall, core)
# co-rotating frame: angle ωt − κz → streak pattern spins and reads as climbing
ang = M("SUBTRACT", v_wt.outputs[0], M("MULTIPLY", z, KAPPA))
cmb = N.new("ShaderNodeCombineXYZ")
L.new(qx, cmb.inputs[0]); L.new(qy, cmb.inputs[1]); L.new(M("MULTIPLY", z, 0.22), cmb.inputs[2])
rot = N.new("ShaderNodeVectorRotate")
rot.rotation_type = "Z_AXIS"
rot.invert = True
L.new(cmb.outputs[0], rot.inputs["Vector"])
L.new(ang, rot.inputs["Angle"])
noise = N.new("ShaderNodeTexNoise")
noise.noise_dimensions = "4D"
L.new(rot.outputs[0], noise.inputs["Vector"])
noise.inputs["W"].default_value = 3.7 * V + 0.5
noise.inputs["Scale"].default_value = 0.55
noise.inputs["Detail"].default_value = 6.0
noise.inputs["Roughness"].default_value = 0.62
streak = maprange(noise.outputs["Fac"], 0.36, 0.7)
f_bot = maprange(z, -0.2, 0.8)
f_top = maprange(z, 0.84 * H, 1.02 * H, 1.0, 0.0)   # z, not s: s is clamped at 1
col = M("MULTIPLY", M("MULTIPLY", radial, streak), M("MULTIPLY", f_bot, f_top))
# base skirt: a low ring of kicked-up dust around the foot
rb = M("SQRT", M("ADD", M("MULTIPLY", x, x), M("MULTIPLY", y, y)))
ring = M("EXPONENT", M("MULTIPLY", -1.0, M("POWER", M("DIVIDE", M("SUBTRACT", rb, 1.8), 1.7), 2.0)))
skirt = M("MULTIPLY", M("MULTIPLY", ring, M("EXPONENT", M("DIVIDE", z, -1.3))), M("MULTIPLY", streak, f_bot))
dens = M("MULTIPLY", M("ADD", col, M("MULTIPLY", skirt, 0.8)), 0.75)
pv = N.new("ShaderNodeVolumePrincipled")
pv.inputs["Color"].default_value = (0.85, 0.85, 0.85, 1)
pv.inputs["Anisotropy"].default_value = 0.55
L.new(dens, pv.inputs["Density"])
L.new(pv.outputs[0], out.inputs["Volume"])

bpy.ops.mesh.primitive_cube_add(size=1.0)
dom = bpy.context.active_object
dom.name = "DustDomain"
dom.scale = (22.0, 22.0, 30.0)
dom.location = (0.0, 0.0, 14.5)
dom.data.materials.append(mat)

# ---------------------------------------------------------------- grains and clumps (points riding the guides)
NC, NS = 1500, 500
NP = NC + NS
k_c = rng.choice([1, 2], NC, p=[0.55, 0.45]).astype(float)
ph_c = rng.uniform(0, 1, NC)
th0_c = rng.uniform(0, 2 * math.pi, NC)
turns_c = rng.uniform(2.0, 3.4, NC) / k_c                    # turns per life → ~0.5–0.85 rev/s like the sheath
hmax_c = rng.uniform(0.45, 1.04, NC)
rf_c = rng.uniform(0.35, 1.08, NC)
fl_c = rng.uniform(0, 1, NC) < 0.32                           # these get flung out partway up
sf_c = rng.uniform(0.25, 0.75, NC)
kick_c = rng.uniform(1.0, 3.5, NC)
k_s = rng.choice([2, 3, 4], NS).astype(float)
ph_s = rng.uniform(0, 1, NS)
th0_s = rng.uniform(0, 2 * math.pi, NS)
r0_s = rng.uniform(0.6, 2.2, NS)
vr_s = rng.uniform(1.5, 5.0, NS)
vt_s = rng.uniform(2.0, 6.0, NS)
vz_s = rng.uniform(1.5, 6.5, NS)
size = rng.uniform(0.03, 0.065, NP)
clump = rng.uniform(0, 1, NP) < 0.06
size[clump] = rng.uniform(0.09, 0.17, clump.sum())


def climber_state(t):
    life = T / k_c
    s = np.mod(k_c * t / T + ph_c, 1.0)
    def guide(ss, tt):
        zz = H * hmax_c * ss ** 0.8
        th = th0_c + 2 * math.pi * turns_c * ss
        rr = radius_at(zz) * rf_c
        ax, ay = np.vectorize(sway_at)(tt)
        sp = np.clip(zz / H, 0, 1) ** 1.5
        return np.stack([np.cos(th) * rr + ax * sp, np.sin(th) * rr + ay * sp, zz], 1), th, rr
    p, th, rr = guide(s, np.full(NC, t))
    a = np.clip(s / 0.06, 0, 1) * np.clip((1.0 - s) / 0.1, 0, 1)
    # flung ones: leave the guide at sf with its tangential speed plus a kick outward, then ballistic
    fl = fl_c & (s > sf_c)
    if fl.any():
        tau = (s - sf_c) * life
        tf = t - tau
        pf, thf, rrf = guide(sf_c, tf)
        wang = 2 * math.pi * turns_c * k_c / T                    # rad/s along the guide
        vt = wang * rrf * 0.55
        vz = H * hmax_c * 0.8 * np.maximum(sf_c, 1e-3) ** -0.2 * k_c / T * 0.5
        vx = -np.sin(thf) * vt + np.cos(thf) * kick_c
        vy = np.cos(thf) * vt + np.sin(thf) * kick_c
        drag = (1 - np.exp(-0.6 * tau)) / 0.6                     # light air drag on the horizontal motion
        q = np.stack([pf[:, 0] + vx * drag, pf[:, 1] + vy * drag, pf[:, 2] + vz * tau - 0.5 * G * tau ** 2], 1)
        p = np.where(fl[:, None], q, p)
        land = q[:, 2] < 0.0
        a = np.where(fl & land, 0.0, a)
        a = np.where(fl, np.clip(s / 0.06, 0, 1) * np.clip((1.0 - s) / 0.05, 0, 1) * (~land), a)
    return p, a


def skirt_state(t):
    life = T / k_s
    s = np.mod(k_s * t / T + ph_s, 1.0)
    tau = s * life
    c, sn = np.cos(th0_s), np.sin(th0_s)
    drag = (1 - np.exp(-0.8 * tau)) / 0.8
    x = c * (r0_s + vr_s * drag) - sn * vt_s * drag
    y = sn * (r0_s + vr_s * drag) + c * vt_s * drag
    zz = vz_s * tau - 0.5 * G * tau ** 2
    a = np.clip(s / 0.05, 0, 1) * (zz > 0.0) * np.clip((1.0 - s) / 0.05, 0, 1)
    return np.stack([x, y, np.maximum(zz, 0.0)], 1), a


me = bpy.data.meshes.new("Grains")
me.from_pydata([(0, 0, 0)] * NP, [], [])
me.attributes.new("radius", "FLOAT", "POINT")
me.attributes.new("alpha", "FLOAT", "POINT")
grains = bpy.data.objects.new("Grains", me)
sc.collection.objects.link(grains)
ng = bpy.data.node_groups.new("ToPoints", "GeometryNodeTree")
ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
gi = ng.nodes.new("NodeGroupInput")
go = ng.nodes.new("NodeGroupOutput")
m2p = ng.nodes.new("GeometryNodeMeshToPoints")
na = ng.nodes.new("GeometryNodeInputNamedAttribute")
na.data_type = "FLOAT"
na.inputs["Name"].default_value = "radius"
setm = ng.nodes.new("GeometryNodeSetMaterial")
ng.links.new(gi.outputs[0], m2p.inputs["Mesh"])
ng.links.new(na.outputs["Attribute"], m2p.inputs["Radius"])
ng.links.new(m2p.outputs[0], setm.inputs["Geometry"])
ng.links.new(setm.outputs[0], go.inputs[0])
gmat = bpy.data.materials.new("Grain")
gn = gmat.node_tree
for n in list(gn.nodes):
    gn.nodes.remove(n)
gout = gn.nodes.new("ShaderNodeOutputMaterial")
attr = gn.nodes.new("ShaderNodeAttribute")
attr.attribute_type = "GEOMETRY"
attr.attribute_name = "alpha"
dif = gn.nodes.new("ShaderNodeBsdfDiffuse")
dif.inputs["Color"].default_value = (0.42, 0.42, 0.42, 1)
tr = gn.nodes.new("ShaderNodeBsdfTranslucent")
tr.inputs["Color"].default_value = (0.5, 0.5, 0.5, 1)
mix1 = gn.nodes.new("ShaderNodeMixShader")
mix1.inputs[0].default_value = 0.3
gn.links.new(dif.outputs[0], mix1.inputs[1]); gn.links.new(tr.outputs[0], mix1.inputs[2])
trn = gn.nodes.new("ShaderNodeBsdfTransparent")
mix2 = gn.nodes.new("ShaderNodeMixShader")
gn.links.new(attr.outputs["Fac"], mix2.inputs[0])
gn.links.new(trn.outputs[0], mix2.inputs[1]); gn.links.new(mix1.outputs[0], mix2.inputs[2])
gn.links.new(mix2.outputs[0], gout.inputs["Surface"])
setm.inputs["Material"].default_value = gmat
mod = grains.modifiers.new("ToPoints", "NODES")
mod.node_group = ng

# ---------------------------------------------------------------- frames
odir = os.path.join(A.out, "v%d" % V)
os.makedirs(odir, exist_ok=True)
idx = range(A.frames) if A.test <= 0 else [int(i * A.frames / A.test) for i in range(A.test)]
for i in idx:
    t = T * i / A.frames
    ax, ay = sway_at(t)
    v_ax.outputs[0].default_value = ax
    v_ay.outputs[0].default_value = ay
    v_wt.outputs[0].default_value = OMEGA * t
    pc, acl = climber_state(t)
    ps, ask = skirt_state(t)
    P = np.concatenate([pc, ps]).astype(np.float32)
    Aa = np.concatenate([acl, ask]).astype(np.float32)
    me.vertices.foreach_set("co", P.ravel())
    me.attributes["radius"].data.foreach_set("value", (size * (Aa > 0.01)).astype(np.float32))
    me.attributes["alpha"].data.foreach_set("value", Aa)
    me.update()
    sc.render.filepath = os.path.join(odir, "f_%03d.png" % i)
    bpy.ops.render.render(write_still=True)
    print("FRAME", V, i, flush=True)
print("DONE", odir)
