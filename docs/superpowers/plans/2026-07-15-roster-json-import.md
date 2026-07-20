# Direct `data.json` Roster Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Umas tab import an UmaExtractor `data.json` directly — removing the lossy
uma.guide round-trip — so recency comes from real timestamps and strategy from the uma's
actual running style instead of a guess that's wrong 20% of the time.

**Architecture:** Both inputs normalise to the **existing `DecodedUma`**, so nothing
downstream (cards, filters, SP, course-aware mapping, storage) forks. `DecodedUma` already
has an optional `create_time`; the only type change is adding an optional `running_style`.
Two consumers become "use the real value when present, else keep today's inference".

**Tech Stack:** TypeScript, Preact, `tape` + `ts-node` (tests), Vite.

**Spec:** `docs/superpowers/specs/2026-07-15-roster-json-import-design.md`

**Real sample for verification:** `docs/private/data.json` (249 umas, 5.0 MB). It is
gitignored — **never commit it, never paste its contents anywhere.** It contains account
identifiers (`viewer_id`, `trained_chara_id`). It has no auth tokens (verified), unlike the
training-log JSON in `docs/`.

## Global Constraints

- **v2 only.** v1 (`umalator/`) is deprecated as of 2026-07-14. Do not touch it.
- **Whitelist, never blacklist.** Import must project onto only the fields we need, so
  identifiers (`viewer_id`, `owner_viewer_id`, `trained_chara_id`, `owner_trained_chara_id`,
  `nickname_id`) are dropped by construction and never reach memory, `localStorage`, or a
  shared URL.
- **Never `Date.parse` a `create_time`.** The format is `"YYYY-MM-DD HH:MM:SS"` — not ISO
  8601 (space, no `T`, no zone), so parsing is implementation-defined. All values are
  fixed-width 19 chars and zero-padded, so **lexicographic order is chronological**: compare
  the strings. A `Date.parse`-based sort was removed as dead code earlier and must not return.
- **Keep the paste flow working.** The share code stays as a fallback; a share-code import
  must behave exactly as it does today.
- **Field name is `wiz`, not `wisdom`,** in `data.json`. `DecodedUma` uses `wisdom`.
- **Aptitudes are 1–8** in `data.json` (1=G … 8=S) — the same encoding `DecodedUma` and
  `aptToLetter` already use. No conversion.
- **Type gate:** `npm run typecheck:roster` must print `roster typecheck clean`.
  `npm run test:roster` runs `--transpile-only` and does NOT type-check.
- **Local preview:** `npx vite` from `umalator-global/v2` (NOT `build.mjs --serve`).
- **Commit style:** no `Co-Authored-By` trailers.

## File Structure

| File | Responsibility |
|---|---|
| `umalator-global/v2/roster/roster-json.ts` | **New.** Parse + whitelist an UmaExtractor `data.json` into `DecodedUma[]`. Pure; no UI, no DOM. |
| `umalator-global/v2/roster/roster-decoder.ts` (modify) | Add `running_style?: number` to `DecodedUma`. Nothing else. |
| `umalator-global/v2/roster/roster-filter.ts` (modify) | `sortUmas('recency')` uses real `create_time` when present. |
| `umalator-global/v2/roster/roster-mapping.ts` (modify) | `decodedUmaToUmaState` uses real `running_style` when present. |
| `umalator-global/v2/roster/roster-uma-card.tsx` (modify) | Show the training date when known. |
| `umalator-global/v2/roster/umas-tab.tsx` (modify) | File import (primary) + demote paste to fallback. |
| `umalator-global/v2/roster/roster.css` (modify) | Styles for the new import row. |
| `umalator-global/v2/roster/roster.test.ts` (modify) | Append tests. |

Tasks 1–3 are pure logic and land test-first. Task 4 is UI. Task 5 verifies against the real file.

---

### Task 1: Parse `data.json` into `DecodedUma[]`

**Files:**
- Create: `umalator-global/v2/roster/roster-json.ts`
- Modify: `umalator-global/v2/roster/roster-decoder.ts` (one field on `DecodedUma`)
- Modify: `umalator-global/v2/roster/roster.test.ts` (append)

**Interfaces:**
- Consumes: `DecodedUma` from `./roster-decoder`.
- Produces:
  - `parseRosterJson(text: string): DecodedUma[]` — throws nothing; returns `[]` on anything unusable.
  - `DecodedUma.running_style?: number` (1=nige, 2=senko, 3=sashi, 4=oikomi)

