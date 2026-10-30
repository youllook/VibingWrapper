#!/bin/sh
# tools/clip.sh <out.mp4> [seconds] [user args…] — renders the main scene at 1672×941, 30 fps, and encodes an MP4
G="$HOME/AppData/Local/Microsoft/WinGet/Packages/GodotEngine.GodotEngine_Microsoft.Winget.Source_8wekyb3d8bbwe/Godot_v4.7.2-stable_win64_console.exe"
OUT="$(realpath -m "$1")"; shift
SEC="${1:-6}"; [ $# -gt 0 ] && shift
cd "$(dirname "$0")/.."
. tools/lock.sh
TMP="$(mktemp -d)"
"$G" --path . --rendering-driver opengl3 --resolution 1672x941 --write-movie "$TMP/f.png" --fixed-fps 30 --quit-after $((SEC * 30)) -- "$@" 2>&1 | grep -i -E "error" | head -10
ffmpeg -loglevel error -y -framerate 30 -i "$TMP/f%08d.png" -vf "crop=1672:940:0:0" -c:v libx264 -crf 22 -pix_fmt yuv420p "$OUT"
rm -rf "$TMP"
