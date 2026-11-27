"""Bake the Mixamo Back Squat loop into powerlifter.glb (powerlifting gym v1).

New clips: Squat (one rep), Grind (stuck at the sticking point, shaking), Hold (standing with the
bar, breathing). The old hand-keyed Squat is kept as "Setup": the theme still uses its first second
to walk under the bar and brace. Breath / Belly / Jaw (bones Mixamo doesn't have) are sampled from
the old clips. The Bar bone follows the two palms every frame.

blender -b -P bake_mixamo.py -- <squat_loop.fbx> <glb in> <glb out> <info json out>
"""
import bpy, sys, json, math
from mathutils import Matrix, Vector, Quaternion

argv = sys.argv[sys.argv.index("--") + 1:]
FBX, GLB_IN, GLB_OUT, INFO_OUT = argv[:4]
SRC_HZ = 30.0

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)
scn = bpy.context.scene
FPS = scn.render.fps / scn.render.fps_base
tgt = next(o for o in bpy.data.objects if o.type == "ARMATURE")
print("tgt world", [round(v, 4) for r in tgt.matrix_world for v in r])
old = {a.name: a for a in bpy.data.actions}
P = "mixamorig:"
order = [b.name for b in tgt.data.bones]


def rest_pose():
    tgt.animation_data.action = None
    for pb in tgt.pose.bones:
        pb.rotation_mode = "QUATERNION"; pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0); pb.scale = (1, 1, 1)
    bpy.context.view_layer.update()


def sample_old(act_name, frame):
    """Armature-space matrices of every bone in an old action at a (24 fps) frame."""
    tgt.animation_data.action = old[act_name]; scn.frame_set(int(frame), subframe=frame % 1)
    return {pb.name: pb.matrix.copy() for pb in tgt.pose.bones}, {pb.name: (pb.location.copy(), pb.rotation_quaternion.copy(), pb.scale.copy()) for pb in tgt.pose.bones}


# Old feet (Hold, first frame): the new clips stand on the same spot.
m_hold, _ = sample_old("Hold", old["Hold"].frame_range[0])
old_feet = (m_hold[P + "LeftFoot"].translation + m_hold[P + "RightFoot"].translation) / 2
rest_pose()


def T(n): return tgt.data.bones[P + n]
def thead(n): return T(n).head_local.copy()
def ttail(n): return T(n).tail_local.copy()


def frame(a, b):
    x = a.normalized(); y = (b - b.dot(x) * x).normalized(); z = x.cross(y)
    return Matrix((x, y, z)).transposed()


leg_t = (thead("LeftLeg") - thead("LeftUpLeg")).length + (thead("LeftFoot") - thead("LeftLeg")).length

# ── source ──
bpy.ops.import_scene.fbx(filepath=FBX)
scn.render.fps, scn.render.fps_base = 24, 1.0   # the FBX import switches the scene to 30 fps
assert FPS == 24, FPS
src = bpy.context.object
Q = next(b.name for b in src.data.bones if b.name.endswith("Hips")).replace("Hips", "")
def S(n): return src.matrix_world @ src.pose.bones[Q + n].head

def lat_s(): return S("LeftArm") - S("RightArm")
def lat_t(): return thead("LeftArm") - thead("RightArm")
def hip_s(): return S("LeftUpLeg") - S("RightUpLeg")
def hip_t(): return thead("LeftUpLeg") - thead("RightUpLeg")
def cf_s(): return lat_s().cross(S("Neck") - S("Spine2"))
def cf_t(): return lat_t().cross(thead("Neck") - thead("Spine2"))

