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

# Copy v2 dist to root /v2 for cleaner URLs
echo "Copying v2 to /v2..."
rm -rf v2
cp -r umalator-global/v2/dist v2

echo ""
echo "Building umalator (JP)..."
cd umalator
node build.mjs
cd ..

echo ""
echo "Building skill-visualizer..."
cd skill-visualizer
node build.mjs
cd ..

echo ""
echo "Building skill-visualizer (global)..."
cd umalator-global/skill-visualizer
node build.mjs
cd ../..

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
