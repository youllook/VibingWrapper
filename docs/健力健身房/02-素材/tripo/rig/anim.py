# 健力選手 8 段動作：IK 擺腳／手、逐格解前傾讓槓維持在腳掌中段，最後烘成純 FK 關鍵影格
# blender -b -P anim.py   → E:\tmp\gym\tripo\powerlifter_anim.blend
# 座標：Blender 世界，Z 上、角色面朝 -Y、單位公尺（身高 1.80）
import bpy, math, sys
from mathutils import Vector, Matrix, Euler, Quaternion
from bpy_extras import anim_utils

SRC = r"E:\tmp\gym\tripo\powerlifter_rig_180.blend"
OUT = r"E:\tmp\gym\tripo\powerlifter_anim.blend"
FPS = 30
M = 'mixamorig:'
ONLY = sys.argv[sys.argv.index('--') + 1].split(',') if '--' in sys.argv else None

bpy.ops.wm.open_mainfile(filepath=SRC)
sc = bpy.context.scene
sc.render.fps = FPS
arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
me = [o for o in bpy.data.objects if o.type == 'MESH'][0]
AWM = arm.matrix_world.copy()
AW = AWM.inverted()

# ---------- 1. Bar 骨（高槓位置：斜方肌上緣） ----------
BAR = Vector((0.004, 0.172, 1.495))
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
eb = arm.data.edit_bones
if 'Bar' not in eb:
    b = eb.new('Bar'); b.head = AW @ BAR; b.tail = AW @ (BAR + Vector((0.2, 0, 0)))
    b.parent = eb[M + 'Spine2']; b.use_deform = False; b.roll = 0
bpy.ops.object.mode_set(mode='OBJECT')
me.modifiers[0].show_viewport = False   # 解算時不算網格變形，快很多

PB = arm.pose.bones
def P(n): return PB.get(M + n) or PB.get(n)
for pb in PB: pb.rotation_mode = 'QUATERNION'

def rest_w(n):  # 骨頭靜止的世界矩陣
    return AWM @ P(n).bone.matrix_local

# ---------- 2. IK 目標空物件 ----------
def empty(name):
    o = bpy.data.objects.get(name) or bpy.data.objects.new(name, None)
    if o.name not in sc.collection.objects: sc.collection.objects.link(o)
    o.rotation_mode = 'QUATERNION'
    return o
E = {k: empty(k) for k in ['ft_L', 'ft_R', 'kp_L', 'kp_R', 'ht_L', 'ht_R', 'ep_L', 'ep_R']}
SIDE = {'L': 'Left', 'R': 'Right'}
CON = {}
for s, S in SIDE.items():
    leg = P(S + 'Leg'); c = leg.constraints.new('IK'); c.target = E['ft_' + s]; c.pole_target = E['kp_' + s]; c.chain_count = 2
    f = P(S + 'Foot'); cf = f.constraints.new('COPY_ROTATION'); cf.target = E['ft_' + s]
    fa = P(S + 'ForeArm'); ca = fa.constraints.new('IK'); ca.target = E['ht_' + s]; ca.pole_target = E['ep_' + s]; ca.chain_count = 2
    h = P(S + 'Hand'); ch = h.constraints.new('COPY_ROTATION'); ch.target = E['ht_' + s]
    CON[s] = dict(leg=c, foot=cf, arm=ca, hand=ch)

dg = bpy.context.evaluated_depsgraph_get()
def upd(): bpy.context.view_layer.update()
def evm(n):  # 評估後的世界矩陣
    ob = arm.evaluated_get(bpy.context.evaluated_depsgraph_get())
    pb = ob.pose.bones.get(M + n) or ob.pose.bones.get(n)
    return AWM @ pb.matrix

REST = {n: rest_w(n) for n in ['LeftFoot', 'RightFoot', 'LeftLeg', 'RightLeg', 'LeftForeArm', 'RightForeArm',
                               'LeftHand', 'RightHand', 'Hips', 'Bar']}

