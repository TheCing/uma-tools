#!/bin/bash
# SUNSET (2026-11): Umalator is retired. The only thing this build ships is the farewell
# page; every app route is redirected to it by _redirects.
#
# The app sources and their committed bundles are left in the repo untouched -- the
# redirects make them unreachable, and nothing is deleted, so the sunset is reversible.
# The pre-sunset version of this script is in git history (git log -- build-all.sh).
set -e

echo "Umalator is retired -- publishing the farewell page only."
cp sunset/index.html ./index.html
echo "Done."
