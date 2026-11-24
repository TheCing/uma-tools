'use strict';
/**
 * Where to find the Global master.mdb. One resolver, shared by every script that reads
 * the Global DB (umalator-global/build.mjs, tools/sync-upstream-data.mjs,
 * tools/ingest-master-mdb.mjs, tools/fast-forward-global.ts), so they can never disagree.
 *
 * Search order (first existing file wins):
 *   1. $UMA_MASTER_MDB                         explicit override
 *   2. ~/.local/share/uma-tools/master.mdb     canonical local copy (pulled from the PC)
 *   3. docs/master.mdb                         legacy in-repo location (no longer tracked)
 *
 * If $UMA_MASTER_MDB is set but does not point at a file, resolution stops there and
 * reports "not found" instead of silently falling back to an older copy.
 *
 * CommonJS so the ts-node (commonjs) tools can require() it; ESM callers can import it.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LOCAL_MASTER_MDB = path.join(os.homedir(), '.local', 'share', 'uma-tools', 'master.mdb');
const LEGACY_MASTER_MDB = path.join(REPO_ROOT, 'docs', 'master.mdb');

function isFile(p) {
	try { return fs.statSync(p).isFile(); } catch { return false; }
}

function masterDbCandidates(env = process.env) {
	const list = [];
	if (env.UMA_MASTER_MDB) list.push({path: path.resolve(env.UMA_MASTER_MDB), source: '$UMA_MASTER_MDB', explicit: true});
	list.push({path: LOCAL_MASTER_MDB, source: '~/.local/share/uma-tools/master.mdb'});
	list.push({path: LEGACY_MASTER_MDB, source: 'docs/master.mdb (legacy)'});
	return list;
}

/** @returns {{path: string, source: string} | null} */
function resolveMasterDb(env = process.env) {
	for (const c of masterDbCandidates(env)) {
		if (isFile(c.path)) return {path: c.path, source: c.source};
		if (c.explicit) return null;   // explicit override that is wrong: do not fall back
	}
	return null;
}

/** Human-readable explanation of why no DB was found. */
function masterDbMissingMessage(env = process.env) {
	const lines = ['Global master.mdb not found. Looked in:'];
	for (const c of masterDbCandidates(env)) {
		lines.push('  - ' + c.path + '  (' + c.source + ')' + (isFile(c.path) ? '' : '  -> missing'));
		if (c.explicit) { lines.push('  ($UMA_MASTER_MDB is set, so later locations were not considered)'); break; }
	}
	lines.push('Pull the staged copy from the PC (see "Updating Game Data" in README.md), e.g.:');
	lines.push('  mkdir -p ~/.local/share/uma-tools');
	lines.push('  scp <pc>:Dev/uma-master-staging/latest.json ~/.local/share/uma-tools/latest.json');
	lines.push('  scp <pc>:Dev/uma-master-staging/<file named in latest.json> ~/.local/share/uma-tools/master.mdb');
	lines.push('or point $UMA_MASTER_MDB at a copy.');
	return lines.join('\n');
}

module.exports = {REPO_ROOT, LOCAL_MASTER_MDB, LEGACY_MASTER_MDB, masterDbCandidates, resolveMasterDb, masterDbMissingMessage};
