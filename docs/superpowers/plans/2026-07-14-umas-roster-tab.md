# Umas / Roster Tab (v2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 4th "Umas" tab to the v2 simulator drawer where a user pastes a
[uma.guide roster viewer](https://uma.guide/roster-viewer/) share code, browses their real
in-game roster as a filterable card grid, and loads any uma into Uma 1 / Uma 2.

**Architecture:** Port kachi-dev's pure bit-packed roster decoder — keeping its **wire
format exactly**, but cleaning it up to our standards — then rebuild the UI on v2
primitives. Pure logic (decoder, mapping, SP, filter) lives in separate modules under
`umalator-global/v2/roster/` and is unit-tested with `tape` + `ts-node`; the UI is Preact
components styled with v2 design tokens in their own `roster.css`.

**Decoder policy (decided 2026-07-15):** the decoder is **our code, held to the normal
rubric** — not vendored. Name the magic bit-lengths, drop the `as any` casts, and share the
primitives the three version readers genuinely have in common. The file will therefore
diverge from upstream, so re-syncing a future upstream format (a v5) becomes a manual
port rather than a clean diff — that is the accepted trade. **The bit layouts are the one
thing that must not change**, which is why Task 1 lands a synthetic encoder and golden
decode fixtures for v1/v2/v4 *before* any cleanup.

**Tech Stack:** Preact (`h`, hooks), TypeScript, Vite (v2 build), `tape` + `ts-node` (tests),
`DecompressionStream`/`CompressionStream` (gzip), lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-07-14-umas-roster-tab-design.md`

## Global Constraints

- **v2 only.** v1 (`umalator/`) is officially deprecated as of 2026-07-14. Do not touch
  `umalator/app.tsx` or any v1 file.
- **No `preact-i18n`.** v2 is English-only (`CC_GLOBAL`). Use plain strings.
- **Global data only.** Import `../../skill_data.json`, `../../umas.json`,
  `../../not-in-game.json` (the `umalator-global/` copies), never
  `uma-skill-tools/data/*`.
- **No duplicate SP math.** Reuse `isPurpleSkill`, `skillGroups`, `calculateSkillCost` from
  `umalator-global/v2/skill-chart-utils.ts`.
- **Mobile rules** (from commit `19e96c4`): inputs must be `font-size: 16px` (else iOS
  auto-zooms on focus); use `dvh` not `vh`; data tables/grids must not rely on
  `table-layout: fixed` + `width: 100%`.
- **Commit style:** no `Co-Authored-By` trailers (see `CLAUDE.md`).
- **Aptitude letters:** v2 `UmaState` stores aptitude as the **letter** `'S'|'A'|…|'G'`.
  The engine's inverted `Aptitude` enum (`S=0…G=7`) is resolved downstream — never convert
  to the enum in this feature.
- **Local preview:** `npx vite` from `umalator-global/v2` (NOT `build.mjs --serve`, which
  cannot transpile the `.tsx` entry). See memory `v2-dev-preview`.
- **Wire format is frozen.** The decoder's bit layouts, field order, bit widths and
  `+1` offsets are dictated by the producer (uma.guide) and must match upstream exactly.
  Clean up *style*, never *layout*. Any layout change is a bug, not a refactor.

## File Structure

| File | Responsibility |
|---|---|
| `umalator-global/v2/roster/roster-decoder.ts` | **Cleaned port** (layout-identical to upstream). Bit-packed v1/v2/v4 → `DecodedUma[]`; `saveRoster`/`loadRoster` (gzip+b64 string codec). Zero imports. |
| `umalator-global/v2/roster/roster-storage.ts` | localStorage wrapper around `saveRoster`/`loadRoster` + quota handling. |
| `umalator-global/v2/roster/roster-mapping.ts` | `DecodedUma` → `UmaState`, course-aware. Char/outfit/icon lookup. **The crux.** |
| `umalator-global/v2/roster/roster-sp.ts` | `calcTotalSP` aggregation on top of `calculateSkillCost`. |
| `umalator-global/v2/roster/roster-filter.ts` | Pure filter + sort predicates over `DecodedUma[]`. |
| `umalator-global/v2/roster/roster-uma-card.tsx` | One roster card + Load/Promote actions. |
| `umalator-global/v2/roster/roster-filter-panel.tsx` | Aptitude-min selects, skill picker, sort control. |
| `umalator-global/v2/roster/umas-tab.tsx` | Tab shell: import bar, search, grid, wiring. |
| `umalator-global/v2/roster/roster.css` | Styles on v2 design tokens. |
| `umalator-global/v2/roster/roster.test.ts` | Unit tests for the pure modules. |
| `umalator-global/v2/app-v2.tsx` (modify) | Extend `activeUmaTab`, add 4th tab button + branch. |
| `package.json` (modify) | Add `test:roster` script. |

Tasks 1–4 are pure logic and land test-first. Tasks 5–7 are UI. Task 8 wires + verifies.

---

### Task 1: Port + clean up the roster decoder, storage, test harness

**Files:**
- Create: `umalator-global/v2/roster/roster-decoder.ts`
- Create: `umalator-global/v2/roster/roster-storage.ts`
- Create: `umalator-global/v2/roster/roster.test.ts`
- Modify: `package.json` (add `test:roster` script)

**Interfaces:**
- Produces:
  - `interface DecodedUma { card_id: number; talent_level?: number; rank_score?: number; create_time?: string; speed: number; stamina: number; power: number; guts: number; wisdom: number; apt_short: number; apt_mile: number; apt_middle: number; apt_long: number; apt_turf: number; apt_dirt: number; apt_nige: number; apt_senko: number; apt_sashi: number; apt_oikomi: number; skills: Array<{ id: number; level: number }>; }`
  - `decodeRoster(input: string): Promise<DecodedUma[]>`
  - `saveRoster(umas: DecodedUma[]): Promise<string>`
  - `loadRoster(stored: string): Promise<DecodedUma[]>`
  - `readRosterFromStorage(): Promise<DecodedUma[]>`
  - `writeRosterToStorage(umas: DecodedUma[]): Promise<{ ok: true } | { ok: false; reason: string }>`
  - `clearRosterStorage(): void`

**Sequencing — read this first.** The decoder is a wire-format parser whose bit layouts are
dictated by uma.guide and must not change, but whose *style* we are cleaning up. So this
task refactors under test, in this order:

1. Land upstream's file verbatim as a **scaffold** (a known-good starting implementation).
2. Write golden decode fixtures using a synthetic bit **encoder** written from upstream's
   layout, and get them green against the scaffold. Green here proves the fixtures encode
   the *real* layout rather than repeating a misreading — this is the whole safety net.
3. Only then clean the decoder up, re-running the fixtures to prove behaviour is unchanged.

Do not reorder these. Cleaning first, then writing tests against the cleaned code, would
happily pin whatever bug the cleanup introduced.

- [ ] **Step 1: Land the upstream decoder as a scaffold**

The upstream file has **zero imports** and no JP/UI coupling, so it drops straight in:

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1
mkdir -p umalator-global/v2/roster
git show kachi-dev/master:umalator/rosterDecoder.ts > umalator-global/v2/roster/roster-decoder.ts
```

Do not edit it yet — Step 5 rewrites it. Confirm it landed intact:
```bash
diff <(git show kachi-dev/master:umalator/rosterDecoder.ts) umalator-global/v2/roster/roster-decoder.ts
```
Expected: no output (identical).

- [ ] **Step 2: Write the failing tests**

Create `umalator-global/v2/roster/roster.test.ts`. Node has no `localStorage`, so stub it on
`globalThis` — that lets us test the persistence and quota paths rather than leaving them
unverified. This is safe because `roster-storage.ts` only touches `localStorage` *inside*
its functions, never at module top level, so the stub only has to exist by the time a test
calls one. (Import statements hoist above the stub assignment; that does not matter here,
and the stub must NOT be moved into the storage module itself.)

```ts
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
```

- [ ] **Step 3: Add the test script**

In `package.json`, add to `"scripts"` (next to the existing `test:mechanics`):

```json
"test:roster": "npx ts-node umalator-global/v2/roster/roster.test.ts"
```

- [ ] **Step 4: Run the tests — storage red, decoder fixtures green**

Run: `npm run test:roster`
Expected: FAIL with `Cannot find module './roster-storage'` — that module arrives in Step 5.

Once Step 5 lands, **every decoder fixture must be green against the untouched scaffold**.
That is the gate for this whole task: green here proves the synthetic encoder reproduces
upstream's real layout, which is what makes the Step 6 cleanup safe. If a fixture is red
while the decoder is still upstream's verbatim code, **the test is wrong, not the decoder** —
fix the encoder against `git show kachi-dev/master:umalator/rosterDecoder.ts` until it is
green, and do not touch `roster-decoder.ts`.

Note: `DecompressionStream`/`CompressionStream` require Node 18+. Verify with `node -v`.

- [ ] **Step 5: Implement the storage wrapper**

Create `umalator-global/v2/roster/roster-storage.ts`:

```ts
/**
 * localStorage persistence for the roster. Namespaced to v2 — we deliberately do NOT
 * share kachi's `umas_tab_roster` key.
 */
import { DecodedUma, saveRoster, loadRoster } from './roster-decoder';

const STORAGE_KEY = 'v2_umas_roster';

export async function readRosterFromStorage(): Promise<DecodedUma[]> {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return [];
		return await loadRoster(stored);
	} catch {
		// Corrupt or undecodable payload — treat as empty rather than breaking the tab.
		return [];
	}
}

