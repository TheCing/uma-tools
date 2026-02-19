# V1 vs V2 Parity Tests

Automated tests to verify that V2 skill chart mode produces identical results to V1.

## Overview

The skill chart parity tests ensure that:
1. V2 produces the same min/max/mean/median values as V1 for identical inputs
2. Results match within acceptable tolerance (0.01L)
3. Performance meets or exceeds V1

## Test Structure

```
test/v1-v2-parity/
├── skill-chart-comparison.ts   # Main test runner
├── v2-adapter.ts                # V2 comparison wrapper
├── v1-adapter.ts                # V1 comparison wrapper (TODO)
└── README.md                    # This file
```

## Running Tests

### Prerequisites

```bash
npm install
cd test/v1-v2-parity
```

### Run All Tests

```bash
npx ts-node skill-chart-comparison.ts
```

### Test Output

```
🧪 V1 vs V2 Skill Chart Parity Tests

Running: Basic Speed Build - Tokyo 2400m...
  V2 completed 4 skills in 1234ms

═══════════════════════════════════════════════════════════════════════════════
TEST: Basic Speed Build - Tokyo 2400m
Common speed-focused build on Tokyo middle distance
───────────────────────────────────────────────────────────────────────────────
✓ PASSED - All 4 skills match within tolerance

Performance:
  V1: 5000ms
  V2: 1234ms
  Speedup: 4.05x
═══════════════════════════════════════════════════════════════════════════════
```

## Test Fixtures

### Current Test Cases

1. **Basic Speed Build - Tokyo 2400m**
   - Speed-focused uma on middle distance
   - Tests: Speed Star, Acceleration, Quick Pace, Last Spurt
   - Expected: All skills show positive gain

2. **Stamina Build - Kyoto 3000m**
   - Stamina-focused uma on long distance
   - Tests: Stamina Keeper, Stamina Recovery, Good Horsekeeping
   - Expected: Recovery skills show strong performance

### Adding New Test Cases

Edit `skill-chart-comparison.ts` and add to `TEST_FIXTURES`:

```typescript
{
  name: 'Your Test Name',
  description: 'Brief description',
  uma: {
    speed: 1200,
    stamina: 800,
    // ... other stats
    skills: ['200041'],
  },
  courseId: '10501',
  ground: 0,
  weather: 1,
  season: 4,
  time: 2,
  skillsToTest: ['200041', '200061'],
  seed: 12345,
  nsamples: 100,
}
```

## Implementation Status

### ✅ Completed
- Test infrastructure and runner
- V2 adapter using existing v2-adapter.ts
- Comparison logic with tolerance checking
- Test fixtures for common scenarios
- Console output formatting

### 🚧 TODO
- V1 adapter implementation
- Actual V1 vs V2 comparison (currently V2 vs V2)
- Performance profiling
- Extended test coverage
- CI/CD integration

## Tolerance Levels

- **Default**: 0.01L (length difference)
- **Metrics compared**: min, max, mean, median
- **Pass criteria**: All metrics within tolerance

## Debugging Failed Tests

If a test fails:

1. Check the discrepancy details in output
2. Verify seed is identical for both runs
3. Check skill metadata and course data match
4. Run with single skill to isolate issue
5. Compare detailed runData if available

## Notes

- Tests use deterministic RNG with fixed seeds
- Same seed should produce identical results
- Small floating-point differences (<0.001L) are acceptable
- Worker parallelization not used in tests (sequential for consistency)