MAP = {
    "Hips": (lambda: (S("Spine") - S("Hips"), hip_s()), lambda: (thead("Spine") - thead("Hips"), hip_t())),
    "Spine": (lambda: (S("Spine1") - S("Spine"), hip_s()), lambda: (thead("Spine1") - thead("Spine"), hip_t())),
    "Spine1": (lambda: (S("Spine2") - S("Spine1"), hip_s() + lat_s()), lambda: (thead("Spine2") - thead("Spine1"), hip_t() + lat_t())),
    "Spine2": (lambda: (S("Neck") - S("Spine2"), lat_s()), lambda: (thead("Neck") - thead("Spine2"), lat_t())),
    # target has Neck + Neck1; source has one Neck: split the bend evenly by aiming both at the head
    "Neck": (lambda: (S("Head") - S("Neck"), lat_s()), lambda: (thead("Head") - thead("Neck"), lat_t())),
    # both rest heads look straight ahead (the glTF bone tail is tilted, so aim the target at +Z)
    "Head": (lambda: (S("HeadTop_End") - S("Head"), lat_s()), lambda: (Vector((0, 0, 1)), lat_t())),
}
for s in ("Left", "Right"):
    MAP[f"{s}Shoulder"] = (lambda s=s: (S(f"{s}Arm") - S(f"{s}Shoulder"), S("Neck") - S("Spine2")),
                           lambda s=s: (thead(f"{s}Arm") - thead(f"{s}Shoulder"), thead("Neck") - thead("Spine2")))
    MAP[f"{s}Arm"] = (lambda s=s: (S(f"{s}ForeArm") - S(f"{s}Arm"), cf_s()),
                      lambda s=s: (thead(f"{s}ForeArm") - thead(f"{s}Arm"), cf_t()))
    MAP[f"{s}ForeArm"] = (lambda s=s: (S(f"{s}Hand") - S(f"{s}ForeArm"), S(f"{s}HandIndex1") - S(f"{s}HandPinky1")),
                          lambda s=s: (thead(f"{s}Hand") - thead(f"{s}ForeArm"), thead(f"{s}HandIndex1") - thead(f"{s}HandPinky1")))
    MAP[f"{s}Hand"] = (lambda s=s: (S(f"{s}HandMiddle1") - S(f"{s}Hand"), S(f"{s}HandIndex1") - S(f"{s}HandPinky1")),
                       lambda s=s: (thead(f"{s}HandMiddle1") - thead(f"{s}Hand"), thead(f"{s}HandIndex1") - thead(f"{s}HandPinky1")))
    for f in ("Thumb", "Index", "Middle", "Ring", "Pinky"):
        for k in (1, 2, 3):
            nb = f"{s}Hand{f}{k}"
            if P + nb not in tgt.data.bones: continue
            nxt = f"{s}Hand{f}{k + 1}"
            tdir = (lambda nb=nb, nxt=nxt: (thead(nxt) if P + nxt in tgt.data.bones else ttail(nb)) - thead(nb))
            MAP[nb] = (lambda s=s, nb=nb, nxt=nxt: (S(nxt) - S(nb), S(f"{s}HandIndex1") - S(f"{s}HandPinky1")),
                       lambda s=s, tdir=tdir: (tdir(), thead(f"{s}HandIndex1") - thead(f"{s}HandPinky1")))
    MAP[f"{s}UpLeg"] = (lambda s=s: (S(f"{s}Leg") - S(f"{s}UpLeg"), S(f"{s}ToeBase") - S(f"{s}Foot")),
                        lambda s=s: (thead(f"{s}Leg") - thead(f"{s}UpLeg"), thead(f"{s}ToeBase") - thead(f"{s}Foot")))
    MAP[f"{s}Leg"] = (lambda s=s: (S(f"{s}Foot") - S(f"{s}Leg"), S(f"{s}ToeBase") - S(f"{s}Foot")),
                      lambda s=s: (thead(f"{s}Foot") - thead(f"{s}Leg"), thead(f"{s}ToeBase") - thead(f"{s}Foot")))
    MAP[f"{s}Foot"] = (lambda s=s: (S(f"{s}ToeBase") - S(f"{s}Foot"), S(f"{s}Leg") - S(f"{s}Foot")),
                       lambda s=s: (thead(f"{s}ToeBase") - thead(f"{s}Foot"), thead(f"{s}Leg") - thead(f"{s}Foot")))
    MAP[f"{s}ToeBase"] = (lambda s=s: (S(f"{s}Toe_End") - S(f"{s}ToeBase"), S(f"{s}Leg") - S(f"{s}Foot")),
                          lambda s=s: (ttail(f"{s}ToeBase") - thead(f"{s}ToeBase"), thead(f"{s}Leg") - thead(f"{s}Foot")))
