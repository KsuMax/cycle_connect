#!/usr/bin/env bash
# Download SRTM 1 arc-second (~30m) tiles from the Mapzen "skadi" S3 mirror.
#
# The Mapzen Terrain Tiles project is archived but the S3 bucket
# (s3://elevation-tiles-prod) still serves files publicly. The skadi/ prefix
# holds the original SRTM HGT tiles, gzipped, organised by latitude subdir
# (skadi/N60/N60E029.hgt.gz).
#
# Usage:
#   ./scripts/srtm-download.sh /opt/cycle-connect/srtm [preset]
#
# Presets:
#   russia-eu      European Russia + Karelia + Kola (default for the launch region)
#   russia-full    All of Russia incl. Siberia, Far East, Arctic (large: ~3 GB)
#   bbox S W N E   Custom bbox, integer degrees
#
# Layout produced (matches what SrtmReader expects):
#   /opt/cycle-connect/srtm/N60/N60E029.hgt.gz
#   /opt/cycle-connect/srtm/N60/N60E030.hgt.gz
#   ...
#
# On the VPS:
#   1. Pick a host directory, e.g. /opt/cycle-connect/srtm
#   2. Run this script; it skips tiles already present
#   3. Mount that dir into the Next.js container, e.g.
#        volumes:
#          - /opt/cycle-connect/srtm:/srv/srtm:ro
#      and set SRTM_TILE_DIR=/srv/srtm in the container env.
#
# Re-running is safe — existing tiles are skipped.
set -euo pipefail

TARGET="${1:-./srtm}"
PRESET="${2:-russia-eu}"
BASE_URL="https://s3.amazonaws.com/elevation-tiles-prod/skadi"

mkdir -p "$TARGET"

case "$PRESET" in
  russia-eu)
    # European Russia + Karelia + Kola + western Urals.
    SOUTH=43; WEST=19; NORTH=70; EAST=60
    ;;
  russia-full)
    # Includes Siberia and Far East. Currently ~2500 1°×1° tiles → ~3 GB gzipped.
    SOUTH=41; WEST=19; NORTH=82; EAST=190
    ;;
  bbox)
    SOUTH="${3:?bbox needs S W N E}"; WEST="${4:?bbox needs S W N E}"
    NORTH="${5:?bbox needs S W N E}"; EAST="${6:?bbox needs S W N E}"
    ;;
  *)
    echo "Unknown preset: $PRESET" >&2
    echo "Use one of: russia-eu | russia-full | bbox S W N E" >&2
    exit 1
    ;;
esac

echo "Target dir : $TARGET"
echo "Preset     : $PRESET"
echo "Bbox       : S=$SOUTH W=$WEST N=$NORTH E=$EAST"

TOTAL=0
DOWNLOADED=0
SKIPPED=0
MISSING=0

for ((lat=SOUTH; lat<NORTH; lat++)); do
  for ((lng=WEST; lng<EAST; lng++)); do
    TOTAL=$((TOTAL+1))
    if [ "$lat" -ge 0 ]; then NS=N; ABSLAT=$lat; else NS=S; ABSLAT=$((-lat)); fi
    if [ "$lng" -ge 0 ]; then EW=E; ABSLNG=$lng; else EW=W; ABSLNG=$((-lng)); fi
    KEY=$(printf "%s%02d%s%03d" "$NS" "$ABSLAT" "$EW" "$ABSLNG")
    SUBDIR="$TARGET/${KEY:0:3}"
    FILE="$SUBDIR/$KEY.hgt.gz"
    if [ -f "$FILE" ]; then
      SKIPPED=$((SKIPPED+1))
      continue
    fi
    mkdir -p "$SUBDIR"
    URL="$BASE_URL/${KEY:0:3}/$KEY.hgt.gz"
    if curl -sfLo "$FILE.tmp" --max-time 60 "$URL"; then
      mv "$FILE.tmp" "$FILE"
      DOWNLOADED=$((DOWNLOADED+1))
      printf "."
    else
      rm -f "$FILE.tmp"
      MISSING=$((MISSING+1))
    fi
  done
done

echo
echo "Total candidates : $TOTAL"
echo "Downloaded       : $DOWNLOADED"
echo "Already present  : $SKIPPED"
echo "Missing (no tile): $MISSING (ocean / never-released)"

du -sh "$TARGET" 2>/dev/null || true
