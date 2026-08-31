#!/usr/bin/env node
/**
 * Vendor alpha123's published race engine + sim glue as "engine v1".
 *
 * We ship two engines and let the user pick (see the Engine toggle in sim-settings):
 *   v2 = uma-skill-tools/      -- ours, actively developed
 *   v1 = uma-skill-tools-v1/   -- alpha123's, vendored verbatim, NEVER hand-edited
 *
 * The refs below are pinned deliberately and are NOT what alpha123 himself pins.
 * His uma-tools repo pins the engine at 6ba5ca0 (2025-08-07) but its app code has,
 * since 1b8876b (2026-03-16), called RaceSolverBuilder#otherHorse -- a method that
 * exists in no published commit of uma-skill-tools, on any branch or PR. His repo
 * therefore does not build against its own pinned engine.
 *
 * ENGINE_REF is the newest engine commit that resolves cleanly, and GLUE_REF is the
 * last app commit before the otherHorse overreach. Verified: that pair has zero
 * unresolved imports and zero missing builder methods. Do not advance GLUE_REF past
 * 21a4d43 unless upstream publishes an engine providing otherHorse.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE_REPO = 'https://github.com/alpha123/uma-skill-tools.git';
const ENGINE_REF = '8b3f5e27e939e77431679876403d3fb2f0709e2a';  // master, 2026-03-17
const GLUE_REPO = 'https://github.com/alpha123/uma-tools.git';
const GLUE_REF = '21a4d43';                                     // 2026-03-16, pre-otherHorse
const OUT = join(REPO, 'uma-skill-tools-v1');
const CACHE = join(REPO, '.upstream-engine-cache');

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, {encoding: 'utf8', maxBuffer: 1 << 28, ...opts});

function ensureClone(url, dir) {
	if (!existsSync(dir)) run('git', ['clone', '--quiet', url, dir], {env: {...process.env, GIT_TERMINAL_PROMPT: '0'}});
	else run('git', ['-C', dir, 'fetch', '--quiet', 'origin'], {env: {...process.env, GIT_TERMINAL_PROMPT: '0'}});
	return dir;
}

mkdirSync(CACHE, {recursive: true});
const engDir = ensureClone(ENGINE_REPO, join(CACHE, 'engine'));
const glueDir = ensureClone(GLUE_REPO, join(CACHE, 'app'));

// --- engine ---
rmSync(OUT, {recursive: true, force: true});
mkdirSync(join(OUT, 'data'), {recursive: true});
const engFiles = run('git', ['-C', engDir, 'ls-tree', '--name-only', ENGINE_REF]).trim().split('\n').filter(f => f.endsWith('.ts'));
const banner = '// VENDORED from alpha123/uma-skill-tools — do not edit by hand.\n'
	+ '// Refresh with: node tools/sync-upstream-engine.mjs\n';
for (const f of engFiles) {
	writeFileSync(join(OUT, f), banner + run('git', ['-C', engDir, 'show', `${ENGINE_REF}:${f}`]));
}

// --- glue: rewrite its engine imports to point at the vendored copy ---
const glueOut = {'compare.ts': 'compare-v1.ts', 'hpcalc.ts': 'hpcalc-v1.ts'};
for (const [src, dst] of Object.entries(glueOut)) {
	let s = run('git', ['-C', glueDir, 'show', `${GLUE_REF}:umalator/${src}`]);
	s = s.replace(/(['"])\.\.\/uma-skill-tools\//g, '$1../uma-skill-tools-v1/');
	// hpcalc imports helpers from its sibling compare; keep it pointed at the v1 copy
	// rather than letting it resolve to ours.
	s = s.replace(/(['"])\.\/compare(['"])/g, '$1./compare-v1$2');
	writeFileSync(join(REPO, 'umalator', dst), banner + s);
}

const engRev = run('git', ['-C', engDir, 'log', '-1', '--format=%h %cs', ENGINE_REF]).trim();
const glueRev = run('git', ['-C', glueDir, 'log', '-1', '--format=%h %cs', GLUE_REF]).trim();
writeFileSync(join(OUT, 'VENDORED.json'), JSON.stringify({
	engine: {repo: ENGINE_REPO, ref: ENGINE_REF, rev: engRev},
	glue: {repo: GLUE_REPO, ref: GLUE_REF, rev: glueRev, files: glueOut}
}, null, '\t') + '\n');

console.log(`engine v1: ${engFiles.length} files from uma-skill-tools @ ${engRev}`);
console.log(`glue  v1: ${Object.values(glueOut).join(', ')} from uma-tools @ ${glueRev}`);
