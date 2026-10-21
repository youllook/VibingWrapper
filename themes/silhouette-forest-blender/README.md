# 層疊剪影霧林・Blender 原型（silhouette-forest-blender）

固定鏡頭作弊的原型（`studio/notes/08_固定鏡頭作弊.md`）：場景在 Blender 一次烘好，執行時只畫會動、會跟著 AI 狀態變的東西。

- `plate.png`：背景成品（體積霧、出口點光、逆光太陽、水面倒影），**不含**會搖的前景
- `near.png`：會搖的前景（蕨類、雜枝、前景土坡），明度＋alpha；它們在背景烘焙時仍會擋光，只是不入鏡
- `depth.png`：背景的 sqrt(距離 / 220 m)，8-bit
- `masks.png`：R＝水面遮罩，G＝搖擺場（卡片底部 0 → 頂端 1，模糊成平滑場，才能反向扭曲、讓葉尖移出原本的像素）

執行時（全部在一個全螢幕 shader）：

| 項目 | 做法 |
|---|---|
| 前景搖曳 | near.png 依搖擺場反向扭曲，風力隨狀態（storm 最大），加陣風雜訊 |
| 依深度加霧 | overcast 變濃、clearing 變清 |
| 流動霧帶 | 三片立在 75／34／15 m 的貼地霧，用真深度判斷前後：會從遠樹前、近樹後飄過 |
| 光芒、飄塵 | 從出口斜落的柔光束；飄塵每顆有自己的深度，被較近的東西擋住 |
| 雨（不畫雨絲，只畫雨打到的東西） | 水面雨滴圈（鋪在真實水面座標上，近大遠扁、大小不一）、蕨類被雨滴打到下沉回彈、中景枝條下緣滴水（照重力落到該深度的地面，被更近的東西擋住；clearing 時仍滴一陣） |
| 水面、閃電、小燈 | 漣漪只在水裡；燈的吊線都掛在畫面上看得到的枝條或苔蘚 |

重烘（約 3 分鐘，RTX 2060 SUPER）：

```
blender -b --factory-startup -P studio/blender/fog_forest_scene.py -- studio/blender/fog_forest/layout.json studio/blender/fog_forest/sprites <out> --scale 1 --samples 256 --sky 0.1 --aniso 0.85 --hard --exit 1.5 --fog 0.016 --sun 10 --glow 0.0003 --lamp 900000 --lampd 90 [--split]
python studio/blender/pack_plates.py <split 的 out> <不加 --split 的 beauty.png> themes/silhouette-forest-blender
```

不加 `--split` 烘一次取前景的顏色，加 `--split` 再烘一次取背景、深度、遮罩、搖擺場。佈局與素材在 `studio/blender/fog_forest/`：layout.json 是原 2D 拼貼版（silhouette-forest-claude，2026-10-21 刪除，見 git af6c6a1）的 LAYERS。
素材：`gen_*` 為 Codex 生成（prompt 在 studio/briefs/layered-silhouette/claude/sprite_prompts/），其他為 Poly Haven CC0 模型算的剪影。