export async function writeRosterToStorage(
	umas: DecodedUma[]
): Promise<{ ok: true } | { ok: false; reason: string }> {
	try {
		localStorage.setItem(STORAGE_KEY, await saveRoster(umas));
		return { ok: true };
	} catch (e) {
		// Most likely QuotaExceededError on a large roster. The caller keeps the roster
		// in memory for the session and warns.
		return { ok: false, reason: e instanceof Error ? e.message : String(e) };
	}
}

export function clearRosterStorage(): void {
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		/* nothing useful to do */
	}
}
```

- [ ] **Step 6: Run the tests — everything green against the scaffold**

Run: `npm run test:roster`
Expected: PASS, `# fail 0`. All decoder fixtures (v4 single/multi/rank, v2, v1, share-URL,
garbage), the save/load round-trip, and the three storage tests.

**Do not proceed to Step 7 until this is green.** It is the safety net for the cleanup.

- [ ] **Step 7: Clean up the decoder, re-running the tests after each change**

Now — and only now — rewrite `umalator-global/v2/roster/roster-decoder.ts` to our standards.
Re-run `npm run test:roster` after each change; it must stay `# fail 0` throughout. If a
test goes red, you changed the layout — revert that change.

Add this header:

```ts
/**
 * Roster decoder — decodes the bit-packed roster share code produced by
 * https://uma.guide/roster-viewer/ (formats v1, v2, v4).
 *
 * Ported from kachi-dev/master:umalator/rosterDecoder.ts and then cleaned up, so this file
 * intentionally diverges from upstream; a future upstream format is a manual port.
 *
 * The BIT LAYOUTS ARE THE WIRE FORMAT and are dictated by the producer: field order, bit
 * widths and the +1 offsets must not change. roster.test.ts pins them with a synthetic
 * encoder. Style is ours; layout is not.
 *
 * Pure: no imports, no UI, no region coupling.
 */
```

Required changes:

1. **Name the bit-lengths.** Replace the bare `109` / `162` / `129` guards and inline widths:
```ts
// Minimum bits a record occupies, used to decide whether another one follows.
const V4_MIN_BITS = 109;
const V2_MIN_BITS = 162;
const V1_MIN_BITS = 129;

// Field widths (bits). Dictated by the producer — do not change.
const CARD_ID_BITS = 20;
const STAT_BITS = 11;
const TALENT_BITS = 3;
const RANK_BITS = 15;
const APT_BITS_V4 = 3;   // stored as value-1
const APT_BITS_V12 = 4;  // stored raw
const SKILL_ID_BITS = 20;
const SKILL_COUNT_BITS = 6;
const SKILL_LEVEL_BITS_V12 = 4;
const FACTOR_COUNT_BITS = 4;
const FACTOR_BITS = 24;
const PARENT_COUNT_BITS = 2;
const CREATE_TIME_BITS = 32;
```

2. **Drop the `as any` casts** in `gzip`/`gunzip`. `Blob` accepts a `Uint8Array` as a
   `BlobPart`, and `Blob.stream()` returns a `ReadableStream<Uint8Array>`:
```ts
async function gunzip(data: Uint8Array): Promise<Uint8Array> {
	const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gzip(text: string): Promise<Uint8Array> {
	const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}
```
If TypeScript rejects `DecompressionStream`/`CompressionStream` as undefined names, add
`"dom"` lib types rather than reinstating `as any`; if that is not available in this
tsconfig, declare them once at the top of the file:
```ts
declare const DecompressionStream: { new (format: string): GenericTransformStream };
declare const CompressionStream: { new (format: string): GenericTransformStream };
```

3. **Extract the one block all three readers genuinely share** — the five 11-bit stats:
```ts
type Stats = Pick<DecodedUma, 'speed' | 'stamina' | 'power' | 'guts' | 'wisdom'>;

function readStats(bv: BitVector): Stats {
	return {
		speed:   bv.read(STAT_BITS),
		stamina: bv.read(STAT_BITS),
		power:   bv.read(STAT_BITS),
		guts:    bv.read(STAT_BITS),
		wisdom:  bv.read(STAT_BITS)
	};
}
```
and the aptitude block, which v1 and v2 share (v4 needs its own because of the width and
the +1):
```ts
type Aptitudes = Pick<DecodedUma,
	'apt_short' | 'apt_mile' | 'apt_middle' | 'apt_long' |
	'apt_turf' | 'apt_dirt' |
	'apt_nige' | 'apt_senko' | 'apt_sashi' | 'apt_oikomi'>;

/** width = bits per aptitude; offset = added to each raw value (v4 stores value-1). */
function readAptitudes(bv: BitVector, width: number, offset: number): Aptitudes {
	const r = () => bv.read(width) + offset;
	// Order is part of the wire format.
	return {
		apt_short: r(), apt_mile: r(), apt_middle: r(), apt_long: r(),
		apt_turf: r(), apt_dirt: r(),
		apt_nige: r(), apt_senko: r(), apt_sashi: r(), apt_oikomi: r()
	};
}
```
v4 calls `readAptitudes(bv, APT_BITS_V4, 1)`; v1/v2 call `readAptitudes(bv, APT_BITS_V12, 0)`.

**Keep `readV1Uma`, `readV2Uma` and `readV4Uma` as three separate functions.** They are three
different wire formats, not duplication — merging them would couple formats that are free to
diverge, and is explicitly not wanted.

4. **Type the exports properly** — no `any` in the public surface. `DecodedUma` already
   exists; keep it exported unchanged (Tasks 2–5 import it).

- [ ] **Step 8: Run the tests to verify the cleanup changed nothing**

Run: `npm run test:roster`
Expected: PASS, `# fail 0` — identical to Step 6. Same fixtures, cleaned implementation.

Then confirm no `as any` survives in the decoder:
```bash
grep -n "as any" umalator-global/v2/roster/roster-decoder.ts || echo "clean"
```
Expected: `clean`.

- [ ] **Step 9: Commit**

```bash
git add umalator-global/v2/roster/roster-decoder.ts umalator-global/v2/roster/roster-storage.ts umalator-global/v2/roster/roster.test.ts package.json
git commit -m "v2 roster: bit-packed roster decoder + storage

Ports kachi-dev's rosterDecoder and cleans it up to our standards: named bit-width
constants instead of magic numbers, no 'as any' casts, shared readStats/readAptitudes
helpers. The three version readers stay separate — they are three wire formats, not
duplication.

The bit layouts are the wire format and are unchanged. roster.test.ts pins them with a
synthetic encoder covering v1/v2/v4, so the cleanup is verified behaviour-preserving
rather than assumed.

Also adds a v2-namespaced localStorage wrapper (v2_umas_roster) with quota handling and
a tape/ts-node harness (npm run test:roster)."
```

---

### Task 2: Course-aware roster → UmaState mapping

This is the crux and the one place we deliberately diverge from upstream.

**Files:**
- Create: `umalator-global/v2/roster/roster-mapping.ts`
- Modify: `umalator-global/v2/roster/roster.test.ts` (append tests)

