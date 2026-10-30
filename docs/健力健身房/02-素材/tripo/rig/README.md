# 選手骨架細化（2026-10-30）

來源：Tripo 自動綁定 GLB（`D:\ChromeDownload\powerlifter_rig.glb`，55 根 mixamorig 骨）。
成品：`themes/powerlifting-gym/models/powerlifter.glb`（身高 1.80 m、腳底 y=0、面朝 +Z、材質不透明、59 根骨、39k 三角、4K 貼圖）。

## 改了什麼
| 部位 | 改法 |
|---|---|
| 脖子 | Neck 切成 `Neck`＋`Neck1` 兩節，低頭／抬頭有弧度，不再單點對折 |
| 頭 | 下巴底到後腦的斜切面以上 100% `Head`，臉不再被脖子拉歪（原本臉上殘留 10–15% Neck） |
| 下顎 | 新增 `Jaw`（耳前顳顎關節→下巴）；模型沒有口腔，**張開上限約 3°**（咬牙、吐氣） |
| 脊椎 | Hips／Spine／Spine1／Spine2 依高度平滑重分配（原本 Spine2 幾乎沒權重） |
| 呼吸 | 新增 `Breath`（胸口，用縮放 1.0–1.06 鼓胸）、`Belly`（腹部，沿骨向前推約 1–2 cm，頂腰帶） |

肩、手臂、腿的權重保留 Tripo 原值；每頂點最多 4 骨、已正規化。

## 重跑
```bash
blender -b -P build_rig.py      # 讀 E:\tmp\gym\tripo\powerlifter_rig.glb → powerlifter_rig.blend
blender -b -P finalize.py       # 縮放、不透明、導出 GLB
blender -b -P stress.py -- <glb 或 blend> <輸出資料夾> [姿勢,...]   # 壓力測試截圖
```
姿勢旋轉一律用世界軸（Tripo mesh 本地軸轉了 90°，別用本地軸判斷前後）。

## 8 段動作（2026-10-30）
`anim.py` 用 IK 擺腳／手，扛槓時逐格解前傾讓**槓維持在腳掌中段**，再烘成純 FK（three.js 不需要 IK）。
`export_anim.py` 導出到同一個 `models/powerlifter.glb`（59 骨＋`Bar` 骨，8 個 clip，30 fps）。檢視頁：`themes/powerlifting-gym/models.html[?clip=Squat&t=0.5]`。

| clip | 長度 | 迴圈 | 內容 |
|---|---|---|---|
| `Sit` | 4.0 s | ✔ | 坐凳（座面高 0.43 m）手肘撐腿、低頭喘氣 |
| `Chalk` | 3.0 s | ✔ | 搓手、拍兩下（拍手在 1.47 s、2.13 s 附近，粉塵由 code 放） |
| `Walk` | 1.0 s | ✔ | 原地走，步幅 0.5 m → **root 要以 1.0 m/s 前進** |
| `Unrack` | 3.5 s | | 槓下蹲起、退兩步；結束時身體**往後 0.30 m** |
| `Hold` | 3.0 s | ✔ | 扛槓站著吸氣撐腹，等口令 |
| `Squat` | 3.2 s | | 吸氣撐腹 → 下蹲 1.1 s → 最低點 → 起身（黏滯點放慢）→ 吐氣 |
| `Grind` | 1.5 s | ✔ | 卡在黏滯點（約 6 成深）發抖、咬牙 |
| `Rack` | 3.2 s | | 往前兩步進架、蹲下掛槓、放手、往前鑽出站直 |

**接到 code 的約定**（three.js 座標：選手面朝 +Z）
- 槓：每格把槓的世界位置／旋轉設成 `Bar` 骨（槓沿骨頭 Y 軸＝世界 X），`Sit`／`Chalk`／`Walk` 不掛。
- 架的位置＝`Unrack` 第 0 格 Bar 骨的世界位置（槓在 J 鉤上、膝微彎，鉤高 1.47 m）。
- `Unrack` 結束後把選手根節點往 **-Z 移 0.30 m**，`Hold`／`Squat`／`Grind` 都在原地播。
- `Rack` 要在**架原點**播（起點身體在 -Z 0.30、終點在 +Z 0.275）；第 **54 格（1.80 s）槓降到鉤高**，這時把槓從 Bar 骨脫開留在鉤上。
- 動作之間用 0.3 s crossfade；`Walk` 接 `Unrack` 起點會有跳，靠 crossfade 蓋。
- 呼吸／咬牙已烘進動作（`Breath` 骨縮放、`Belly` 位移、`Jaw` 旋轉）。
