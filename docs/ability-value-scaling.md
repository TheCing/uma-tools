# Ability Value Scaling (ability_value_usage)

Each skill effect in `skill_data` has an `ability_value_usage` column that controls how the raw modifier value is scaled at runtime. Most skills use Direct (1), meaning the raw value is applied as-is.

## Scaling Types

| ID | Name | Description |
|----|------|-------------|
| 0-1 | Direct | Raw value used as-is (divided by 10000 in sim) |
| 2 | Acquired Skills | Multiplied by number of acquired skills |
| 3 | Team Speed | Multiplied by team speed stat (Aoharu) |
| 4 | Team Stamina | Multiplied by team stamina stat (Aoharu) |
| 5 | Team Power | Multiplied by team power stat (Aoharu) |
| 6 | Team Guts | Multiplied by team guts stat (Aoharu) |
| 7 | Team Wit | Multiplied by team wit stat (Aoharu) |
| 8 | Random Roll | 60% = 0.0x, 30% = 0.02x, 10% = 0.04x |
| 9 | Random Roll | Same as 8 |
| 10 | Race Wins (Climax) | Scales by races won during training: <6 = 0.8x, 6-13 = 0.9x, 14-17 = 1.0x, 18-24 = 1.1x, 25+ = 1.2x |
| 11 | Final Corner Place Change | Multiplied by positions gained at final corner |
| 12 | Fan Count | Multiplied by fan count |
| 13 | Maximum Raw Stats | Multiplied by highest raw stat value |
| 14 | Activated Passive Skills (`MultiplyActivateSpecificTagSkillCount`) | Scales by the number of green skills (tag 601-615) **activated during the race**: 0-2 = 0.0x, 3-4 = 1.0x, 5 = 2.0x, 6+ = 3.0x. Note the 0.0x floor — below 3 greens the effect contributes nothing at all. |
| 15 | Activated Heal Skills | Scales by number of heal skills activated |
| 16 | Position at Final Corner | Scales by position at final corner |
| 17 | Number of Team Members | Scales by team size |
| 18 | Base Wit | Scales by base wit stat |
| 19 | Number of Passed Runners | Scales by runners overtaken |
| 20-21 | Blocked Time in Middle Phase | Scales by time spent blocked during middle phase |
| 22-23 | Speed Stat | Scales by speed stat |
| 24 | Overseas Aptitude | Scales by overseas aptitude |
| 25 | Leading Amount | Scales by lead distance |
| 26 | UAF Final Win Count | Scales by UAF final wins |
| 30 | Love Received | Scales by love received |

## Additional Activation Types

Separate from scaling, some skills have an `ability_additional_activation` column that applies a multiplier to the effect value based on runtime conditions:

| ID | Name | Formula |
|----|------|---------|
| 1 | Approaching Behind | Base multiplier 0.25. If 20m+ behind first place, +0.1 (total 0.35). |
| 2 | Activate Skills, Up to 2 | Activates additional skill effects, up to 2 |
| 3 | Activate Skills, Up to 3 | Activates additional skill effects, up to 3 |

### Example: Lyricism at Journey's End (100571)

`ability_additional_activation = 1` (Approaching Behind)

- Effect: TargetSpeed +2500
- Close to first place: 2500 × 0.25 = **625** effective
- 20m+ behind first: 2500 × 0.35 = **875** effective

## Database Columns

In `master.mdb`, the `skill_data` table has columns following this pattern:

- `ability_value_usage_[alt]_[effect]` — scaling type per effect
- `ability_value_level_usage_[alt]_[effect]` — level scaling type per effect

Where `[alt]` is the alternative index (1 or 2) and `[effect]` is the effect index (1, 2, or 3).

## Examples

**Nothing Ventured (202031)**
- Effect 1: Speed +4500, Direct (1) — flat +0.45 speed
- Effect 2: Recovery -10000, Random Roll (8) — 60% no drain, 30% = 2% HP, 10% = 4% HP

**Luck Runs My Way (100981)** — Copano Rickey unique, `phase_laterhalf_random==1`, baseDuration 50000

> Renamed by Cygames in the 2026-07 Global data drop; it was **"Luck Comes to the Prepared"**
> before. In-game description: *"Moderately increase velocity sometime upon approaching
> late-race, then increase velocity and acceleration based on how many passive skills the
> skill user has in effect."* — those "passive skills" are the greens.
>
> **This is the only skill in the game that uses usage 14.** Of every effect in the 2026-07
> Global data, 824 are Direct (1) and hers are the sole two `14`s.