- [ ] **Step 1: Add the one new field**

In `umalator-global/v2/roster/roster-decoder.ts`, inside the `DecodedUma` interface, directly
after the existing `create_time?: string;` line, add:

```ts
	/** The uma's actual running style (1=nige, 2=senko, 3=sashi, 4=oikomi). Present only from
	 *  an UmaExtractor data.json import — the bit-packed share code does not encode it, so it
	 *  stays undefined there and callers fall back to inferring from aptitudes. */
	running_style?: number;
```

Change nothing else in that file — the wire format is frozen.

- [ ] **Step 2: Write the failing tests**

Append to `umalator-global/v2/roster/roster.test.ts`:

```ts
import { parseRosterJson } from './roster-json';

// One UmaExtractor record, trimmed to the fields we read. Real shape: 51 fields, of which we
// deliberately keep only these — see roster-json.ts.
const JSON_UMA = {
	card_id: 100101,
	create_time: '2025-11-02 08:12:37',
	rank_score: 21000,
	talent_level: 5,
	running_style: 2,
	speed: 1200, stamina: 1100, power: 900, guts: 400, wiz: 500,
	proper_distance_short: 2, proper_distance_mile: 5, proper_distance_middle: 8, proper_distance_long: 7,
	proper_ground_turf: 8, proper_ground_dirt: 1,
	proper_running_style_nige: 3, proper_running_style_senko: 8,
	proper_running_style_sashi: 6, proper_running_style_oikomi: 4,
	skill_array: [{ skill_id: 200011, level: 1 }, { skill_id: 200012, level: 2 }],
	// Fields we must DROP:
	viewer_id: 123456789,
	owner_viewer_id: 123456789,
	trained_chara_id: 987654321,
	nickname_id: 42,
	race_result_list: [{ big: 'payload' }],
	succession_chara_array: [{ big: 'payload' }]
};

test('parseRosterJson: maps an UmaExtractor record onto DecodedUma', t => {
	const [u] = parseRosterJson(JSON.stringify([JSON_UMA]));
	t.equal(u.card_id, 100101);
	t.equal(u.create_time, '2025-11-02 08:12:37', 'real timestamp is carried through verbatim');
	t.equal(u.running_style, 2, 'the actual running style is carried through');
	t.equal(u.rank_score, 21000);
	t.equal(u.talent_level, 5);
	t.equal(u.speed, 1200);
	t.equal(u.wisdom, 500, "data.json calls it 'wiz'; DecodedUma calls it 'wisdom'");
	t.equal(u.apt_short, 2);
	t.equal(u.apt_mile, 5);
	t.equal(u.apt_middle, 8);
	t.equal(u.apt_long, 7);
	t.equal(u.apt_turf, 8);
	t.equal(u.apt_dirt, 1);
	t.equal(u.apt_nige, 3);
	t.equal(u.apt_senko, 8);
	t.equal(u.apt_sashi, 6);
	t.equal(u.apt_oikomi, 4);
	t.deepEqual(u.skills, [{ id: 200011, level: 1 }, { id: 200012, level: 2 }]);
	t.end();
});

test('parseRosterJson: drops identifying and bulk fields (whitelist, not blacklist)', t => {
	const [u] = parseRosterJson(JSON.stringify([JSON_UMA]));
	// These must never reach memory/localStorage/a shared URL.
	for (const k of ['viewer_id', 'owner_viewer_id', 'trained_chara_id', 'nickname_id',
	                 'race_result_list', 'succession_chara_array']) {
		t.equal((u as any)[k], undefined, `${k} is dropped`);
	}
	t.end();
});

test('parseRosterJson: garbage in, [] out — never throws', t => {
	t.deepEqual(parseRosterJson('not json'), []);
	t.deepEqual(parseRosterJson(''), []);
	t.deepEqual(parseRosterJson('{}'), [], 'a bare object is not a roster');
	t.deepEqual(parseRosterJson('[]'), []);
	t.deepEqual(parseRosterJson('[{"nope":1}]'), [], 'records without a card_id are skipped');
	t.end();
});

test('parseRosterJson: skips unusable records but keeps the good ones', t => {
	const r = parseRosterJson(JSON.stringify([JSON_UMA, { nope: 1 }, { ...JSON_UMA, card_id: 100201 }]));
	t.equal(r.length, 2, 'the junk record is skipped, the valid ones survive');
	t.equal(r[0].card_id, 100101);
	t.equal(r[1].card_id, 100201);
	t.end();
});

test('parseRosterJson: tolerates a missing optional field', t => {
	const noStyle: any = { ...JSON_UMA };
	delete noStyle.running_style;
	delete noStyle.create_time;
	const [u] = parseRosterJson(JSON.stringify([noStyle]));
	t.equal(u.card_id, 100101, 'still parses');
	t.equal(u.running_style, undefined, 'absent style stays undefined (caller infers)');
	t.equal(u.create_time, undefined, 'absent timestamp stays undefined (caller falls back)');
	t.end();
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test:roster`
Expected: FAIL with `Cannot find module './roster-json'`.

