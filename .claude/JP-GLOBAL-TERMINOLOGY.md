# Uma Musume JP ↔ Global Terminology Reference

**Purpose**: Internal reference for Claude Code when working with uma-skill-tools and umalator-global directories. This document maps Japanese game terminology to English equivalents used in the Global release.

---

## Core Stats (Five Main Attributes)

| Japanese | Romaji | English (Global) | Code Constant |
|----------|--------|------------------|---------------|
| スピード | supiido | Speed | `speed` |
| スタミナ | sutamina | Stamina | `stamina` |
| パワー | pawaa | Power | `power` |
| 根性 | konjou | Guts | `guts` |
| 賢さ | kashikosa | Wit/Wisdom | `wisdom` |

---

## Running Styles (Strategy)

| Japanese | Romaji | English (Global) | Code Enum | Enum Value |
|----------|--------|------------------|-----------|------------|
| 逃げ | nige | Front/Leader | `Strategy.Nige` | 1 |
| 先行 | senkou | Stalker/Presser | `Strategy.Senkou` | 2 |
| 差し | sasi | Late/Closer | `Strategy.Sasi` | 3 |
| 追込 | oikomi | End/Chaser | `Strategy.Oikomi` | 4 |
| 大逃げ | oonige | (Super Escape) | `Strategy.Oonige` | 5 |

**Location**: `uma-skill-tools/HorseTypes.ts:3`

**Notes**:
- `Oonige` is treated as equivalent to `Nige` in strategy matching logic
- Global release uses "Front/Stalker/Late/End" but community also uses "Leader/Presser/Closer/Chaser"

---

## Aptitude Grades

| Grade | Code Enum | Performance Impact |
|-------|-----------|-------------------|
| S | `Aptitude.S` (0) | +5% Distance/Track, +10% Style |
| A | `Aptitude.A` (1) | Baseline (no modifier) |
| B | `Aptitude.B` (2) | -10% Distance/Track, -15% Style |
| C | `Aptitude.C` (3) | ~-20% |
| D | `Aptitude.D` (4) | ~-40% |
| E | `Aptitude.E` (5) | ~-60% |
| F | `Aptitude.F` (6) | ~-75% |
| G | `Aptitude.G` (7) | ~-90% |

**Location**: `uma-skill-tools/HorseTypes.ts:4`

**Notes**: S-rank aptitude ≈ 100-200 extra effective stat points depending on base stats

---

## Mood Conditions

| Japanese | Romaji | English (Global) | Code Value |
|----------|--------|------------------|------------|
| 絶好調 | zekkocho | Great/Perfect | `2` (Mood) |
| 好調 | kocho | Good | `1` |
| 普通 | futsuu | Normal | `0` |
| 不調 | fuchou | Bad | `-1` |
| 絶不調 | zekkufuchou | Terrible/Awful | `-2` |

**Type**: `Mood = -2 | -1 | 0 | 1 | 2`
**Location**: `uma-skill-tools/RaceParameters.ts:1`

---

## Ground Conditions

| Japanese | Romaji | English (Global) | Code Enum | Enum Value |
|----------|--------|------------------|-----------|------------|
| 良 | ryou | Firm* | `GroundCondition.Good` | 1 |
| 稍重 | yaya-omo | Good* | `GroundCondition.Yielding` | 2 |
| 重 | omo | Soft | `GroundCondition.Soft` | 3 |
| 不良 | furyou | Heavy | `GroundCondition.Heavy` | 4 |

**Location**: `uma-skill-tools/RaceParameters.ts:2`

**⚠️ CRITICAL NAMING CONFUSION**:
- Code uses `GroundCondition.Good` but this maps to 良 (firm/best conditions)
- In Global UI, 良 = "Firm", 稍重 = "Good"
- When reading JP documentation that says "良", code uses `GroundCondition.Good`
- This is a legacy naming issue; the enum name doesn't match Global UI terminology

---

## Weather Conditions

| Japanese | Romaji | English (Global) | Code Enum | Enum Value |
|----------|--------|------------------|-----------|------------|
| 晴れ | hare | Sunny | `Weather.Sunny` | 1 |
| 曇り | kumori | Cloudy | `Weather.Cloudy` | 2 |
| 雨 | ame | Rainy | `Weather.Rainy` | 3 |
| 雪 | yuki | Snowy | `Weather.Snowy` | 4 |

**Location**: `uma-skill-tools/RaceParameters.ts:3`

---

## Seasons

| Japanese | Romaji | English | Code Enum | Enum Value |
|----------|--------|---------|-----------|------------|
| 春 | haru | Spring | `Season.Spring` | 1 |
| 夏 | natsu | Summer | `Season.Summer` | 2 |
| 秋 | aki | Autumn | `Season.Autumn` | 3 |
| 冬 | fuyu | Winter | `Season.Winter` | 4 |
| 桜花賞 | oukashow | Sakura (special) | `Season.Sakura` | 5 |

**Location**: `uma-skill-tools/RaceParameters.ts:4`

---

## Time of Day