- Effect 1: TargetSpeed +2500, Direct (1) — flat +0.25 m/s regardless of green count
- Effect 2: TargetSpeed +500, Activated Passive Skills (14) — scales with green skill count
- Effect 3: Accel +500, Activated Passive Skills (14) — scales with green skill count

In-game effect at each green skill breakpoint:

| Green skills | TargetSpeed (Eff. 1) | TargetSpeed (Eff. 2) | Accel (Eff. 3) | Total TargetSpeed | Total Accel |
|---|---|---|---|---|---|
| 0–2 | +0.25 m/s | +0.00 m/s | +0.00 m/s² | **+0.25 m/s** | **+0.00 m/s²** |
| 3–4 | +0.25 m/s | +0.05 m/s | +0.05 m/s² | **+0.30 m/s** | **+0.05 m/s²** |
| 5   | +0.25 m/s | +0.10 m/s | +0.10 m/s² | **+0.35 m/s** | **+0.10 m/s²** |
| 6+  | +0.25 m/s | +0.15 m/s | +0.15 m/s² | **+0.40 m/s** | **+0.15 m/s²** |

**Radiant Star (210061)**
- Effect 1: Speed +2500, Race Wins (10) — ranges from +2000 (0.8x) to +3000 (1.2x)
- Effect 2: Accel +3000, Race Wins (10) — ranges from +2400 (0.8x) to +3600 (1.2x)
- Effect 3: Recovery +350, Race Wins (10) — ranges from +280 (0.8x) to +420 (1.2x)

## Simulator Note

*Verified against the code and the 2026-07 Global data. The previous version of this section
was wrong on every point — it named a field that doesn't exist (`valueUsage`), said nothing
read it, and undercounted the affected skills. Re-verify before trusting; don't assume.*

**The data path is live.** In `umalator-global/skill_data.json` the field is **`scaling`** (not
`valueUsage` — no effect carries that name). `RaceSolverBuilder.ts:277` reads it:

```ts
valueScaling: ef.scaling > 1 ? ef.scaling : undefined
```

…and `RaceSolver.ts:1438` consumes it in `activateSkill`.

**What is actually implemented:** only **8 / 9** (Random Roll). `RaceSolver.ts:1438` applies the
60/30/10 → 0.0x/0.02x/0.04x roll and records it in `randomRolls`. Everything else falls through
and is applied at **full value**, i.e. silently as if Direct.

| usage | in data? | in solver? | skills affected |
|---|---|---|---|
| 1 (Direct) | ✅ | ✅ (no-op) | the overwhelming majority |
| 3, 4, 5, 6, 7 (Aoharu team stats) | ✅ | ❌ full value | `210011/12` `210021/22` `210031/32` `210041/42` `210051/52` — Burning/Ignited Spirit SPD·STA·PWR·GUTS·WIT |
| 8 (Random Roll) | ✅ | ✅ | `202031` Nothing Ventured, `202032` Risky Business |
| 10 (Race Wins, Climax) | ✅ | ❌ full value | `210061` Radiant Star, `210062` Glittering Star |
| **14 (green count)** | ❌ **dropped by the generator** | ❌ full value | `100981` Luck Runs My Way |

That's **14 skills** carrying non-Direct scaling, plus `100981` which *should* and doesn't.

**The `100981` gap is the worst of these**, because it's wrong in both directions rather than
merely conservative:

- The generator never records `scaling: 14` — all three of her effects land in
  `skill_data.json` with no `scaling` at all, so `ef.scaling` is `undefined`, `valueScaling`
  is `undefined`, and the solver's `8|9` branch never fires.
- So both `usage=14` effects apply as a flat **+500 / +500**.
- With ≤2 greens the real multiplier is **0.0x** — we grant a bonus that shouldn't exist.
- With 6+ greens it's **3.0x** — we apply a third of what we should.

Note also that `RaceSolver.ts` deliberately **imports no skill data** (`PendingSkill` carries
`skillId`/`rarity`/`effects`, no tags), so implementing 14 cannot be done by looking up
`skill_meta` inside the solver. The green-ness has to be injected at the builder seam, the way
`valueScaling` already is.

Green skills for the purposes of usage 14 are those tagged **601–615** in `skill_meta.json`
(`tags` array) — e.g. `200011` Right-Handed ◎ (`rotation==1`), `200031` Tokyo Racecourse ◎
(`track_id==10006`). 110 of them exist in the current Global data. Note tags 601–615 are *not*
exclusive to greens: inherited uniques carry them too, so a count must also filter on rarity.
