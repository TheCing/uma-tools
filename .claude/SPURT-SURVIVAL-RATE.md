# Spurt Survival Rate Calculation

This document explains the exact math used to calculate the spurt/stamina survival rate in the umalator simulator.

## Survival Rate Formula

```
Survival Rate = (total_simulations - hp_died_count) / total_simulations × 100%
```

**Source:** [umalator/compare.ts:516](../umalator/compare.ts#L516)

A horse "survives" if it doesn't run out of HP (stamina) before the race ends. The survival rate represents the percentage of simulation runs where the horse maintained positive HP throughout the entire race.

## HP (Stamina) System

### Max HP Calculation

**Source:** [uma-skill-tools/HpPolicy.ts:56](../uma-skill-tools/HpPolicy.ts#L56)

```
maxHp = 0.8 × HpStrategyCoefficient[strategy] × stamina + distance
```

**HpStrategyCoefficient by Strategy:**

| Strategy | Coefficient |
|----------|-------------|
| None     | 0           |
| Nige (Front) | 0.95    |
| Senkou (Stalker) | 0.89 |
| Sasi (Betweener) | 1.0  |
| Oikomi (Chaser) | 0.995 |
| Oonige   | 0.86        |

### HP Consumption Per Second

**Source:** [uma-skill-tools/HpPolicy.ts:89-92](../uma-skill-tools/HpPolicy.ts#L89-L92)

```
hpPerSecond = 20 × (velocity - baseSpeed + 12)² / 144 × statusModifier × groundModifier × gutsModifier
```

#### Base Speed

```
baseSpeed = 20 - (distance - 2000) / 1000
```

#### Guts Modifier

**Source:** [uma-skill-tools/HpPolicy.ts:58](../uma-skill-tools/HpPolicy.ts#L58)

```
gutsModifier = 1 + 200 / √(600 × guts)
```

**Note:** Only applies during phase ≥ 2 (middle and final phases of the race).

#### Ground Modifier

**Source:** [uma-skill-tools/HpPolicy.ts:27-31](../uma-skill-tools/HpPolicy.ts#L27-L31)

| Surface | Good (Firm) | Yielding | Soft | Heavy |
|---------|-------------|----------|------|-------|
| Turf    | 1.0         | 1.0      | 1.02 | 1.02  |
| Dirt    | 1.0         | 1.0      | 1.01 | 1.02  |

#### Status Modifier

**Source:** [uma-skill-tools/HpPolicy.ts:63-86](../uma-skill-tools/HpPolicy.ts#L63-L86)

The status modifier is multiplicative and depends on race conditions:

| Condition | Modifier |
|-----------|----------|
| Downhill Mode | ×0.4 |
| Pace Down | ×0.6 |
| Rushed (kakari) | ×1.6 |
| Lead Competition | ×1.4 |
| Lead Competition + Rushed | ×3.6 |
| Lead Competition (Oonige) | ×3.5 |
| Lead Competition + Rushed (Oonige) | ×7.7 |

### HP Tick (Per Frame)

**Source:** [uma-skill-tools/HpPolicy.ts:95-98](../uma-skill-tools/HpPolicy.ts#L95-L98)

```
hp -= hpPerSecond × dt
```

Where `dt` is the time delta per simulation frame.

### HP Recovery

**Source:** [uma-skill-tools/HpPolicy.ts:109-110](../uma-skill-tools/HpPolicy.ts#L109-L110)

Skills can recover HP using a modifier:

```
hp = min(maxHp, hp + maxHp × modifier)
```

## HP Died State

**Source:** [uma-skill-tools/RaceSolver.ts:679-681](../uma-skill-tools/RaceSolver.ts#L679-L681)

When `hp <= 0`:
- `hpDied` flag is set to `true`
- `hpDiedPosition` records distance remaining to finish
- Target speed drops to minimum speed
- Acceleration becomes -1.2 m/s² (deceleration)

**Source:** [uma-skill-tools/RaceSolver.ts:1112-1113](../uma-skill-tools/RaceSolver.ts#L1112-L1113), [RaceSolver.ts:1145-1147](../uma-skill-tools/RaceSolver.ts#L1145-L1147)

## Summary

The spurt survival rate measures how often a horse can maintain stamina throughout a race. Higher stamina stats, appropriate strategy coefficients, and guts (which reduces HP consumption in later phases) all contribute to better survival rates. Ground conditions and special states like being rushed or in lead competition can significantly increase HP consumption.
