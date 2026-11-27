# 健力健身房 — 07 Mixamo 動捕深蹲（2026-11-27）

第一版做壞的主因之一是深蹲動作：IK 手調，蹲起來僵、握槓怪（見 [06-對比交付.md](06-對比交付.md)「和 gym1 還差的」）。
Mixamo 有真人動捕的健身動作，選手骨架本來就是 mixamorig，所以直接轉骨架烘進 `models/powerlifter.glb`。

## 用了什麼

| 來源（mixamo.com） | 檔案 | 長度 | 用途 |
|---|---|---|---|
| Back Squat — *Back Squat Workout* | `squat_loop.fbx` | 69 格（2.27 s） | 一下深蹲：站姿 → 1.27 s 最低點（髖低於膝）→ 起身 |

下載設定：FBX Binary、**Without Skin**、30 fps、Keyframe Reduction none，角色用 Mixamo 預設。原檔在 `E:\tmp\gym-mixamo\`（不進 git；Mixamo 原檔不能單獨散佈，烘進自己的角色可以）。

同時下載但**沒用上**的：*Starting／Ending Back Squat Workout*（從地上抓槓、上膊、過頭推、放到背上——是 CrossFit 流程，不是健力從架上取槓）、*Male Fitness Idle With Breathing*。

## 動作表（改動後）

| clip | 來源 | 用途 |
|---|---|---|
| `Squat` | **Mixamo** | 一下深蹲（2.29 s） |
| `Grind` | **Mixamo 衍生** | 卡在起身 55 %（`GRIND_AT = 1.77 s`）：慢慢下沉／頂起 ±1.6 格＋10 Hz 抖，1.5 s 循環 |
| `Hold` | **Mixamo 衍生** | 第 0 格站姿停 3 s，呼吸／咬牙取自舊 Hold |
| `Setup` | 舊手調 `Squat` 改名 | 只剩走進槓下、蓄力（第 1.05、1.3 秒）用 |
| `Unrack`／`Rack`／`Sit`／`Chalk`／`Walk` | 舊的 | 不動 |

## 轉骨架（`02-素材/tripo/rig/bake_mixamo.py`）

```bash
blender -b -P bake_mixamo.py -- squat_loop.fbx <舊 powerlifter.glb> <新 glb> <info.json>
```

- 做法同 MotionBricks 的 `bake.py`：每根骨用「骨頭方向＋側向」兩向量對齊框架（體型差很多也不會扭）；手指也對。
- 髖位移按腿長比例放大（×1.073），水平位置對齊舊 Hold 的兩腳中點（選手站的位置不變）。
- 目標骨架有、Mixamo 沒有的 `Breath`／`Belly`／`Jaw`：從舊動作同比例時間取樣。
- `Bar` 骨每格放在兩手掌心中點下 1.7 cm、沿兩手連線（舊動作的相對位置）——槓跟手走，不會脫手。
- 頭：目標的 glTF 骨尾是斜的，rest 方向改用正上方，不然整段抬下巴。
- **坑**：FBX 匯入會把場景改成 30 fps，舊動作導出會短 20 %；腳本匯入後改回 24 fps。

## 已知差異

- Mixamo 是**高槓**、握得窄；舊 `Unrack`／`Rack` 是低槓。交接 0.3 s 淡入淡出時槓會移幾公分。
- 一下比舊的快（2.3 s vs 3.2 s），組間 Hold 從 0.8 s 拉到 1.2 s。