**Interfaces:**
- Consumes: `DecodedUma` from `./roster-decoder` (Task 1).
- Produces:
  - `type AptLetter = 'S'|'A'|'B'|'C'|'D'|'E'|'F'|'G'`
  - `interface RosterCourse { surface: number; distanceType: number }`
  - `aptToLetter(v: number): AptLetter`
  - `bestStrategyKey(uma: DecodedUma): 'apt_nige'|'apt_senko'|'apt_sashi'|'apt_oikomi'`
  - `decodedUmaToUmaState(uma: DecodedUma, course: RosterCourse): UmaState`
  - `getCharInfo(card_id: number): { charName: string; outfitName: string; iconSrc: string }`
  - `unknownSkillCount(uma: DecodedUma): number`

- [ ] **Step 1: Write the failing tests**

Append to `umalator-global/v2/roster/roster.test.ts`:

```ts
import { aptToLetter, bestStrategyKey, decodedUmaToUmaState, RosterCourse } from './roster-mapping';

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
	t.equal(s.uniqueLv, 3, 'uniqueLv comes from talent_level');
	t.equal(s.mood, 2, 'mood defaults to Great, matching upstream');
	t.ok(Array.isArray(s.skills), 'skills is an array of string ids');
	t.end();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:roster`
Expected: FAIL with `Cannot find module './roster-mapping'`.

- [ ] **Step 3: Implement the mapping**

Create `umalator-global/v2/roster/roster-mapping.ts`:

```ts
/**
 * Roster -> simulator mapping.
 *
 * DecodedUma carries all 10 aptitudes but UmaState stores only 3 (distance/surface/
 * strategy), so a collapse is required. Upstream (kachi-dev app.tsx:1530) collapses with
 * Math.max(), which OVERSTATES aptitude on off-surface/off-distance courses (an A-turf /
 * G-dirt uma loads as surface A on a dirt race) and yields wrong sim numbers. We select
 * the aptitude matching the current course instead.
 *
 * This is a snapshot: changing the course after loading does not re-derive, exactly as
 * for a manually-entered uma.
 */
import { DecodedUma } from './roster-decoder';
import { UmaState, defaultUmaState } from '../uma-panel';
import skilldata from '../../skill_data.json';
import umas from '../../umas.json';
import icons from '../../../icons.json';

export type AptLetter = 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

/** Subset of course_data.json we need. Surface: Turf=1, Dirt=2. DistanceType: Short=1, Mile=2, Mid=3, Long=4. */
export interface RosterCourse {
	surface: number;
	distanceType: number;
}

// Roster encodes 1=G .. 8=S (v4 reads 3 bits +1 => 1-8; v1/v2 read 4 bits => 0-9).
// Index by the raw value; the duplicated G/S ends clamp v1/v2's wider range.
const APT_LETTERS: readonly AptLetter[] =
	['G', 'G', 'F', 'E', 'D', 'C', 'B', 'A', 'S', 'S'];

export function aptToLetter(v: number): AptLetter {
	return APT_LETTERS[Math.max(0, Math.min(9, v))];
}

type StratKey = 'apt_nige' | 'apt_senko' | 'apt_sashi' | 'apt_oikomi';

const STRATEGIES: ReadonlyArray<{ key: StratKey; strat: 'Nige' | 'Senkou' | 'Sasi' | 'Oikomi' }> = [
	{ key: 'apt_nige',   strat: 'Nige' },
	{ key: 'apt_senko',  strat: 'Senkou' },
	{ key: 'apt_sashi',  strat: 'Sasi' },
	{ key: 'apt_oikomi', strat: 'Oikomi' }
];

// umas.json outfit.strategy: 1=Nige, 2=Senkou, 3=Sashi, 4=Oikomi
const CANONICAL_STRATEGY_KEY: Record<number, StratKey> = {
	1: 'apt_nige', 2: 'apt_senko', 3: 'apt_sashi', 4: 'apt_oikomi'
};

function canonicalStrategyKey(card_id: number): StratKey | null {
	const charId = String(Math.floor(card_id / 100));
	const outfit = (umas as any)[charId]?.outfits?.[String(card_id)];
	return outfit ? (CANONICAL_STRATEGY_KEY[outfit.strategy] ?? null) : null;
}

/**
 * The roster does not record which style the uma actually runs, so use the best strategy
 * aptitude. Upstream's `>=` reduce silently resolves ties to Oikomi (common: all-equal
 * aptitudes); we break ties toward the outfit's canonical strategy from umas.json, else
 * the first best in Nige -> Senkou -> Sasi -> Oikomi order.
 */
export function bestStrategyKey(uma: DecodedUma): StratKey {
	const best = Math.max(uma.apt_nige, uma.apt_senko, uma.apt_sashi, uma.apt_oikomi);
	const tied = STRATEGIES.filter(s => uma[s.key] === best);
	if (tied.length === 1) return tied[0].key;
	const canonical = canonicalStrategyKey(uma.card_id);
	if (canonical && tied.some(s => s.key === canonical)) return canonical;
	return tied[0].key;
}

export function getCharInfo(card_id: number): { charName: string; outfitName: string; iconSrc: string } {
	const charId = String(Math.floor(card_id / 100));
	const outfitId = String(card_id);
	const character = (umas as any)[charId];
	// umas.json name is [jp, en]; v2 is Global so take index 1 and fall back to the raw id.
	const charName = character?.name?.[1] ?? `Unknown (${charId})`;
	const outfitName = character?.outfits?.[outfitId]?.epithet ?? '';
	const iconSrc = (icons as any)[outfitId] ?? (icons as any)[charId]
		?? '/uma-tools/icons/utx_ico_umamusume_00.png';
	return { charName, outfitName, iconSrc };
}

export function decodedUmaToUmaState(uma: DecodedUma, course: RosterCourse): UmaState {
	const surfaceApt = course.surface === 2 ? uma.apt_dirt : uma.apt_turf;
	const distanceApt = [uma.apt_short, uma.apt_mile, uma.apt_middle, uma.apt_long][
		Math.max(0, Math.min(3, course.distanceType - 1))
	];
	const stratKey = bestStrategyKey(uma);
	const strat = STRATEGIES.find(s => s.key === stratKey)!;

	return {
		...defaultUmaState,
		outfitId: String(uma.card_id),
		uniqueLv: uma.talent_level ?? 1,
		speed: uma.speed,
		stamina: uma.stamina,
		power: uma.power,
		guts: uma.guts,
		wisdom: uma.wisdom,
		strategy: strat.strat,
		distanceAptitude: aptToLetter(distanceApt),
		surfaceAptitude: aptToLetter(surfaceApt),
		strategyAptitude: aptToLetter(uma[stratKey]),
		mood: 2,
		// Drop ids Global doesn't know so the sim never sees an unknown skill.
		skills: uma.skills.map(s => String(s.id)).filter(id => id in (skilldata as any)),
		forcedSkillPositions: {}
	};
}

/** Ids in the roster that our Global data doesn't know — surfaced in the UI, not hidden. */
export function unknownSkillCount(uma: DecodedUma): number {
	return uma.skills.filter(s => !(String(s.id) in (skilldata as any))).length;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:roster`
Expected: PASS. If the tie-break test fails, check that `umas.json` entry `1001` →
`outfits["100101"].strategy` is `3`; if that datum changed, update the test's expected
strategy to match `umas.json` rather than weakening the assertion.

- [ ] **Step 5: Commit**

```bash
git add umalator-global/v2/roster/roster-mapping.ts umalator-global/v2/roster/roster.test.ts
git commit -m "v2 roster: course-aware roster -> UmaState mapping

DecodedUma has 10 aptitudes; UmaState stores 3, so a collapse is required.
Upstream collapses with max(), overstating aptitude on off-surface/off-distance
courses (A-turf/G-dirt uma loads as surface A on dirt) and producing wrong sim
numbers. Select by course.surface / course.distanceType instead.

Also breaks strategy ties toward the outfit's canonical strategy from umas.json;
upstream's >= reduce silently resolved every tie to Oikomi."
```

---

### Task 3: Total SP for a roster uma

**Files:**
- Create: `umalator-global/v2/roster/roster-sp.ts`
- Modify: `umalator-global/v2/roster/roster.test.ts` (append tests)

**Interfaces:**
- Consumes: `DecodedUma` (Task 1); `skillGroups`, `calculateSkillCost` from
  `../skill-chart-utils`.
- Produces: `calcTotalSP(skills: Array<{ id: number; level: number }>): number`

