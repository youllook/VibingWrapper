# 夢境之門（dream-doors）

雲海上的石板步道，一扇接一扇的門往天邊排下去。約一半的門後是另一個世界（燈塔海岸、燈籠街、月夜湖、雪地、麥田）。短髮女孩背對鏡頭一直往前走。
這是無限系列 s11，目標圖是 `docs/infinite-series/s11.png`，製作文件放在 `docs/dream-doors/00–06`。

**六步都做完了（2026-11-28）**，全部在 `main.js` 一個檔：

- 步道石板、雲海（高度場步進）、門後世界（全景視差）
- 逆光陰影、步道光斑
- 六種狀態，見下方對照表

## 幾何
- 鏡頭和女孩固定不動，門框沿 +Z 往鏡頭移動。
- 18 扇門，間距 5.2 m。每扇門過了鏡頭後方 2 m 就回收到最遠處，每一輪換一種長相：門框兩款、門板六款、門後世界五款。
- 石板、雲海、花瓣、夜燈都用同一個走路距離 `offset` 捲動。

## 素材
| 檔 | 來源 |
|---|---|
| `models/frame_wood.glb`、`frame_iron.glb` | Tripo 生成（專業版，可商用）→ glbprep |
| `models/girl.glb` | Tripo 生成＋自動綁定（Mixamo 骨架），動作是 Tripo 內建的 walk（原地走）。長裙權重用 `E:/tmp/dream-doors/skirt_fix.mjs` 抹平過 |
| `tex/leaf_*.webp`、`world_*.webp`、`sakura_branch.webp` | Codex 生圖（門板、門後世界全景、櫻花枝） |
| 石板、天空、雲海 | 程式生成（canvas／shader） |

## 狀態（`STATES`）
| bridge 天空 | 狀態 | 畫面 |
|---|---|---|
| clear | 待命 | 慢步，1.3 m/s |
| overcast | 思考 | 放慢；遠處的門一扇扇亮起 |
| storm | 執行 | 小跑；門整排提早彈開；花瓣變多 |
| clearing | 收尾 | 放慢；天色轉金 |
| waiting | 等你 | 停在一扇關著的門前（門縫透光），然後回頭看 |
| 沒有 session | 不在 | 夜：月亮、星星、步道小燈；門後世界換成夜景 |

19–6 點一律是夜。

## 網址參數
| 參數 | 用途 |
|---|---|
| `state=` | 固定一種狀態（idle／thinking／working／finishing／waiting／absent） |
| `day=1`、`night=1` | 固定白天／夜晚 |
| `freeze=1` | 停住，門照目標圖擺（擺景驗收用） |
| `ids=1` | 分層遮罩，驗收用 `check.js` |
| `ref=0.5` | 疊目標圖 |
| `pr=` | pixel ratio，預設 0.6 |
| `noshadow=1` | 關掉陰影（約省 4 ms） |
| `look=` | 等你時的回頭角度（弧度），預設 −0.9 |

測試介面 `window.theme`：`applyState`、`setSessions`、`setState`、`requestState`、`STATES`、`CONFIG`。分頁在背景時 rAF 不跑，可以用 `tick(秒)` 手動推進時間。
