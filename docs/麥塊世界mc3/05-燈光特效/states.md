# 階段 5：狀態機與苦力怕動作（states.js）

程式：`themes/creeper-end/states.js`。`createStates({ hero, walkers, scene, q })` 回傳 `{ update(dt, t), set(name), state, STATES, PARAMS }`，掛在 `window.theme.states`。

## 狀態對應（照 sea-monster）
每秒 `fetch('state.json')`；`sessions` 全空 → 不在，否則看 `state`（失敗則維持原狀）。只在值改變時切換。

| state.json | 六態 | 按鍵 |
|---|---|---|
| sessions 全 null | absent 不在 | 0 |
| clear | idle 待命 | 1 |
| overcast | thinking 思考 | 2 |
| storm | executing 執行 | 3 |
| clearing | finishing 收尾 | 4 |
| waiting | waiting 等你 | 5 |

`?state=<六態名或 sky 名>` 固定該狀態、不輪詢。`theme.states.set('executing')` 也可。

## 演出
所有值都是目標值，以指數趨近（頭 3.2/s、腳 4/s、光 5/s），狀態切換不跳。
- 不在：全隊靜止，主角頭轉回正前方。
- 待命：站定；全員頭輕晃（±3°，兩個慢頻率疊起來不規律）、身體呼吸 1.2%；主角維持回望。
- 思考：主角頭左右轉 ±11°（週期約 7 秒）；綠色自發光（#35e86a，上限 0.34）以 4.2 秒一輪由近到遠接力，相鄰相位差 0.55/(n+1) 個週期。
- 執行：隊伍原地踏步，腳樞紐擺 ±0.42 rad（約 24°），1.05 步／秒，對角腳同相，每隻起始相位錯開；主角站著。
- 收尾：進入後 i×0.65 秒第 i 隻（由近到遠）腳幅度趨近 0，期間節奏放慢到 0.8 步／秒。
- 等你：隊伍定格；主角回望鏡頭，每 2.6 秒一次柔和閃白（自發光至 0.08，主線從 0.3 調低：曝光 1.25＋ACES 下 0.3 會把臉洗白）並微脹 2.5%，不爆炸。

## 實作備註
- 每隻自己 clone 材質後才改 emissive（共用材質不動）；若場景之後重新套材質，會自動重 clone。
- 參數集中在 `PARAMS`，可由 `theme.states.PARAMS` 即時調。
- 截圖：`states-*.png`（1672×941，?full=1）；執行／收尾圖看腳的擺幅，思考圖看綠光。