# 手掌法向（靜止時，朝掌心）
def palm_normal(S):
    d = (REST[S + 'Hand'].to_3x3() @ Vector((0, 1, 0))).normalized()
    i = rest_w(S + 'HandIndex1').translation; p = rest_w(S + 'HandPinky1').translation
    n = d.cross(i - p).normalized()
    return n if S == 'Left' else -n
PALM = {s: palm_normal(S) for s, S in SIDE.items()}

def frame_rot(d, n):  # 以 (指向, 掌心) 建正交框
    d = d.normalized(); n = (n - d * n.dot(d)).normalized()
    return Matrix((d, n, d.cross(n))).transposed()

def hand_world_rot(s, d, n):
    S = SIDE[s]
    Rr = REST[S + 'Hand'].to_3x3().normalized()
    d0 = Rr @ Vector((0, 1, 0))
    R = frame_rot(d, n) @ frame_rot(d0, PALM[s]).transposed()
    return (R @ Rr).to_quaternion()

# ---------- 3. 極向量角度：讓靜止時 IK 解回原姿 ----------
def search_pole(s):
    S = SIDE[s]
    for kind, bone, tgt, pole, pdir in [('leg', S + 'Leg', 'ft_', 'kp_', Vector((0, -0.6, 0))),
                                        ('arm', S + 'ForeArm', 'ht_', 'ep_', Vector((0, 0.6, 0)))]:
        end = 'Foot' if kind == 'leg' else 'Hand'
        E[tgt + s].location = REST[S + end].translation; E[tgt + s].rotation_quaternion = REST[S + end].to_quaternion()
        E[pole + s].location = REST[bone].translation + pdir
        best = None
        for a in range(-180, 180, 3):
            CON[s][kind].pole_angle = math.radians(a); upd()
            err = (evm(bone).translation - REST[bone].translation).length + \
                  (evm(bone).to_3x3().col[1].normalized() - REST[bone].to_3x3().col[1].normalized()).length * 0.1
            if best is None or err < best[0]: best = (err, a)
        CON[s][kind].pole_angle = math.radians(best[1])
        print('pole', s, kind, best)
for s in SIDE: search_pole(s)

# ---------- 4. 控制工具 ----------
def reset():
    for pb in PB:
        pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0); pb.scale = (1, 1, 1)

def wrot(n, x=0, y=0, z=0, R=None):
    """世界軸增量（在骨頭靜止框套用，會跟著父骨走）。x 正＝前彎，y＝側傾，z＝水平轉。疊加在既有旋轉上。"""
    pb = P(n)
    if pb is None: return
    if R is None: R = Euler((math.radians(x), math.radians(y), math.radians(z)), 'XYZ').to_matrix()
    B = rest_w(n).to_3x3().normalized()
    q = (B.inverted() @ R @ B).to_quaternion()
    pb.rotation_quaternion = pb.rotation_quaternion @ q

def set_hips(pos, x=0, y=0, z=0):
    pb = P('Hips'); B = REST['Hips']
    pb.location = B.to_3x3().normalized().inverted() @ (Vector(pos) - B.translation)
    wrot('Hips', x, y, z)

FINGERS = ['Index', 'Middle', 'Ring', 'Pinky']
def curl(deg, thumb=None):
    for s, S in SIDE.items():
        n = PALM[s]
        for f in FINGERS:
            for k in (1, 2, 3):
                bn = f'{S}Hand{f}{k}'
                if P(bn) is None: continue
                d = rest_w(bn).to_3x3().col[1].normalized()
                ax = d.cross(n).normalized()
                wrot(bn, R=Matrix.Rotation(math.radians(deg * (0.8 if k == 1 else 1.0)), 3, ax))
        if thumb:
            for k in (2, 3):
                bn = f'{S}HandThumb{k}'
                d = rest_w(bn).to_3x3().col[1].normalized()
                wrot(bn, R=Matrix.Rotation(math.radians(thumb), 3, d.cross(n).normalized()))