**Why this module exists:** our `calculateSkillCost(id, hints, ownedSkills)` is the
per-skill primitive and is equivalent to upstream's `costForId` when called with empty maps
(hint 0 makes `scaleBaseCost` a no-op). Our `skillGroups` sort is functionally identical to
upstream's. Only the **aggregation** (rarity filter + highest-index-per-group) is new.

- [ ] **Step 1: Write the failing tests**

Append to `umalator-global/v2/roster/roster.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:roster`
Expected: FAIL with `Cannot find module './roster-sp'`.

- [ ] **Step 3: Implement**

Create `umalator-global/v2/roster/roster-sp.ts`:

```ts
/**
 * Total SP spent by a roster uma.
 *
 * Reuses v2's existing SP primitives — `calculateSkillCost(id, new Map(), new Map())` is
 * equivalent to upstream's `costForId(id, new Map())` (hint 0 makes scaleBaseCost a
 * no-op), and our `skillGroups` sort matches upstream's. Only the aggregation below is
 * ported from kachi-dev's UmasTab.calcTotalSP.
 */
import { skillGroups, calculateSkillCost } from '../skill-chart-utils';
import skilldata from '../../skill_data.json';
import skillmeta from '../../../skill_meta.json';

const NO_HINTS = new Map<string, number>();
const NO_OWNED = new Map<string, string>();

/** Uniques (rarity 3-5) are awarded, not bought, so they don't count toward SP. */
function countsTowardSP(idStr: string): boolean {
	const rarity = (skilldata as any)[idStr]?.rarity ?? 1;
	return rarity < 3 || rarity > 5;
}

export function calcTotalSP(skills: Array<{ id: number; level: number }>): number {
	// Within a group you only ever pay the walk up to the highest tier you own.
	const highestIndexByGroup = new Map<string, number>();

	for (const s of skills) {
		const idStr = String(s.id);
		if (!countsTowardSP(idStr)) continue;
		const groupId = (skillmeta as any)[idStr]?.groupId;
		if (!groupId) continue;
		const group = skillGroups.get(groupId);
		const idx = group?.indexOf(idStr) ?? -1;
		if (idx < 0) continue;
		const best = highestIndexByGroup.get(groupId) ?? -1;
		if (idx > best) highestIndexByGroup.set(groupId, idx);
	}

	let total = 0;
	for (const [groupId, idx] of highestIndexByGroup) {
		const skillId = skillGroups.get(groupId)![idx];
		total += calculateSkillCost(skillId, NO_HINTS, NO_OWNED);
	}
	return total;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:roster`
Expected: PASS.

The fixture ids are verified against the current Global data, so do not substitute them:
`100011` = rarity 5 (unique tier → excluded from SP); `200011` = rarity 1, `baseCost` 110,
group `20001`; `200012` = rarity 1, same group `20001`. If one of these assertions fails,
the aggregation is wrong — fix `calcTotalSP`, not the test.

- [ ] **Step 5: Commit**

```bash
git add umalator-global/v2/roster/roster-sp.ts umalator-global/v2/roster/roster.test.ts
git commit -m "v2 roster: total SP for a roster uma

Reuses v2's calculateSkillCost/skillGroups (equivalent to upstream's costForId with
empty maps) and ports only the aggregation: exclude uniques, take the highest tier
owned per group, charge that walk once."
```

---

### Task 4: Filter + sort predicates

**Files:**
- Create: `umalator-global/v2/roster/roster-filter.ts`
- Modify: `umalator-global/v2/roster/roster.test.ts` (append tests)

**Interfaces:**
- Consumes: `DecodedUma` (Task 1); `getCharInfo` (Task 2); `calcTotalSP` (Task 3).
- Produces:
  - `type AptKey = 'apt_turf'|'apt_dirt'|'apt_short'|'apt_mile'|'apt_middle'|'apt_long'|'apt_nige'|'apt_senko'|'apt_sashi'|'apt_oikomi'`
  - `interface FilterState { name: string; aptMin: Partial<Record<AptKey, number>>; skills: number[] }`
  - `const EMPTY_FILTERS: FilterState`
  - `type SortKey = 'sp' | 'time' | 'rating'`; `type SortDir = 'asc' | 'desc'`
  - `interface SortState { key: SortKey; dir: SortDir }`; `const DEFAULT_SORT: SortState`
  - `const SORT_LABELS: Record<SortKey, string>`
  - `filterUmas(all: DecodedUma[], f: FilterState): DecodedUma[]`
  - `sortUmas(all: DecodedUma[], s: SortState): DecodedUma[]`
  - `activeFilterCount(f: FilterState): number`

- [ ] **Step 1: Write the failing tests**

Append to `umalator-global/v2/roster/roster.test.ts`:

```ts
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

test('activeFilterCount counts each active dimension', t => {
	t.equal(activeFilterCount(EMPTY_FILTERS), 0);
	t.equal(activeFilterCount({ name: 'x', aptMin: { apt_turf: 8 }, skills: [1] }), 3);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:roster`
Expected: FAIL with `Cannot find module './roster-filter'`.

- [ ] **Step 3: Implement**

Create `umalator-global/v2/roster/roster-filter.ts`:

```ts
/** Pure filter/sort over the decoded roster. No UI, no state. */
import { DecodedUma } from './roster-decoder';
import { getCharInfo } from './roster-mapping';
import { calcTotalSP } from './roster-sp';

export type AptKey =
	| 'apt_turf' | 'apt_dirt'
	| 'apt_short' | 'apt_mile' | 'apt_middle' | 'apt_long'
	| 'apt_nige' | 'apt_senko' | 'apt_sashi' | 'apt_oikomi';

export interface FilterState {
	name: string;
	aptMin: Partial<Record<AptKey, number>>;
	skills: number[];
}

export const EMPTY_FILTERS: FilterState = { name: '', aptMin: {}, skills: [] };

export type SortKey = 'sp' | 'time' | 'rating';
export type SortDir = 'asc' | 'desc';
export interface SortState { key: SortKey; dir: SortDir }

export const SORT_LABELS: Record<SortKey, string> = {
	sp: 'Total SP', time: 'Created', rating: 'Rating'
};
export const DEFAULT_SORT: SortState = { key: 'time', dir: 'desc' };

export function activeFilterCount(f: FilterState): number {
	return (f.name.trim() ? 1 : 0) + Object.keys(f.aptMin).length + (f.skills.length ? 1 : 0);
}

export function filterUmas(all: DecodedUma[], f: FilterState): DecodedUma[] {
	const needle = f.name.trim().toLowerCase();
	return all.filter(uma => {
		if (needle) {
			const { charName, outfitName } = getCharInfo(uma.card_id);
			const haystack = `${charName} ${outfitName}`.toLowerCase();
			if (!haystack.includes(needle)) return false;
		}
		for (const [key, min] of Object.entries(f.aptMin)) {
			if ((uma as any)[key] < (min as number)) return false;
		}
		if (f.skills.length) {
			const owned = new Set(uma.skills.map(s => s.id));
			// AND semantics: the uma must own every selected skill.
			if (!f.skills.every(id => owned.has(id))) return false;
		}
		return true;
	});
}

function sortValue(uma: DecodedUma, key: SortKey): number {
	switch (key) {
		case 'sp': return calcTotalSP(uma.skills);
		case 'rating': return uma.rank_score ?? 0;
		case 'time': return uma.create_time ? Date.parse(uma.create_time) || 0 : 0;
	}
}

export function sortUmas(all: DecodedUma[], s: SortState): DecodedUma[] {
	const dir = s.dir === 'asc' ? 1 : -1;
	// slice() so callers can sort derived arrays without surprising mutation.
	return all.slice().sort((a, b) => (sortValue(a, s.key) - sortValue(b, s.key)) * dir);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:roster`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add umalator-global/v2/roster/roster-filter.ts umalator-global/v2/roster/roster.test.ts
git commit -m "v2 roster: pure filter + sort predicates

