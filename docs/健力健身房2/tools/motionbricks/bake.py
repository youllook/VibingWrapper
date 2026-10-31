"""Bake MotionBricks BVH clips into powerlifter.glb.

SitDown / StandUp / Walk get their ground motion (hips XY + heading, smoothed) taken out into
mb-root.json, so the clips play in place and the theme moves the container. Sit stays as is.
The seated hips land where the first version's Sit put them, so the bench placement holds.
"""
import bpy, sys, json, math
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:]
CLIPS, GLB_IN, GLB_OUT, ROOT_OUT = argv[:4]
CLIPS = CLIPS.rstrip("/\\")
HEAD_REF = json.load(open(CLIPS + "/head_ref.json"))
SRC_HZ = 30.0

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_IN)
scn = bpy.context.scene
FPS = scn.render.fps / scn.render.fps_base
print("scene fps", FPS)
tgt = next(o for o in bpy.data.objects if o.type == "ARMATURE")
old = {a.name: a for a in bpy.data.actions}
tgt.animation_data.action = None
for pb in tgt.pose.bones:
    pb.rotation_mode = "QUATERNION"; pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0); pb.scale = (1, 1, 1)
bpy.context.view_layer.update()

P = "mixamorig:"
def T(n): return tgt.data.bones[P + n]
def thead(n): return T(n).head_local.copy()
def ttail(n): return T(n).tail_local.copy()

def frame(a, b):
    x = a.normalized(); y = (b - b.dot(x) * x).normalized(); z = x.cross(y)
    return Matrix((x, y, z)).transposed()

order = [b.name for b in tgt.data.bones]
leg_t = (thead("LeftLeg") - thead("LeftUpLeg")).length + (thead("LeftFoot") - thead("LeftLeg")).length

