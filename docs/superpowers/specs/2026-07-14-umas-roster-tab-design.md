# Umas / Roster Tab (v2) — Design Spec

**Date:** 2026-07-14
**Status:** Approved (design)

## Purpose

Port the **Umas tab / roster** feature from the `kachi-dev` remote (`kachi-dev/master`)
into our v2 app. It lets a user paste a roster share code — produced by the
[uma.guide roster viewer](https://uma.guide/roster-viewer/) (formerly `roster.uma.guide`,
which ingests UmaExtractor JSON) — and browse their **real in-game roster** as a
searchable, filterable card grid, loading any uma straight into the simulator.

Upstream source (reference, not copied wholesale):
- `umalator/rosterDecoder.ts` (304 lines) — bit-packed v1/v2/v4 roster decoder
- `umalator/components/UmasTab.tsx` (747 lines) — the tab UI
- `umalator/components/UmasTab.css` (961 lines) — upstream styling
- `umalator/app.tsx:1530` `decodedUmaToUmaState()` — the roster→sim mapping

Confirmed scope from brainstorming:
- **v2 only (Global).** v1 is officially deprecated as of 2026-07-14 and is not a target.
- **Separate "Umas" tab**, a 4th tab beside Uma 1 / Uma 2 / Saved. The roster is its own
  re-importable collection; the Saved tab keeps its curated hand-made builds. The two are
  not merged.
- **Import via pasted share code/URL** — port `rosterDecoder` as-is. Direct UmaExtractor
  JSON import is out of scope.
- **Full parity + v2 polish** (see §5).
- **Course-aware aptitude collapsing** — deliberately fixes an upstream bug (§4).
- **Decoder is our code, not vendored** (decided 2026-07-15). Port the decoder's logic but
  clean it up to our rubric: named bit-width constants, no `as any`, shared `readStats`/
  `readAptitudes` helpers. The three version readers stay separate — they are three wire
  formats, not duplication. The **bit layouts are frozen** (dictated by uma.guide), so the
  port lands verbatim first and is only cleaned up once a synthetic encoder pins v1/v2/v4
  decoding. Accepted trade: the file diverges from upstream, so a future upstream format is
  a manual port rather than a clean diff.
- **Approach A**: port the pure logic, rebuild the UI on v2 primitives. We do
  **not** copy `UmasTab.tsx`/`UmasTab.css`, which carry `preact-i18n`, JP data paths, a
  rival 961-line stylesheet, and duplicate SP math we already own.

## 1. Integration point

The drawer tab strip is already a discriminated value
`activeUmaTab: 1 | 2 | "trainees"` (`umalator-global/v2/app-v2.tsx:1855`). We extend it
with `"umas"` and add a 4th button beside Saved.

`UmasTab` mirrors `TraineesTab`'s **load contract** so the two library tabs stay consistent
and app wiring stays trivial. For reference, `TraineesTabProps` is
`{ onLoadToUma1, onLoadToUma2, currentMode, currentUma1, currentUma2 }`. Ours:

```ts
interface UmasTabProps {
    onLoadToUma1: (state: UmaState) => void;   // same contract as TraineesTab
    onLoadToUma2: (state: UmaState) => void;   // same contract as TraineesTab
    currentMode: 'compare' | 'skill' | 'stamina';  // hides the Uma 2 action outside compare
    course: CourseData;                        // NEW — required for course-aware aptitudes
}
```

Two deliberate differences from `TraineesTabProps`:
- **`currentUma1`/`currentUma2` are dropped.** `TraineesTab` needs them to save the
  *current* uma into a slot; the Umas tab never saves the current uma, only loads out of
  the roster.
- **`course` is added**, and it is required: the roster→`UmaState` mapping cannot be
  correct without it (§4).

## 2. File structure

A self-contained module. Per-feature CSS follows the existing `stacalc.css` precedent
rather than growing `v2.css` (already ~167KB).

```
umalator-global/v2/roster/
├── roster-decoder.ts        ~300  ported from kachi + cleaned (layout frozen; pure)
├── roster-storage.ts         ~40  gzip+base64 persistence to localStorage
├── roster-mapping.ts         ~60  DecodedUma → UmaState (course-aware); char/icon lookup
├── roster-sp.ts              ~40  calcTotalSP aggregation over calculateSkillCost
├── roster-filter.ts          ~80  pure filter + sort predicates over DecodedUma[]
├── umas-tab.tsx             ~200  tab shell: import bar, search, grid, wiring
├── roster-uma-card.tsx      ~150  one card + actions
├── roster-filter-panel.tsx  ~150  aptitude-minimum selects, skill picker, sort control
├── roster.css               ~300  styling on v2 design tokens
└── roster.test.ts            ~80  pure-logic tests (§7)
```