- [ ] **Step 4: Implement**

Create `umalator-global/v2/roster/roster-json.ts`:

```ts
/**
 * Parses an UmaExtractor `data.json` (the raw game `trained_chara` array) into the same
 * `DecodedUma` shape the bit-packed share code produces, so nothing downstream forks.
 *
 * Why this exists: the share code is a lossy transport. It carries no `create_time` at all
 * (its v4 fixed prefix is exactly V4_MIN_BITS with no room for one), and no `running_style`
 * — so strategy has to be inferred from the best style aptitude, which measured wrong for
 * 54 of 249 umas (22%) on a real roster. This file reads both for real.
 *
 * PRIVACY: this is a WHITELIST. The source record has 51 fields including account
 * identifiers (viewer_id, owner_viewer_id, trained_chara_id, nickname_id) and ~1.8MB of
 * bulk we don't need (race_result_list, succession_chara_array). Only the fields named below
 * are read, so everything else is dropped by construction — including any field a future
 * UmaExtractor version adds. Do not "improve" this into a spread-and-delete.
 */
import { DecodedUma } from './roster-decoder';

/** One record of the raw game trained_chara array, narrowed to what we read. */
interface RawTrainedChara {
	card_id?: unknown;
	create_time?: unknown;
	rank_score?: unknown;
	talent_level?: unknown;
	running_style?: unknown;
	speed?: unknown; stamina?: unknown; power?: unknown; guts?: unknown; wiz?: unknown;
	proper_distance_short?: unknown; proper_distance_mile?: unknown;
	proper_distance_middle?: unknown; proper_distance_long?: unknown;
	proper_ground_turf?: unknown; proper_ground_dirt?: unknown;
	proper_running_style_nige?: unknown; proper_running_style_senko?: unknown;
	proper_running_style_sashi?: unknown; proper_running_style_oikomi?: unknown;
	skill_array?: unknown;
}

const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && isFinite(v) ? v : fallback);
const optNum = (v: unknown): number | undefined => (typeof v === 'number' && isFinite(v) ? v : undefined);
const optStr = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);

function readRecord(raw: RawTrainedChara): DecodedUma | null {
	const card_id = optNum(raw.card_id);
	if (card_id === undefined) return null; // not a trained-uma record

	const skills = Array.isArray(raw.skill_array)
		? raw.skill_array.reduce((acc: Array<{ id: number; level: number }>, s: any) => {
			const id = optNum(s?.skill_id);
			if (id !== undefined) acc.push({ id, level: num(s?.level, 1) });
			return acc;
		}, [])
		: [];

	return {
		card_id,
		// Verbatim: "YYYY-MM-DD HH:MM:SS". Never parse it — see the sort comment in roster-filter.
		create_time: optStr(raw.create_time),
		rank_score: optNum(raw.rank_score),
		talent_level: optNum(raw.talent_level),
		running_style: optNum(raw.running_style),
		speed: num(raw.speed),
		stamina: num(raw.stamina),
		power: num(raw.power),
		guts: num(raw.guts),
		wisdom: num(raw.wiz),          // data.json calls it `wiz`
		// Aptitudes are already 1..8 (1=G .. 8=S) — the same encoding DecodedUma uses.
		apt_short: num(raw.proper_distance_short),
		apt_mile: num(raw.proper_distance_mile),
		apt_middle: num(raw.proper_distance_middle),
		apt_long: num(raw.proper_distance_long),
		apt_turf: num(raw.proper_ground_turf),
		apt_dirt: num(raw.proper_ground_dirt),
		apt_nige: num(raw.proper_running_style_nige),
		apt_senko: num(raw.proper_running_style_senko),
		apt_sashi: num(raw.proper_running_style_sashi),
		apt_oikomi: num(raw.proper_running_style_oikomi),
		skills
	};
}

/** Returns [] for anything unusable — callers show one inline error, same as a bad code. */
export function parseRosterJson(text: string): DecodedUma[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return [];
	}
	if (!Array.isArray(parsed)) return [];
	return parsed.reduce((acc: DecodedUma[], raw) => {
		const uma = readRecord(raw as RawTrainedChara);
		if (uma) acc.push(uma);
		return acc;
	}, []);
}
```

