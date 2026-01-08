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
echo "Building umalator (JP)..."
cd umalator
node build.mjs
cd ..

echo ""
echo "Building skill-visualizer..."
cd skill-visualizer
../node_modules/.bin/esbuild app.tsx --bundle --external:node:assert --outfile=bundle.js
../node_modules/.bin/unassert bundle.js > bundle.2.js
../node_modules/.bin/esbuild bundle.2.js --minify --outfile=bundle.js
rm -f bundle.2.js
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