ANKLE = {s: REST[S + 'Foot'].translation.copy() for s, S in SIDE.items()}
def foot(s, dy=0, dz=0, pitch=0, dx=0):
    S = SIDE[s]
    E['ft_' + s].location = ANKLE[s] + Vector((dx, dy, dz))
    q = REST[S + 'Foot'].to_quaternion()
    E['ft_' + s].rotation_quaternion = Quaternion(Vector((1, 0, 0)), math.radians(pitch)) @ q
    sx = 1 if s == 'L' else -1
    E['kp_' + s].location = ANKLE[s] + Vector((dx + sx * 0.30, dy - 0.8, 0.45))

def arms_ik(on):
    for s in SIDE:
        CON[s]['arm'].influence = on; CON[s]['hand'].influence = on

def hand(s, pos, d, n, pole):
    E['ht_' + s].location = Vector(pos)
    E['ht_' + s].rotation_quaternion = hand_world_rot(s, Vector(d), Vector(n))
    E['ep_' + s].location = Vector(pole)

def breath(sv=1.0, belly=0.0, jaw=0.0):
    P('Breath').scale = (sv, sv, sv)
    P('Belly').location = (0, belly, 0)
    wrot('Jaw', jaw)

def head_chain(total, turn=0):
    for n, k in (('Neck', 0.3), ('Neck1', 0.3), ('Head', 0.4)):
        wrot(n, total * k, 0, turn * k)

def spine(total, side=0, twist=0):
    for n, k in (('Spine', 0.35), ('Spine1', 0.35), ('Spine2', 0.3)):
        wrot(n, total * k, side * k, twist * k)

def bar_mat():
    return evm('Bar')

# 槓上握點（相對 Bar 骨靜止框的世界偏移）→ 跟著 Bar 骨走
GRIP_X = 0.44
def grip_hands():
    Bm = bar_mat(); Rd = Bm.to_3x3().normalized() @ REST['Bar'].to_3x3().normalized().inverted()
    o = Bm.translation
    for s in SIDE:
        sx = 1 if s == 'L' else -1
        w = o + Rd @ Vector((sx * GRIP_X, 0.035, -0.055))      # 手腕在槓下偏後
        d = Rd @ Vector((sx * 0.15, -0.25, 1.0))                # 手指朝上、繞過槓
        n = Rd @ Vector((0, -1, 0.35))                          # 掌心朝前上（壓槓）
        pole = o + Rd @ Vector((sx * 0.75, 0.45, -0.75))        # 手肘朝下後
        hand(s, w, d, n, pole)

def ease(t): t = min(max(t, 0), 1); return t * t * (3 - 2 * t)
def lerp(a, b, t): return a + (b - a) * t
def seg(f, a, b): return ease((f - a) / (b - a)) if b > a else float(f >= a)

# ---------- 5. 槓在腳掌中段：逐格解前傾 ----------
FEET_BACK = 0.08          # 扛槓時兩腳比身體退後一點，讓槓落在腳掌中段
def midfoot_y():
    return (E['ft_L'].location.y + E['ft_R'].location.y) / 2 - 0.085

def solve_lean(apply, target_y, th0):
    """apply(theta) 設好整個姿勢（不含手），回傳讓槓 y＝target 的前傾角。"""
    def f(th):
        reset(); apply(th); upd(); return bar_mat().translation.y - target_y
    a, fa = th0, f(th0)
    b = th0 + 4; fb = f(b)
    for _ in range(6):
        if abs(fb) < 0.002 or fb == fa: break
        c = b - fb * (b - a) / (fb - fa)
        c = max(-5, min(60, c))
        a, fa, b = b, fb, c; fb = f(b)
    return b

# 深蹲姿勢：s=0 站直、1 最低點
def squat_pose(s, th, hy=0.0, extra=None):
    hz = lerp(0.968, 0.475, s ** 1.1)
    yy = lerp(0.025, 0.275, s ** 0.85) + hy
    set_hips((0.004, yy, hz), th * 0.45)
    spine(th * 0.55)
    head_chain(-th * 0.55 * (1 - 0.4 * s))   # 蹲低時少抵銷一點前傾：頭擺正、眼神略往下（gym1），不抬下巴
    if extra: extra()