- [ ] **Step 5: Run tests and the type gate**

Run: `npm run test:roster`
Expected: PASS (`# fail 0`).

Run: `npm run typecheck:roster`
Expected: `roster typecheck clean`.

- [ ] **Step 6: Verify against the REAL file**

The unit tests use a trimmed fixture; this proves it against the genuine 5 MB export.
Create a scratch file `umalator-global/v2/roster/__check.tmp.ts` (it must live inside the repo
tree or relative imports won't resolve):

```ts
import * as fs from 'fs';
import { parseRosterJson } from './roster-json';
const r = parseRosterJson(fs.readFileSync('docs/private/data.json', 'utf8'));
console.log('parsed:', r.length, '(expect 249)');
console.log('all have create_time:', r.every(u => !!u.create_time));
console.log('all have running_style:', r.every(u => u.running_style !== undefined));
console.log('create_time ascending:', r.map(u => u.create_time!).every((v, i, a) => i === 0 || a[i-1] <= v));
console.log('no identifiers leaked:', r.every(u => !('viewer_id' in u) && !('trained_chara_id' in u)));
console.log('stats sane:', r.every(u => u.speed > 0 && u.wisdom > 0));
console.log('apts in 1..8:', r.every(u => u.apt_turf >= 1 && u.apt_turf <= 8));
console.log('projected+gzip bytes:', require('zlib').gzipSync(JSON.stringify(r)).length, '(expect ~18k)');
```

Run:
```bash
npx ts-node --transpile-only --compiler-options '{"moduleResolution":"node","module":"commonjs"}' umalator-global/v2/roster/__check.tmp.ts
rm -f umalator-global/v2/roster/__check.tmp.ts
```
Expected: `parsed: 249`, every check `true`, gzip ~18000 bytes.
**Delete the scratch file** — do not commit it.

- [ ] **Step 7: Commit**

```bash
git add umalator-global/v2/roster/roster-json.ts umalator-global/v2/roster/roster-decoder.ts umalator-global/v2/roster/roster.test.ts
git commit -m "v2 roster: parse UmaExtractor data.json

Produces the same DecodedUma the share code does, so nothing downstream forks.
Adds the one field the share code cannot carry: running_style.

The parser is a whitelist. The raw record has 51 fields including account
identifiers (viewer_id, trained_chara_id, nickname_id) and ~1.8MB of bulk we
don't need, so only the fields we read are projected and everything else is
dropped by construction."
```

---

### Task 2: Sort by real dates when we have them

**Files:**
- Modify: `umalator-global/v2/roster/roster-filter.ts`
- Modify: `umalator-global/v2/roster/roster.test.ts` (append)

**Interfaces:**
- Consumes: `DecodedUma.create_time?: string` (Task 1 populates it from `data.json`).
- Produces: no signature change. `sortUmas(all, { key: 'recency', dir })` now sorts by
  `create_time` when every record has one, else falls back to array order.

- [ ] **Step 1: Write the failing tests**

Append to `umalator-global/v2/roster/roster.test.ts`:

```ts
test('sortUmas: recency uses real create_time when present', t => {
	// Deliberately store them out of chronological order, so array order and date order differ.
	const older = { ...UMA, card_id: 100101, create_time: '2025-11-02 08:12:37' };
	const newer = { ...UMA, card_id: 100201, create_time: '2026-07-15 00:55:58' };
	const roster = [newer, older]; // newest FIRST in the array — the opposite of the fallback
	const desc = sortUmas(roster, { key: 'recency', dir: 'desc' });
	t.equal(desc[0].card_id, 100201, 'newest by DATE first, not by array position');
	const asc = sortUmas(roster, { key: 'recency', dir: 'asc' });
	t.equal(asc[0].card_id, 100101, 'oldest by date first');
	t.deepEqual(roster, [newer, older], 'input not mutated');
	t.end();
});

test('sortUmas: recency falls back to array order when dates are absent', t => {
	// A share-code import has no timestamps; today's behaviour must be preserved exactly.
	const first = { ...UMA, card_id: 100101 };
	const last = { ...UMA, card_id: 100201 };
	const roster = [first, last];
	t.equal(sortUmas(roster, { key: 'recency', dir: 'desc' })[0].card_id, 100201,
		'no dates => reverse array order (uma.guide exports oldest->newest)');
	t.equal(sortUmas(roster, { key: 'recency', dir: 'asc' })[0].card_id, 100101);
	t.end();
});

test('sortUmas: recency falls back if only SOME records have dates', t => {
	// Mixed input would sort undefined dates arbitrarily; prefer the consistent fallback.
	const dated = { ...UMA, card_id: 100101, create_time: '2026-07-15 00:55:58' };
	const undated = { ...UMA, card_id: 100201 };
	const r = sortUmas([dated, undated], { key: 'recency', dir: 'desc' });
	t.equal(r.length, 2, 'still returns everything');
	t.equal(r[0].card_id, 100201, 'falls back to reversed array order');
	t.end();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:roster`
Expected: FAIL — "newest by DATE first, not by array position" fails (today's code reverses
the array, so it returns 100101).

- [ ] **Step 3: Implement**

In `umalator-global/v2/roster/roster-filter.ts`, replace the `'recency'` branch of `sortUmas`
with:

```ts
	if (s.key === 'recency') {
		// data.json carries a real create_time; the bit-packed share code carries none at all,
		// so fall back to array position there (uma.guide exports oldest->newest; verified
		// against a real roster: rank_score correlates r=0.71 with position, and the file's own
		// create_time order confirms it). Require ALL records to have a date before trusting
		// dates, otherwise a mixed list would order the undated ones arbitrarily.
		const dated = all.length > 0 && all.every(u => !!u.create_time);
		if (!dated) return s.dir === 'desc' ? all.slice().reverse() : all.slice();
		// create_time is "YYYY-MM-DD HH:MM:SS", fixed-width and zero-padded, so lexicographic
		// order IS chronological. Never Date.parse it: that format is not ISO 8601 and parsing
		// it is implementation-defined.
		const dir = s.dir === 'asc' ? 1 : -1;
		return all.slice().sort((a, b) =>
			(a.create_time! < b.create_time! ? -1 : a.create_time! > b.create_time! ? 1 : 0) * dir);
	}
```

Leave the `'sp'`/`'rating'` comparator path exactly as it is.

- [ ] **Step 4: Run tests and the type gate**

Run: `npm run test:roster`
Expected: PASS (`# fail 0`), including the pre-existing recency tests.

Run: `npm run typecheck:roster`
Expected: `roster typecheck clean`.

- [ ] **Step 5: Commit**

```bash
git add umalator-global/v2/roster/roster-filter.ts umalator-global/v2/roster/roster.test.ts
git commit -m "v2 roster: sort Newest by real dates when available

A data.json import has a real create_time, so use it. Share codes carry no
timestamp, so those keep today's array-order fallback - which the real file
vindicates: its records are already create_time-ascending.

Dates compare as strings. create_time is fixed-width, zero-padded
'YYYY-MM-DD HH:MM:SS', so lexicographic order is chronological; Date.parse is
implementation-defined on that format and must not be used."
```

---

### Task 3: Use the real running style

This is the correctness win: strategy is currently inferred from the best style aptitude, and
that inference is **wrong for 54 of 249 umas (22%)** on a real roster.

**Files:**
- Modify: `umalator-global/v2/roster/roster-mapping.ts`
- Modify: `umalator-global/v2/roster/roster.test.ts` (append)

**Interfaces:**
- Consumes: `DecodedUma.running_style?: number` (Task 1).
- Produces: no signature change to `decodedUmaToUmaState(uma, course)`.

- [ ] **Step 1: Write the failing tests**

Append to `umalator-global/v2/roster/roster.test.ts`:

```ts
test('decodedUmaToUmaState: uses the real running_style over the aptitude guess', t => {
	// UMA's best style aptitude is senko (8) => the guess says Senkou. But this uma is
	// actually run as Oikomi. The real value must win: measured on a real roster, the guess
	// disagrees with running_style for 54 of 249 umas.
	const s = decodedUmaToUmaState({ ...UMA, running_style: 4 }, TURF_SPRINT);
	t.equal(s.strategy, 'Oikomi', 'real running_style wins over best-aptitude inference');
	t.equal(s.strategyAptitude, 'D', "strategyAptitude follows the CHOSEN style (oikomi=4 => 'D')");
	t.end();
});

test('decodedUmaToUmaState: maps every running_style value', t => {
	const cases: Array<[number, string]> = [[1, 'Nige'], [2, 'Senkou'], [3, 'Sasi'], [4, 'Oikomi']];
	for (const [rs, strat] of cases) {
		t.equal(decodedUmaToUmaState({ ...UMA, running_style: rs }, TURF_SPRINT).strategy, strat,
			`running_style ${rs} => ${strat}`);
	}
	t.end();
});

test('decodedUmaToUmaState: falls back to inference when running_style is absent', t => {
	// Share-code imports have no running_style; today's behaviour must be preserved.
	const s = decodedUmaToUmaState(UMA, TURF_SPRINT);
	t.equal(s.strategy, 'Senkou', 'best style aptitude (senko=8) still wins when nothing better exists');
	t.end();
});

test('decodedUmaToUmaState: ignores an out-of-range running_style', t => {
	const s = decodedUmaToUmaState({ ...UMA, running_style: 9 }, TURF_SPRINT);
	t.equal(s.strategy, 'Senkou', 'garbage style falls back to the inference rather than breaking');
	t.end();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:roster`
Expected: FAIL — "real running_style wins" gets `Senkou` (the inference) instead of `Oikomi`.

- [ ] **Step 3: Implement**

In `umalator-global/v2/roster/roster-mapping.ts`, add this map next to the existing
`CANONICAL_STRATEGY_KEY`:

```ts
// data.json's running_style: 1=nige, 2=senko, 3=sashi, 4=oikomi. Verified against a real
// export: each style's mean aptitude for its own style is ~7, and it disagrees with the
// best-aptitude guess for 54 of 249 umas — which is exactly why we prefer it.
const RUNNING_STYLE_KEY: Record<number, StratKey> = {
	1: 'apt_nige', 2: 'apt_senko', 3: 'apt_sashi', 4: 'apt_oikomi'
};
```

Then change `bestStrategyKey` to prefer the real value. Rename nothing — callers use it:

```ts
/**
 * Which strategy to load the uma as.
 *
 * A data.json import knows the uma's ACTUAL running_style, so use it. A share code doesn't
 * carry one, so fall back to the best style aptitude (ties broken toward the outfit's
 * canonical strategy, since upstream's `>=` reduce silently resolved every tie to Oikomi).
 */
export function bestStrategyKey(uma: DecodedUma): StratKey {
	const real = uma.running_style !== undefined ? RUNNING_STYLE_KEY[uma.running_style] : undefined;
	if (real) return real;

	const best = Math.max(uma.apt_nige, uma.apt_senko, uma.apt_sashi, uma.apt_oikomi);
	const tied = STRATEGIES.filter(s => uma[s.key] === best);
	if (tied.length === 1) return tied[0].key;
	const canonical = canonicalStrategyKey(uma.card_id);
	if (canonical && tied.some(s => s.key === canonical)) return canonical;
	return tied[0].key;
}
```

`decodedUmaToUmaState` already derives both `strategy` and `strategyAptitude` from
`bestStrategyKey`, so no other change is needed — `strategyAptitude` automatically follows the
real style.

- [ ] **Step 4: Run tests and the type gate**

Run: `npm run test:roster`
Expected: PASS (`# fail 0`). The pre-existing tie-break test must still pass — it uses no
`running_style`, so it takes the fallback path.

Run: `npm run typecheck:roster`
Expected: `roster typecheck clean`.

- [ ] **Step 5: Commit**

```bash
git add umalator-global/v2/roster/roster-mapping.ts umalator-global/v2/roster/roster.test.ts
git commit -m "v2 roster: use the real running style when we have it

Strategy was inferred from the best style aptitude because the share code does
not carry one. Measured against a real 249-uma data.json, that inference
disagrees with the actual running_style for 54 umas (22%) - each of those loaded
with the wrong strategy and therefore wrong sim numbers.

A data.json import now uses running_style directly. Share codes keep the
inference (including the canonical-outfit tie-break), so nothing regresses."
```

---

### Task 4: File import in the tab, and the date on the card

**Files:**
- Modify: `umalator-global/v2/roster/umas-tab.tsx`
- Modify: `umalator-global/v2/roster/roster-uma-card.tsx`
- Modify: `umalator-global/v2/roster/roster.css`

**Interfaces:**
- Consumes: `parseRosterJson` (Task 1); existing `writeRosterToStorage`, `decodeRoster`.

- [ ] **Step 1: Add the file import handler**

In `umalator-global/v2/roster/umas-tab.tsx`, add this import alongside the other `./roster-*`
imports (there is no existing `roster-json` import — Task 1 created that module):
```tsx
import { parseRosterJson } from './roster-json';
```

Add this handler next to the existing `handleImport`. It mirrors the file-picker pattern
already used by `importHorseJsonMulti` in `../storage.ts`:

```tsx
	const handleImportFile = useCallback(() => {
		if (busy) return;
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json,application/json';
		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (!file) return;
			setBusy(true);
			setError('');
			setNotice('');
			try {
				// ~5MB of JSON; reading + parsing is why the button shows a pending state.
				const decoded = parseRosterJson(await file.text());
				if (decoded.length === 0) {
					setError("Couldn't read that file — pick your UmaExtractor data.json.");
					return;
				}
				onStateChange({ ...state, roster: decoded, loaded: true });
				const written = await writeRosterToStorage(decoded);
				setNotice(written.ok
					? `Imported ${decoded.length} umas from ${file.name}.`
					: `Imported ${decoded.length} umas, but they could not be saved (${written.reason}). They'll be gone when you reload.`);
			} catch {
				setError("Couldn't read that file — pick your UmaExtractor data.json.");
			} finally {
				setBusy(false);
			}
		};
		input.click();
	}, [busy, state, onStateChange]);
