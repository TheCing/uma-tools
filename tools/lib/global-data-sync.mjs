/**
 * Data steps that derive committed umalator-global files from the Global master.mdb.
 * Shared by umalator-global/build.mjs (best effort, every build) and
 * tools/ingest-master-mdb.mjs (strict, on a new DB), so both produce identical output.
 *
 * The compute* functions are pure (data in, data out). The run* wrappers do the file and
 * DB IO for build.mjs and keep its historical best-effort behaviour: if the DB or the
 * sqlite3 CLI is missing (e.g. the Cloudflare Pages image), the committed file is left
 * alone.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MasterDb } from './master-db.mjs';
import { readJsonFile, writeJsonFile } from './json-file.mjs';
import { readCmDates } from './global-master.mjs';
import { applyOfficialName } from './skill-data-rules.mjs';

// ---------------------------------------------------------------- not-in-game.json
/**
 * Skills/outfits present in our data but not on Global yet.
 * liveSkillIds should be the mdb skill IDs UNIONed with global-live-skills.json: upstream's
 * generator drops scenario/bonus skills, so the list is a supplement, never a replacement.
 */
export function computeNotInGame({skillData, umas, liveSkillIds, outfitIds}) {
	const localOutfits = Object.keys(umas).flatMap(id => Object.keys(umas[id].outfits || {}));
	return {
		skills: Object.keys(skillData).filter(id => !liveSkillIds.has(id)),
		outfits: localOutfits.filter(id => !outfitIds.has(id))
	};
}

// ---------------------------------------------------------------- umas.json names
/**
 * Global character names (text_data 170) and outfit epithets (text_data 5) replace the
 * JP strings once the outfit/character exists on Global. Mutates umas; returns change lines.
 */
export function syncUmaNames(umas, {epithets, charaNames}) {
	const changes = [];
	for (const [charaId, chara] of Object.entries(umas)) {
		const globalName = charaNames.get(charaId);
		if (globalName && Array.isArray(chara.name) && chara.name[1] !== globalName) {
			changes.push(`${charaId} name: "${chara.name[1]}" → "${globalName}"`);
			chara.name[1] = globalName;
		}
		for (const [outfitId, current] of Object.entries(chara.outfits || {})) {
			const globalEpithet = epithets.get(outfitId);
			if (!globalEpithet) continue;
			// Outfits are stored either as the bare epithet string (fast-forwarded chars)
			// or as a full object with an epithet field (proper entries).
			if (typeof current === 'string') {
				if (current !== globalEpithet) {
					changes.push(`${outfitId}: "${current}" → "${globalEpithet}"`);
					chara.outfits[outfitId] = globalEpithet;
				}
			} else if (current && typeof current === 'object') {
				if (current.epithet !== globalEpithet) {
					changes.push(`${outfitId}: "${current.epithet}" → "${globalEpithet}"`);
					current.epithet = globalEpithet;
				}
			}
		}
	}
	return changes;
}

// ---------------------------------------------------------------- CM presets
/**
 * Champions Meeting presets for Global. Global CM N replays JP CM N exactly, so race
 * conditions come from the JP DB, run dates from the Global DB (authoritative) or the
 * hand-maintained v2/cm-dates.json for CMs beyond the Global client horizon.
 */
export function readJpCmConditions(jpDb) {
	const rows = jpDb.query(
		'SELECT cs.id, r.course_set, rc.season, rc.weather, rc.ground, ri.time ' +
		'FROM champions_schedule cs ' +
		'JOIN champions_race_condition crc ON crc.champions_id = cs.id AND crc.round_id = 0 ' +
		'JOIN race_instance ri ON ri.id = crc.race_instance_id ' +
		'JOIN race r ON r.id = ri.race_id ' +
		'JOIN race_condition rc ON rc.id = crc.race_condition_id ' +
		'ORDER BY cs.id');
	const jp = new Map();
	for (const r of rows) jp.set(Number(r.id), {courseId: r.course_set, season: r.season, weather: r.weather, ground: r.ground, time: r.time});
	return jp;
}

const ZODIAC = ['Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra',
	'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces', 'Aries'];

export function computeCMPresets({jp, globalDates, handDates}) {
	const out = [];
	for (const [id, cond] of jp) {
		const confirmed = globalDates[id] != null;
		const date = globalDates[id] ?? handDates[id];
		if (!date) continue;  // no Global date known yet: can't place this event
		out.push({
			id,
			type: 0,  // EventType.CM
			name: `${ZODIAC[(id - 1) % 12]} Cup`,
			date,
			courseId: cond.courseId,
			season: cond.season,
			ground: cond.ground,
			weather: cond.weather,
			time: cond.time,
			confirmed,
		});
	}
	out.sort((a, b) => a.id - b.id);
	return out;
}

/** JP DB location for CM conditions: $UMA_JP_MASTER_MDB, else docs/master(1).mdb. */
export function resolveJpDb(root) {
	const p = process.env.UMA_JP_MASTER_MDB ? path.resolve(process.env.UMA_JP_MASTER_MDB) : path.join(root, 'docs', 'master(1).mdb');
	return fs.existsSync(p) ? p : null;
}

// ================================================================ build.mjs wrappers
const fmtSource = db => `${db.source}: ${db.path}`;

