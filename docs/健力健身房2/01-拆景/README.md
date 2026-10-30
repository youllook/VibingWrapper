# 動態桌布底圖與遮罩

所有 PNG 均為 **1672 × 941**。座標原點為左上角，單位為像素。

- `plate-day.png`、`plate-shade.png`、`plate-night.png`：RGB 底圖。
- `mask-windows.png`、`mask-mirror.png`、`mask-floor-sun.png`、`mask-fan.png`、`mask-lamps.png`、`mask-board.png`、`mask-bulbs.png`：L 灰階遮罩，255 表示範圍內。
- `fan.json`、`lamps.json`、`board.json`、`bulbs.json`：座標資料。三色燈依紅、黃、白排序；白板依左上、右上、右下、左下排序。
- `check-遮罩.png`：原圖疊加遮罩與英文色彩圖例。
- `check-三張.png`：左上原圖、右上白天、左下陰天、右下夜晚。
- `generated-*.png`：內建 image_gen 的補景／光照生成中間檔。
- `generation-prompts.md`：三次生成使用的完整提示詞。
- `mask-edit-day.png`：額外保留的白天局部補景遮罩；此遮罩外像素逐像素維持原圖。
- `validation.json`：尺寸、模式、原圖雜湊與像素檢查結果。

## 重跑

環境需要 Python、Pillow、numpy、opencv-python；執行 `python build_plates.py`。
腳本從本資料夾的原圖及三張生成中間檔重建全部成品，不需再次呼叫生圖服務。
程式以 SHA-256 確認原圖未修改，驗證通過後建立空檔 `.done`。

## 合成方式

白天採用局部補景合成，保留原圖窗光地板、海報、前景器材及框架。
陰天與夜晚採生成圖的光照場轉移至白天底圖；前景器材另外保護，避免生成模型刪除槓片。
鏡面因原本即失焦，直接採局部生成內容。鏡面遮罩排除前方長凳遮擋處。
扇葉遮罩依需求是以馬達為中心的完整圓盤，影像外部分裁切；不是透視橢圓。
燈泡資料含實體壁燈與鏡內可見的燈點，`in_mirror` 可區分兩者；包含補景後鏡內的遠處燈點。
