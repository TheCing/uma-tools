# Meta Analyzer Tool

A Python tool for analyzing optimal skills per course/strategy for Champions Meeting.

## Usage

```bash
# Basic usage - Oikomi on CM8 Nakayama 2500m
python3 tools/meta-analyzer.py -c 10506 -s oikomi

# Nige package analysis (Groundwork activators + flex slots)
python3 tools/meta-analyzer.py -c 10506 -s nige --nige-package

# Filter to accel-only skills
python3 tools/meta-analyzer.py -c 10506 -s oikomi --accel-only

# Custom conditions
python3 tools/meta-analyzer.py -c 10506 -s oikomi --season 4 --ground 1 --weather 1
```

### Parameters
- `-c/--course`: Course ID (default: 10506 = Nakayama 2500m)
- `-s/--strategy`: Running style (nige, senkou, sashi, oikomi)
- `--season`: 1=Spring, 2=Summer, 3=Autumn, 4=Winter
- `--ground`: 1=Firm, 2=Good, 3=Soft, 4=Heavy
- `--weather`: 1=Sunny, 2=Cloudy, 3=Rainy, 4=Snowy
- `-n/--top`: Number of results to show
- `--accel-only`, `--speed-only`, `--recovery-only`: Filter by effect type
- `--nige-package`: Special mode for Nige Groundwork analysis

## Calibration

Bashin estimates were calibrated against actual umalator simulation results on CM8 (Nakayama 2500m, Oikomi):

| Skill | Actual | Estimated | Accuracy |
|-------|--------|-----------|----------|
| Encroaching Shadow | 4.06 L | ~4.0 L | ~98% |
| LPSI (inherited) | 3.52 L | ~3.5 L | ~99% |
| MPAB (inherited) | 3.52 L | ~3.5 L | ~99% |
| Straightaway Spurt | 2.14 L | ~2.1 L | ~98% |
| NSM (median) | 1.13 L | ~1.1 L | ~97% |

### Key Formulas

**Accel skills:**
- Base rate: ~4 L per 0.1 m/s² per second
- Last spurt multiplier: 2.8x (~11 L per accel-second)
- Phase 2 corner multiplier: 1.85x (~7.4 L per accel-second)
- Late race multiplier: 1.5x

**Speed skills:**
- Base rate: ~2 L per 0.1 m/s per second
- Last spurt multiplier: 1.5x
- Late race multiplier: 1.2x

## Skill Filtering

### Original vs Inherited Skills
- **Original uniques** (10xxx, 11xxx, 10xxxx, 11xxxx): Filtered out - character-specific
- **Inherited versions** (90xxx, 900xxx): Included - usable by any uma
- Example: 100271 (LPSI original) filtered, 900271 (LPSI inherited) included

### Condition Reliability Penalties

| Condition | Strategy | Reliability | Notes |
|-----------|----------|-------------|-------|
| `infront_near_lane_time>=` | Sashi/Oikomi | 16% | Blocked from front (rare) |
| `infront_near_lane_time>=` | Nige/Senkou | 5% | Very rare for front runners |
| `blocked_side_continuetime>=` | Sashi/Oikomi | 20% | Side-blocked (rare) |
| `blocked_side_continuetime>=` | Nige/Senkou | 8% | Very rare |
| `popularity>=` | All | 25% | Underdog status - matchup dependent |
| `is_overtake==` | Sashi/Oikomi | 80% | Usually happens |
| `is_overtake==` | Nige/Senkou | 40% | Less common |
| `phase_random==2` | All | 55% | Random in phase 2 |
| `corner_random==` | All | 30% | Random corner activation |

### Course Condition Checks
- `ground_type==1` (turf) vs `ground_type==2` (dirt) - 0% if mismatch
- `season==N` - 0% if wrong season
- `ground_condition==N` - 0% if wrong ground condition
- `distance_type==N` - 0% if wrong distance category
- `track_id==N` - 0% if wrong track

## Nige Package Mode

For Front Runners, the meta requires a "package" approach:
1. **Groundwork** (core skill)
2. **3 Activators** (green skills that proc on the course)
3. **Taking the Lead** (secures 1st place)
4. **Angling and Scheming** (nearly guaranteed with 1st place)

The `--nige-package` mode shows:
1. **Groundwork Activators**: Green skills sorted by reliability
   - Guaranteed (90%+): Track/distance/condition skills
   - Likely (50-90%): Phase 2 random skills
   - Possible (30-50%): Corner/straight random skills
2. **Flex Slot Options**: Best accel skills assuming 1st place secured

## Known Limitations

1. **Missing inherited skill data**: Some inherited skills (e.g., 90141 Corazon inherited) have no data in skill_data.json
2. **Single-horse simulation**: Estimates don't account for pack dynamics, blocking probability varies by race
3. **Position conditions**: `order<=2` reliability depends on race state, not fully modeled
4. **Skill interactions**: Doesn't model skill synergies or conflicts

## Data Sources

- `umalator-global/course_data.json` - Course definitions
- `uma-skill-tools/data/skill_data.json` - Skill effects and conditions
- `umalator-global/skillnames.json` - Skill name translations
- `skill_meta.json` - Skill metadata

## Future Improvements

- [ ] Add missing inherited skill data (estimate from originals at ~50% power)
- [ ] Model position reliability based on strategy (Nige with package = high `order==1` reliability)
- [ ] Add support for skill combos (e.g., Groundwork + activator count)
- [ ] Calibrate for other strategies (Senkou, Sashi) with actual simulation data
- [ ] Add course name lookup instead of just IDs
