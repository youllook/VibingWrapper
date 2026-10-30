# 掃氛圍參數：拍成品（全解析、待命），印對目標圖的平均 ΔE、亮度、對比
# 用法（repo 根目錄）：bash "docs/麥塊世界mc3/tools/look.sh" '<atm json>' '<env json>' [額外網址參數]
D="docs/麥塊世界mc3"; T="${TMP:-/tmp}/mc3-look"; mkdir -p "$T"
q=$(python -c "import urllib.parse,sys;a,e=sys.argv[1],sys.argv[2];print('&'.join(k+'='+urllib.parse.quote(v) for k,v in (('atm',a),('env',e)) if v and v!='{}'))" "${1:-{\}}" "${2:-{\}}")
timeout 90 npx electron "$D/tools/shot.js" "creeper-end/index.html?full=1&state=idle&$q${3:+&$3}" "$T/look.png" 1672 941 >/dev/null 2>&1
python -I "$D/tools/colorcheck.py" "$T/look.png" "$D/mc3.png" "$T/look_c.png" | tail -1
