# Downhill Mode Analysis

Analysis of downhill mode activation patterns using empirical simulation data.

## Summary

**Conclusion:** Downhill mode provides significant HP savings but has high variance. The HP calculator should use conservative (no downhill) estimates for minimum stamina recommendations. Downhill mode should be treated as a bonus, not a requirement.

## Mechanics

From [HpPolicy.ts](../uma-skill-tools/HpPolicy.ts) and [RaceSolver.ts](../uma-skill-tools/RaceSolver.ts):

- **Activation chance per second:** `wisdom × 0.0004` (while on downhill slope)
- **Deactivation chance per second:** `0.2` (20%)
- **HP consumption reduction:** `×0.4` (60% savings when active)
- **Theoretical steady-state:** `P(active) = p_activate / (p_activate + p_deactivate)`

| Wisdom | p_activate | Theoretical Active % |
|--------|------------|---------------------|
| 800    | 0.32       | 61.5%               |
| 1000   | 0.40       | 66.7%               |
| 1200   | 0.48       | 70.6%               |
| 1400   | 0.56       | 73.7%               |

## Empirical Test Results

### Test Configuration

```
Strategy: Sashi (Late Surger)
Aptitudes: S/A/A
Mood: +2
Ground: Various
Samples per test: 100-500
```

### Hanshin 3200m (Tenno-sho Spring)

- **Downhill sections:** 870-1270m (400m), 2400-2995m (595m)
- **Total downhill:** 995m (31.1% of course)

#### Wisdom 1200

| Seed  | Activations | Active Distance | % of Downhill |
|-------|-------------|-----------------|---------------|
| 12345 | 6           | 698m            | 70.1%         |
| 11111 | 4           | 878m            | 88.3%         |
| 22222 | 8           | 478m            | 48.1%         |
| 33333 | 7           | 667m            | 67.0%         |
| 44444 | 6           | 668m            | 67.2%         |
| 55555 | 7           | 667m            | 67.0%         |

**Average:** ~68% active (range 48-88%)

#### Wisdom 1000

| Seed  | Activations | Active Distance | % of Downhill |
|-------|-------------|-----------------|---------------|
| 12345 | 6           | 617m            | 62.0%         |
| 11111 | 4           | 828m            | 83.2%         |
| 22222 | 7           | 441m            | 44.3%         |
| 33333 | 6           | 526m            | 52.9%         |
| 44444 | 6           | 671m            | 67.4%         |
| 55555 | 6           | 644m            | 64.7%         |

**Average:** ~62% active (range 44-83%)

### Other Courses

| Course | Distance | Downhill | Wisdom | Avg Active % |
|--------|----------|----------|--------|--------------|
| Kyoto 3000m | 3000m | 300m (10.0%) | 1200 | 76.3% |
| Nakayama 2500m | 2500m | 400m (16.0%) | 1200 | 68.1% |
| Tokyo 2400m | 2400m | 250m (10.4%) | 1200 | 83.6% |

## Impact on Stamina Requirements

### Example: Hanshin 3200m, Sashi, Wisdom 1000

| Metric | Base (no downhill) | Median Adjusted |
|--------|-------------------|-----------------|
| Total HP Needed | 4,194 | 3,709 |
| HP Savings | - | 485 (11.6%) |
| Min Stamina | **1,243** | 637 (-606) |

### Why NOT to Use Adjusted Min Stamina

The adjusted number (637) would be **terrible advice** because:

1. **High variance:** Activation ranges from 44% to 88% across runs
2. **CM is high stakes:** You don't want to rely on RNG luck
3. **Unlucky runs exist:** A 600 stamina uma on a bad RNG run would be catastrophic
4. **Median ≠ Safe:** Half of all runs do worse than median

**Correct approach:** Use base min stamina (1,243) as the recommendation. Downhill mode becomes a nice bonus that improves your spurt rate, not a requirement you're gambling on.

## Validation

Test with 1200 stamina on Hanshin 3200m (wisdom 1000):
- Base calc says need 1,243 stamina for full spurt
- With 1,200 stamina → 43 HP short
- Simulator shows **96% full spurt rate**
- The 96% (not 100%) confirms downhill mode helps most runs but not all

## CLI Tool

The `--downhill` flag was added to `tools/compare-cli.ts` to analyze downhill mode activations:

```bash
npx ts-node --transpile-only tools/compare-cli.ts \
  horse1.json horse2.json \
  -c 10914 --downhill -N 500

# Output includes:
# --- Downhill Mode (Median Run) ---
# Course distance: 3200m
# Downhill sections: 870-1270m (400m), 2400-2995m (595m)
# Total downhill distance: 995m (31.1% of course)
#
# Uma 1 downhill mode:
#   Activations: 6
#   Regions: 891-1155m (264m), 1176-1239m (63m), ...
#   Total active: 698m (70.1% of downhill)
```

## References

- [HpPolicy.ts](../uma-skill-tools/HpPolicy.ts) - HP consumption and downhill modifier
- [RaceSolver.ts](../uma-skill-tools/RaceSolver.ts) - Downhill mode activation logic (line 1228-1260)
- [SPURT-SURVIVAL-RATE.md](./SPURT-SURVIVAL-RATE.md) - Related stamina documentation