LEAN = [8.0]
def bar_frame(s, hy=0.0, feet=None, extra=None, ahead=0.05):
    """扛槓的一格：設腳、解前傾、抓槓、捲指。"""
    feet = feet or {}
    def apply(th):
        for side in SIDE:
            dy, dz, pitch = feet.get(side, (0, 0, 0))
            foot(side, FEET_BACK + hy + dy, dz, pitch)
        squat_pose(s, th, hy, extra)
    tgt = midfoot_y_for(feet, hy) + ahead * (1 - s)
    LEAN[0] = solve_lean(apply, tgt, LEAN[0])
    reset(); apply(LEAN[0]); upd()
    arms_ik(1); grip_hands(); curl(75, 35)
    upd()

def midfoot_y_for(feet, hy):
    ys = [ANKLE[s].y + FEET_BACK + hy + feet.get(s, (0, 0, 0))[0] for s in SIDE]
    return sum(ys) / 2 - 0.085

def stand_free():
    for s in SIDE: foot(s)

# ---------- 6. 八段動作 ----------
def act_sit(f, N):  # 坐凳休息，大口喘（迴圈 4 秒）
    t = f / N; ph = math.sin(t * 2 * math.pi * 2)
    reset(); arms_ik(1)
    set_hips((0.004, 0.10, 0.575 + 0.004 * ph), 22)
    spine(14 - 3 * ph); head_chain(16 + 4 * ph)
    for s in SIDE:
        sx = 1 if s == 'L' else -1
        foot(s, -0.43, 0, 0, sx * 0.08)
        E['kp_' + s].location = Vector((sx * 0.6, -1.2, 0.8))
    breath(1.0 + 0.03 * (ph + 1), 0, 2.0 + 1.5 * (ph + 1))
    upd()
    for s in SIDE:
        sx = 1 if s == 'L' else -1
        hand(s, (sx * 0.10, -0.36, 0.50), (0, -0.25, -1), (-sx, 0, 0), (sx * 0.7, 0.3, 0.9))
    curl(30, 15)

def act_chalk(f, N):  # 抹粉：搓手、拍兩下（迴圈 3 秒）
    reset(); stand_free(); arms_ik(1)
    set_hips((0.004, 0.025, 0.965), 3); spine(4); head_chain(12)
    breath(1.0, 0, 0)
    t = f
    rub = math.sin(t / N * 2 * math.pi * 4) if t < 40 or t > 82 else 0
    clap = 0
    for c0 in (44, 64):
        if c0 <= t < c0 + 18: clap = math.sin((t - c0) / 18 * math.pi)
    sep = 0.012 + 0.16 * clap
    for s in SIDE:
        sx = 1 if s == 'L' else -1
        hand(s, (sx * sep, -0.40 + 0.02 * rub * sx, 1.08 + 0.015 * rub * sx),
             (0, -0.6, 0.8), (-sx, 0, 0), (sx * 0.7, 0.4, 1.0))
    curl(8, 0)

def act_walk(f, N):  # 原地走路（迴圈 1 秒，步幅 0.5 m → 1 m/s）
    t = f / N; reset(); arms_ik(0)
    for s, off in (('L', 0.0), ('R', 0.5)):
        u = (t + off) % 1.0
        if u < 0.5:   # 支撐：腳往後滑
            dy = lerp(-0.25, 0.25, u / 0.5); dz = 0; pitch = 0
            if u < 0.08: pitch = lerp(-12, 0, u / 0.08)
        else:          # 擺盪
            v = (u - 0.5) / 0.5; dy = lerp(0.25, -0.25, ease(v)); dz = 0.07 * math.sin(v * math.pi)
            pitch = lerp(18, -12, v)
        foot(s, dy, dz, pitch)
    bob = math.cos(t * 4 * math.pi)
    sway = math.sin(t * 2 * math.pi)
    set_hips((0.004 + 0.028 * sway, 0.025, 0.935 + 0.018 * bob), 4, 3 * sway, 7 * math.sin(t * 2 * math.pi))
    spine(3, -2 * sway, -9 * math.sin(t * 2 * math.pi))
    head_chain(2, 3 * math.sin(t * 2 * math.pi))
    sw = math.sin(t * 2 * math.pi)
    for s, S in SIDE.items():
        sx = 1 if s == 'L' else -1
        wrot(S + 'Arm', -20 * sw * sx, sx * 30, 0)
        wrot(S + 'ForeArm', -18 - 8 * max(0, sw * sx))
    breath(1.0 + 0.01 * bob)
    curl(20, 10)

