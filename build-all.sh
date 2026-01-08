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
npm run build
cd ..

echo ""
echo "Building build-planner..."
cd build-planner
npm run build
cd ..

echo ""
echo "========================================="
echo "Build complete! All applications ready."
echo "========================================="
