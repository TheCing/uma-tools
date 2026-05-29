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

# Copy v2 dist to project root (v2 is the default landing page)
echo "Copying v2 to root..."
cp umalator-global/v2/dist/index.html ./index.html
cp umalator-global/v2/dist/favicon.svg ./favicon.svg 2>/dev/null || true
cp umalator-global/v2/dist/simulator.worker.js ./simulator.worker.js 2>/dev/null || true
rm -rf assets
cp -r umalator-global/v2/dist/assets ./assets

echo ""
echo "Building umalator (JP)..."
cd umalator
node build.mjs
cd ..

echo ""
echo "Building skill-visualizer (JP) → /skill-visualizer-jp/..."
cd skill-visualizer-jp
node build.mjs
cd ..

# Builds both Global v1 (/umalator-global/skill-visualizer/) and v2
# (/umalator-global/skill-visualizer/v2/).
# The v2 build is also surfaced at the clean URL /skill-visualizer/ via the
# _redirects rewrite at repo root.
echo ""
echo "Building skill-visualizer (Global v1 + v2)..."
cd umalator-global/skill-visualizer
node build.mjs
cd ../..

echo ""
echo "Building team-trials..."
cd team-trials
node build.mjs
cd ..

echo ""
echo "Building release-timeline..."
cd release-timeline
node build.mjs
cd ..

echo ""
echo "Building build-planner..."
cd build-planner
../node_modules/.bin/esbuild app.tsx --bundle --external:node:assert --outfile=bundle.js
../node_modules/.bin/unassert bundle.js > bundle.2.js
rm -f bundle.2.js
cd ..

echo ""
echo "========================================="
echo "Build complete! All applications ready."
echo "========================================="
# Note: hp-calculator uses Vite (requires Node 20+) and is built locally.
# Pre-built files (bundle.js, bundle.css, index.html) are committed to git.