```

- [ ] **Step 2: Lead with the file, demote the paste box**

Replace the existing `.rosterImportBar` block and its `.rosterHint` with:

```tsx
			<div class="rosterImportFile">
				<Button variant="primary" onClick={handleImportFile} disabled={busy}>
					{busy ? 'Reading…' : 'Import data.json'}
				</Button>
				<span class="rosterHint">
					Your roster export from UmaExtractor. Nothing leaves your browser.
				</span>
			</div>

			<details class="rosterPasteFallback">
				<summary>Or paste a share link</summary>
				<div class="rosterImportBar">
					<Input
						className="rosterImportInput"
						placeholder="Paste your roster share link or code…"
						value={code}
						onInput={setCode}
					/>
					<Button variant="secondary" onClick={handleImport} disabled={busy || !code.trim()}>
						{busy ? 'Decoding…' : 'Import'}
					</Button>
				</div>
				<span class="rosterHint">
					Export at <a href="https://uma.guide/roster-viewer/" target="_blank" rel="noopener noreferrer">uma.guide/roster-viewer</a>.
					A share link has no training dates, so "Newest" falls back to export order.
				</span>
			</details>
```

Keep everything else in the component — the `!course` guard, the error/notice banners, the
counts, the grid — exactly as-is.

- [ ] **Step 3: Show the training date on the card**

In `umalator-global/v2/roster/roster-uma-card.tsx`, inside the existing `.rosterCardMeta`
block, immediately after the `{uma.talent_level != null && ...}` entry, add:

```tsx
				{uma.create_time && (
					<span title={`Trained ${uma.create_time}`}>{uma.create_time.slice(0, 10)}</span>
				)}
