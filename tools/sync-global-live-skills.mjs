#!/usr/bin/env node
/**
 * Regenerate umalator-global/global-live-skills.json from alpha123/uma-tools.
 *
 * Our docs/master.mdb lags the live Global client (it is synced by hand from another
 * machine), so skills that have already released show up in not-in-game.json and get a
 * "Not in game" badge. Upstream regenerates their Global skill_data.json straight from a
 * current client DB, so their key set is a better answer to "what has shipped".
 *
 * The build UNIONs this list with the mdb rather than replacing it: upstream's generator
 * drops scenario/bonus skills (its filter is is_general_skill=1 OR rarity>=3), so a
 * straight swap would wrongly flag ~18 skills the mdb correctly reports as live.
 *
 *   git fetch alpha123 master
 *   node tools/sync-global-live-skills.mjs
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const REF = process.argv[2] ?? 'alpha123/master';
const OUT = join(REPO, 'umalator-global', 'global-live-skills.json');

const git = args => execFileSync('git', ['-C', REPO, ...args], {encoding: 'utf8', maxBuffer: 1 << 28});

let json;
try {
	json = git(['show', `${REF}:umalator-global/skill_data.json`]);
} catch (e) {
	console.error(`Could not read ${REF}:umalator-global/skill_data.json`);
	console.error('Run "git fetch alpha123 master" first (remote alpha123 = https://github.com/alpha123/uma-tools).');
	process.exit(1);
}

const ids = Object.keys(JSON.parse(json)).sort((a, b) => a.localeCompare(b));
const rev = git(['rev-parse', '--short', REF]).trim();
const date = git(['log', '-1', '--format=%cs', REF]).trim();

let prev = [];
try { prev = JSON.parse(readFileSync(OUT, 'utf8')).skills ?? []; } catch {}

writeFileSync(OUT, JSON.stringify({
	_comment: 'Skill IDs live on Global per upstream, used to supplement docs/master.mdb when it lags the client. Regenerate with tools/sync-global-live-skills.mjs.',
	source: `alpha123/uma-tools@${rev} (${date})`,
	skills: ids
}, null, '\t') + '\n');

const added = ids.filter(i => !prev.includes(i)), removed = prev.filter(i => !ids.includes(i));
console.log(`global-live-skills.json: ${ids.length} skills from ${REF} @ ${rev} (${date})`);
if (prev.length) console.log(`  +${added.length} -${removed.length}${added.length ? '  added: ' + added.join(',') : ''}`);