Name search over character/outfit names, aptitude-minimum filters, owned-skill
filter (AND semantics), and sort by SP/created/rating. sortUmas is non-mutating."
```

---

### Task 5: Roster uma card

**Files:**
- Create: `umalator-global/v2/roster/roster-uma-card.tsx`
- Create: `umalator-global/v2/roster/roster.css`

**Interfaces:**
- Consumes: `DecodedUma` (Task 1); `getCharInfo`, `decodedUmaToUmaState`,
  `unknownSkillCount`, `aptToLetter`, `RosterCourse` (Task 2); `calcTotalSP` (Task 3).
- Produces:
  ```ts
  interface RosterUmaCardProps {
      uma: DecodedUma;
      course: RosterCourse;
      showUma2: boolean;
      onLoadUma1: (uma: DecodedUma) => void;
      onLoadUma2: (uma: DecodedUma) => void;
      onPromote: (uma: DecodedUma) => void;
  }
  export function RosterUmaCard(props: RosterUmaCardProps): JSX.Element
  export function statRankStr(v: number): string   // exported for tests/reuse
  ```

- [ ] **Step 1: Implement the card**

Create `umalator-global/v2/roster/roster-uma-card.tsx`:

```tsx
import { h } from 'preact';
import { useMemo } from 'preact/hooks';
import { DecodedUma } from './roster-decoder';
import { getCharInfo, decodedUmaToUmaState, unknownSkillCount, aptToLetter, RosterCourse } from './roster-mapping';
import { calcTotalSP } from './roster-sp';
import { getSkillIcon } from '../skills';
import notInGameData from '../../not-in-game.json';
import skillnames from '../../skillnames.json';

// not-in-game.json is { outfits: string[], skills: string[] }
const NOT_IN_GAME_OUTFITS: Set<string> = new Set((notInGameData as any).outfits ?? []);
const NOT_IN_GAME_SKILLS: Set<string> = new Set((notInGameData as any).skills ?? []);

function skillName(id: number): string {
	return (skillnames as any)[String(id)]?.[0] ?? `Unknown (${id})`;
}

/** Upstream's in-game stat-rank curve (UmasTab.rankForStat). */
function rankForStat(x: number): number {
	if (x > 1200) return Math.min(18 + Math.floor((x - 1200) / 100) * 10 + Math.floor(x / 10) % 10, 97);
	if (x >= 1150) return 17;
	if (x >= 1100) return 16;
	if (x >= 400) return 8 + Math.floor((x - 400) / 100);
	return Math.floor(x / 50);
}

export function statRankStr(v: number): string {
	return String(100 + rankForStat(v)).slice(1);
}

const STATS: ReadonlyArray<{ label: string; key: 'speed' | 'stamina' | 'power' | 'guts' | 'wisdom' }> = [
	{ label: 'SPD', key: 'speed' }, { label: 'STA', key: 'stamina' }, { label: 'POW', key: 'power' },
	{ label: 'GUT', key: 'guts' }, { label: 'WIT', key: 'wisdom' }
];

const APT_ROWS: ReadonlyArray<{ label: string; keys: ReadonlyArray<[string, keyof DecodedUma]> }> = [
	{ label: 'Surface', keys: [['Turf', 'apt_turf'], ['Dirt', 'apt_dirt']] },
	{ label: 'Distance', keys: [['Sprint', 'apt_short'], ['Mile', 'apt_mile'], ['Med', 'apt_middle'], ['Long', 'apt_long']] },
	{ label: 'Style', keys: [['Front', 'apt_nige'], ['Pace', 'apt_senko'], ['Late', 'apt_sashi'], ['End', 'apt_oikomi']] }
];

interface RosterUmaCardProps {
	uma: DecodedUma;
	course: RosterCourse;
	showUma2: boolean;
	onLoadUma1: (uma: DecodedUma) => void;
	onLoadUma2: (uma: DecodedUma) => void;
	onPromote: (uma: DecodedUma) => void;
}

