#!/usr/bin/env node
/**
 * Ingest a Global master.mdb into the committed umalator-global data files.
 *
 *   node tools/ingest-master-mdb.mjs --mdb <path> [--dry-run] [--summary <file.md>]
 *                                    [--baseline-mdb <older.mdb>]
 *
 * Exit codes:  0 data changed (or would change, with --dry-run)
 *              3 no data change
 *              2 refused by a safety check (nothing written)
 *              1 error (nothing written)
 *
 * The DB is opened read-only through the sqlite3 CLI. Without --mdb the shared resolver
 * is used ($UMA_MASTER_MDB, ~/.local/share/uma-tools/master.mdb, docs/master.mdb).
 *
 * Writes only data JSON files under umalator-global/:
 *   skill_data.json          merge: Global-live definitions refreshed/added, JP-only entries untouched
 *   skill_meta.json          merge: groupId/iconId/baseCost/order for Global skills
 *   skillnames.json          official names; aliases and "(obsolete)" markers kept
 *   umas.json                Global character names and outfit epithets
 *   global-live-skills.json  union of the previous list and the DB's skill IDs
 *   not-in-game.json         regenerated against the DB (same logic as build.mjs)
 *   v2/cm-presets.generated.json  only when the JP DB is available (same logic as build.mjs)
 *   global-master-snapshot.json   IDs/counts of the ingested DB: the baseline for next time
 *
 * Safety (exit 2, nothing written): integrity check fails; required tables/columns
 * missing; skill or outfit count drops below the baseline; a x1.2 scenario skill no
 * longer matches exactly; skill_data.json or skillnames.json would lose an entry; the
 * file name says master-<sha256>.mdb but the content hash differs; the path points into
 * the live game folder (AppData/LocalLow) instead of a staged copy.
 *
 * Merge rules are shared with tools/sync-upstream-data.mjs (tools/lib/skill-data-rules.mjs).
 * Running it twice on the same DB changes nothing the second time (exit 3).
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

import { MasterDb } from './lib/master-db.mjs';
import { readJsonFile, writeJsonFile } from './lib/json-file.mjs';
import { GuardError, mergeSkillData, applyOfficialName, assertNamesKept } from './lib/skill-data-rules.mjs';
import { checkSchema, readGlobalMaster, readCmDates } from './lib/global-master.mjs';
import { computeNotInGame, syncUmaNames, readJpCmConditions, computeCMPresets, resolveJpDb } from './lib/global-data-sync.mjs';

// Paths that end up in the PR body: show the home directory as ~ so the account name never leaks.
const HOME = homedir();
const tilde = p => (HOME && (p === HOME || p.startsWith(HOME + '/') || p.startsWith(HOME + '\\')) ? '~' + p.slice(HOME.length) : p);

const { resolveMasterDb, masterDbMissingMessage } = createRequire(import.meta.url)('./lib/master-db-path.cjs');

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const G = join(REPO, 'umalator-global');
const EXIT = {CHANGED: 0, ERROR: 1, REFUSED: 2, UNCHANGED: 3};
const SNAPSHOT = 'global-master-snapshot.json';

// ------------------------------------------------------------------ CLI
function parseArgs(argv) {
	const opts = {dryRun: false};
	for (let i = 0; i < argv.length; ++i) {
		const a = argv[i];
		const val = () => { if (i + 1 >= argv.length) throw new UsageError(a + ' needs a value'); return argv[++i]; };
		if (a === '--mdb') opts.mdb = val();
		else if (a === '--dry-run') opts.dryRun = true;
		else if (a === '--summary') opts.summary = val();
		else if (a === '--baseline-mdb') opts.baselineMdb = val();
		else if (a === '-h' || a === '--help') opts.help = true;
		else throw new UsageError('unknown argument: ' + a);
	}
	return opts;
}
class UsageError extends Error {}
const USAGE = 'Usage: node tools/ingest-master-mdb.mjs --mdb <path> [--dry-run] [--summary <file.md>] [--baseline-mdb <older.mdb>]';

const refuse = msg => { throw new GuardError(msg); };
const sortIds = ids => [...ids].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
const fmtList = (ids, label) => ids.length ? ids.map(label).join('\n') : '_none_';

// ------------------------------------------------------------------ main
function main() {
	const opts = parseArgs(process.argv.slice(2));
	if (opts.help) { console.log(USAGE); return EXIT.UNCHANGED; }

	// ---- locate the DB
	let mdbPath, mdbSource;
	if (opts.mdb) {
		mdbPath = resolve(opts.mdb);
		mdbSource = '--mdb';
		if (!existsSync(mdbPath) || !statSync(mdbPath).isFile()) {
			console.error(`Global master.mdb not found at ${mdbPath} (from --mdb).`);
			console.error(masterDbMissingMessage());
			return EXIT.ERROR;
		}
	} else {
		const found = resolveMasterDb();
		if (!found) { console.error(masterDbMissingMessage()); return EXIT.ERROR; }
		({path: mdbPath, source: mdbSource} = found);
	}
	console.log(`Global master.mdb: ${mdbPath} (${mdbSource})${opts.dryRun ? '  [dry run]' : ''}`);

	if (/[\\/]AppData[\\/]LocalLow[\\/]/i.test(mdbPath))
		refuse('refusing to read the live game folder in place; ingest a staged copy instead');

	const db = new MasterDb(mdbPath);
	const sha256 = db.sha256();
	const named = basename(mdbPath).match(/^master-([0-9a-f]{64})\.mdb$/i);
	if (named && named[1].toLowerCase() !== sha256)
		refuse(`file name says sha256 ${named[1]} but the content hashes to ${sha256} (incomplete copy?)`);

	// ---- structural checks before trusting anything in it
	const integrity = db.quickCheck();
	if (integrity !== 'ok') refuse(`PRAGMA quick_check returned: ${integrity}`);
	const missing = checkSchema(db);
	if (missing.length) refuse(`required tables/columns missing: ${missing.join(', ')}`);

	const g = readGlobalMaster(db);
	const staged = readStagedMeta(mdbPath, sha256);

	// ---- current committed data
	const files = {
		skillData: load('skill_data.json'),
		meta: load('skill_meta.json'),
		names: load('skillnames.json'),
		umas: load('umas.json'),
		live: load('global-live-skills.json'),
		notInGame: load('not-in-game.json'),
		cmPresets: load('v2/cm-presets.generated.json', {optional: true}),
		snapshot: load(SNAPSHOT, {optional: true}),
	};

	// ---- baseline: what the previous ingest saw
	const baseline = loadBaseline(opts, files);
	const warnings = [];

	if (!g.skillIds.length) refuse('skill_data table is empty');
	if (g.skillIds.length < baseline.skillCount)
		refuse(`skill count dropped: ${baseline.skillCount} -> ${g.skillIds.length} (baseline: ${baseline.source})`);
	if (g.outfitIds.length < baseline.outfitCount)
		refuse(`outfit count dropped: ${baseline.outfitCount} -> ${g.outfitIds.length} (baseline: ${baseline.source})`);

	const dbSkills = new Set(g.skillIds), dbOutfits = new Set(g.outfitIds);
	const goneSkills = sortIds([...baseline.skills].filter(id => !dbSkills.has(id) && !baseline.derived));
	const goneOutfits = sortIds([...baseline.outfits].filter(id => !dbOutfits.has(id) && !baseline.derived));
	if (goneSkills.length) warnings.push(`skill IDs in the baseline but no longer in the DB (left in our data): ${goneSkills.join(', ')}`);
	if (goneOutfits.length) warnings.push(`outfit IDs in the baseline but no longer in the DB (left in our data): ${goneOutfits.join(', ')}`);

	// ---- 1. skill definitions (shared merge rules; GuardError -> refuse)
	const skillMerge = mergeSkillData(files.skillData.data, g.definitions, {compare: 'exact'});
	const skillData = skillMerge.data;

	// ---- 2. skill meta: refresh the four DB-derived fields, keep any extra keys / key order
	const meta = structuredClone(files.meta.data);
	const metaUpdated = [], metaAdded = [];
	for (const [id, m] of Object.entries(g.meta)) {
		const cur = meta[id];
		if (!cur) { meta[id] = m; metaAdded.push(id); continue; }
		if (Object.keys(m).some(k => cur[k] !== m[k])) { Object.assign(cur, m); metaUpdated.push(id); }
	}

	// ---- 3. names: the DB is the client's own text; keep aliases and "(obsolete)"
	const names = structuredClone(files.names.data);
	const renamed = [], namesAdded = [];
	for (const id of g.skillIds) {
		const official = g.skillNames.get(id);
		if (official == null) continue;
		if (names[id]) {
			const prev = applyOfficialName(names[id], official);
			if (prev != null) renamed.push({id, from: prev, to: official});
		} else if (id in skillData) {
			names[id] = [official];
			namesAdded.push(id);
		}
	}
	assertNamesKept(files.names.data, names);

	// ---- 4. live-skill list: never drop an ID, add everything the DB has
	const prevLive = files.live.data.skills ?? [];
	const liveIds = [...new Set([...prevLive, ...g.skillIds])].sort((a, b) => a.localeCompare(b));
	let live = files.live.data;
	if (JSON.stringify(liveIds) !== JSON.stringify(prevLive)) {
		live = {
			_comment: 'Skill IDs live on Global. Maintained by tools/ingest-master-mdb.mjs (union of the Global master.mdb skill_data IDs and earlier entries; upstream sync may also add IDs). The build unions this with the DB when one is present.',
			source: `Global master.mdb sha256:${sha256.slice(0, 12)}`,
			skills: liveIds
		};
	}
	const notInDb = prevLive.filter(id => !dbSkills.has(id));
	if (notInDb.length) warnings.push(`global-live-skills.json lists IDs the DB does not have (kept): ${notInDb.join(', ')}`);

	// ---- 5. umas.json names (same function build.mjs uses)
	const umas = structuredClone(files.umas.data);
	const umaChanges = syncUmaNames(umas, {epithets: g.epithets, charaNames: g.charaNames});

	// ---- 6. not-in-game.json (same function build.mjs uses)
	const notInGame = computeNotInGame({skillData, umas, liveSkillIds: new Set(liveIds), outfitIds: dbOutfits});

	// ---- 7. CM presets (needs the JP DB for race conditions)
	let cmPresets = files.cmPresets.data, cmNote;
	const jpPath = resolveJpDb(REPO);
	if (jpPath) {
		const handDates = load('v2/cm-dates.json', {optional: true}).data ?? {};
		cmPresets = computeCMPresets({jp: readJpCmConditions(new MasterDb(jpPath)), globalDates: g.cmDates, handDates});
		cmNote = `regenerated with JP DB ${tilde(jpPath)}`;
	} else {
		cmNote = 'JP DB not present ($UMA_JP_MASTER_MDB or docs/master(1).mdb): v2/cm-presets.generated.json left as committed';
	}

	// ---- 8. write
	const outputs = [
		['skill_data.json', files.skillData, skillData],
		['skill_meta.json', files.meta, meta],
		['skillnames.json', files.names, names],
		['umas.json', files.umas, umas],
		['global-live-skills.json', files.live, live],
		['not-in-game.json', files.notInGame, notInGame],
		...(files.cmPresets.text != null || jpPath ? [['v2/cm-presets.generated.json', files.cmPresets, cmPresets]] : []),
	];
	const changed = outputs.filter(([name, f, data]) => writeJsonFile(join(G, name), data, f.format, {dryRun: true})).map(([name]) => name);

	const stable = {
		skillCount: g.skillIds.length, outfitCount: g.outfitIds.length, tableCount: g.tableCount,
		skills: sortIds(g.skillIds), outfits: sortIds(g.outfitIds), cmDates: g.cmDates
	};
	const prevStable = files.snapshot.data && JSON.stringify(pickStable(files.snapshot.data)) === JSON.stringify(stable);
	if (changed.length || !prevStable) {
		const snapshot = {
			_comment: 'What the last tools/ingest-master-mdb.mjs run saw in the Global master.mdb. Baseline for the next run (count-drop guard, new IDs in the summary).',
			sha256, steamBuildId: staged.steamBuildId ?? null, sourceMtime: staged.sourceMtime ?? null, stagedAt: staged.stagedAt ?? null,
			...stable
		};
		outputs.push([SNAPSHOT, files.snapshot, snapshot]);
		changed.push(SNAPSHOT);
	}
	if (!opts.dryRun) for (const [name, f, data] of outputs) writeJsonFile(join(G, name), data, f.format);

	// ---- 9. report
	const exit = changed.length ? EXIT.CHANGED : EXIT.UNCHANGED;
	const newSkills = sortIds(g.skillIds.filter(id => !baseline.skills.has(id) && (!baseline.derived || id in files.skillData.data)));
	const newOutfits = sortIds(g.outfitIds.filter(id => !baseline.outfits.has(id)));
	const newCms = Object.entries(g.cmDates).filter(([id, d]) => baseline.cmDates[id] !== d);
	const skillName = id => g.skillNames.get(id) ?? names[id]?.[0] ?? '?';
	const outfitTitle = id => {
		const chara = id.slice(0, 4);
		const who = g.charaNames.get(chara) ?? umas[chara]?.name?.[1] ?? chara;
		return `${g.epithets.get(id) ?? umas[chara]?.outfits?.[id]?.epithet ?? '?'} ${who}`;
	};
	const md = [
		`# Global master.mdb ingest${opts.dryRun ? ' (dry run)' : ''}`,
		'',
		`- DB: \`${tilde(mdbPath)}\` (${mdbSource}), sha256 \`${sha256}\`, ${db.size()} bytes, ${g.tableCount} tables, integrity ok`,
		`- Staged metadata: ${staged.note}`,
		`- Baseline: ${baseline.source}`,
		`- Skills: ${baseline.skillCount} -> ${g.skillIds.length}${baseline.derived ? ' (old count derived from committed data)' : ''}`,
		`- Outfits: ${baseline.outfitCount} -> ${g.outfitIds.length}${baseline.derived ? ' (old count derived from committed data)' : ''}`,
		`- Result: exit ${exit} (${exit === EXIT.CHANGED ? (opts.dryRun ? 'data would change' : 'data changed') : 'no data change'})`,
		'',
		`## New skills (${newSkills.length})`,
		fmtList(newSkills, id => `- ${id} ${skillName(id)}`),
		'',
		`## New outfits (${newOutfits.length})`,
		fmtList(newOutfits, id => `- ${id} ${outfitTitle(id)}`),
		'',
		`## Renamed skills (${renamed.length})`,
		fmtList(renamed, r => `- ${r.id}: "${r.from}" -> "${r.to}"`),
		'',
		`## New or changed Champions Meeting dates (${newCms.length})`,
		fmtList(newCms, ([id, d]) => `- CM ${id}: ${baseline.cmDates[id] ? baseline.cmDates[id] + ' -> ' : ''}${d}`),
		'',
		'## Data files',
		`- skill_data.json: ${skillMerge.updated.length} updated, ${skillMerge.added.length} added, ${skillMerge.skipped.length} x1.2 scenario skills verified and kept; ${skillMerge.before} -> ${skillMerge.after} entries`,
		...(skillMerge.updated.length ? [`  - updated: ${skillMerge.updated.map(id => id + ' ' + skillName(id)).join('; ')}`] : []),
		...(skillMerge.added.length ? [`  - added: ${skillMerge.added.map(id => id + ' ' + skillName(id)).join('; ')}`] : []),
		`- skill_meta.json: ${metaUpdated.length} updated, ${metaAdded.length} added` + (metaUpdated.length + metaAdded.length ? ` (${[...metaUpdated, ...metaAdded].join(', ')})` : ''),
		`- skillnames.json: ${renamed.length} renamed, ${namesAdded.length} added` + (namesAdded.length ? ` (${namesAdded.join(', ')})` : ''),
		`- umas.json: ${umaChanges.length} name/epithet change(s)`,
		...umaChanges.map(c => '  - ' + c),
		`- global-live-skills.json: ${prevLive.length} -> ${liveIds.length} IDs`,
		`- not-in-game.json: ${files.notInGame.data.skills.length} -> ${notInGame.skills.length} skills, ${files.notInGame.data.outfits.length} -> ${notInGame.outfits.length} outfits`,
		`- cm-presets: ${cmNote}`,
		`- Files ${opts.dryRun ? 'that would change' : 'changed'}: ${changed.length ? changed.map(f => 'umalator-global/' + f).join(', ') : 'none'}`,
		...(warnings.length ? ['', '## Warnings', ...warnings.map(w => '- ' + w)] : []),
		''
	].join('\n');

	console.log('\n' + md);
	if (opts.summary) writeFileSync(resolve(opts.summary), md);
	return exit;
}

// ------------------------------------------------------------------ helpers
function load(name, {optional = false} = {}) {
	const p = join(G, name);
	if (!existsSync(p)) {
		if (optional) return {data: undefined, text: null, format: {indent: '\t', trailingNewline: true}};
		throw new Error(`missing data file umalator-global/${name}`);
	}
	return readJsonFile(p);
}

const pickStable = s => ({skillCount: s.skillCount, outfitCount: s.outfitCount, tableCount: s.tableCount,
	skills: s.skills, outfits: s.outfits, cmDates: s.cmDates});

/** latest.json written by the PC stager, if it sits next to the DB and describes this exact file. */
function readStagedMeta(mdbPath, sha256) {
	const p = join(dirname(mdbPath), 'latest.json');
	if (!existsSync(p)) return {note: 'no latest.json next to the DB'};
	try {
		const j = JSON.parse(readFileSync(p, 'utf8'));
		if (String(j.sha256).toLowerCase() !== sha256)
			return {note: `latest.json describes a different file (sha256 ${j.sha256}); ignored`};
		return {steamBuildId: j.steamBuildId ?? null, sourceMtime: j.sourceMtime ?? null, stagedAt: j.stagedAt ?? null,
			note: `latest.json matches (steamBuildId ${j.steamBuildId ?? 'null'}, sourceMtime ${j.sourceMtime}, stagedAt ${j.stagedAt})`};
	} catch (e) {
		return {note: `latest.json unreadable (${e.message}); ignored`};
	}
}

