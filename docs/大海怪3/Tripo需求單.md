# 大海怪3 — Tripo 建模紀錄（2026-10-27）

用戶給參考圖（暴風雨、漁夫肩後、巨魷頭與眼破水），要求人物與模型盡量用 Tripo（專業版，Claude in Chrome 操作），輸入圖找 Codex 生。

## 輸入圖（Codex，`E:\tmp\sea-monster-3\<件>\target.png`，各自 `prompt.md`、`gen.sh`）

| 件 | 要求 |
|---|---|
| fisherman | 濕透油布雨衣、單膝跪、上身前傾、右手伸出抓握形，左後方 3/4 背面，純白背景 |
| boat | 約 7 m 老舊木造漁船、剝漆濕黑、船首兩根鐵箍木樁、網堆麻繩木箱，3/4 斜上方 |
| head | 只有頭（腕在根部截斷）、側面一顆巨眼正對鏡頭、厚皺眼瞼、紫褐斑駁濕皮 |
| tentacle | 單根筆直平放、兩列吸盤朝斜上方 |

## Tripo 設定與點數

| 件 | 設定 | 點數 |
|---|---|---|
| 漁夫 | H3.1、2K、PBR、三角 2 萬面；自動綁骨架（人形、Mixamo） | 45 + 20 |
| 木船 | H3.1、2K、PBR、2 萬面 | 45 |
| 巨魷頭 | H3.1、**4K**、PBR、4 萬面 | 55 |
| 腕 | H3.1、4K、PBR、4 萬面（骨架在 Blender 自己綁） | 55 |

共 220 點（2700 → 2480）。

**2026-10-30 木船重生**：同一張輸入圖，H3.1、Ultra Mesh Quality、AI Complete、4K、PBR、三角 **30 萬面**（實得 280,029 面；舊的 18,907 面邊角全圓）。55 點（1885 → 1830），導出 `D:\ChromeDownloadoat_h31_300k.glb`（26 MB）。Tripo 的 Retopo 最多 1 萬面，只能減不能加，所以要重生。導出 GLB 到 `D:\ChromeDownload\`（`boat3_h31`、`fisherman_rig`、`squidhead_h31`、`tentacle_h31`），轉進 `godot/sea-monster-3/models/`。

## 接手時的處理

- 漁夫：Tripo 綁骨架的 GLB 骨頭 rest 全是原點，程式從蒙皮反綁定矩陣重建。
- 腕：Blender 腳本沿中心線 16 節骨鏈、權重依沿長度位置線性分配（`rig_tentacle.py`）。
- 頭：從貼圖最暗的瞳孔群找眼睛位置（`find_eye.py`），活眼再依畫面微調。
- 所有 Tripo 材質是半透明混合：改不透明。
