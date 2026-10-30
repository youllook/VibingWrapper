#!/bin/sh
# sweep.sh "<args 1>" "<args 2>" … — shoots layers=1 per arg set and prints the four IoUs (output in /e/tmp/sw2/sweep/)
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
mkdir -p /e/tmp/sw2/sweep
i=0
for a in "$@"; do
	i=$((i + 1))
	FRAMES=30 "$ROOT/godot/sandworm2/tools/shot.sh" /e/tmp/sw2/sweep/s$i.png layers=1 $a >/dev/null 2>&1
	echo "[$i] $a :: $(python -I "$ROOT/docs/沙蟲/tools/layercheck.py" /e/tmp/sw2/sweep/s$i.png "$ROOT/docs/沙蟲/01-拆景" /e/tmp/sw2/sweep/c$i.png | tr '\n' ' ')"
done
