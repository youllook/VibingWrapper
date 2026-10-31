"""MotionBricks clips for powerlifting-gym-2: SitDown, Sit (loop), StandUp, Walk (loop).

Local frame (SOMA, Y up, metres): the seated pose S_a has its hips at x = z = 0 and faces +Z.
Writes one BVH per clip plus head_ref.json (the SOMA reference-pose head vectors in Blender axes).
"""
import json, sys
from pathlib import Path
import numpy as np
import warp as wp
from scipy.spatial.transform import Rotation as R

from motionbricks.io.bvh import load_bvh
from motionbricks.io.usd import load_skeleton_from_usd
from motionbricks.io.utils import SOMA_SKELETON_PRIM_PATH, get_asset_file
from motionbricks.model.contract import MODEL_POSES_PER_TOKEN as K, MODEL_SAMPLE_RATE as HZ
from motionbricks.model.engine import MotionBricksInferenceConfig
from motionbricks.model.soma.contract import SOMA_N1_FP32_ONNX_PATH
from motionbricks.model.soma.engine import MotionBricksSOMAEngine

OUT = Path(r"E:\tmp\mb-work\clips"); OUT.mkdir(exist_ok=True)
M = Path(r"E:\tmp\motionbricks\assets\motions\soma")
UP = np.array([0.0, 1.0, 0.0])
SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 0

wp.init(); wp.set_device("cuda:0")
skel = load_skeleton_from_usd(get_asset_file("human", "soma_base_skel_minimal_no_root.usd"), SOMA_SKELETON_PRIM_PATH)
names = skel.joint_names; parents = skel._np_parent_indices
ref = skel.reference_local_transforms.numpy()
J = len(names)
iL, iR = names.index("LeftLeg"), names.index("RightLeg")

def clip(rel): return load_bvh(str(M / rel), skel)
walk = clip("locomotion/bs_1d_linear/Neutral_walk_forward_002__A057.bvh")
sit_loop = clip("sitting/sit_on_chair_loop.bvh")
sit_stop = clip("sitting/sit_on_chair_stop_R_001__A047.bvh")
dur = lambda c: (c.num_frames - 1) / c.sample_rate

def window(c, t0):
    buf = wp.empty((K, J), dtype=wp.transform)
    for i in range(K): c.sample(t0 + i / HZ, buf[i])
    return buf.numpy()

def fk(pose):
    w = np.zeros((J, 3)); wr = [None] * J
    for j in range(J):
        p, q = pose[j, :3], R.from_quat(pose[j, 3:7])
        if parents[j] < 0: w[j], wr[j] = p, q
        else: w[j] = w[parents[j]] + wr[parents[j]].apply(p); wr[j] = wr[parents[j]] * q
    return w

def facing(pose):
    w = fk(pose); f = np.cross(w[iL] - w[iR], UP); f[1] = 0
    return f / np.linalg.norm(f), w[0]

yaw_of = lambda v: np.arctan2(v[0], v[2])

def place(poses, src_pos, src_dir, dst_pos, dst_dir):
    rot = R.from_euler("y", yaw_of(dst_dir) - yaw_of(src_dir))
    out = poses.copy()
    p = out[..., 0, :3] - np.array([src_pos[0], 0, src_pos[2]])
    out[..., 0, :3] = rot.apply(p.reshape(-1, 3)).reshape(p.shape) + np.array([dst_pos[0], 0, dst_pos[2]])
    q = R.from_quat(out[..., 0, 3:7].reshape(-1, 4))
    out[..., 0, 3:7] = (rot * q).as_quat().reshape(out[..., 0, 3:7].shape)
    return out

to_wp = lambda a: wp.array(a.astype(np.float32), dtype=wp.transform)
Z = np.array([0.0, 0.0, 1.0]); O = np.zeros(3)

# The seated pose S_a, and the transform that puts the loop clip's chair at the origin facing +Z.
s_a = window(sit_loop, 0.5)
f_a, p_a = facing(s_a[0])
seat = lambda w: place(w, p_a, f_a, O, Z)
S_A = seat(s_a)

def norm(v): v = np.asarray(v, float); return v / np.linalg.norm(v)