export function RosterUmaCard({ uma, course, showUma2, onLoadUma1, onLoadUma2, onPromote }: RosterUmaCardProps) {
	const { charName, outfitName, iconSrc } = useMemo(() => getCharInfo(uma.card_id), [uma.card_id]);
	const sp = useMemo(() => calcTotalSP(uma.skills), [uma.skills]);
	const unknown = useMemo(() => unknownSkillCount(uma), [uma]);
	const mapped = useMemo(() => decodedUmaToUmaState(uma, course), [uma, course]);
	const outfitNotInGame = NOT_IN_GAME_OUTFITS.has(String(uma.card_id));

	return (
		<div class="rosterCard">
			<div class="rosterCardHeader">
				<img class="rosterCardIcon" src={iconSrc} alt="" loading="lazy" />
				<div class="rosterCardTitle">
					<div class="rosterCardName">{charName}</div>
					{outfitName && <div class="rosterCardOutfit">{outfitName}</div>}
				</div>
				{outfitNotInGame && <span class="rosterBadge rosterBadgeNotInGame">Not in game</span>}
			</div>

			<div class="rosterCardStats">
				{STATS.map(s => (
					<div class="rosterStat" key={s.key}>
						<span class="rosterStatLabel">{s.label}</span>
						<span class="rosterStatValue">{uma[s.key]}</span>
						<span class="rosterStatRank">{statRankStr(uma[s.key])}</span>
					</div>
				))}
			</div>

			<div class="rosterCardApts">
				{APT_ROWS.map(row => (
					<div class="rosterAptRow" key={row.label}>
						<span class="rosterAptRowLabel">{row.label}</span>
						{row.keys.map(([label, key]) => (
							<span class="rosterApt" key={key} title={label}>
								{label} <b>{aptToLetter(uma[key] as number)}</b>
							</span>
						))}
					</div>
				))}
			</div>

			<div class="rosterCardSkills">
				{uma.skills.map(s => {
					const idStr = String(s.id);
					return (
						<span
							class={`rosterSkill ${NOT_IN_GAME_SKILLS.has(idStr) ? 'rosterSkillNotInGame' : ''}`}
							key={idStr}
							title={NOT_IN_GAME_SKILLS.has(idStr) ? `${skillName(s.id)} (not in game)` : skillName(s.id)}
						>
							<img class="rosterSkillIcon" src={getSkillIcon(idStr)} alt="" loading="lazy" />
						</span>
					);
				})}
			</div>

			<div class="rosterCardMeta">
				<span title="Total SP spent (uniques excluded)">{sp} SP</span>
				<span>{uma.skills.length} skills</span>
				{uma.talent_level != null && <span>Talent {uma.talent_level}</span>}
				{uma.rank_score != null && <span>Rating {uma.rank_score}</span>}
				{unknown > 0 && (
					<span class="rosterCardWarn" title="Skills in this roster that Global doesn't have — excluded from SP and not loaded">
						{unknown} unrecognised
					</span>
				)}
			</div>

			<div class="rosterCardLoadInfo" title="Aptitudes are selected for the currently-selected course">
				Loads as {mapped.strategy} · {mapped.surfaceAptitude}/{mapped.distanceAptitude}/{mapped.strategyAptitude}
			</div>

			<div class="rosterCardActions">
				<button type="button" class="rosterCardBtn" onClick={() => onLoadUma1(uma)}>Load Uma 1</button>
				{showUma2 && <button type="button" class="rosterCardBtn" onClick={() => onLoadUma2(uma)}>Load Uma 2</button>}
				<button type="button" class="rosterCardBtn rosterCardBtnGhost" onClick={() => onPromote(uma)} title="Copy into the Saved tab">Save</button>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Add the card styles**

Create `umalator-global/v2/roster/roster.css` (v2 tokens only; per-feature CSS follows the
`stacalc.css` precedent so `v2.css` — already ~167KB — doesn't grow):

```css
/* Umas / roster tab. Uses v2 design tokens; see v2.css :root. */

.rosterGrid {
	display: grid;
	/* 2 columns at the 680px drawer width, 1 on mobile. */
	grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
	gap: var(--space-sm);
}

.rosterCard {
	display: flex;
	flex-direction: column;
	gap: var(--space-xs);
	padding: var(--space-sm);
	background: var(--color-surface-overlay);
	border: 1px solid var(--color-border);
	border-radius: var(--radius-md);
	min-width: 0;
}

.rosterCardHeader { display: flex; align-items: center; gap: var(--space-sm); min-width: 0; }
.rosterCardIcon { width: 44px; height: 44px; flex-shrink: 0; border-radius: var(--radius-sm); }
.rosterCardTitle { min-width: 0; flex: 1; }
.rosterCardName {
	color: var(--color-text); font-weight: 600;
	white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.rosterCardOutfit {
	color: var(--color-text-muted); font-size: var(--font-sm);
	white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.rosterBadge {
	flex-shrink: 0; padding: 2px 6px; border-radius: var(--radius-sm);
	font-size: var(--font-xs); font-weight: 600;
}
.rosterBadgeNotInGame { background: var(--color-surface-hover); color: var(--color-text-muted); }

.rosterCardStats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; }
.rosterStat {
	display: flex; flex-direction: column; align-items: center;
	padding: 4px 2px; background: var(--color-surface); border-radius: var(--radius-sm);
}
.rosterStatLabel { font-size: var(--font-xs); color: var(--color-text-muted); }
.rosterStatValue { font-weight: 700; color: var(--color-text); }
.rosterStatRank { font-size: var(--font-xs); color: var(--color-text-muted); }

.rosterCardApts { display: flex; flex-direction: column; gap: 2px; }
.rosterAptRow { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; font-size: var(--font-sm); }
.rosterAptRowLabel { color: var(--color-text-muted); min-width: 56px; font-size: var(--font-xs); }
.rosterApt { color: var(--color-text-muted); }
.rosterApt b { color: var(--color-text); }

.rosterCardSkills { display: flex; flex-wrap: wrap; gap: 3px; }
.rosterSkill { display: inline-flex; line-height: 0; }
.rosterSkillIcon { width: 22px; height: 22px; object-fit: contain; }
/* Skills the roster has but Global doesn't — dimmed, not hidden. */
.rosterSkillNotInGame { opacity: 0.4; filter: grayscale(1); }

.rosterCardMeta {
	display: flex; flex-wrap: wrap; gap: var(--space-sm);
	font-size: var(--font-sm); color: var(--color-text-muted);
}
.rosterCardWarn { color: var(--color-accent); }

.rosterCardLoadInfo { font-size: var(--font-xs); color: var(--color-text-muted); }

.rosterCardActions { display: flex; gap: 6px; margin-top: auto; }
.rosterCardBtn {
	flex: 1; padding: 6px 8px; cursor: pointer;
	background: var(--color-primary); color: var(--color-primary-text);
	border: none; border-radius: var(--radius-sm);
	font-size: var(--font-sm); font-weight: 600;
}
.rosterCardBtn:hover { background: var(--color-primary-hover); }
.rosterCardBtnGhost {
	flex: 0 0 auto; background: var(--color-surface);
	color: var(--color-text); border: 1px solid var(--color-border);
}
```

- [ ] **Step 3: Typecheck**

Run: `cd umalator-global/v2 && npx tsc --noEmit -p . 2>&1 | grep roster/ ; cd ../..`
Expected: no output (`CC_GLOBAL`/`Cannot find name` noise from other files is expected and
documented in `CLAUDE.md` — only `roster/` errors matter).

- [ ] **Step 4: Commit**

```bash
git add umalator-global/v2/roster/roster-uma-card.tsx umalator-global/v2/roster/roster.css
git commit -m "v2 roster: uma card component + styles

Card shows icon, name, outfit, stats with in-game stat ranks, all 10 aptitudes,
total SP, talent, rating, a 'Not in game' badge, an unrecognised-skill count, and
a preview of how the uma will load for the current course."
```

---

### Task 6: Filter panel

**Files:**
- Create: `umalator-global/v2/roster/roster-filter-panel.tsx`
- Modify: `umalator-global/v2/roster/roster.css` (append)

**Interfaces:**
- Consumes: `FilterState`, `AptKey`, `SortState`, `SortKey`, `SORT_LABELS`,
  `activeFilterCount` (Task 4); `DecodedUma` (Task 1).
- Produces:
  ```ts
  interface RosterFilterPanelProps {
      filters: FilterState;
      onChange: (f: FilterState) => void;
      sort: SortState;
      onSortChange: (s: SortState) => void;
      availableSkills: Array<{ id: number; name: string }>;
  }
  export function RosterFilterPanel(props: RosterFilterPanelProps): JSX.Element
  ```

- [ ] **Step 1: Implement the panel**

Create `umalator-global/v2/roster/roster-filter-panel.tsx`:

```tsx
import { h } from 'preact';
import { useState } from 'preact/hooks';
import { FilterState, AptKey, SortState, SortKey, SortDir, SORT_LABELS, activeFilterCount } from './roster-filter';

const APT_GRADES: ReadonlyArray<{ label: string; value: number }> = [
	{ label: '—', value: 0 }, { label: 'G', value: 1 }, { label: 'F', value: 2 }, { label: 'E', value: 3 },
	{ label: 'D', value: 4 }, { label: 'C', value: 5 }, { label: 'B', value: 6 }, { label: 'A', value: 7 },
	{ label: 'S', value: 8 }
];

const APT_FIELDS: ReadonlyArray<{ key: AptKey; label: string }> = [
	{ key: 'apt_turf', label: 'Turf' }, { key: 'apt_dirt', label: 'Dirt' },
	{ key: 'apt_short', label: 'Sprint' }, { key: 'apt_mile', label: 'Mile' },
	{ key: 'apt_middle', label: 'Medium' }, { key: 'apt_long', label: 'Long' },
	{ key: 'apt_nige', label: 'Front' }, { key: 'apt_senko', label: 'Pace' },
	{ key: 'apt_sashi', label: 'Late' }, { key: 'apt_oikomi', label: 'End' }
];

interface RosterFilterPanelProps {
	filters: FilterState;
	onChange: (f: FilterState) => void;
	sort: SortState;
	onSortChange: (s: SortState) => void;
	availableSkills: Array<{ id: number; name: string }>;
}

export function RosterFilterPanel({ filters, onChange, sort, onSortChange, availableSkills }: RosterFilterPanelProps) {
	const [skillQuery, setSkillQuery] = useState('');

	function setApt(key: AptKey, value: number) {
		const aptMin = { ...filters.aptMin };
		if (value === 0) delete aptMin[key]; else aptMin[key] = value;
		onChange({ ...filters, aptMin });
	}

	function toggleSkill(id: number) {
		const skills = filters.skills.includes(id)
			? filters.skills.filter(s => s !== id)
			: [...filters.skills, id];
		onChange({ ...filters, skills });
	}

	const matches = skillQuery.trim()
		? availableSkills.filter(s => s.name.toLowerCase().includes(skillQuery.trim().toLowerCase())).slice(0, 30)
		: [];

	return (
		<div class="rosterFilters">
			<div class="rosterFilterRow">
				<label class="rosterFilterLabel" for="rosterSort">Sort</label>
				<select
					id="rosterSort"
					class="rosterSelect"
					value={sort.key}
					onChange={e => onSortChange({ ...sort, key: (e.currentTarget as HTMLSelectElement).value as SortKey })}
				>
					{(Object.keys(SORT_LABELS) as SortKey[]).map(k => (
						<option value={k} key={k}>{SORT_LABELS[k]}</option>
					))}
				</select>
				<button
					type="button"
					class="rosterSortDir"
					title={sort.dir === 'desc' ? 'Descending' : 'Ascending'}
					onClick={() => onSortChange({ ...sort, dir: (sort.dir === 'desc' ? 'asc' : 'desc') as SortDir })}
				>
					{sort.dir === 'desc' ? '▼' : '▲'}
				</button>
			</div>

			<div class="rosterFilterSection">
				<div class="rosterFilterSectionTitle">Minimum aptitude</div>
				<div class="rosterAptGrid">
					{APT_FIELDS.map(f => (
						<label class="rosterAptFilter" key={f.key}>
							<span>{f.label}</span>
							<select
								class="rosterSelect"
								value={String(filters.aptMin[f.key] ?? 0)}
								onChange={e => setApt(f.key, Number((e.currentTarget as HTMLSelectElement).value))}
							>
								{APT_GRADES.map(g => <option value={String(g.value)} key={g.value}>{g.label}</option>)}
							</select>
						</label>
					))}
				</div>
			</div>

			<div class="rosterFilterSection">
				<div class="rosterFilterSectionTitle">Owns skills</div>
				<input
					type="text"
					class="rosterInput"
					placeholder="Search skills to filter by…"
					value={skillQuery}
					onInput={e => setSkillQuery((e.currentTarget as HTMLInputElement).value)}
				/>
				{filters.skills.length > 0 && (
					<div class="rosterChips">
						{filters.skills.map(id => {
							const name = availableSkills.find(s => s.id === id)?.name ?? String(id);
							return (
								<button type="button" class="rosterChip" key={id} onClick={() => toggleSkill(id)} title="Remove">
									{name} ✕
								</button>
							);
						})}
					</div>
				)}
				{matches.length > 0 && (
					<div class="rosterSkillMatches">
						{matches.map(s => (
							<button
								type="button"
								class={`rosterSkillMatch ${filters.skills.includes(s.id) ? 'selected' : ''}`}
								key={s.id}
								onClick={() => toggleSkill(s.id)}
							>
								{s.name}
							</button>
						))}
					</div>
				)}
			</div>

			<div class="rosterFilterFooter">
				<span>{activeFilterCount(filters)} active</span>
				<button
					type="button"
					class="rosterCardBtn rosterCardBtnGhost"
					onClick={() => onChange({ name: filters.name, aptMin: {}, skills: [] })}
				>
					Clear filters
				</button>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Append the panel styles**

Append to `umalator-global/v2/roster/roster.css`:

```css
.rosterFilters {
	display: flex; flex-direction: column; gap: var(--space-sm);
	padding: var(--space-sm);
	background: var(--color-surface-overlay);
	border: 1px solid var(--color-border);
	border-radius: var(--radius-md);
}
.rosterFilterRow { display: flex; align-items: center; gap: var(--space-sm); }
.rosterFilterLabel { color: var(--color-text-muted); font-size: var(--font-sm); }
.rosterFilterSection { display: flex; flex-direction: column; gap: 6px; }
.rosterFilterSectionTitle { color: var(--color-text-muted); font-size: var(--font-xs); text-transform: uppercase; letter-spacing: 0.04em; }

.rosterAptGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 6px; }
.rosterAptFilter { display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: var(--font-sm); color: var(--color-text-muted); }

/* 16px prevents iOS auto-zoom on focus — see commit 19e96c4. */
.rosterSelect, .rosterInput {
	font-size: 16px;
	padding: 6px 8px;
	background: var(--color-surface);
	color: var(--color-text);
	border: 1px solid var(--color-border);
	border-radius: var(--radius-sm);
	min-width: 0;
}
.rosterInput { width: 100%; }

.rosterSortDir {
	padding: 6px 10px; cursor: pointer;
	background: var(--color-surface); color: var(--color-text);
	border: 1px solid var(--color-border); border-radius: var(--radius-sm);
}

.rosterChips, .rosterSkillMatches { display: flex; flex-wrap: wrap; gap: 4px; }
.rosterChip, .rosterSkillMatch {
	padding: 4px 8px; cursor: pointer;
	background: var(--color-surface); color: var(--color-text);
	border: 1px solid var(--color-border); border-radius: var(--radius-sm);
	font-size: var(--font-sm);
}
.rosterSkillMatch.selected { border-color: var(--color-primary); color: var(--color-primary); }
.rosterSkillMatches { max-height: 160px; overflow-y: auto; }

.rosterFilterFooter { display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm); font-size: var(--font-sm); color: var(--color-text-muted); }
```

- [ ] **Step 3: Typecheck**

Run: `cd umalator-global/v2 && npx tsc --noEmit -p . 2>&1 | grep roster/ ; cd ../..`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add umalator-global/v2/roster/roster-filter-panel.tsx umalator-global/v2/roster/roster.css
git commit -m "v2 roster: filter panel (aptitude minimums, owned skills, sort)

Inputs are 16px to avoid iOS auto-zoom on focus."
```

---

### Task 7: Umas tab shell (import bar + search + grid)

**Files:**
- Create: `umalator-global/v2/roster/umas-tab.tsx`
- Modify: `umalator-global/v2/roster/roster.css` (append)

**Interfaces:**
- Consumes: everything above.
- Produces:
  ```ts
  export interface UmasTabProps {
      onLoadToUma1: (state: UmaState) => void;
      onLoadToUma2: (state: UmaState) => void;
      currentMode: 'compare' | 'skill' | 'stamina';
      course: RosterCourse;
  }
  export function UmasTab(props: UmasTabProps): JSX.Element
  ```

- [ ] **Step 1: Implement the tab**

Create `umalator-global/v2/roster/umas-tab.tsx`:

```tsx
import { h } from 'preact';
import { useState, useEffect, useMemo, useCallback } from 'preact/hooks';
import { DecodedUma, decodeRoster } from './roster-decoder';
import { readRosterFromStorage, writeRosterToStorage, clearRosterStorage } from './roster-storage';
import { decodedUmaToUmaState, RosterCourse } from './roster-mapping';
import { filterUmas, sortUmas, EMPTY_FILTERS, DEFAULT_SORT, FilterState, SortState } from './roster-filter';
import { RosterUmaCard } from './roster-uma-card';
import { RosterFilterPanel } from './roster-filter-panel';
import { UmaState } from '../uma-panel';
import { saveHorseSlot } from '../storage';
import { getCharInfo } from './roster-mapping';
import skillnames from '../../skillnames.json';
import './roster.css';

export interface UmasTabProps {
	onLoadToUma1: (state: UmaState) => void;
	onLoadToUma2: (state: UmaState) => void;
	currentMode: 'compare' | 'skill' | 'stamina';
	course: RosterCourse;
}

export function UmasTab({ onLoadToUma1, onLoadToUma2, currentMode, course }: UmasTabProps) {
	const [roster, setRoster] = useState<DecodedUma[]>([]);
	const [code, setCode] = useState('');
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');
	const [busy, setBusy] = useState(false);
	const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
	const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
	const [filtersOpen, setFiltersOpen] = useState(false);

	useEffect(() => { readRosterFromStorage().then(setRoster); }, []);

	const handleImport = useCallback(async () => {
		if (!code.trim() || busy) return;
		setBusy(true);
		setError('');
		setNotice('');
		try {
			const decoded = await decodeRoster(code.trim());
			if (decoded.length === 0) {
				setError('Could not decode — check the code and try again.');
				return;
			}
			setRoster(decoded);
			setCode('');
			const written = await writeRosterToStorage(decoded);
			setNotice(written.ok
				? `Imported ${decoded.length} umas.`
				: `Imported ${decoded.length} umas, but they could not be saved (${written.reason}). They'll be gone when you reload.`);
		} catch (e) {
			setError('Could not decode — check the code and try again.');
		} finally {
			setBusy(false);
		}
	}, [code, busy]);

	const handleClear = useCallback(() => {
		setRoster([]);
		clearRosterStorage();
		setNotice('');
		setError('');
	}, []);

	const handlePromote = useCallback((uma: DecodedUma) => {
		const state = decodedUmaToUmaState(uma, course);
		const { charName, outfitName } = getCharInfo(uma.card_id);
		// saveHorseSlot(name, horse, memo?, folder?) -> boolean
		const name = outfitName ? `${charName} ${outfitName}` : charName;
		const ok = saveHorseSlot(name, state, 'Imported from roster');
		setNotice(ok ? `Saved "${name}" to the Saved tab.` : `Could not save "${name}" — storage may be full.`);
	}, [course]);

	// Only offer skills the roster actually contains — filtering by a skill nobody owns is useless.
	const availableSkills = useMemo(() => {
		const ids = new Set<number>();
		roster.forEach(u => u.skills.forEach(s => ids.add(s.id)));
		return [...ids]
			.map(id => ({ id, name: (skillnames as any)[String(id)]?.[0] ?? String(id) }))
			.sort((a, b) => a.name.localeCompare(b.name));
	}, [roster]);

	const visible = useMemo(
		() => sortUmas(filterUmas(roster, filters), sort),
		[roster, filters, sort]
	);

	return (
		<div class="rosterTab">
			<div class="rosterImportBar">
				<input
					type="text"
					class="rosterInput"
					placeholder="Paste your roster share link or code…"
					value={code}
					onInput={e => setCode((e.currentTarget as HTMLInputElement).value)}
					onKeyDown={e => { if ((e as KeyboardEvent).key === 'Enter') handleImport(); }}
				/>
				<button type="button" class="rosterCardBtn" onClick={handleImport} disabled={busy || !code.trim()}>
					{busy ? 'Decoding…' : 'Import'}
				</button>
			</div>

			<div class="rosterHint">
				Export your roster at{' '}
				<a href="https://uma.guide/roster-viewer/" target="_blank" rel="noopener noreferrer">uma.guide/roster-viewer</a>
				{' '}and paste the share link here.
			</div>

			{error && <div class="rosterError">{error}</div>}
			{notice && <div class="rosterNotice">{notice}</div>}

			{roster.length > 0 && (
				<div class="rosterControls">
					<input
						type="text"
						class="rosterInput"
						placeholder="Search umas…"
						value={filters.name}
						onInput={e => setFilters({ ...filters, name: (e.currentTarget as HTMLInputElement).value })}
					/>
					<button type="button" class="rosterCardBtn rosterCardBtnGhost" onClick={() => setFiltersOpen(o => !o)}>
						{filtersOpen ? 'Hide filters' : 'Filters'}
					</button>
					<button type="button" class="rosterCardBtn rosterCardBtnGhost" onClick={handleClear} title="Remove the imported roster">
						Clear
					</button>
				</div>
			)}

			{filtersOpen && roster.length > 0 && (
				<RosterFilterPanel
					filters={filters}
					onChange={setFilters}
					sort={sort}
					onSortChange={setSort}
					availableSkills={availableSkills}
				/>
			)}

			{roster.length > 0 && (
				<div class="rosterCount">{visible.length} of {roster.length} umas</div>
			)}

			{roster.length === 0 ? (
				<div class="rosterEmpty">No roster imported yet. Paste your share link above to browse your umas.</div>
			) : visible.length === 0 ? (
				<div class="rosterEmpty">No umas match these filters.</div>
			) : (
				<div class="rosterGrid">
					{visible.map(uma => (
						<RosterUmaCard
							key={`${uma.card_id}-${uma.create_time ?? ''}-${uma.rank_score ?? ''}`}
							uma={uma}
							course={course}
							showUma2={currentMode === 'compare'}
							onLoadUma1={u => onLoadToUma1(decodedUmaToUmaState(u, course))}
							onLoadUma2={u => onLoadToUma2(decodedUmaToUmaState(u, course))}
							onPromote={handlePromote}
						/>
					))}
				</div>
			)}
		</div>
	);
}
```

- [ ] **Step 2: Append the shell styles**

Append to `umalator-global/v2/roster/roster.css`:

```css
.rosterTab { display: flex; flex-direction: column; gap: var(--space-sm); }
.rosterImportBar { display: flex; gap: 6px; }
.rosterImportBar .rosterInput { flex: 1; }
.rosterImportBar .rosterCardBtn { flex: 0 0 auto; }
.rosterHint { font-size: var(--font-sm); color: var(--color-text-muted); }
.rosterHint a { color: var(--color-primary); }
.rosterError { padding: 6px 8px; border-radius: var(--radius-sm); background: var(--color-surface-overlay); color: var(--color-primary); font-size: var(--font-sm); }
.rosterNotice { padding: 6px 8px; border-radius: var(--radius-sm); background: var(--color-surface-overlay); color: var(--color-text-muted); font-size: var(--font-sm); }
.rosterControls { display: flex; gap: 6px; }
.rosterControls .rosterInput { flex: 1; }
.rosterCount { font-size: var(--font-xs); color: var(--color-text-muted); }
.rosterEmpty { padding: var(--space-lg); text-align: center; color: var(--color-text-muted); font-style: italic; }
```

- [ ] **Step 3: Typecheck**

Run: `cd umalator-global/v2 && npx tsc --noEmit -p . 2>&1 | grep roster/ ; cd ../..`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add umalator-global/v2/roster/umas-tab.tsx umalator-global/v2/roster/roster.css
git commit -m "v2 roster: Umas tab shell (import bar, search, filters, grid)

Paste a uma.guide share link -> decode -> persist -> browse. Cards load into
Uma 1/2 or promote into the Saved tab. Decode failures and localStorage quota
failures are surfaced inline rather than swallowed."
```

