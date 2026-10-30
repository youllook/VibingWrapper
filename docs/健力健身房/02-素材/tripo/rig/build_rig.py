# Tripo GLB → 細化軀幹／頸／頭骨架與權重 → powerlifter_rig.blend（尚未縮放，單位同 Tripo，身高 0.979）
import bpy, numpy as np, math
from mathutils import Vector
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r"E:\tmp\gym\tripo\powerlifter_rig.glb")
for o in list(bpy.data.objects):
    if o.name=='Icosphere': bpy.data.objects.remove(o)
arm=[o for o in bpy.data.objects if o.type=='ARMATURE'][0]
me=[o for o in bpy.data.objects if o.type=='MESH'][0]
M='mixamorig:'

# ---- 1. 骨架：Neck 切兩節、加 Jaw／Breath／Belly ----
bpy.context.view_layer.objects.active=arm
bpy.ops.object.mode_set(mode='EDIT')
eb=arm.data.edit_bones
neck,head=eb[M+'Neck'],eb[M+'Head']
mid=(neck.head+neck.tail)/2
n1=eb.new(M+'Neck1'); n1.head=mid; n1.tail=head.head.copy(); n1.roll=neck.roll
neck.tail=mid
n1.parent=neck; n1.use_connect=True
head.parent=n1; head.use_connect=True
def add(name,h,t,parent):
    b=eb.new(name); b.head=Vector(h); b.tail=Vector(t); b.parent=eb[parent]; b.use_deform=True; return b
add(M+'Jaw',(0.002,-0.008,0.887),(0.002,-0.075,0.848),M+'Head')
add(M+'Breath',(0.002,-0.06,0.735),(0.002,-0.11,0.735),M+'Spine2')
add(M+'Belly',(0.002,-0.05,0.60),(0.002,-0.10,0.60),M+'Spine')
J={n:eb[M+n].head.z for n in ['Spine','Spine1','Spine2','Neck','Neck1']}
bpy.ops.object.mode_set(mode='OBJECT')
print('joints',{k:round(v,3) for k,v in J.items()})

# ---- 2. 讀權重 ----
mw=me.matrix_world
co=np.array([(mw@v.co)[:] for v in me.data.vertices]); N=len(co)  # 世界座標（mesh 本地軸轉了 90°）
names=[g.name for g in me.vertex_groups]
for n in ['Neck1','Jaw','Breath','Belly']:
    if M+n not in names: me.vertex_groups.new(name=M+n); names.append(M+n)
idx={n:i for i,n in enumerate(names)}
W=np.zeros((N,len(names)))
for v in me.data.vertices:
    for g in v.groups: W[v.index,g.group]=g.weight
x,y,z=co[:,0],co[:,1],co[:,2]
def ss(a,b,t):
    u=np.clip((t-a)/(b-a),0,1); return u*u*(3-2*u)

# ---- 3. 軀幹鏈：把原本 Hips/Spine*/Neck/Head 的總量依高度重新分配 ----
chain=['Hips','Spine','Spine1','Spine2','Neck','Neck1','Head']
ci=[idx[M+c] for c in chain]
mass=W[:,ci].sum(1)
zcut=0.842+0.24*(y+0.07)              # 頭的斜切面：下巴底 → 後腦
joints=[J['Spine'],J['Spine1'],J['Spine2'],J['Neck'],J['Neck1']]
bw=[0.02,0.025,0.025,0.015,0.01]
up=[ss(j-b,j+b,z) for j,b in zip(joints,bw)]          # 過了第 k 個關節的程度
hcut=ss(zcut-0.018,zcut+0.003,z)                      # 進入頭部
up.append(hcut)
newc=np.zeros((N,len(chain)))
prev=np.ones(N)
for k in range(len(chain)):
    nxt=up[k] if k<len(up) else np.zeros(N)
    newc[:,k]=np.clip(prev-nxt,0,1) if k<len(chain)-1 else prev
    prev=nxt if k<len(up) else prev
newc/=np.maximum(newc.sum(1,keepdims=True),1e-6)
active=z>0.50
for k,c in enumerate(ci):
    W[active,c]=mass[active]*newc[active,k]

# ---- 4. 頭部剛體：切面以上只留 Head ----
h=hcut
W=W*(1-h)[:,None]
W[:,idx[M+'Head']]+=h

# ---- 5. 下顎：嘴線以下、耳前 ----
jaw=ss(0.873,0.861,z)*ss(0.0,-0.03,y)*ss(zcut-0.012,zcut,z)
hw=W[:,idx[M+'Head']]
W[:,idx[M+'Jaw']]=hw*jaw; W[:,idx[M+'Head']]=hw*(1-jaw)

# ---- 6. 呼吸／肚子：只吃軀幹鏈的量、只在前側 ----
core=W[:,[idx[M+c] for c in ['Spine','Spine1','Spine2']]].sum(1)
def blob(c,r):
    d=np.linalg.norm(co-np.array(c),axis=1); return ss(r,r*0.35,d)
br=blob((0,-0.12,0.735),0.11)*ss(-0.02,-0.06,y)*0.7
be=blob((0,-0.13,0.60),0.10)*ss(-0.02,-0.07,y)*0.8
take_b=np.minimum(br,1)*W[:,idx[M+'Spine2']]+np.minimum(br,1)*W[:,idx[M+'Spine1']]
for n in ['Spine1','Spine2']: W[:,idx[M+n]]*=(1-br)
W[:,idx[M+'Breath']]=take_b
take_e=be*(W[:,idx[M+'Spine']]+W[:,idx[M+'Hips']])
for n in ['Spine','Hips']: W[:,idx[M+n]]*=(1-be)
W[:,idx[M+'Belly']]=take_e

# ---- 7. 前 4 名、正規化、寫回 ----
W[W<0.01]=0
order=np.argsort(-W,axis=1)
mask=np.zeros_like(W,bool); np.put_along_axis(mask,order[:,:4],True,axis=1)
W=W*mask; W/=np.maximum(W.sum(1,keepdims=True),1e-6)
for g in me.vertex_groups: g.remove(list(range(N)))
for gi,g in enumerate(me.vertex_groups):
    nz=np.nonzero(W[:,gi])[0]
    for vi in nz: g.add([int(vi)],float(W[vi,gi]),'REPLACE')
print('zero-weight verts',(W.sum(1)==0).sum())
for n in ['Spine2','Neck','Neck1','Head','Jaw','Breath','Belly']:
    print(n,(W[:,idx[M+n]]>0.05).sum())
bpy.ops.wm.save_as_mainfile(filepath=r"E:\tmp\gym\tripo\powerlifter_rig.blend")
print('SAVED')
