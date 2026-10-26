#!/bin/sh
# tools/shot.sh <out.png> [user args…] — renders one 1280×720 frame natively (Compatibility renderer) for look checks
G="$HOME/AppData/Local/Microsoft/WinGet/Packages/GodotEngine.GodotEngine_Microsoft.Winget.Source_8wekyb3d8bbwe/Godot_v4.7.2-stable_win64_console.exe"
OUT="$1"; shift
TMP="$(mktemp -d)"
"$G" --path . --rendering-driver opengl3 --resolution 1280x720 --write-movie "$TMP/f.png" --fixed-fps 30 --quit-after 4 -- "$@" 2>&1 | grep -i -E "error|warn" | grep -v "^$" | head -20
cp "$(ls "$TMP"/f*.png | tail -1)" "$OUT"; rm -rf "$TMP"