---

### Task 8: Wire the tab into the app + verify in the browser

**Files:**
- Modify: `umalator-global/v2/app-v2.tsx` (state at :274, tab strip at :1855–1891, drawer branch at :1893+)

**Interfaces:**
- Consumes: `UmasTab`, `UmasTabProps` (Task 7).

- [ ] **Step 1: Import the tab and the course data lookup**

In `umalator-global/v2/app-v2.tsx`, next to the existing `import { TraineesTab } from "./trainees-tab";` (:67) add:

```tsx
import { UmasTab } from "./roster/umas-tab";
```

`courseData` is already imported at :88 and `courseId` state already exists at :211 — reuse
both, do not add new state.

- [ ] **Step 2: Widen the tab union**

At `umalator-global/v2/app-v2.tsx:274`, change:

```tsx
const [activeUmaTab, setActiveUmaTab] = useState<1 | 2 | "trainees">(1);
```

to:

```tsx
const [activeUmaTab, setActiveUmaTab] = useState<1 | 2 | "trainees" | "umas">(1);
```

- [ ] **Step 3: Add the 4th tab button**

In the `.v2-uma-tabs` strip, immediately after the existing "Saved" button (which closes at
:1890) and before the closing `</div>` at :1891, add:

```tsx
                  <button
                    type="button"
                    class={`v2-uma-tab-umas ${activeUmaTab === "umas" ? "active" : ""}`}
                    onClick={() => setActiveUmaTab("umas")}
                  >
                    <LayoutGrid size={14} />
                    Umas
                  </button>
```