Pure logic (decoder / mapping / filter) is deliberately split from UI so the parts that can
fail *silently* are testable without a browser.

## 3. Data flow

1. User pastes a share URL or bare `#code` into the import bar.
2. `decodeRoster(input)` → `DecodedUma[]`. It strips anything before `#`, applies
   `decodeURIComponent`, handles the optional `z` gzip prefix, reads an 8-bit version and
   dispatches to the v1 / v2 / v4 readers.
3. Roster persisted via `saveRoster()` (gzip + base64) to `localStorage` under
   `v2_umas_roster`; rehydrated with `loadRoster()` on mount.
4. `roster-filter` applies search/filters/sort → grid of `RosterUmaCard`.
5. **Load into Uma 1/2** → `decodedUmaToUmaState(uma, course)` → `onLoadToUma1/2` →
   the drawer switches to that uma's tab.

Note the storage key is `v2_umas_roster`, **not** upstream's `umas_tab_roster` — our
payload is namespaced to v2 and there is no shared state with a kachi install.

## 4. Roster → UmaState mapping (`roster-mapping.ts`)

This is the only part with real judgement, and it intentionally **diverges from upstream**.

### The upstream bug

`kachi-dev/master:umalator/app.tsx:1530` collapses aptitudes by taking the best of each:

```ts
distanceAptitude: aptToLetter(Math.max(apt_short, apt_mile, apt_middle, apt_long))
surfaceAptitude:  aptToLetter(Math.max(apt_turf, apt_dirt))
```

`DecodedUma` carries all 10 aptitudes but `UmaState` stores only 3
(`distanceAptitude`, `surfaceAptitude`, `strategyAptitude`), so a collapse is required.
Taking the max is wrong for a simulator: an uma with A turf / G dirt loaded onto a **dirt**
course would get surface **A**, overstating aptitude and producing wrong sim numbers.

### Our rule — pick the aptitude that matches the course

`course_data.json` carries both fields we need, so this is exact rather than inferred:

| Target | Source | Selector |
|---|---|---|
| `surfaceAptitude` | `apt_turf` / `apt_dirt` | `course.surface` (`Surface.Turf=1`, `Dirt=2`) |
| `distanceAptitude` | `apt_short` / `apt_mile` / `apt_middle` / `apt_long` | `course.distanceType` (`Short=1, Mile=2, Mid=3, Long=4`) |
| `strategy` | — | best of `apt_nige`/`apt_senko`/`apt_sashi`/`apt_oikomi` → `Nige`/`Senkou`/`Sasi`/`Oikomi` |
| `strategyAptitude` | that strategy's apt | the strategy chosen above |

Strategy keeps upstream's "best aptitude" heuristic: the roster does not record which style
the uma actually runs, so best-apt is the only sensible default.

### Numeric → letter

v2's `UmaState` stores aptitudes as **letters** (`type Aptitude = 'S'|'A'|…|'G'`,
`uma-panel.tsx:75`); `HorseState` passes letters through and the engine's inverted
`Aptitude` enum (`S=0 … G=7`, `uma-skill-tools/HorseTypes.ts:4`) is resolved downstream by
existing code. So our mapping target is the **letter**, and the engine inversion is not our
concern.

The roster encodes `1=G … 8=S` (v4 reads `read(3)+1` → 1–8; v1/v2 read 4 bits → 0–9).
Use upstream's clamped table, which covers both ranges:

```ts
const APT_LETTERS = ['G','G','F','E','D','C','B','A','S','S'] as const;
const aptToLetter = (v: number) => APT_LETTERS[Math.max(0, Math.min(9, v))];
```

Getting this table wrong silently flips S↔G, so it is pinned by a test (§7).

### Remaining fields

| Target | Source |
|---|---|
| `outfitId` | `String(card_id)` |
| `speed`/`stamina`/`power`/`guts`/`wisdom` | direct |
| `uniqueLv` | `talent_level ?? 1` |
| `skills` | `skills.map(s => String(s.id))`, filtered to ids present in Global `skill_data.json` |
| `mood` | `2` (Great) — matches upstream |
| `starCount` | leave at `defaultUmaState.starCount` (3); the roster does not encode rarity |
| `forcedSkillPositions` | `{}` |