clips = {}
with MotionBricksSOMAEngine(SOMA_N1_FP32_ONNX_PATH) as eng, wp.ScopedStream(eng.stream):
    ci, ti, out = eng.create_input(skel), eng.create_input(skel), eng.create_output(skel)

    def gen(ctx, tgt, tokens=(8, 9, 10, 11, 12, 13, 14)):
        ci.update_from_poses(to_wp(ctx), stream=eng.stream)
        ti.update_from_poses(to_wp(tgt), stream=eng.stream)
        eng.generate_animation(ci, ti, out, config=MotionBricksInferenceConfig(allowed_token_counts=tuple(tokens)))
        eng.synchronize()
        return out.poses[:out.num_frames].numpy()

    # SitDown: walking toward the bench from 1.3 m in front (a little to the side), turn, sit.
    ctx = window(walk, 2.0 + 0.1 * SEED)
    f_c, p_c = facing(ctx[-1])
    start = np.array([0.35, 0.0, 1.3])
    ctx = place(ctx, p_c, f_c, start, norm(-start * np.array([1, 0, 1])))
    sd = gen(ctx, S_A, range(12, 17))
    clips["SitDown"] = sd

    # Sit: seated idle loop S_a -> S_b -> S_c -> S_a.
    loop, c = [], S_A
    for t in (2.0, 3.6):
        nxt = gen(c, seat(window(sit_loop, t)), range(10, 15)); loop.append(nxt[:-1]); c = nxt[-K:]
    last = gen(c, S_A, range(10, 15)); loop.append(last[:-1])
    clips["Sit"] = np.concatenate(loop)

    # StandUp: from S_a, the end of the stop clip kept relative to its own seated start.
    st0 = window(sit_stop, 0.2); f0, p0 = facing(st0[0])
    stand = place(window(sit_stop, dur(sit_stop) - 0.3), p0, f0, O, Z)
    clips["StandUp"] = gen(S_A, stand, range(10, 17))

    # Walk: a loop. The target is the context itself, 2.6 m further along +Z.
    w = window(walk, 3.0); fw, pw = facing(w[-1])
    w0 = place(w, pw, fw, O, Z)
    w1 = place(w, pw, fw, np.array([0, 0, 2.6]), Z)
    clips["Walk"] = gen(w0, w1, range(13, 17))

for k, v in clips.items():
    r0, r1 = v[0, 0, :3], v[-1, 0, :3]
    print(f"{k}: {len(v)} frames {len(v) / HZ:.2f}s  hips {r0.round(2)} -> {r1.round(2)}")

def write_bvh(path, frames):
    kids = {j: [k for k in range(J) if parents[k] == j] for j in range(J)}
    lines, order = ["HIERARCHY"], []
    def rec(j, d):
        ind = "  " * d; off = ref[j, :3] * 100
        lines.append(f"{ind}{'ROOT' if parents[j] < 0 else 'JOINT'} {names[j]}")
        lines.append(f"{ind}{{"); lines.append(f"{ind}  OFFSET {off[0]:.6f} {off[1]:.6f} {off[2]:.6f}")
        lines.append(f"{ind}  " + ("CHANNELS 6 Xposition Yposition Zposition Zrotation Yrotation Xrotation" if parents[j] < 0 else "CHANNELS 3 Zrotation Yrotation Xrotation"))
        order.append(j)
        if kids[j]:
            for k in kids[j]: rec(k, d + 1)
        else:
            lines.extend([f"{ind}  End Site", f"{ind}  {{", f"{ind}    OFFSET 0 5 0", f"{ind}  }}"])
        lines.append(f"{ind}}}")
    rec(0, 0)
    lines += ["MOTION", f"Frames: {len(frames)}", f"Frame Time: {1 / HZ:.6f}"]
    for f in frames:
        row = []
        for j in order:
            if parents[j] < 0: row += list(f[j, :3] * 100)
            row += list(R.from_quat(f[j, 3:7]).as_euler("ZYX", degrees=True))
        lines.append(" ".join(f"{v:.5f}" for v in row))
    path.write_text("\n".join(lines) + "\n")

for k, v in clips.items(): write_bvh(OUT / f"{k}.bvh", v)

# Reference-pose head vectors, SOMA (x, y, z) -> Blender (x, -z, y).
w = fk(ref)
b = lambda v: [float(v[0]), float(-v[2]), float(v[1])]
hd = {n: b(w[names.index(n)]) for n in ("Head", "HeadEnd", "LeftEye", "RightEye")}
(OUT / "head_ref.json").write_text(json.dumps(hd))
print("head ref", {k: [round(x, 3) for x in v] for k, v in hd.items()})
