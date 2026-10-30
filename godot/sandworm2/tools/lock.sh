# sourced by shot.sh / import.sh: one Godot at a time across parallel agents (two at once render black frames); waits up to 10 min
LOCK="${TMPDIR:-/tmp}/sandworm2-godot.lock"
i=0
until mkdir "$LOCK" 2>/dev/null; do
	i=$((i + 1)); [ $i -gt 600 ] && { echo "lock timeout; remove $LOCK if stale" >&2; exit 1; }
	sleep 1
done
trap 'rmdir "$LOCK"' EXIT
