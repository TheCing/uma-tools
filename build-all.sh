#!/bin/bash
# Build all applications for production deployment

set -e  # Exit on any error

echo "========================================="
echo "Building uma-tools applications..."
echo "========================================="

echo ""
echo "Building umalator-global..."
cd umalator-global
node build.mjs
cd ..

echo ""
echo "Building umalator-global v2..."
cd umalator-global/v2
npx vite build
cd ../..

# Retired 2026-11: the site stays up as an unmaintained archive. The notice page
# (linked from the v2 banner) lives at /retired/.
mkdir -p retired && cp sunset/index.html retired/index.html

# Copy v2 dist to project root (v2 is the default landing page)
echo "Copying v2 to root..."
cp umalator-global/v2/dist/index.html ./index.html
cp umalator-global/v2/dist/favicon.svg ./favicon.svg 2>/dev/null || true
cp umalator-global/v2/dist/simulator.worker.js ./simulator.worker.js 2>/dev/null || true
rm -rf assets
cp -r umalator-global/v2/dist/assets ./assets

# Retired 2026-11: only the main simulator (v2, at the root) is published. The other
# sub-apps are no longer built; _redirects sends their URLs to /retired/.

echo ""
echo "========================================="
echo "Build complete! (main simulator only)"
echo "========================================="
