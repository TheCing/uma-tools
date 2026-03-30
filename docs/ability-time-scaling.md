# Duration Scaling (`ability_time_usage`)

Controls how a skill's base duration is scaled at activation time. Stored in the `ability_time_usage_1` / `ability_time_usage_2` columns of the `skill_data` table in `master.mdb`.

See also: [Ability Value Scaling](ability-value-scaling.md) for the effect modifier counterpart.

---

## Direct (1)

No scaling. Duration = BaseDuration × (distance / 1000).

## MultiplyDistanceDiffTop (2)

Duration scales with distance from the leader.

```
ScaledDuration = BaseDuration × min(0.8 + DistanceFromTop / 62.5m, 1.6)
```

**Skills**: 110521, 910521

## MultiplyRemainHp — Type 1 (3)

Duration scales with remaining HP at activation time.

| Remaining HP | Multiplier |
|-------------|-----------|
| HP < 2000 | 1.0× |
| 2000 ≤ HP < 2400 | 1.5× |
| 2400 ≤ HP < 2600 | 2.0× |
| 2600 ≤ HP < 2800 | 2.2× |
| 2800 ≤ HP < 3000 | 2.5× |
| 3000 ≤ HP < 3200 | 3.0× |
| 3200 ≤ HP < 3500 | 3.5× |
| 3500 ≤ HP | 4.0× |

**Skills**: Mejiro Bright (100741), Mejiro McQueen

## MultiplyRemainHp — Type 2 (7)

Same concept, different thresholds.

| Remaining HP | Multiplier |
|-------------|-----------|
| HP < 1500 | 1.0× |
| 1500 ≤ HP < 1800 | 1.5× |
| 1800 ≤ HP < 2000 | 2.0× |
| 2000 ≤ HP < 2100 | 2.5× |
| 2100 ≤ HP | 3.0× |

**Skills**: Matikane Tannhauser

## IncrementOrderUp (4)

Duration increases by 1 second for each successful overtake while the skill is active, up to 3 times. The increased duration also scales with course distance (same as base duration).

## MultiplyBlockedSideMaxContinueTimePhaseMiddleRun — Type 1 (5)

Duration scales with how long the uma has been blocked during mid-race.

| Blocked Time | Multiplier |
|-------------|-----------|
| Blocked < 2s | 1.0× |
| Blocked < 4s | 2.0× |
| Blocked < 6s | 3.0× |
| Blocked ≥ 6s | 4.0× |

Same logic as the ability value counterpart — see [Ability Value Scaling](ability-value-scaling.md).

## MultiplyBlockedSideMaxContinueTimePhaseMiddleRun — Type 2 (6)

Not implemented yet.