def retarget(bvh_path):
    """Return per-frame {bone: armature-space 4x4} for the target, from one BVH."""
    bpy.ops.import_anim.bvh(filepath=bvh_path, global_scale=0.01, axis_forward="-Z", axis_up="Y",
                            update_scene_fps=False, update_scene_duration=False)
    src = bpy.context.object
    def S(n): return src.matrix_world @ src.pose.bones[n].head
    def lat_s(): return S("LeftArm") - S("RightArm")
    def lat_t(): return thead("LeftArm") - thead("RightArm")
    def hip_s(): return S("LeftLeg") - S("RightLeg")
    def hip_t(): return thead("LeftUpLeg") - thead("RightUpLeg")
    def cf_s(): return lat_s().cross(S("Neck1") - S("Chest"))
    def cf_t(): return lat_t().cross(thead("Neck") - thead("Spine2"))
    V = lambda k: Vector(HEAD_REF[k])
    MAP = {
        "Hips": (lambda: (S("Spine1") - S("Hips"), hip_s()), lambda: (thead("Spine") - thead("Hips"), hip_t())),
        "Spine": (lambda: (S("Chest") - S("Spine1"), hip_s()), lambda: (thead("Spine1") - thead("Spine"), hip_t())),
        "Spine1": (lambda: (S("Chest") - S("Spine2"), hip_s() + lat_s()), lambda: (thead("Spine2") - thead("Spine1"), hip_t() + lat_t())),
        "Spine2": (lambda: (S("Neck1") - S("Chest"), lat_s()), lambda: (thead("Neck") - thead("Spine2"), lat_t())),
        "Neck": (lambda: (S("Neck2") - S("Neck1"), lat_s()), lambda: (thead("Neck1") - thead("Neck"), lat_t())),
        "Neck1": (lambda: (S("Head") - S("Neck2"), lat_s()), lambda: (thead("Head") - thead("Neck1"), lat_t())),
        # The head: the target's rest head is taken to sit like SOMA's reference head (both look ahead).
        "Head": (lambda: (S("HeadEnd") - S("Head"), S("LeftEye") - S("RightEye")),
                 lambda: (V("HeadEnd") - V("Head"), V("LeftEye") - V("RightEye"))),
    }
    for s in ("Left", "Right"):
        MAP[f"{s}Shoulder"] = (lambda s=s: (S(f"{s}Arm") - S(f"{s}Shoulder"), S("Neck1") - S("Chest")),
                               lambda s=s: (thead(f"{s}Arm") - thead(f"{s}Shoulder"), thead("Neck") - thead("Spine2")))
        MAP[f"{s}Arm"] = (lambda s=s: (S(f"{s}ForeArm") - S(f"{s}Arm"), cf_s()),
                          lambda s=s: (thead(f"{s}ForeArm") - thead(f"{s}Arm"), cf_t()))
        MAP[f"{s}ForeArm"] = (lambda s=s: (S(f"{s}Hand") - S(f"{s}ForeArm"), S(f"{s}HandIndex1") - S(f"{s}HandPinky1")),
                              lambda s=s: (thead(f"{s}Hand") - thead(f"{s}ForeArm"), thead(f"{s}HandIndex1") - thead(f"{s}HandPinky1")))
        MAP[f"{s}Hand"] = (lambda s=s: (S(f"{s}HandMiddle1") - S(f"{s}Hand"), S(f"{s}HandIndex1") - S(f"{s}HandPinky1")),
                           lambda s=s: (thead(f"{s}HandMiddle1") - thead(f"{s}Hand"), thead(f"{s}HandIndex1") - thead(f"{s}HandPinky1")))
        MAP[f"{s}UpLeg"] = (lambda s=s: (S(f"{s}Shin") - S(f"{s}Leg"), S(f"{s}ToeBase") - S(f"{s}Foot")),
                            lambda s=s: (thead(f"{s}Leg") - thead(f"{s}UpLeg"), thead(f"{s}ToeBase") - thead(f"{s}Foot")))
        MAP[f"{s}Leg"] = (lambda s=s: (S(f"{s}Foot") - S(f"{s}Shin"), S(f"{s}ToeBase") - S(f"{s}Foot")),
                          lambda s=s: (thead(f"{s}Foot") - thead(f"{s}Leg"), thead(f"{s}ToeBase") - thead(f"{s}Foot")))
        MAP[f"{s}Foot"] = (lambda s=s: (S(f"{s}ToeBase") - S(f"{s}Foot"), S(f"{s}Shin") - S(f"{s}Foot")),
                           lambda s=s: (thead(f"{s}ToeBase") - thead(f"{s}Foot"), thead(f"{s}Leg") - thead(f"{s}Foot")))
        MAP[f"{s}ToeBase"] = (lambda s=s: (S(f"{s}ToeEnd") - S(f"{s}ToeBase"), S(f"{s}Shin") - S(f"{s}Foot")),
                              lambda s=s: (ttail(f"{s}ToeBase") - thead(f"{s}ToeBase"), thead(f"{s}Leg") - thead(f"{s}Foot")))
    rest = {n: frame(*tf()) for n, (_, tf) in MAP.items()}
    f0, f1 = (int(v) for v in src.animation_data.action.frame_range)
    scn.frame_set(f0)
    ratio = leg_t / ((S("LeftShin") - S("LeftLeg")).length + (S("LeftFoot") - S("LeftShin")).length)
    frames = []
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
                pose[name] = Matrix.Translation(S("Hips") * ratio) @ want[name].to_4x4()
        frames.append(pose)
    src_act = src.animation_data.action
    bpy.data.objects.remove(src)
    bpy.data.actions.remove(src_act)
    return frames

def root_of(pose):
    m = pose[P + "Hips"]
    fwd = m.to_3x3() @ (T("Hips").matrix_local.to_3x3().inverted() @ Vector((0, -1, 0)))
    return m.translation.x, m.translation.y, math.atan2(fwd.x, -fwd.y)

def smooth(vals, r=7):
    """Gaussian smoothing, then a linear correction so both ends keep their raw values."""
    n = len(vals); w = [math.exp(-0.5 * (k / (r / 2)) ** 2) for k in range(-r, r + 1)]
    out = [sum(w[k + r] * vals[min(n - 1, max(0, i + k))] for k in range(-r, r + 1)) / sum(w) for i in range(n)]
    d0, d1 = vals[0] - out[0], vals[-1] - out[-1]
    return [out[i] + d0 + (d1 - d0) * i / max(1, n - 1) for i in range(n)]

