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
| 14 | Activated Passive Skills | Scales by green skill count (tag 601-615): 0-2 = 0.0x, 3-4 = 1.0x, 5 = 2.0x, 6+ = 3.0x |
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

Separate from scaling, some skills have an `ability_additional_activation` column:

| ID | Name |
|----|------|
| 1 | Approaching Behind |
| 2 | Activate Skills, Up to 2 |
| 3 | Activate Skills, Up to 3 |

## Database Columns

In `master.mdb`, the `skill_data` table has columns following this pattern:

- `ability_value_usage_[alt]_[effect]` — scaling type per effect
- `ability_value_level_usage_[alt]_[effect]` — level scaling type per effect

Where `[alt]` is the alternative index (1 or 2) and `[effect]` is the effect index (1, 2, or 3).

## Examples

**Nothing Ventured (202031)**
- Effect 1: Speed +4500, Direct (1) — flat +0.45 speed
- Effect 2: Recovery -10000, Random Roll (8) — 60% no drain, 30% = 2% HP, 10% = 4% HP

**Luck Comes to the Prepared (100981)**
- Effect 1: Speed +2500, Direct (1) — flat +0.25 speed
- Effect 2: Speed +500, Activated Passive Skills (14) — 0/+500/+1000/+1500 based on green skill count
- Effect 3: Accel +500, Activated Passive Skills (14) — 0/+500/+1000/+1500 based on green skill count

**Radiant Star (210061)**
- Effect 1: Speed +2500, Race Wins (10) — ranges from +2000 (0.8x) to +3000 (1.2x)
- Effect 2: Accel +3000, Race Wins (10) — ranges from +2400 (0.8x) to +3600 (1.2x)
- Effect 3: Recovery +350, Race Wins (10) — ranges from +280 (0.8x) to +420 (1.2x)

## Simulator Note

The Moomoolator currently does **not** implement `ability_value_usage`. All modifiers are treated as Direct. This means skills with non-Direct scaling (12 skills as of March 2026) may have incorrect effect magnitudes in simulation.

The `valueUsage` field has been added to `umalator-global/skill_data.json` for the affected skills but is not yet read by `RaceSolverBuilder.ts`.
