#!/bin/bash
# Pull the latest Global master.mdb from MEGA and update docs/master.mdb
#
# Prerequisites:
#   brew install megatools
#   ~/.megarc with MEGA credentials
#
# Usage:
#   ./tools/pull-master-mdb.sh          # Download and replace docs/master.mdb
#   ./tools/pull-master-mdb.sh --check  # Just check if a newer version exists

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEST="$ROOT/docs/master.mdb"
MEGA_PATH="/Root/uma/master.mdb"
TMP_DIR="$(mktemp -d)"

trap 'rm -rf "$TMP_DIR"' EXIT

if ! command -v megaget &>/dev/null; then
    echo "Error: megatools not installed. Run: brew install megatools" >&2
    exit 1
fi

if [ ! -f ~/.megarc ]; then
    echo "Error: ~/.megarc not found. Create it with:" >&2
    echo '  [Login]' >&2
    echo '  Username = your@email.com' >&2
    echo '  Password = yourpassword' >&2
    exit 1
fi

echo "Downloading master.mdb from MEGA..."
megaget --path "$TMP_DIR/" "$MEGA_PATH"
DOWNLOADED="$TMP_DIR/master.mdb"

if [ ! -f "$DOWNLOADED" ]; then
    echo "Error: Download failed" >&2
    exit 1
fi

NEW_COUNT=$(sqlite3 "$DOWNLOADED" "SELECT count(*) FROM skill_data")
echo "Downloaded DB has $NEW_COUNT skills"

if [ -f "$DEST" ]; then
    OLD_COUNT=$(sqlite3 "$DEST" "SELECT count(*) FROM skill_data")
    echo "Current DB has $OLD_COUNT skills"

    if [ "${1:-}" = "--check" ]; then
        if [ "$NEW_COUNT" -gt "$OLD_COUNT" ]; then
            echo "Update available: $OLD_COUNT → $NEW_COUNT skills"
        else
            echo "Already up to date"
        fi
        exit 0
    fi

    if [ "$NEW_COUNT" -lt "$OLD_COUNT" ]; then
        echo "Warning: Downloaded DB has fewer skills ($NEW_COUNT < $OLD_COUNT)" >&2
        read -p "Continue anyway? [y/N] " -n 1 -r
        echo
        [[ $REPLY =~ ^[Yy]$ ]] || exit 1
    fi
fi

cp "$DOWNLOADED" "$DEST"
echo "Updated docs/master.mdb ($NEW_COUNT skills)"
