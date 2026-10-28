#!/bin/sh
# tools/frames.sh <out_dir> <n_frames> "<frame list>" [user args…] — runs n frames at 30 fps and keeps the listed ones
G="$HOME/AppData/Local/Microsoft/WinGet/Packages/GodotEngine.GodotEngine_Microsoft.Winget.Source_8wekyb3d8bbwe/Godot_v4.7.2-stable_win64_console.exe"
OUT="$1"; N="$2"; L="$3"; shift 3
TMP="$(mktemp -d)"
"$G" --path . --rendering-driver opengl3 --resolution 1280x720 --write-movie "$TMP/f.png" --fixed-fps 30 --quit-after "$N" -- "$@" 2>&1 | grep -i -E "error" | head -10
mkdir -p "$OUT"
for f in $L; do cp "$TMP/f$(printf %08d $f).png" "$OUT/f_$f.png" 2>/dev/null; done
rm -rf "$TMP"
