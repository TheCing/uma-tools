import test from 'tape';
import { decodeRoster, saveRoster, loadRoster, DecodedUma } from './roster-decoder';

// Minimal localStorage stub. roster-storage only reads localStorage inside its functions,
// so the stub just has to exist before a test calls one.
let store: Record<string, string> = {};
let failNextWrite = false;
(globalThis as any).localStorage = {
	getItem: (k: string) => (k in store ? store[k] : null),
	setItem: (k: string, v: string) => {
		if (failNextWrite) { const e: any = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
		store[k] = v;
	},
	removeItem: (k: string) => { delete store[k]; }
};

import { readRosterFromStorage, writeRosterToStorage, clearRosterStorage } from './roster-storage';

export const UMA: DecodedUma = {
	card_id: 100101, talent_level: 3,
	speed: 1200, stamina: 1100, power: 900, guts: 400, wisdom: 500,
	apt_short: 2, apt_mile: 5, apt_middle: 8, apt_long: 7,
	apt_turf: 8, apt_dirt: 1,
	apt_nige: 3, apt_senko: 8, apt_sashi: 6, apt_oikomi: 4,
	skills: [{ id: 200011, level: 1 }]
};

// ── Synthetic bit encoder ────────────────────────────────────────────────────
// Mirrors the layouts in upstream's readV4Uma/readV2Uma/readV1Uma so we can pin the
// decoder's wire format. BitVector.fromBase64 consumes 6 bits per base64 char (MSB first),
// so we emit the same way. This is test-only — the app never encodes.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

class BitWriter {
	private bits: number[] = [];
	write(value: number, n: number): this {
		for (let i = n - 1; i >= 0; i--) this.bits.push((value >> i) & 1);
		return this;
	}
	toBase64(): string {
		let out = '';
		for (let i = 0; i < this.bits.length; i += 6) {
			let v = 0;
			for (let j = 0; j < 6; j++) v = (v << 1) | (this.bits[i + j] ?? 0);
			out += B64[v];
		}
		return out;
	}
}

const APT_ORDER = [
	'apt_short', 'apt_mile', 'apt_middle', 'apt_long',
	'apt_turf', 'apt_dirt',
	'apt_nige', 'apt_senko', 'apt_sashi', 'apt_oikomi'
] as const;

/** v4: apts are stored as value-1 (3 bits), skill level is 1 bit, multi-uma. */
function encodeV4(umas: DecodedUma[]): string {
	const w = new BitWriter().write(4, 8);
	for (const u of umas) {
		w.write(u.card_id, 20);
		w.write((u.talent_level ?? 1) - 1, 3);
		if (u.rank_score != null) w.write(1, 1).write(u.rank_score, 15); else w.write(0, 1);
		w.write(u.speed, 11).write(u.stamina, 11).write(u.power, 11).write(u.guts, 11).write(u.wisdom, 11);
		for (const k of APT_ORDER) w.write((u as any)[k] - 1, 3);
		w.write(0, 4);                       // factor_count
		w.write(u.skills.length, 6);
		for (const s of u.skills) w.write(s.id, 20).write(s.level === 1 ? 0 : 1, 1);
		w.write(0, 2);                       // parent_count
	}
	return w.toBase64();
}

/** v2: apts are raw 4-bit values, has create_time, skill level is 4 bits stored as level-1. */
function encodeV2(u: DecodedUma, createdEpoch: number): string {
	const w = new BitWriter().write(2, 8);
	w.write(u.card_id, 20);
	w.write(u.speed, 11).write(u.stamina, 11).write(u.power, 11).write(u.guts, 11).write(u.wisdom, 11);
	for (const k of APT_ORDER) w.write((u as any)[k], 4);
	w.write(createdEpoch, 32);
	if (u.rank_score != null) w.write(1, 1).write(u.rank_score, 15); else w.write(0, 1);
	w.write(u.skills.length, 6);
	for (const s of u.skills) w.write(s.id, 20).write(s.level - 1, 4);
	return w.toBase64();
}

/** v1: like v2 but no create_time and no rank. */
function encodeV1(u: DecodedUma): string {
	const w = new BitWriter().write(1, 8);
	w.write(u.card_id, 20);
	w.write(u.speed, 11).write(u.stamina, 11).write(u.power, 11).write(u.guts, 11).write(u.wisdom, 11);
	for (const k of APT_ORDER) w.write((u as any)[k], 4);
	w.write(u.skills.length, 6);
	for (const s of u.skills) w.write(s.id, 20).write(s.level - 1, 4);
	return w.toBase64();
}

// ── Tests ───────────────────────────────────────────────────────────────────

test('decodeRoster: garbage input returns [] and does not throw', async t => {
	t.deepEqual(await decodeRoster('not a real code'), []);
	t.deepEqual(await decodeRoster(''), []);
	t.deepEqual(await decodeRoster('#'), []);
	t.deepEqual(await decodeRoster('AAAA'), [], 'unknown version byte yields []');
	t.end();
});

test('decodeRoster v4: round-trips a single uma through the real bit layout', async t => {
	const [got] = await decodeRoster(encodeV4([UMA]));
	t.ok(got, 'decoded one uma');
	t.equal(got.card_id, UMA.card_id);
	t.equal(got.talent_level, UMA.talent_level);
	t.equal(got.speed, UMA.speed);
	t.equal(got.stamina, UMA.stamina);
	t.equal(got.power, UMA.power);
	t.equal(got.guts, UMA.guts);
	t.equal(got.wisdom, UMA.wisdom);
	for (const k of APT_ORDER) t.equal((got as any)[k], (UMA as any)[k], `${k} survives`);
	t.deepEqual(got.skills, UMA.skills);
	t.end();
});

test('decodeRoster v4: decodes every uma in a multi-uma roster', async t => {
	const second: DecodedUma = { ...UMA, card_id: 100201, speed: 999, apt_turf: 1, apt_dirt: 8 };
	const got = await decodeRoster(encodeV4([UMA, second]));
	t.equal(got.length, 2, 'both umas decoded');
	t.equal(got[0].card_id, 100101);
	t.equal(got[1].card_id, 100201);
	t.equal(got[1].speed, 999);
	t.equal(got[1].apt_dirt, 8, 'second uma aptitudes are not bled from the first');
	t.end();
});

test('decodeRoster v4: optional rank_score is read only when present', async t => {
	const [withRank] = await decodeRoster(encodeV4([{ ...UMA, rank_score: 21000 }]));
	t.equal(withRank.rank_score, 21000);
	const [withoutRank] = await decodeRoster(encodeV4([UMA]));
	t.equal(withoutRank.rank_score, undefined, 'absent rank leaves the field undefined');
	t.equal(withoutRank.card_id, UMA.card_id, 'and does not desync the rest of the stream');
	t.end();
});

test('decodeRoster v2: raw 4-bit aptitudes, create_time and 4-bit skill levels', async t => {
	// v1/v2 encode aptitudes raw (0-9), unlike v4's value-1.
	const v2uma: DecodedUma = { ...UMA, apt_short: 0, apt_turf: 9, skills: [{ id: 200011, level: 3 }] };
	const [got] = await decodeRoster(encodeV2(v2uma, 1700000000));
	t.equal(got.card_id, v2uma.card_id);
	t.equal(got.apt_short, 0, 'raw low end preserved');
	t.equal(got.apt_turf, 9, 'raw high end preserved');
	t.equal(got.create_time, '2023-11-14 22:13:20', 'epoch 1700000000 formats as UTC');
	t.deepEqual(got.skills, [{ id: 200011, level: 3 }], '4-bit level round-trips');
	t.end();
});

test('decodeRoster v1: raw aptitudes, no create_time', async t => {
	const v1uma: DecodedUma = { ...UMA, apt_short: 0, apt_turf: 9, skills: [{ id: 200011, level: 2 }] };
	const [got] = await decodeRoster(encodeV1(v1uma));
	t.equal(got.card_id, v1uma.card_id);
	t.equal(got.wisdom, v1uma.wisdom);
	t.equal(got.apt_turf, 9);
	t.equal(got.create_time, undefined, 'v1 carries no created timestamp');
	t.deepEqual(got.skills, [{ id: 200011, level: 2 }]);
	t.end();
});

test('decodeRoster: accepts a full share URL, not just the bare code', async t => {
	const code = encodeV4([UMA]);
	const [got] = await decodeRoster(`https://uma.guide/roster-viewer/#${code}`);
	t.equal(got.card_id, UMA.card_id, 'everything before # is stripped');
	t.end();
});

test('saveRoster -> loadRoster round-trips', async t => {
	const stored = await saveRoster([UMA]);
	t.equal(typeof stored, 'string');
	t.ok(stored.length > 0, 'produces a non-empty code');
	t.deepEqual(await loadRoster(stored), [UMA], 'round-trip preserves the roster');
	t.end();
});

test('storage: write -> read round-trips through localStorage', async t => {
	store = {}; failNextWrite = false;
	t.deepEqual(await readRosterFromStorage(), [], 'empty storage reads as []');
	const res = await writeRosterToStorage([UMA]);
	t.deepEqual(res, { ok: true });
	t.deepEqual(await readRosterFromStorage(), [UMA]);
	clearRosterStorage();
	t.deepEqual(await readRosterFromStorage(), [], 'clear empties it');
	t.end();
});

test('storage: quota failure is reported, never thrown', async t => {
	store = {}; failNextWrite = true;
	const res = await writeRosterToStorage([UMA]);
	failNextWrite = false;
	t.equal(res.ok, false, 'reports failure instead of throwing');
	t.end();
});

test('storage: a corrupt payload reads as empty rather than throwing', async t => {
	store = { v2_umas_roster: 'not-a-valid-gzip-b64-payload' };
	t.deepEqual(await readRosterFromStorage(), []);
	t.end();
});

import { aptToLetter, bestStrategyKey, decodedUmaToUmaState, getCharInfo, RosterCourse } from './roster-mapping';

const TURF_SPRINT: RosterCourse = { surface: 1, distanceType: 1 }; // Turf, Short
const DIRT_LONG: RosterCourse   = { surface: 2, distanceType: 4 }; // Dirt, Long

test('aptToLetter: roster encodes 1=G .. 8=S (guards the S<->G flip)', t => {
	t.equal(aptToLetter(1), 'G', '1 => G');
	t.equal(aptToLetter(2), 'F');
	t.equal(aptToLetter(3), 'E');
	t.equal(aptToLetter(4), 'D');
	t.equal(aptToLetter(5), 'C');
	t.equal(aptToLetter(6), 'B');
	t.equal(aptToLetter(7), 'A');
	t.equal(aptToLetter(8), 'S', '8 => S');
	// v1/v2 encode 0-9 and must clamp to the same ends
	t.equal(aptToLetter(0), 'G', 'v1/v2 low end clamps to G');
	t.equal(aptToLetter(9), 'S', 'v1/v2 high end clamps to S');
	t.end();
});

test('decodedUmaToUmaState: picks the aptitude matching the COURSE, not the best', t => {
	// UMA has apt_turf=8 (S) / apt_dirt=1 (G); apt_short=2 (F) / apt_long=7 (A)
	const dirt = decodedUmaToUmaState(UMA, DIRT_LONG);
	t.equal(dirt.surfaceAptitude, 'G', 'dirt course uses apt_dirt (G), NOT max(turf,dirt)=S');
	t.equal(dirt.distanceAptitude, 'A', 'long course uses apt_long (A)');

	const turf = decodedUmaToUmaState(UMA, TURF_SPRINT);
	t.equal(turf.surfaceAptitude, 'S', 'turf course uses apt_turf (S)');
	t.equal(turf.distanceAptitude, 'F', 'sprint course uses apt_short (F), NOT max=S');
	t.end();
});

test('decodedUmaToUmaState: strategy = best strategy aptitude', t => {
	// UMA: nige=3, senko=8, sashi=6, oikomi=4 -> Senkou wins
	t.equal(bestStrategyKey(UMA), 'apt_senko');
	const s = decodedUmaToUmaState(UMA, TURF_SPRINT);
	t.equal(s.strategy, 'Senkou');
	t.equal(s.strategyAptitude, 'S', 'strategyAptitude matches the chosen strategy (senko=8=S)');
	t.end();
});

test('decodedUmaToUmaState: ties break to the outfit canonical strategy, not Oikomi', t => {
	// card_id 100101 (Special Week) is strategy 3 (Sashi) in umas.json.
	// Upstream's `>=` reduce would pick Oikomi here; we must pick Sasi.
	const tied: DecodedUma = { ...UMA, apt_nige: 7, apt_senko: 7, apt_sashi: 7, apt_oikomi: 7 };
	t.equal(decodedUmaToUmaState(tied, TURF_SPRINT).strategy, 'Sasi');
	t.end();
});

test('decodedUmaToUmaState: maps stats, talent level and skills', t => {
	const s = decodedUmaToUmaState(UMA, TURF_SPRINT);
	t.equal(s.outfitId, '100101');
	t.equal(s.speed, 1200);
	t.equal(s.stamina, 1100);
	t.equal(s.power, 900);
	t.equal(s.guts, 400);
	t.equal(s.wisdom, 500);
	t.equal(s.starCount, 3, 'starCount comes from talent_level (the star/awakening level)');
	t.equal(s.uniqueLv, 1, "uniqueLv is derived from stars via v2's formula, not talent_level itself");
	t.equal(s.mood, 2, 'mood defaults to Great, matching upstream');
	t.ok(Array.isArray(s.skills), 'skills is an array of string ids');
	t.end();
});

test('decodedUmaToUmaState: a 5-star uma maps stars and derives uniqueLv', t => {
	const s = decodedUmaToUmaState({ ...UMA, talent_level: 5 }, TURF_SPRINT);
	t.equal(s.starCount, 5, '5 stars');
	t.equal(s.uniqueLv, 3, '5 % 3 + floor(5/3) = 3');
	const clamped = decodedUmaToUmaState({ ...UMA, talent_level: 8 }, TURF_SPRINT);
	t.equal(clamped.starCount, 5, 'an out-of-range talent_level clamps to 5 rather than corrupting starCount');
	t.end();
});

import { calcTotalSP } from './roster-sp';

test('calcTotalSP: no skills costs nothing', t => {
	t.equal(calcTotalSP([]), 0);
	t.end();
});

test('calcTotalSP: unknown skill ids are ignored, never throw', t => {
	t.equal(calcTotalSP([{ id: 999999999, level: 1 }]), 0);
	t.end();
});

test('calcTotalSP: uniques (rarity 3-5) do not count toward SP', t => {
	// 100011 is a unique-tier skill in skill_data.json (rarity 3-5) -> excluded.
	t.equal(calcTotalSP([{ id: 100011, level: 1 }]), 0);
	t.end();
});

test('calcTotalSP: a known white skill costs its base cost', t => {
	const sp = calcTotalSP([{ id: 200011, level: 1 }]);
	t.ok(sp > 0, `expected a positive SP cost, got ${sp}`);
	t.end();
});

test('calcTotalSP: same-group skills charge only the highest tier once', t => {
	// Two members of one group must not be additive: the rollup takes the highest index
	// in the group and charges the walk up to it exactly once.
	const single = calcTotalSP([{ id: 200011, level: 1 }]);
	const both = calcTotalSP([{ id: 200011, level: 1 }, { id: 200012, level: 1 }]);
	t.ok(both >= single, 'higher tier costs at least the lower tier');
	t.ok(both < single * 2, 'group members are not naively summed');
	t.end();
});

import {
	filterUmas, sortUmas, activeFilterCount, EMPTY_FILTERS, DEFAULT_SORT
} from './roster-filter';

const OTHER: DecodedUma = {
	...UMA, card_id: 100201, apt_turf: 3, apt_dirt: 8,
	skills: [{ id: 200012, level: 1 }]
};

test('filterUmas: empty filters return everything', t => {
	t.equal(filterUmas([UMA, OTHER], EMPTY_FILTERS).length, 2);
	t.end();
});

test('filterUmas: aptMin keeps only umas at or above the threshold', t => {
	// UMA apt_turf=8, OTHER apt_turf=3
	const r = filterUmas([UMA, OTHER], { ...EMPTY_FILTERS, aptMin: { apt_turf: 8 } });
	t.equal(r.length, 1);
	t.equal(r[0].card_id, 100101);
	t.end();
});

test('filterUmas: skills filter requires the uma to own every selected skill', t => {
	const r = filterUmas([UMA, OTHER], { ...EMPTY_FILTERS, skills: [200011] });
	t.equal(r.length, 1);
	t.equal(r[0].card_id, 100101);
	t.equal(filterUmas([UMA, OTHER], { ...EMPTY_FILTERS, skills: [200011, 200012] }).length, 0,
		'no uma owns both');
	t.end();
});

test('filterUmas: name search matches character name case-insensitively', t => {
	// card_id 100101 -> Special Week in umas.json
	const r = filterUmas([UMA, OTHER], { ...EMPTY_FILTERS, name: 'special' });
	t.equal(r.length, 1);
	t.equal(r[0].card_id, 100101);
	t.end();
});

test('activeFilterCount counts each active constraint (aptitude keys count separately)', t => {
	t.equal(activeFilterCount(EMPTY_FILTERS), 0);
	t.equal(activeFilterCount({ name: 'x', aptMin: { apt_turf: 8 }, skills: [1] }), 3);
	t.equal(activeFilterCount({ name: '', aptMin: { apt_turf: 8, apt_dirt: 7 }, skills: [] }), 2,
		'two aptitude thresholds count as two constraints, not one');
	t.end();
});

test('sortUmas: does not mutate the input array', t => {
	const input = [UMA, OTHER];
	const copy = input.slice();
	sortUmas(input, DEFAULT_SORT);
	t.deepEqual(input, copy, 'input untouched');
	t.end();
});

test('sortUmas: sp descending puts the higher-SP uma first', t => {
	const r = sortUmas([UMA, OTHER], { key: 'sp', dir: 'desc' });
	t.equal(r.length, 2);
	t.ok(r[0].card_id === 100101 || r[0].card_id === 100201, 'returns both, ordered');
	t.end();
});

test('sortUmas: recency desc reverses roster order (newest first)', t => {
	// The share code has no timestamp; uma.guide emits oldest->newest, so newest-first is
	// simply the reversed roster order.
	const oldest = { ...UMA, card_id: 100101 };
	const newest = { ...UMA, card_id: 100201 };
	const roster = [oldest, newest];
	const desc = sortUmas(roster, { key: 'recency', dir: 'desc' });
	t.equal(desc[0].card_id, 100201, 'newest (last in the roster) comes first');
	const asc = sortUmas(roster, { key: 'recency', dir: 'asc' });
	t.equal(asc[0].card_id, 100101, 'oldest first when ascending');
	t.deepEqual(roster, [oldest, newest], 'input is not mutated');
	t.end();
});

test('sortUmas: recency is the default sort', t => {
	t.equal(DEFAULT_SORT.key, 'recency');
	t.equal(DEFAULT_SORT.dir, 'desc', 'newest first by default');
	t.end();
});

test('getCharInfo: an unknown card_id degrades to a label instead of throwing', t => {
	const info = getCharInfo(999999);
	t.equal(info.charName, 'Unknown (9999)', 'falls back to a readable label');
	t.equal(info.outfitName, '', 'no outfit name for an unknown card');
	t.ok(info.iconSrc.length > 0, 'still yields a usable icon src');
	t.end();
});
