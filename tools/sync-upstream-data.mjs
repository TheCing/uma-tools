#!/usr/bin/env node
/**
 * Pull alpha123's Global game data into our repo. Designed to run unattended
 * (.github/workflows/sync-upstream-data.yml) and commit on its own.
 *
 * The safety lives here, not in a review step. Three rules were learned the hard way
 * and are enforced as code, with guards that abort the whole run rather than commit
 * something wrong:
 *
 *   1. skill_data.json is a JP SUPERSET (~1530) over upstream's Global-live set (~692).
 *      Only entries upstream also has may be updated; JP-only entries are never touched
 *      and the key count may never shrink.
 *   2. Scenario skills 210011-210291 carry make_skill_data.pl's patch_modifier() x1.2.
 *      Upstream ships the unpatched values, so syncing them would silently cut those
 *      magnitudes ~17%. They are skipped, and we verify each skipped one really is an
 *      exact 1.2 ratio so a genuine upstream change can't hide in that set.
 *   3. For NAMES, UPSTREAM wins for anything Global-live, and docs/master.mdb only fills
 *      in what upstream lacks. Our mdb is synced by hand and lags the client by weeks --
 *      that lag is why global-live-skills.json exists at all -- so treating it as the
 *      naming authority silently blocks genuine Cygames renames. 202401 was renamed
 *      "Flash Forward" -> "Lightning Surge"; an earlier version of this script pinned the
 *      stale value and kept the rename out. Our extra search aliases and "(obsolete)"
 *      markers are still preserved.
 *
 * Usage: node tools/sync-upstream-data.mjs [--check]
 *        --check reports what would change and writes nothing (exit 1 if drift).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const G = join(REPO, 'umalator-global');
const MDB = join(REPO, 'docs', 'master.mdb');
const UPSTREAM = 'https://github.com/alpha123/uma-tools.git';
const CACHE = join(REPO, '.upstream-engine-cache', 'app');
const CHECK = process.argv.includes('--check');

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, {encoding: 'utf8', maxBuffer: 1 << 28, ...opts});
const changes = [];
const fail = msg => { console.error(`\nGUARD FAILED: ${msg}\nNothing written.`); process.exit(2); };

// ---- file IO that preserves each file's on-disk shape -------------------------
const MINIFIED = new Set(['course_data.json', 'not-in-game.json']);
const read = name => JSON.parse(readFileSync(join(G, name), 'utf8'));
function write(name, obj) {
	const body = MINIFIED.has(name) ? JSON.stringify(obj) : JSON.stringify(obj, null, '\t') + '\n';
	// write bytes: never let a text writer normalise line endings
	if (!CHECK) writeFileSync(join(G, name), Buffer.from(body, 'utf8'));
}

// ---- upstream ---------------------------------------------------------------
mkdirSync(dirname(CACHE), {recursive: true});
if (!existsSync(CACHE)) sh('git', ['clone', '--quiet', UPSTREAM, CACHE], {env: {...process.env, GIT_TERMINAL_PROMPT: '0'}});
sh('git', ['-C', CACHE, 'fetch', '--quiet', 'origin'], {env: {...process.env, GIT_TERMINAL_PROMPT: '0'}});
const REF = sh('git', ['-C', CACHE, 'rev-parse', 'origin/HEAD']).trim();
const REV = sh('git', ['-C', CACHE, 'log', '-1', '--format=%h %cs', REF]).trim();
const up = name => JSON.parse(sh('git', ['-C', CACHE, 'show', `${REF}:umalator-global/${name}`]));
console.log(`upstream alpha123/uma-tools @ ${REV}\n`);

// ---- 1. course data: upstream is authoritative; keep courses it lacks ---------
{
	const a = up('course_data.json'), o = read('course_data.json');
	const merged = {...o, ...a};
	const added = Object.keys(a).filter(k => !(k in o));
	const changed = Object.keys(a).filter(k => k in o && JSON.stringify(a[k]) !== JSON.stringify(o[k]));
	const ourOnly = Object.keys(o).filter(k => !(k in a));
	if (added.length || changed.length) {
		changes.push(`course_data: ${added.length} added, ${changed.length} updated`);
		if (added.length) console.log(`  course_data +${added.length}: ${added.join(',')}`);
		if (changed.length) console.log(`  course_data ~${changed.length} geometry updates`);
		if (ourOnly.length) console.log(`  (kept ${ourOnly.length} course(s) upstream lacks: ${ourOnly.join(',')})`);
		write('course_data.json', merged);
	}
}

// ---- 2. track names: union, ours wins for entries upstream lacks -------------
{
	const a = up('tracknames.json'), o = read('tracknames.json');
	const merged = {...a, ...Object.fromEntries(Object.keys(o).filter(k => !(k in a)).map(k => [k, o[k]]))};
	for (const k of Object.keys(a)) if (!(k in o)) merged[k] = a[k];
	if (JSON.stringify(merged) !== JSON.stringify(o)) {
		const added = Object.keys(merged).filter(k => !(k in o));
		changes.push(`tracknames: ${added.length} added`);
		console.log(`  tracknames +${added.length}: ${added.join(',')}`);
		write('tracknames.json', merged);
	}
}

// ---- 3. live-skill list ------------------------------------------------------
const upSkills = up('skill_data.json');
{
	const ids = Object.keys(upSkills).sort((x, y) => x.localeCompare(y));
	const cur = read('global-live-skills.json');
	if (JSON.stringify(cur.skills) !== JSON.stringify(ids)) {
		const added = ids.filter(i => !cur.skills.includes(i));
		changes.push(`global-live-skills: ${ids.length} (${added.length} new)`);
		console.log(`  global-live-skills: ${ids.length} skills${added.length ? ', new: ' + added.join(',') : ''}`);
		write('global-live-skills.json', {...cur, source: `alpha123/uma-tools@${REV}`, skills: ids});
	}
}

// ---- 4. skill definitions: merge Global-live only, never the x1.2 scenarios ---
{
	const ours = read('skill_data.json');
	const before = Object.keys(ours).length;
	const isScenario = k => +k >= 210011 && +k <= 210291;
	const norm = s => JSON.stringify({rarity: s.rarity, alts: (s.alternatives ?? []).map(x => ({
		c: x.condition ?? '', p: x.precondition ?? '', d: x.baseDuration, ds: x.durationScaling ?? 1,
		e: (x.effects ?? []).map(e => [e.type, e.modifier, e.target ?? null, e.scaling ?? null]).sort()}))});

	const drift = Object.keys(upSkills).filter(k => k in ours && norm(upSkills[k]) !== norm(ours[k]));
	const merge = drift.filter(k => !isScenario(k));
	const skipped = drift.filter(isScenario);

	// every skipped scenario skill must be an exact x1.2 of upstream, structure identical
	for (const k of skipped) {
		const A = upSkills[k].alternatives, O = ours[k].alternatives;
		const shape = alts => JSON.stringify(alts.map(a => ({c: a.condition ?? '', p: a.precondition ?? '',
			d: a.baseDuration, ds: a.durationScaling ?? 1, e: (a.effects ?? []).map(e => [e.type, e.target ?? null])})));
		if (shape(A) !== shape(O)) fail(`scenario skill ${k} differs structurally, not just by the x1.2 patch`);
		A.forEach((a, i) => (a.effects ?? []).forEach((e, j) => {
			const r = O[i]?.effects?.[j]?.modifier / e.modifier;
			if (Math.abs(r - 1.2) > 1e-9) fail(`scenario skill ${k} effect ${j} ratio ${r}, expected exactly 1.2`);
		}));
	}

	const added = Object.keys(upSkills).filter(k => !(k in ours));
	if (merge.length || added.length) {
		for (const k of merge) ours[k] = upSkills[k];
		for (const k of added) ours[k] = upSkills[k];
		if (Object.keys(ours).length < before) fail('skill_data key count shrank');
		changes.push(`skill_data: ${merge.length} updated, ${added.length} added`);
		console.log(`  skill_data: ${merge.length} updated, ${added.length} added, ${skipped.length} scenario skills correctly skipped`);
		write('skill_data.json', ours);
	} else if (skipped.length) {
		console.log(`  skill_data: no changes (${skipped.length} scenario skills correctly skipped)`);
	}
}

// ---- 5. names: upstream wins for live skills, master.mdb fills the rest ------
{
	const names = read('skillnames.json');
	const upNames = up('skillnames.json');
	const before = Object.keys(names).length;
	const mdb = existsSync(MDB)
		? new Map(sh('sqlite3', ['-separator', '\t', MDB,
				'SELECT "index", text FROM text_data WHERE category=47;']).trim().split('\n')
				.map(l => { const i = l.indexOf('\t'); return [l.slice(0, i), l.slice(i + 1)]; }))
		: new Map();
	if (!mdb.size) console.log('  skillnames: master.mdb absent, upstream only');

	let fromUp = 0, fromMdb = 0, derived = 0;
	for (const id of Object.keys(names)) {
		const cur = names[id];
		if (!Array.isArray(cur) || !cur.length) continue;
		if (cur[0].includes('(obsolete)')) continue;       // our own annotation; never strip

		// upstream regenerates from a current client DB, so it wins wherever it has an entry
		const u = upNames[id]?.[0];
		if (u != null) { if (cur[0] !== u) { cur[0] = u; ++fromUp; } continue; }

		const off = mdb.get(id);
		if (off != null) { if (cur[0] !== off) { cur[0] = off; ++fromMdb; } continue; }

		if (/^9/.test(id)) {                                // inherited variant mirrors its base
			const baseUp = upNames['1' + id.slice(1)]?.[0], baseMdb = mdb.get('1' + id.slice(1));
			const base = baseUp ?? baseMdb;
			if (base != null) {
				const want = base + ' (inherited)';
				if (cur[0] !== want) { cur[0] = want; ++derived; }
			}
		}
	}
	if (fromUp || fromMdb || derived) {
		changes.push(`skillnames: ${fromUp + fromMdb + derived} updated`);
		console.log(`  skillnames: ${fromUp} from upstream, ${fromMdb} from master.mdb, ${derived} inherited`);
		write('skillnames.json', names);
	}
	if (Object.keys(names).length !== before) fail('skillnames key count changed');
}

if (!changes.length) { console.log('\nAlready up to date.'); process.exit(0); }
console.log(`\n${CHECK ? 'WOULD APPLY' : 'APPLIED'}: ${changes.join(' | ')}`);
if (!CHECK) writeFileSync(join(REPO, '.sync-summary.txt'), changes.join('; ') + ` (upstream ${REV})`);
process.exit(CHECK ? 1 : 0);
