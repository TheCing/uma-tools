# Direct `data.json` Roster Import (v2) — Design Spec

**Date:** 2026-07-15
**Status:** Approved (design)
**Follows:** `2026-07-14-umas-roster-tab-design.md` (the share-code port)

## Purpose

The Umas tab currently imports rosters via a share code pasted from
[uma.guide/roster-viewer](https://uma.guide/roster-viewer/). That flow is a lossy
round-trip — UmaExtractor → uma.guide → 37k-char paste — and the user's verdict after
testing was blunt: *"the UX kind of sucks."*

Import the **UmaExtractor `data.json` directly** instead. It removes the third-party hop and,
more importantly, carries data the share code physically cannot.

Confirmed scope from brainstorming:
- **Keep both inputs; file first.** File import becomes the primary path; the pasted share
  code stays as a secondary fallback (for people without UmaExtractor, or given a link by a
  friend). The bit decoder is already built and pinned by tests — retiring it would throw
  away working code for no gain.
- **This pass surfaces dates + real running style only.** Sparks (`factor_info_array`) and
  parents (`succession_chara_array`) are present in the file but explicitly out of scope.

## 1. What the file actually contains (measured, not assumed)

Verified against the user's real export: **249 records** (the same 249 as their share code),
**5.0 MB**, 51 fields each, uniform shape. It is the raw game `trained_chara` record.

| Field | Type | Why it matters |
|---|---|---|
| `create_time`, `register_time` | `string` `"2025-11-02 08:12:37"` | **Real timestamps.** Range 2025-11-02 → 2026-07-15. |
| `running_style` | `number` 1–4 | **The uma's actual style** (nige/senko/sashi/oikomi). |
| `card_id` | `number` | Same as the share code. |
| `speed`/`stamina`/`power`/`guts`/**`wiz`** | `number` | Note `wiz`, not `wisdom`. |
| `proper_distance_{short,mile,middle,long}` | `number` 1–8 | Aptitudes, **same 1=G…8=S encoding we already handle**. |
| `proper_ground_{turf,dirt}` | `number` 1–8 | ″ |
| `proper_running_style_{nige,senko,sashi,oikomi}` | `number` 1–8 | ″ |
| `skill_array[]` | `{skill_id, level}` | 7–25 per uma (avg 16). |
| `rank_score` | `number` | Rating (already surfaced under the portrait). |
| `talent_level` | `number` 2–5 | Star level — matches `master.mdb`'s `card_talent_upgrade`, confirming the earlier star-count fix. |
| `rarity` | `number` | |

**No auth tokens.** Unlike the training-log JSON in `docs/` (which carries a live
`steam_session_ticket`), `data.json` has none. It does carry account identifiers —
`viewer_id`, `owner_viewer_id`, `trained_chara_id`, `owner_trained_chara_id`, `nickname_id`
— which we drop (§4).

### Why this is worth doing — two measured wins

1. **The share code has no dates at all.** `create_time` was `undefined` for all 249 decoded
   records; the v4 wire format's fixed prefix is exactly `V4_MIN_BITS` (109 bits) with no room
   for a timestamp. The current "Newest" sort therefore *infers* recency from array order
   (justified at Pearson r=0.71). `data.json` makes it real — and **vindicates the inference**:
   the array is already `create_time`-ascending (verified `[.create_time] | sort == .`).
2. **The current strategy is a guess, and it's wrong 20% of the time.** `decodedUmaToUmaState`
   infers strategy from the best style aptitude (plus a canonical-outfit tie-break), because
   the share code doesn't carry it. Measured against the real file: `running_style` disagrees
   with the best-aptitude guess for **49 of 249 umas (20%)** — those load with the wrong
   strategy and therefore wrong simulation numbers. Reading `running_style` fixes all 49.

## 2. Architecture — normalise, don't fork

Both inputs converge on the **existing `DecodedUma`** so every downstream consumer (cards,
filters, SP, course-aware mapping, storage) is untouched:

```
paste share code ─→ decodeRoster()          ─┐
                                             ├─→ DecodedUma[] ─→ (existing tab, unchanged)
drop data.json   ─→ parseRosterJson()       ─┘
```

`DecodedUma` already has an optional `create_time` (the v2 wire format carries one), so the
only type change is adding an optional `running_style`:

```ts
	/** The uma's actual running style (1=nige, 2=senko, 3=sashi, 4=oikomi). Present only
	 *  from data.json — the share code doesn't encode it, so it stays undefined there. */
	running_style?: number;
```

Two consumers become "use the real value when we have it, else keep today's inference":

- `sortUmas('recency')` — sort by `create_time` when every record has one; otherwise fall
  back to array order (today's behaviour, still correct for share codes).
- `decodedUmaToUmaState` — use `running_style` when present; otherwise the existing
  best-aptitude + canonical-tie-break inference.

This means a share-code import behaves exactly as it does today, and a `data.json` import is
strictly better, with no branching in the UI.

## 3. Date comparison — string, not `Date.parse`

`create_time` is `"YYYY-MM-DD HH:MM:SS"` — **not ISO 8601** (space, no `T`, no zone). Parsing
that with `Date.parse` is implementation-defined and can differ across engines.

Every timestamp is fixed-width (verified: all lengths are exactly 19) and zero-padded, so
**lexicographic order is chronological**. Compare the strings directly; never parse them.
This also sidesteps timezone ambiguity entirely, since we only ever order and display.

The existing `sortValue`'s `'time'` case used `Date.parse` — it was removed as dead code
earlier and must **not** come back.

## 4. Privacy — strip by construction

Import projects each record onto only the fields we need. Everything else — including every
identifying field (`viewer_id`, `owner_viewer_id`, `trained_chara_id`, `nickname_id`) — is
dropped at parse time, so identifiers never reach memory, `localStorage`, or a shared URL.
This is a whitelist, not a blacklist: new upstream fields are ignored by default.

The bulk is also dropped, which solves storage: `race_result_list` (1.0 MB) and
`succession_chara_array` (794 KB) dominate the 5 MB file and we need neither.

| | bytes |
|---|---|
| raw `data.json` | 4,997,097 |
| projected to needed fields | 216,935 |
| **projected + gzipped (what we store)** | **17,830** |

Comfortably inside the ~5 MB `localStorage` ceiling, via the existing gzip roster storage.

## 5. UX

- The Umas tab leads with a **file drop / picker** ("Import your UmaExtractor `data.json`").
- The paste box remains, demoted to a secondary fallback.
- Cards show the **training date** (`create_time`) when known.
- "Newest" stays the default sort, now backed by real dates.
- A file that parses to zero valid umas reports the same inline-error treatment as a bad
  share code, and leaves the existing roster untouched.

`data.json` is ~5 MB, so parse off the main thread or show a pending state; the import button
already has a busy state to reuse.

## 6. Out of scope

- Sparks / factors (`factor_info_array`, 3–17 per uma) — the obvious next feature.
- Parents / legacy (`succession_chara_array`, always 6).
- `race_result_list`, `support_card_list`, `wins`, `fans`, `nickname_id_array`.
- Retiring the share-code decoder.
- v1 (deprecated 2026-07-14).
