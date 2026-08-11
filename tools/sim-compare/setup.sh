#!/usr/bin/env bash
# Fetch and prepare the upstream alpha123/uma-skill-tools checkout that compare-sims.mjs
# runs against. Safe to re-run: updates an existing checkout instead of re-cloning.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALPHA="$HERE/alpha"
REMOTE="https://github.com/alpha123/uma-skill-tools.git"

if [ -d "$ALPHA/.git" ]; then
	echo "==> updating $ALPHA"
	git -C "$ALPHA" fetch --quiet origin
	git -C "$ALPHA" checkout --quiet master
	git -C "$ALPHA" reset --hard --quiet origin/master
else
	echo "==> cloning $REMOTE"
	GIT_TERMINAL_PROMPT=0 git clone --quiet "$REMOTE" "$ALPHA"
fi

echo "==> upstream at $(git -C "$ALPHA" log -1 --format='%h %cs %s')"

# Upstream's Rule30CARng samples its output bits out of the high word of its state, and every
# CLI entry point in that repo seeds the high word as 0 (the constructor default). The first
# several random() calls therefore return exactly 0, which zeroes the start delay and pins the
# per-section speed modifier to its minimum in every section — upstream's baseline CLI race is
# degenerate and produces byte-identical results for every --seed. Comparing against that is
# comparing against a broken baseline, not against upstream's model, so warm the state up.
echo "==> applying upstream-rng-warmup.patch"
git -C "$ALPHA" apply --reverse --check "$HERE/upstream-rng-warmup.patch" 2>/dev/null \
	&& echo "    (already applied)" \
	|| git -C "$ALPHA" apply "$HERE/upstream-rng-warmup.patch"

echo "==> npm install (upstream)"
(cd "$ALPHA" && npm install --no-audit --no-fund --silent)

if [ ! -x "$HERE/../../uma-skill-tools/node_modules/.bin/ts-node" ]; then
	echo "==> npm install (ours)"
	(cd "$HERE/../../uma-skill-tools" && npm install --no-audit --no-fund --silent)
fi

echo "==> ready. run: node tools/sim-compare/compare-sims.mjs"