```

`create_time` is `"YYYY-MM-DD HH:MM:SS"`, so `.slice(0, 10)` is the date — no parsing, no
timezone shifting.

- [ ] **Step 4: Style the new rows**

Append to `umalator-global/v2/roster/roster.css`:

```css
.rosterImportFile { display: flex; align-items: center; gap: var(--space-sm); flex-wrap: wrap; }
.rosterPasteFallback { font-size: var(--font-sm); color: var(--color-text-muted); }
.rosterPasteFallback > summary { cursor: pointer; padding: 2px 0; }
.rosterPasteFallback > summary:hover { color: var(--color-text); }
.rosterPasteFallback .rosterImportBar { margin-top: 6px; }
```

- [ ] **Step 5: Gates**

Run: `npm run typecheck:roster`
Expected: `roster typecheck clean`.

Run: `npm run test:roster`
Expected: PASS (`# fail 0`).

Run: `cd umalator-global/v2 && npx vite build 2>&1 | tail -2 ; cd ../..`
Expected: `✓ built`.

- [ ] **Step 6: Commit**

```bash
git add umalator-global/v2/roster/umas-tab.tsx umalator-global/v2/roster/roster-uma-card.tsx umalator-global/v2/roster/roster.css
git commit -m "v2 roster: import data.json directly, paste becomes the fallback

The uma.guide round-trip was the worst part of the UX and it loses data. The tab
now leads with a file picker for the UmaExtractor export; the share code moves
into a collapsed 'Or paste a share link' section, which says plainly that a link
has no training dates.

Cards show the training date when the import provides one."
```