rest = {n: frame(*tf()) for n, (_, tf) in MAP.items()}
MAP["Neck1"] = MAP["Neck"]   # same aim for the upper neck
rest["Neck1"] = frame((thead("Head") - thead("Neck1")), lat_t())

f0, f1 = (int(v) for v in src.animation_data.action.frame_range)
scn.frame_set(f0)
ratio = leg_t / ((S("LeftLeg") - S("LeftUpLeg")).length + (S("LeftFoot") - S("LeftLeg")).length)
src_feet0 = (S("LeftFoot") + S("RightFoot")) / 2 * ratio
shift = Vector((old_feet.x - src_feet0.x, old_feet.y - src_feet0.y, 0))
print("ratio", round(ratio, 3), "shift", tuple(round(v, 3) for v in shift))

bar_rest = tgt.data.bones["Bar"].matrix_local.to_3x3()
BAR_DROP = Vector((0, 0, -0.017))   # old clips: bar axis 1.7 cm under the palm centre

frames, hips_z = [], []
for f in range(f0, f1 + 1):
    scn.frame_set(f)
    want = {P + n: frame(*sf()) @ rest[n].transposed() @ T(n).matrix_local.to_3x3() for n, (sf, _) in MAP.items()}
    pose = {}
    for name in order:
        bone = tgt.data.bones[name]
        if bone.parent:
            cur = pose[bone.parent.name] @ (bone.parent.matrix_local.inverted() @ bone.matrix_local)
            pose[name] = Matrix.Translation(cur.translation) @ want.get(name, cur.to_3x3()).to_4x4()
        else:
            pose[name] = Matrix.Translation(S("Hips") * ratio + shift) @ want[name].to_4x4()
    frames.append(pose)
    hips_z.append(S("Hips").z * ratio)
bpy.data.objects.remove(src)
for a_ in [a_ for a_ in bpy.data.actions if "mixamo.com" in a_.name]: bpy.data.actions.remove(a_)
old = {k: v for k, v in old.items() if k in bpy.data.actions}


def palms(pose):
    def pc(s): return (pose[P + s + "Hand"].translation + pose[P + s + "HandMiddle1"].translation) / 2
    return pc("Left"), pc("Right")


def set_bar(pose):
    """Two passes: first build the pose, then put Bar between the palms (it's a leaf under Spine2)."""
    pl, pr = palms(pose)
    a = (pl - pr).normalized()
    up = Vector((0, 0, 1)); up = (up - up.dot(a) * a).normalized()
    # rest bar lies along world X with world Z up; rotate that frame onto (a, up), keep the bone's own roll
    F_new = Matrix((a, up, a.cross(up))).transposed()
    F_rest = Matrix(((1, 0, 0), (0, 0, 1), (0, -1, 0))).transposed()
    rot = F_new @ F_rest.transposed() @ bar_rest
    pose["Bar"] = Matrix.Translation((pl + pr) / 2 + BAR_DROP) @ rot.to_4x4()


for p in frames: set_bar(p)
n = len(frames)
bottom = min(range(n), key=lambda i: hips_z[i])
top, low = hips_z[0], hips_z[bottom]
# sticking point: 55 % of the way up on the ascent
k_stick = next(i for i in range(bottom, n) if hips_z[i] >= low + 0.55 * (top - low))
print("frames", n, "bottom", bottom, "stick", k_stick, "depth", round(top - low, 3))


def lerp_pose(a, b, t):
    out = {}
    for name in order:
        la, ra, _ = a[name].decompose(); lb, rb, _ = b[name].decompose()
        out[name] = Matrix.Translation(la.lerp(lb, t)) @ ra.slerp(rb, t).to_matrix().to_4x4()
    return out


