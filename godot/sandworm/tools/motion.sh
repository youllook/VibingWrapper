#!/bin/sh
# tools/motion.sh <out.mp4> [seq] — records the cycle (default clear → storm → waiting → clearing → clear) at 1280×720 30 fps and encodes an MP4 with the state and time burned in
G="$HOME/AppData/Local/Microsoft/WinGet/Packages/GodotEngine.GodotEngine_Microsoft.Winget.Source_8wekyb3d8bbwe/Godot_v4.7.2-stable_win64_console.exe"
OUT="$1"
SEQ="${2:-clear:4,storm:18,waiting:8,clearing:14,clear:4}"
N="${FRAMES:-1440}"
TMP="$(mktemp -d)"
"$G" --path . --rendering-driver opengl3 --resolution 1280x720 --write-movie "$TMP/f.png" --fixed-fps 30 --quit-after "$N" -- state=clear "seq=$SEQ" 2>&1 | grep -i -E "error" | head -10
ffmpeg -y -loglevel error -framerate 30 -i "$TMP/f%08d.png" \
  -vf "drawtext=fontfile='C\:/Windows/Fonts/consola.ttf':text='%{eif\:t\:d}.%{eif\:mod(t*10,10)\:d}s':x=20:y=20:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.4" \
  -c:v libx264 -pix_fmt yuv420p -crf 20 "$OUT"
rm -rf "$TMP"
