#!/bin/sh
# 用法：先在瀏覽器跑 theme.shot('a.png')，再 sh shot.sh → shots/sbs.jpg
cd "$(dirname "$0")/.." && python -I tools/sbs.py shots/${1:-a.png} shots/${2:-sbs.jpg}