def at(u):
    u = max(0.0, min(n - 1.0, u)); i = int(u)
    return frames[i] if i >= n - 1 else lerp_pose(frames[i], frames[i + 1], u - i)


EXTRA = ("mixamorig:Breath", "mixamorig:Belly", "mixamorig:Jaw")


def key(name, poses, extra_from, hz=SRC_HZ):
    """poses: list of armature-space dicts at hz; extra_from(t)->(action, 24fps frame) for Breath/Belly/Jaw."""
    extras = []
    for i in range(len(poses)):
        a, fr = extra_from(i / hz)
        _, loc = sample_old(a, fr)
        extras.append({b: loc[b] for b in EXTRA})
    tgt.animation_data.action = None
    act = bpy.data.actions.new("MX_" + name); act.use_fake_user = True
    tgt.animation_data.action = act
    for i, pose in enumerate(poses):
        f = 1 + i * FPS / hz
        for bname in order:
            bone = tgt.data.bones[bname]; pb = tgt.pose.bones[bname]
            if bname in EXTRA:
                l, q, sc = extras[i][bname]
                pb.location = l; pb.rotation_quaternion = q; pb.scale = sc
                for path in ("location", "rotation_quaternion", "scale"): pb.keyframe_insert(path, frame=f)
                continue
            m = pose[bname]
            if bone.parent:
                off = bone.parent.matrix_local.inverted() @ bone.matrix_local
                basis = off.inverted() @ pose[bone.parent.name].inverted() @ m
            else:
                basis = bone.matrix_local.inverted() @ m
            loc, q, _ = basis.decompose()
            pb.rotation_quaternion = q; pb.keyframe_insert("rotation_quaternion", frame=f)
            if not bone.parent or bname == "Bar":
                pb.location = loc; pb.keyframe_insert("location", frame=f)
    tgt.animation_data.action = None
    print("baked", name, len(poses), "frames", round((len(poses) - 1) / hz, 2), "s")


def old_at(name, t, dur_new):
    a = old[name]; r0, r1 = a.frame_range
    return name, r0 + (r1 - r0) * min(1.0, t / dur_new)


dur_sq = (n - 1) / SRC_HZ
# Squat: the Mixamo rep as is; the old Squat's breathing/jaw stretched over it
key("Squat", frames, lambda t: old_at("Squat", t, dur_sq))

# Grind: 1.5 s loop around the sticking point — slow sag/push plus a 10 Hz tremor (both close the loop)
G = []
for i in range(45):
    t = i / SRC_HZ
    u = k_stick + 1.6 * math.sin(2 * math.pi * t / 1.5) + 0.35 * math.sin(2 * math.pi * 10 * t)
    G.append(at(u))
G.append(G[0])
key("Grind", G, lambda t: old_at("Grind", t, 1.5))

# Hold: standing with the bar, 3 s, the first frame held; breathing from the old Hold
H = [frames[0]] * 91
key("Hold", H, lambda t: old_at("Hold", t, 3.0))

# swap: old Squat -> Setup (still used to get under the bar), old Grind/Hold out
old["Squat"].name = "Setup"
for nm in ("Grind", "Hold"):
    bpy.data.actions.remove(old[nm])
for a in list(bpy.data.actions):
    if a.name.startswith("MX_"): a.name = a.name[3:]
    a.use_fake_user = True
print("actions", sorted(a.name for a in bpy.data.actions))

bpy.ops.export_scene.gltf(filepath=GLB_OUT, export_format="GLB", export_animation_mode="ACTIONS",
                          export_force_sampling=True, export_yup=True)
json.dump({"squatDur": round(dur_sq, 4), "grindAt": round(k_stick / SRC_HZ, 4), "bottomAt": round(bottom / SRC_HZ, 4),
           "ratio": round(ratio, 4)}, open(INFO_OUT, "w"))
print("DONE")