---

### Task 5: Verify the whole flow against the real export

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

```bash
cd umalator-global/v2 && npx vite --port 5173 --strictPort
```
NOT `build.mjs --serve` — it cannot transpile the v2 entry and you'll get a blank page.
Dismiss the onboarding tour ("Skip tour") if it appears. Use an EXPLICIT 1280x800 viewport —
the browser tool's presets are unreliable and silently leave you at 1280px.

- [ ] **Step 2: Verify, reporting the ACTUAL result for each**

The real export is at `docs/private/data.json` (249 umas, 5.0 MB, gitignored). Use the file
picker to select it. **Do not paste its contents anywhere.**

1. Umas tab → **Import data.json** → pick `docs/private/data.json` → the count reads
   **"249 of 249 umas"**.
2. Sort is **Newest** by default, and the first card's date is **2026-07-15** (the newest);
   flipping to ascending puts **2025-11-02** first. Report the dates you actually see.
3. Cards show a training date (`YYYY-MM-DD`).
4. Pick a card and note its "Loads as" strategy. Cross-check it against that uma's real
   `running_style` — the two must agree. (Report the card and what you compared.)
5. **Load Uma 1** → the panel shows the rating, and the strategy matches the card.
6. Reload the page → the roster persists (it is stored gzipped, ~18KB).
7. Expand **"Or paste a share link"**, paste the code below, Import → it still works and
   shows "3 of 3 umas" — the fallback path must not have regressed:
   ```
   BBhwVaQRLCJjhDIH0M-4XrAIw1LGGpgGHBVjKD54mOEMgfQz7hesAjDUsYamAYdpV1MSwiY4QyB9DPh16wCMNSxhqYA
   ```