function loadBaseline(opts, files) {
	if (opts.baselineMdb) {
		const p = resolve(opts.baselineMdb);
		if (!existsSync(p)) throw new Error(`--baseline-mdb not found: ${p}`);
		const b = new MasterDb(p);
		const skills = new Set(b.ids('skill_data')), outfits = new Set(b.ids('card_data'));
		return {source: `--baseline-mdb ${tilde(p)}`, skills, outfits, cmDates: readCmDates(b),
			skillCount: skills.size, outfitCount: outfits.size, derived: false};
	}
	const s = files.snapshot.data;
	if (s) {
		return {source: `umalator-global/${SNAPSHOT} (sha256 ${String(s.sha256).slice(0, 12)})`,
			skills: new Set(s.skills), outfits: new Set(s.outfits), cmDates: s.cmDates ?? {},
			skillCount: s.skillCount, outfitCount: s.outfitCount, derived: false};
	}
	// First run: no snapshot yet. Reconstruct "what our data treats as live" from the
	// committed files. These counts are floors (they omit DB-only skills our data never
	// tracked), which is what the count-drop guard needs.
	const nig = files.notInGame.data;
	const nigSkills = new Set(nig.skills), nigOutfits = new Set(nig.outfits);
	const skills = new Set([...Object.keys(files.skillData.data).filter(id => !nigSkills.has(id)), ...(files.live.data.skills ?? [])]);
	const outfits = new Set(Object.values(files.umas.data).flatMap(c => Object.keys(c.outfits || {})).filter(id => !nigOutfits.has(id)));
	const cmDates = Object.fromEntries((files.cmPresets.data ?? []).filter(p => p.confirmed).map(p => [String(p.id), p.date]));
	return {source: 'derived from committed data (no ' + SNAPSHOT + ' yet): live = skill_data.json minus not-in-game.json, plus global-live-skills.json',
		skills, outfits, cmDates, skillCount: skills.size, outfitCount: outfits.size, derived: true};
}

// ------------------------------------------------------------------ entry
let code;
try {
	code = main();
} catch (e) {
	if (e instanceof GuardError) {
		console.error(`\nREFUSED: ${e.message}\nNothing written.`);
		code = EXIT.REFUSED;
	} else if (e instanceof UsageError) {
		console.error(e.message + '\n' + USAGE);
		code = EXIT.ERROR;
	} else {
		console.error(`\nERROR: ${e.stack || e.message}\nNothing written.`);
		code = EXIT.ERROR;
	}
}
process.exit(code);
