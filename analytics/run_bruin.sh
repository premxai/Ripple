#!/usr/bin/env bash
# Run the Bruin pipeline and copy the result back to ripple/data/town.duckdb.
#
# On Windows (WSL), files under /mnt/c have no Unix permissions and Bruin's validator
# rejects them, so we run from a Linux-native copy in ~/.ripple-bruin. On macOS/Linux
# you can simply run `bruin run analytics` from the ripple/ folder instead.
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$HOME/.ripple-bruin"
BRUIN="${BRUIN:-$HOME/.local/bin/bruin}"

mkdir -p "$WORK/data"
rm -rf "$WORK/analytics"
cp -r "$SRC/analytics" "$WORK/analytics"
cp "$SRC/.bruin.yml" "$WORK/.bruin.yml"
cp "$SRC/data/events.csv" "$WORK/data/events.csv"
find "$WORK" -path "$WORK/.git" -prune -o -type d -exec chmod 755 {} + -o -type f -exec chmod 644 {} +
[ -d "$WORK/.git" ] || git -C "$WORK" init -q

cd "$WORK"
"$BRUIN" run analytics
cp "$WORK/data/town.duckdb" "$SRC/data/town.duckdb"
echo "bruin: copied town.duckdb back to $SRC/data"