| Japanese | Romaji | English | Code Enum | Enum Value |
|----------|--------|---------|-----------|------------|
| (なし) | - | No Time | `Time.NoTime` | 0 |
| 朝 | asa | Morning | `Time.Morning` | 1 |
| 昼 | hiru | Midday | `Time.Midday` | 2 |
| 夕 | yuu | Evening | `Time.Evening` | 3 |
| 夜 | yoru | Night | `Time.Night` | 4 |

**Location**: `uma-skill-tools/RaceParameters.ts:5`

---

## Race Grades

| Japanese | English | Code Enum | Enum Value |
|----------|---------|-----------|------------|
| G1 | G1 | `Grade.G1` | 100 |
| G2 | G2 | `Grade.G2` | 200 |
| G3 | G3 | `Grade.G3` | 300 |
| オープン | Open | `Grade.OP` | 400 |
| Pre-Open | Pre-Open | `Grade.PreOP` | 700 |
| 未勝利 | Maiden | `Grade.Maiden` | 800 |
| 新馬 | Debut | `Grade.Debut` | 900 |
| デイリー | Daily | `Grade.Daily` | 999 |

**Location**: `uma-skill-tools/RaceParameters.ts:6`

---

## Distance Measurement

| Japanese | Romaji | English (Global) | Conversion |
|----------|--------|------------------|------------|
| バ身 | bashin | Horse Length(s) | 1 bashin = 2.5 meters |

**Usage in code**: All distance/position measurements in simulation use this unit internally

**Note**: Real horse racing typically uses 2.4m per horse length, but Uma Musume uses 2.5m (explained in lore as "arm span of three horsegirl goddesses")

---

## Phase System

| Phase | Japanese | Description | Code Value |
|-------|----------|-------------|------------|
| 0 | 出走 | Start/Gate | `Phase.Start` |
| 1 | 序盤 | Early Race | `Phase.Early` |
| 2 | 終盤 | Final Stretch | `Phase.Final` |

**Note**: Phase 2 triggers "last spurt" (ラストスパート) calculations

---

## Skill Condition Terminology

Common terms in skill activation conditions:

| Japanese | Romaji | English Meaning |
|----------|--------|-----------------|
| phase | - | Race phase (0=start, 1=early, 2=final) |
| running_style | - | Strategy/running style |
| is_lastspurt | - | In final sprint phase |
| corner | - | Corner/turn section |
| straight | - | Straight section |
| slope | - | Hill/slope section |
| random | - | Random activation type |
| accumulatetime | - | Time elapsed condition |
| order | - | Position in race order |
| order_rate | - | Percentile position |

---

## File Organization for Global vs JP

### umalator-global Directory

- **Purpose**: Global version build with English data
- **Key files**:
  - `skill_data.json` - English skill names/conditions
  - `skillnames.json` - English skill translations
  - `course_data.json` - Course definitions
  - `umas.json` - Character data (English names)
  - `tracknames.json` - Race track English names
- **Build**: Uses `build.mjs` with `CC_GLOBAL: 'true'` flag
- **Data generation**: `make_global_*.pl` scripts generate English data from master.mdb

### uma-skill-tools Directory

- **Purpose**: Core simulation library (language-agnostic)
- **Data location**: `uma-skill-tools/data/` (typically JP data)
- **Build**: Uses `ts-node` for CLI tools

### Build Flag Behavior

The `CC_GLOBAL` constant (set by esbuild) controls:
- Which translation strings to use
- Which preset race events to show
- Defaults to `false` for Node.js environments, `true`/`false` for browser builds

**Location**: Check build scripts (`.mjs` files) for `define: {CC_GLOBAL: '...'}`

---

## Common Development Patterns

### Finding Course IDs
```bash
# JP version
cat uma-skill-tools/data/course_data.json | grep -i "tokyo"

# Global version
cat umalator-global/course_data.json | grep -i "tokyo"
```

### Finding Skill IDs
```bash
cd uma-skill-tools
ts-node tools/skillgrep.ts -d "skill name"  # -d flag shows IDs
```

### Testing a Skill's バ身 Gain
```bash
cd uma-skill-tools
ts-node tools/gain.ts -c 10006 -m 2 -g good -s 200041 --nsamples 500
# -c: course ID
# -m: mood (2 = 絶好調/Great)
# -g: ground (good = 良/Firm)
# -s: skill ID
# --nsamples: number of simulations
```

---

## References (Web Search Sources)

- [GameTora Race Mechanics Handbook](https://gametora.com/umamusume/race-mechanics)
- [GameTora Skill List](https://gametora.com/umamusume/skills)
- [Game8 Aptitude Guide](https://game8.co/games/Umamusume-Pretty-Derby/archives/537119)
- [UmaTL English Translation Repository](https://github.com/UmaTL/hachimi-tl-en)
- [Steam Community Discussions](https://steamcommunity.com/app/3224770/discussions/)
- [DTG Umamusume Global vs Japan Differences Guide](https://www.dtgre.com/2025/07/umamusume-global-vs-japan-differences-guide.html)
