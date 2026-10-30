#!/bin/sh
# tools/beats.sh <out_dir> [user args…] — runs 9 s of the break-out (clear → storm) and keeps the frames at the beats
G="$HOME/AppData/Local/Microsoft/WinGet/Packages/GodotEngine.GodotEngine_Microsoft.Winget.Source_8wekyb3d8bbwe/Godot_v4.7.2-stable_win64_console.exe"
OUT="$1"; shift
TMP="$(mktemp -d)"
"$G" --path . --rendering-driver opengl3 --resolution 1280x720 --write-movie "$TMP/f.png" --fixed-fps 30 --quit-after 280 -- state=clear then=storm "$@" 2>&1 | grep -i -E "error" | head -10
mkdir -p "$OUT"
for f in 45 60 75 100 130 165 200 270; do cp "$TMP/f$(printf %08d $f).png" "$OUT/beat_$f.png" 2>/dev/null; done
rm -rf "$TMP"