def unwrap(a):
    out = [a[0]]
    for v in a[1:]:
        d = v - out[-1]; d = math.atan2(math.sin(d), math.cos(d)); out.append(out[-1] + d)
    return out

def M_root(x, y, yaw): return Matrix.Translation((x, y, 0)) @ Matrix.Rotation(yaw, 4, "Z")

def key(name, frames, xform, loop_drop_last=False):
    if loop_drop_last: frames = frames[:-1]
    act = bpy.data.actions.new("MB_" + name); act.use_fake_user = True
    tgt.animation_data.action = act
    for i, pose in enumerate(frames):
        f = 1 + i * FPS / SRC_HZ
        G = xform(i)
        for bname in order:
            bone = tgt.data.bones[bname]; pb = tgt.pose.bones[bname]
            m = G @ pose[bname]
            if bone.parent:
                off = bone.parent.matrix_local.inverted() @ bone.matrix_local
                basis = off.inverted() @ (G @ pose[bone.parent.name]).inverted() @ m
            else:
                basis = bone.matrix_local.inverted() @ m
            loc, q, _ = basis.decompose()
            pb.rotation_quaternion = q; pb.keyframe_insert("rotation_quaternion", frame=f)
            if not bone.parent:
                pb.location = loc; pb.keyframe_insert("location", frame=f)
    tgt.animation_data.action = None
    print("baked", name, len(frames), "frames ->", round((len(frames) - 1) / SRC_HZ, 2), "s")
    return act

SEAT_C = Matrix.Translation((0.004, 0.1, 0))    # where the first version's Sit puts the hips
WALK_C = Matrix.Translation((0.004, 0.025, 0))

sit = retarget(CLIPS + "/Sit.bvh")
A = M_root(*root_of(sit[0]))                    # S_a: the seated pose shared by all the bench clips
roots = {}

def with_root(name, frames, anchor_at_end, C):
    raw = [root_of(p) for p in frames]
    xs, ys = smooth([r[0] for r in raw]), smooth([r[1] for r in raw])
    yaws = smooth(unwrap([r[2] for r in raw]))
    R = [M_root(xs[i], ys[i], yaws[i]) for i in range(len(frames))]
    anchor = A if anchor_at_end is None else (R[-1] if anchor_at_end else R[0])
    rel = [anchor.inverted() @ r for r in R]
    # Blender (x, y) on the ground -> three.js (x, -y); yaw about +Z == yaw about +Y.
    roots[name] = [[round(m.translation.x, 4), round(-m.translation.y, 4), round(math.atan2(m[1][0], m[0][0]), 4)] for m in rel]
    return key(name, frames, lambda i: C @ R[i].inverted())

key("Sit", sit, lambda i: SEAT_C @ A.inverted())
with_root("SitDown", retarget(CLIPS + "/SitDown.bvh"), None, SEAT_C)
with_root("StandUp", retarget(CLIPS + "/StandUp.bvh"), None, SEAT_C)
walk = retarget(CLIPS + "/Walk.bvh")
wr = [root_of(p) for p in walk]
dist = math.hypot(wr[-1][0] - wr[0][0], wr[-1][1] - wr[0][1])
with_root("Walk", walk, False, WALK_C)
roots["walkSpeed"] = round(dist / ((len(walk) - 1) / SRC_HZ), 4)
roots["fps"] = SRC_HZ
del roots["Walk"]
print("walk speed", roots["walkSpeed"])

# Swap in the new clips: the old Walk and Sit go, the rest stay as they were.
for n in ("Walk", "Sit"):
    bpy.data.actions.remove(old[n])
for a in list(bpy.data.actions):
    if a.name.startswith("MB_"):
        a.name = a.name[3:]
    a.use_fake_user = True
print("actions", sorted(a.name for a in bpy.data.actions))

bpy.ops.export_scene.gltf(filepath=GLB_OUT, export_format="GLB", export_animation_mode="ACTIONS",
                          export_force_sampling=True, export_yup=True)
json.dump(roots, open(ROOT_OUT, "w"))
print("DONE")