**Snapshot semantics:** the collapse happens at load time. Changing the course afterwards
does not re-derive the aptitudes — identical to manually-entered umas today. Accepted
explicitly during brainstorming.

## 5. Feature parity + v2 polish

Ported from upstream:
- Card: character icon, name, outfit/epithet, the 5 stats with **stat ranks**
  (upstream's `rankForStat`/`statRankStr`), aptitude icons for all 10, owned-skill grid,
  total SP, talent level, rank score.
- Name search; aptitude-minimum filters (all 10); owned-skill filter; sort control.
- Actions: **Load into Uma 1**, **Load into Uma 2**.

v2 additions:
- **Reuse `skill-chart-utils.ts`** (`skillGroups`, `calculateSkillCost`) instead of
  upstream's duplicate SP implementation. `calculateSkillCost(id, new Map(), new Map())` is
  equivalent to upstream's `costForId(id, new Map())` (hint 0 makes `scaleBaseCost` a
  no-op) and our `skillGroups` sort is functionally identical to upstream's. Only the
  **aggregation** — exclude uniques (rarity 3–5), take the highest tier owned per group,
  charge that walk once — is new, and it lives in `roster-sp.ts`.
- **"Not in game" badges** from `not-in-game.json` for JP-only outfits/skills.
- **Mobile-correct** per the fixes shipped in `19e96c4`: 1-column grid inside the
  now-full-screen drawer, `font-size: 16px` on inputs (avoids iOS focus zoom), `dvh` units.
  2-column at the 680px desktop drawer width (`--drawer-width`).
- **Promote to Saved** — a card action that writes the mapped `UmaState` into the existing
  Saved slots via `storage.ts`, bridging roster → curated builds.
- No `preact-i18n`; v2 is English-only (`CC_GLOBAL`).

## 6. Error handling

| Case | Behaviour |
|---|---|
| Empty/undecodable code, or unknown version byte | `decodeRoster` returns `[]`; inline error "Could not decode — check the code and try again." Existing roster is left untouched. |
| Unknown `card_id` (JP-only / not in our `umas.json`) | Card renders `Unknown (<id>)` with a "Not in game" badge and a fallback icon. Never throws. |
| Unknown skill ids | Skipped for SP/skills; the card shows an "N unrecognised" count so the discrepancy is visible rather than silent. |
| `localStorage` quota exceeded (large rosters) | Caught; warn inline that the roster won't persist. It stays usable for the session. |
| `DecompressionStream` unavailable | Surfaced as the decode error. Already relied on by v2 URL-state (`storage.ts`), so supported everywhere v2 runs. |

Decoding is `async` (gzip streams), so the import bar shows a pending state and disables
submit while decoding.

## 7. Testing

v2 has no test runner. The precedent is `test:mechanics` →
`npx ts-node umalator-global/mechanics-explorer/mechanics.test.ts`. Add a matching
`test:roster` script running `umalator-global/v2/roster/roster.test.ts`.

Tests cover the failure modes that are **silent** rather than loud:
1. **Numeric → letter table** — `1→'G'`, `8→'S'`, plus clamping of the v1/v2 `0`/`9` ends.
   Guards the S↔G flip.
2. **Course-aware selection** — a dirt course picks `apt_dirt` not `max(turf,dirt)`; a
   1200m (`Short`) course picks `apt_short`; the upstream best-of bug is explicitly
   asserted against.
3. **Strategy selection** — highest strategy apt wins and `strategyAptitude` matches it.
4. **`saveRoster` → `loadRoster` round-trip** preserves a roster.
5. **Decoder robustness** — garbage input returns `[]` rather than throwing.

UI is verified in the browser at 390×844 (mobile) and 1280×800 (desktop) per
`v2-dev-preview` (`npx vite`, explicit viewport size).

## 8. Out of scope

- v1 (`umalator/`) — officially deprecated 2026-07-14.
- Direct UmaExtractor JSON import (the uma.guide round-trip stays the input path).
- Merging the roster into the Saved tab, or replacing Saved.
- Re-deriving aptitudes when the course changes after load.
- Upstream's `onExport` (clipboard JSON dump) — superseded by "Promote to Saved".
- Roster factors/parents/sparks: the decoder reads and discards these bits, as upstream
  does. `DecodedUma` does not expose them.