def act_unrack(f, N):  # 槓下蹲起、退兩步（3.5 秒；結束時身體退後 0.30 m）
    s = lerp(0.12, 0.0, seg(f, 14, 34))
    br = lerp(1.0, 1.06, seg(f, 0, 12))
    hy = 0.15 * seg(f, 46, 66) + 0.15 * seg(f, 68, 88)
    feet = {'R': (0.30 * seg(f, 46, 64) - hy, 0.05 * math.sin(math.pi * min(max((f - 46) / 18, 0), 1)), 0),
            'L': (0.30 * seg(f, 68, 86) - hy, 0.05 * math.sin(math.pi * min(max((f - 68) / 18, 0), 1)), 0)}
    bar_frame(s, hy, feet, extra=lambda: breath(br, 0.012 * (br - 1) / 0.06, 0))

def act_hold(f, N):  # 扛槓站著等口令（迴圈 3 秒，原地）
    ph = math.sin(f / N * 2 * math.pi)
    bar_frame(0.0, 0.0, None, extra=lambda: (breath(1.05 + 0.01 * ph, 0.012, 0), wrot('Hips', 0, 0.6 * ph, 0)))

def act_squat(f, N):  # 高槓深蹲一下（3.2 秒，原地）
    if f < 20: s = 0
    elif f < 53: s = ease((f - 20) / 33)
    elif f < 57: s = 1
    elif f < 87:
        u = (f - 57) / 30; s = 1 - (u + 0.18 * math.sin(u * 2 * math.pi) / (2 * math.pi) * 2.2)  # 黏滯點放慢
        s = min(max(s, 0), 1)
    else: s = 0
    br = 1.0 + 0.06 * seg(f, 2, 18) - 0.06 * seg(f, 87, 95)
    jaw = 3.0 * (seg(f, 86, 90) - seg(f, 92, 96)) + 1.0 * (57 <= f < 87)
    bar_frame(s, 0.0, None, extra=lambda: breath(br, 0.013 * (br - 1) / 0.06, jaw))

def act_grind(f, N):  # 卡在黏滯點發抖（迴圈 1.5 秒）
    t = f / N
    shake = 0.010 * math.sin(t * 2 * math.pi * 9) + 0.005 * math.sin(t * 2 * math.pi * 14 + 1)
    s = 0.60 + shake
    def ex():
        breath(1.06, 0.015, 2.5 + 0.8 * math.sin(t * 2 * math.pi * 3))
        wrot('Head', -6)
    bar_frame(s, 0.0, None, extra=ex, ahead=0.02)

RACK_CONTACT = 54   # 槓降回 1.466 m（＝Unrack 起點鉤高）的格
def act_rack(f, N):  # 往前兩步進架、蹲下掛槓、放手、往前鑽出（3.2 秒；起點身體在 +0.30，終點 -0.20）
    hy = 0.30 - 0.15 * seg(f, 0, 18) - 0.15 * seg(f, 20, 38)
    feet = {'L': (0.30 - 0.30 * seg(f, 0, 16) - hy, 0.05 * math.sin(math.pi * min(max(f / 16, 0), 1)), 0),
            'R': (0.30 - 0.30 * seg(f, 20, 36) - hy, 0.05 * math.sin(math.pi * min(max((f - 20) / 16, 0), 1)), 0)}
    s = 0.17 * seg(f, 44, 60)
    if f <= 62:
        bar_frame(s, hy, feet, extra=lambda: breath(1.05 - 0.05 * seg(f, 58, 62), 0.012, 0))
        return
    # 放手、往前鑽出、站直（槓留在鉤上，code 在 RACK_CONTACT 格把槓脫離）
    s2 = lerp(0.17, 0.0, seg(f, 70, 90))
    rel = seg(f, 62, 74)
    reset()
    foot('L', FEET_BACK - 0.30 * seg(f, 70, 84))
    foot('R', FEET_BACK - 0.30 * seg(f, 76, 90))
    hzz = lerp(0.968, 0.475, s2 ** 1.1)
    set_hips((0.004, lerp(0.025 + 0.06, -0.275, seg(f, 66, 90)), hzz), lerp(12, 3, seg(f, 64, 90)))
    spine(lerp(10, 3, seg(f, 64, 90))); head_chain(lerp(-6, 6, seg(f, 64, 90)))
    breath(1.0, 0, 1.5 * (1 - rel))
    upd()
    for side, S in SIDE.items():
        sx = 1 if side == 'L' else -1
        wrot(S + 'Arm', 0, sx * 30 * rel, 0); wrot(S + 'ForeArm', -15 * rel)
    upd()
    arms_ik(1 - rel)
    grip_hands(); curl(75 * (1 - rel) + 15 * rel, 35 * (1 - rel))