8. Mobile 390x844: the import row and the fallback section are usable; no page zoom on tap.
9. Console: no errors.

Take a screenshot of the populated grid.

- [ ] **Step 3: Confirm no identifiers were persisted**

With the roster imported, run this in the browser console via the javascript tool and report
the output:
```js
(async () => {
  const raw = localStorage.getItem('v2_umas_roster');
  const bytes = Uint8Array.from(atob(raw.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
  const txt = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return { storedBytes: raw.length,
           leaks: ['viewer_id','trained_chara_id','nickname_id','race_result_list'].filter(k => txt.includes(k)) };
})()
```
Expected: `leaks: []` — no identifier may appear in what we persist. If any does, that is a
privacy bug: stop and report it rather than continuing.

- [ ] **Step 4: Stop the server**

Stop the dev server and confirm port 5173 is free.

---

## Verification checklist

- [ ] `npm run test:roster` passes.
- [ ] `npm run typecheck:roster` prints `roster typecheck clean`.
- [ ] `cd umalator-global/v2 && npx vite build` succeeds.
- [ ] The real `data.json` imports as 249 umas with real dates and real running styles.
- [ ] Nothing identifying is persisted (Task 5 Step 3 reports `leaks: []`).
- [ ] The pasted share code still imports (fallback not regressed).
- [ ] `docs/private/data.json` is NOT committed, and no scratch `__check.tmp.ts` remains.
- [ ] No v1 file (`umalator/**`) was modified.
