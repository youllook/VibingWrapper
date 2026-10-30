#!/bin/sh
# tools/shot.sh <out.png> [user args…] — one 1672×941 frame (the target's size) from the Compatibility renderer.
# SCENE=res://rocks/preview.tscn shoots another scene; FRAMES=n runs n frames at 30 fps first (particles need ~60).
# User args: gray=1 (flat colour, plain light) · layers=1 (each depth layer one flat colour, for tools/layercheck.py)
G="$HOME/AppData/Local/Microsoft/WinGet/Packages/GodotEngine.GodotEngine_Microsoft.Winget.Source_8wekyb3d8bbwe/Godot_v4.7.2-stable_win64_console.exe"
OUT="$(realpath -m "$1")"; shift
cd "$(dirname "$0")/.."
. tools/lock.sh
TMP="$(mktemp -d)"
"$G" --path . ${SCENE:+"$SCENE"} --rendering-driver opengl3 --resolution 1672x941 --write-movie "$TMP/f.png" --fixed-fps 30 --quit-after "${FRAMES:-4}" -- "$@" 2>&1 | grep -i -E "error|warn" | head -20
cp "$(ls "$TMP"/f*.png | tail -1)" "$OUT"; rm -rf "$TMP"
