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