export function runNotInGame({dir, db}) {
	const outPath = path.join(dir, 'not-in-game.json');
	if (!db) {
		const exists = fs.existsSync(outPath);
		console.log(`not-in-game.json: master.mdb not present — ${exists ? 'leaving committed file alone' : 'no committed file either, writing empty list'}`);
		if (!exists) fs.writeFileSync(outPath, JSON.stringify({skills: [], outfits: []}));
		return;
	}
	try {
		const mdb = new MasterDb(db.path);
		const live = new Set(mdb.ids('skill_data'));
		// docs/master.mdb used to lag the client, so upstream's Global-live list is UNIONed in.
		const livePath = path.join(dir, 'global-live-skills.json');
		let upstreamLive = 0;
		if (fs.existsSync(livePath)) {
			const before = live.size;
			for (const id of JSON.parse(fs.readFileSync(livePath, 'utf-8')).skills || []) live.add(id);
			upstreamLive = live.size - before;
		}
		const result = computeNotInGame({
			skillData: JSON.parse(fs.readFileSync(path.join(dir, 'skill_data.json'), 'utf-8')),
			umas: JSON.parse(fs.readFileSync(path.join(dir, 'umas.json'), 'utf-8')),
			liveSkillIds: live,
			outfitIds: new Set(mdb.ids('card_data'))
		});
		fs.writeFileSync(outPath, JSON.stringify(result));
		console.log(`not-in-game.json (master.mdb): ${result.skills.length} skills, ${result.outfits.length} outfits`
			+ (upstreamLive ? ` (${upstreamLive} more counted live via global-live-skills.json)` : ''));
	} catch (e) {
		console.warn(`Failed to regenerate not-in-game.json: ${e.message}. Leaving existing file in place.`);
	}
}

export function runUmaNames({dir, db, dryRun}) {
	if (!db) { console.log('umas.json sync: master.mdb not present, skipping'); return; }
	const umasPath = path.join(dir, 'umas.json');
	try {
		const mdb = new MasterDb(db.path);
		const umas = JSON.parse(fs.readFileSync(umasPath, 'utf-8'));
		const changes = syncUmaNames(umas, {epithets: mdb.text(5), charaNames: mdb.text(170)});
		if (!changes.length) { console.log('umas.json sync: no changes'); return; }
		console.log(`umas.json sync: ${changes.length} change(s)${dryRun ? ' (dry run)' : ''}`);
		for (const c of changes) console.log(`  ${c}`);
		if (!dryRun) fs.writeFileSync(umasPath, JSON.stringify(umas, null, 2) + '\n');
	} catch (e) {
		// e.g. sqlite3 CLI not installed (Cloudflare build image) or a DB read error.
		console.warn(`umas.json sync skipped: ${e.message}. Leaving existing file in place.`);
	}
}

/**
 * Official English skill names for in-game skills, skipping the ones listed in
 * global-live-skills.json (those are named by the ingest / upstream sync, which keep
 * aliases and "(obsolete)" markers).
 */
export function runSkillNames({dir, db, dryRun}) {
	if (!db) { console.log('skillnames.json sync: master.mdb not present, skipping'); return; }
	const namesPath = path.join(dir, 'skillnames.json');
	try {
		const mdb = new MasterDb(db.path);
		const skillnames = JSON.parse(fs.readFileSync(namesPath, 'utf-8'));
		const inGame = mdb.ids('skill_data');
		const official = mdb.text(47);
		let named = new Set();
		try {
			const livePath = path.join(dir, 'global-live-skills.json');
			if (fs.existsSync(livePath)) named = new Set(JSON.parse(fs.readFileSync(livePath, 'utf-8')).skills || []);
		} catch { /* without the list, behave as before */ }
		const changes = [];
		for (const id of inGame) {
			if (named.has(id)) continue;
			// applyOfficialName keeps aliases and never strips an "(obsolete)" marker
			const prev = applyOfficialName(skillnames[id], official.get(id));
			if (prev != null) changes.push(`${id}: "${prev}" → "${official.get(id)}"`);
		}
		if (!changes.length) { console.log('skillnames.json sync: no changes'); return; }
		console.log(`skillnames.json sync: ${changes.length} change(s)${dryRun ? ' (dry run)' : ''}`);
		for (const c of changes) console.log(`  ${c}`);
		if (!dryRun) fs.writeFileSync(namesPath, JSON.stringify(skillnames, null, '\t') + '\n');
	} catch (e) {
		console.warn(`skillnames.json sync skipped: ${e.message}. Leaving existing file in place.`);
	}
}

export function runCMPresets({dir, root, db}) {
	const outPath = path.join(dir, 'v2', 'cm-presets.generated.json');
	const jpPath = resolveJpDb(root);
	if (!jpPath) {
		console.log(`cm-presets: JP master.mdb (docs/master(1).mdb or $UMA_JP_MASTER_MDB) not present — ${fs.existsSync(outPath) ? 'leaving committed file alone' : 'no committed file either, skipping'}`);
		return;
	}
	try {
		const jp = readJpCmConditions(new MasterDb(jpPath));
		const globalDates = db ? readCmDates(new MasterDb(db.path)) : {};
		const datesPath = path.join(dir, 'v2', 'cm-dates.json');
		const handDates = fs.existsSync(datesPath) ? JSON.parse(fs.readFileSync(datesPath, 'utf-8')) : {};
		const out = computeCMPresets({jp, globalDates, handDates});
		const {format} = readJsonFile(outPath, {indent: '  ', trailingNewline: true});
		writeJsonFile(outPath, out, format);
		const nConfirmed = out.filter(p => p.confirmed).length;
		console.log(`cm-presets.generated.json: ${out.length} presets (${nConfirmed} confirmed, ${out.length - nConfirmed} from hand map)`);
	} catch (e) {
		console.warn(`Failed to regenerate cm-presets.generated.json: ${e.message}. Leaving existing file in place.`);
	}
}

export { fmtSource };
