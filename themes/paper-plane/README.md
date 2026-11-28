# 紙飛機穿城（paper-plane）

無限系列第二輪。一架藍紙飛機穿過白紙做的城市，城市全程式生成、永遠飛不完。
製作文件：`docs/paper-plane/`（00 分析、03 擺景、04-05 紙質光影狀態）。

## 檔案
- `city.js`：城市段（60 m 一段、遠景 240 m 一段），段長相只看段號；段槽循環（Strip）。
- `paper.js`：紙質 shader（立面樣式、切口、假 AO、纖維、夜窗燈）、地面、紙飛機材質。
- `plane.js`：紙鏢幾何。`post.js`：動態模糊。`main.js`：鏡頭、光、狀態。

## 網址參數
`?state=idle|thinking|working|finishing|waiting|absent`、`?day=1`／`?night=1`、`?t=秒&freeze=1`、`?ref=0.5`（疊目標圖）、
`?mb=0`（關模糊）、`?shadow=0`、`?pr=0.6`、鏡頭 `?yaw ?pitch ?fov ?cx ?cy`、飛機 `?pu ?pv ?pd ?ps ?pyaw ?pbank ?ppitch`。

## 測試介面
`window.theme`：`STATES`／`PARAMS`、`CONFIG`（polling、clockHours）、`applyState`、`requestState`、`setState`、`draw`、`shot(name)`（開發伺服器存 1080p 截圖）。
