# 掃參數：用 ?tune= 覆寫 LAYOUT，拍分層圖、算對 Codex 扣圖的 IoU（印 前景 中近景 中景）
# 用法（repo 根目錄）：bash "docs/麥塊世界mc3/tools/sweep.sh" '{"bridgeW":3.6}'
D="docs/麥塊世界mc3"; T="${TMP:-/tmp}/mc3-sweep"; mkdir -p "$T"
enc=$(python -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$1")
timeout 90 npx electron "$D/tools/shot.js" "creeper-end/index.html?layers=1&tune=$enc" "$T/sw.png" 1672 941 >/dev/null 2>&1
python -I "$D/tools/layercheck.py" "$T/sw.png" "$D/01-拆景" "$T/sw_c.png" | sed -n 1,3p | awk '{print $3}' | tr '\n' ' '; echo
