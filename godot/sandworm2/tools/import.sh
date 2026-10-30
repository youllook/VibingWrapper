#!/bin/sh
# tools/import.sh — (re)import resources after adding a GLB or texture; run once before shot.sh sees new files
G="$HOME/AppData/Local/Microsoft/WinGet/Packages/GodotEngine.GodotEngine_Microsoft.Winget.Source_8wekyb3d8bbwe/Godot_v4.7.2-stable_win64_console.exe"
cd "$(dirname "$0")/.."
. tools/lock.sh
"$G" --headless --path . --import 2>&1 | grep -i -E "error" | head -20