ACTIONS = [('Sit', act_sit, 120, True), ('Chalk', act_chalk, 90, True), ('Walk', act_walk, 30, True),
           ('Unrack', act_unrack, 105, False), ('Hold', act_hold, 90, True), ('Squat', act_squat, 96, False),
           ('Grind', act_grind, 45, True), ('Rack', act_rack, 96, False)]

# ---------- 7. 擷取每格評估後姿勢 → 烘成 FK ----------
BONES = [pb.name for pb in PB]
def capture():
    ob = arm.evaluated_get(bpy.context.evaluated_depsgraph_get())
    return {n: ob.pose.bones[n].matrix.copy() for n in BONES}

captured = {}
for name, fn, N, loop in ACTIONS:
    if ONLY and name not in ONLY: continue
    LEAN[0] = 8.0
    frames = []
    for f in range(N + 1):
        ff = f % N if loop else f
        fn(ff, N); upd(); frames.append(capture())
    captured[name] = frames
    print('captured', name, len(frames), 'lean', round(LEAN[0], 1))

# 拆掉約束與空物件
for pb in PB:
    for c in list(pb.constraints): pb.constraints.remove(c)
for o in E.values(): bpy.data.objects.remove(o)
reset()

def basis_of(n, Mx, frame):
    b = PB[n].bone
    if b.parent:
        Pm = frame[b.parent.name]
        rel = b.parent.matrix_local.inverted() @ b.matrix_local
        return rel.inverted() @ Pm.inverted() @ Mx
    return b.matrix_local.inverted() @ Mx

arm.animation_data_create()
for name, frames in captured.items():
    act = bpy.data.actions.get(name)
    if act: bpy.data.actions.remove(act)
    act = bpy.data.actions.new(name); act.use_fake_user = True
    slot = act.slots.new(id_type='OBJECT', name=arm.name)
    arm.animation_data.action = act; arm.animation_data.action_slot = slot
    cb = anim_utils.action_ensure_channelbag_for_slot(act, slot)
    for n in BONES:
        locs, rots, scls = [], [], []
        prev = None
        for fr in frames:
            l, q, sc_ = basis_of(n, fr[n], fr).decompose()
            if prev is not None and prev.dot(q) < 0: q = -q
            prev = q; locs.append(l); rots.append(q); scls.append(sc_)
        def put(path, vals, comps):
            for i in range(comps):
                fc = cb.fcurves.ensure(f'pose.bones["{n}"].{path}', index=i, group_name=n)
                fc.keyframe_points.add(len(vals))
                co = []
                for k, v in enumerate(vals): co += [k + 1, v[i]]
                fc.keyframe_points.foreach_set('co', co)
                for kp in fc.keyframe_points: kp.interpolation = 'LINEAR'
                fc.update()
        put('rotation_quaternion', rots, 4)
        if max(v.length for v in locs) > 1e-4: put('location', locs, 3)
        if max(abs(v.x - 1) + abs(v.y - 1) + abs(v.z - 1) for v in scls) > 1e-4: put('scale', scls, 3)
    print('baked', name, len(frames))

arm.animation_data.action = None
me.modifiers[0].show_viewport = True
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print('SAVED', OUT)
