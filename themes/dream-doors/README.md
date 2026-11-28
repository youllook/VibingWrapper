# 夢境之門（dream-doors）

雲海上的石板步道，一扇接一扇的門往天邊排下去。門平常是關著的，Claude 每做一步就開一扇。每扇門後是另一個世界（雲海、燈塔海岸、燈籠街、月夜湖、雪地、麥田），短髮女孩穿過門，就走進那個世界。
這是無限系列 s11，目標圖是 `docs/infinite-series/s11.png`，製作文件放在 `docs/dream-doors/00–09`。

**六步都做完了（2026-11-28）**，全部在 `main.js` 一個檔（2026-11-28 改成 C 版門的邏輯）：

- 步道石板、雲海（高度場步進）、門後世界（天空 shader 依門洞一層套一層）
- 逆光陰影、步道光斑
- 六種狀態，見下方對照表

## 幾何
- 鏡頭和女孩固定不動，門框沿 +Z 往鏡頭移動。
- 18 扇門，間距 10.4 m。前景沒有東西（近景滑門、櫻花枝已在 2026-11-28 拿掉）。每扇門過了鏡頭後方 2 m 就回收到最遠處，每一輪換一種長相：門框兩款、門板六款；回收時門關上，開門時才決定通往哪個世界。
- 石板、雲海、花瓣、夜燈都用同一個走路距離 `offset` 捲動。

## 素材
| 檔 | 來源 |
|---|---|
| `models/frame_wood.glb`、`frame_iron.glb` | Tripo 生成（專業版，可商用）→ glbprep |
| `models/girl.glb` | Tripo 生成＋自動綁定（Mixamo 骨架），動作是 Tripo 內建的 walk（原地走）＋ Mixamo「Jogging」原地版烘成的 jog（執行中小跑，2026-11-29；`E:/tmp/dream-doors-mixamo/bake_jog.py`，左手臂往外張 0.35 rad 避開側背包；Mixamo 原檔不能單獨散佈）。小跑穿模修正 `E:/tmp/dream-doors-mixamo/weightfix.mjs`：側背包只跟骨盆、左手旁的裙子補抹平。重新匯出女孩要依序跑 skirt_fix → bake_jog → glbprep → weightfix。長裙權重用 `E:/tmp/dream-doors/skirt_fix.mjs` 抹平過 |
| `tex/leaf_*.webp`、`world_*.webp`（含雲海世界 `world_clouds.webp`） | Codex 生圖（門板、門後世界全景）；`sakura_branch.webp` 目前沒用到 |
| 石板、天空、雲海 | 程式生成（canvas／shader） |

材質程式在 `materials.js`（石板三張貼圖、門板由圖算出法線與粗糙度），主題和審材質頁 `_lookdev.html` 共用；審查紀錄見 `docs/dream-doors/08-審材質.md`。

## 門的邏輯（C 版，詳見 `docs/dream-doors/07-門的邏輯C版.md`）
- 門平常是關著的，她走到門前會停下。她前方最多 2 扇門開著（`?maxopen=`，2026-11-29 從 3 改 2）。Claude 每做一步（`events.json` 裡的一次工具呼叫）就開一扇門；執行時沒有事件的話，每 2.4 秒開一扇。
- 開著的門通往下一個世界：天空 shader 算出每條視線穿過了哪幾扇門洞，畫出最後一扇門後的世界。門過了鏡頭，四周就換成那個世界。
- 門板一直掛在門柱上，全開約 115°。

| bridge 天空 | 狀態 | 畫面 |
|---|---|---|
| clear | 待命 | 在門前站一下，門自己開；不換世界 |
| overcast | 思考 | 停在關著的門前，門縫光一明一暗 |
| storm | 執行 | 小跑；每一步開一扇門，穿過去就換一個世界 |
| clearing | 收尾 | 走進金色麥田 |
| waiting | 等你 | 停在關著的門前，門縫透光，然後回頭看 |
| 沒有 session | 不在 | 夜；停在門前；步道小燈亮起 |

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
| `post=0` | 關掉最後一道畫面處理（光暈、光束、調色；`post.js`） |
| `sky=proc` | 雲海世界改回程式畫的天空＋雲海（預設用 Codex 全景 `world_clouds.webp`） |
| `envmap=0` | 關掉世界全景環境貼圖 |
| `layers=0` | 關掉 2.5D 分層，世界回到單張全景 |
| `para=` | 分層視差的晃動幅度倍率，預設 1 |

**2.5D 分層**：每個世界用拆景工具（skill `/scene-split`）拆成天空、遠景、中景、近景四層，每層附法線，再用 `docs/dream-doors/pack_layers.py` 打包成 `tex/layers_L0–L3.webp`、`tex/layers_n.webp`、`tex/layers.js`。天空 shader 由近到遠疊四層，近層隨鏡頭緩緩晃動錯開（26 秒一個來回），主光方向慢慢飄移，朝右的面會亮起金邊（白天暖金，入夜銀白）。
| `look=` | 等你時的回頭角度（弧度），預設 −0.9 |

測試介面 `window.theme`：`applyState`、`setSessions`、`setState`、`requestState`、`STATES`、`CONFIG`。分頁在背景時 rAF 不跑，可以用 `tick(秒)` 手動推進時間。