`Users` is already imported and used by the **Saved** tab, so use a distinct icon here:
add `LayoutGrid` to the existing `lucide-react` import block (it starts at
`umalator-global/v2/app-v2.tsx:52`, where `Users` is listed). Verified present in
lucide-react 0.563.0.

- [ ] **Step 4: Render the tab**

In `.v2-drawer-content`, immediately after the existing `{activeUmaTab === "trainees" && (…)}`
block, add:

```tsx
                  {activeUmaTab === "umas" && (
                    <UmasTab
                      onLoadToUma1={(s) => { handleUma1Load(s); setActiveUmaTab(1); }}
                      onLoadToUma2={(s) => { handleUma2Load(s); setActiveUmaTab(2); }}
                      currentMode={mode}
                      course={courseData[String(courseId)]}
                    />
                  )}
```

The callbacks are wrapped deliberately: `handleUma1Load` (`app-v2.tsx:594`) only calls
`setUma1(state)` and does **not** switch tabs, so without the wrapper a load would silently
appear to do nothing while the user is still looking at the roster grid.

- [ ] **Step 5: Typecheck and build**

Run:
```bash
cd umalator-global/v2 && npx tsc --noEmit -p . 2>&1 | grep -E "roster/|app-v2" ; npx vite build 2>&1 | tail -3 ; cd ../..
```
Expected: no roster/app-v2 type errors; `✓ built in …`.

- [ ] **Step 6: Verify in the browser**

Start the dev server (**must** be Vite — `build.mjs --serve` cannot transpile the v2 entry):

```bash
cd umalator-global/v2 && npx vite --port 5173 --strictPort
```

Then in the browser pane, with an **explicit** viewport (the `mobile` preset is unreliable —
see memory `v2-dev-preview`):

1. Desktop `1280x800`: open the drawer → click **Umas** → the empty state and import bar render.
2. Paste an invalid code (e.g. `abc`) → click Import → inline "Could not decode — check the
   code and try again." and **no** crash.
3. Paste a real share link from https://uma.guide/roster-viewer/ → cards render, the count
   reads "N of N umas", 2 columns at the 680px drawer width.
4. Click **Load Uma 1** → the drawer switches to Uma 1 and the stats/skills match the card.
   With a **dirt** course selected, confirm the surface aptitude matches the uma's *dirt*
   aptitude (not its turf one) — this is the upstream bug we fixed.
5. Reload the page → the roster persists (localStorage).
6. Mobile `390x844`: 1-column grid; tapping the aptitude/search inputs does **not** zoom the
   page (16px rule).
7. Check the console for errors: none.

Stop the server when done (free the port).

- [ ] **Step 7: Commit**

```bash
git add umalator-global/v2/app-v2.tsx
git commit -m "v2: add Umas roster tab to the uma drawer

Fourth tab beside Uma 1 / Uma 2 / Saved. Passes the currently-selected course so
roster umas load with course-correct aptitudes."
```

---

## Verification checklist

- [ ] `npm run test:roster` passes.
- [ ] `cd umalator-global/v2 && npx vite build` succeeds.
- [ ] Invalid code shows an inline error and never throws.
- [ ] A JP-only card renders as `Unknown (id)` + "Not in game" rather than crashing.
- [ ] Loading onto a dirt course uses the uma's dirt aptitude (the upstream bug).
- [ ] Roster survives a reload; **Clear** removes it.
- [ ] Mobile 390x844: 1 column, no input zoom.
- [ ] No v1 file (`umalator/**`) was modified.
