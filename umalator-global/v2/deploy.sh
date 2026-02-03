#!/bin/bash
# Deploy v2 build to specified location
# Usage: ./deploy.sh [target_dir]
# Example: ./deploy.sh /var/www/umalator/v2

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$SCRIPT_DIR/dist"

if [ ! -d "$DIST_DIR" ]; then
    echo "Error: dist directory not found. Run 'npm run build:v2' first."
    exit 1
fi

TARGET="${1:-$DIST_DIR}"

if [ "$TARGET" != "$DIST_DIR" ]; then
    echo "Deploying v2 to: $TARGET"
    mkdir -p "$TARGET"
    cp -r "$DIST_DIR"/* "$TARGET/"
    echo "Done! v2 deployed to $TARGET"
else
    echo "Build output is in: $DIST_DIR"
    echo "To deploy, run: ./deploy.sh /path/to/target"
fi

echo ""
echo "Files:"
ls -la "$TARGET"
