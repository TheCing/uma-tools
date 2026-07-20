#!/usr/bin/env bash
#
# Scoped type gate for the v2 roster module (umalator-global/v2/roster).
#
# Why scoped, and why the crash check — both learned the hard way:
#
#   * `tsc --noEmit -p tsconfig.json` from the repo root CRASHES with
#     "RangeError: Map maximum size exceeded". The root tsconfig has no `include`, so it
#     pulls in the entire repo and the type-relation checker blows its internal Map. Adding
#     umalator-global/v2/app-v2.tsx to this invocation crashes it for the same reason, which
#     is why the gate covers roster/ only and app-v2.tsx is NOT type-checked by anything.
#   * A crashing tsc prints a Node stack trace, not "error TS" lines. So a naive
#     `tsc ... | grep -E 'roster/' && exit 1 || echo clean` gate reports CLEAN while having
#     checked nothing whatsoever. That false green bit us twice. Hence the explicit crash
#     detection below — this gate must fail loudly rather than pass silently.
#
# The repo has pre-existing type errors outside roster/ (uma-skill-tools' const-enum
# `Enum.hasOwnProperty(x)` pattern, ocr-modal.tsx, skill-chart-utils.ts) and has never
# type-checked in any build or CI. We therefore filter to roster/ rather than demanding a
# clean repo. Fixing those is tracked separately.
#
set -uo pipefail

cd "$(dirname "$0")/.."

OUT=$(npx tsc --noEmit --skipLibCheck \
  --jsx react --jsxFactory h --jsxFragmentFactory Fragment \
  --moduleResolution bundler --module esnext --target es2018 --lib es2018,dom \
  --resolveJsonModule --esModuleInterop \
  umalator-global/v2/roster/*.ts* 2>&1)

# A crash means nothing was checked. Never let that read as success.
if grep -qE "RangeError|Maximum call stack|Debug Failure|Cannot find a tsconfig|internal error" <<<"$OUT"; then
	echo "typecheck:roster FAILED — tsc did not complete (nothing was checked):"
	head -n 5 <<<"$OUT"
	exit 1
fi

if grep -E "roster/" <<<"$OUT"; then
	echo "typecheck:roster FAILED — type errors in roster/ (above)"
	exit 1
fi

echo "roster typecheck clean"
