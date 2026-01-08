# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a collection of tools and web applications for ウマ娘 プリティーダービー (Uma Musume Pretty Derby), a Japanese horse racing game. The project includes:

- **uma-skill-tools**: Core TypeScript library for race simulation and skill analysis
- **umalator**: Web-based race simulator with visualization (JP version)
- **umalator-global**: Global/English version of the race simulator
- **skill-visualizer**: Tool to visualize skill activation regions on racecourses
- **build-planner**: Skill build planning interface
- Additional utilities: umadle, rougelike, courseimages

## Development Commands

### Building Frontend Applications

Each frontend application (umalator, skill-visualizer, build-planner, etc.) has its own build process:

```bash
# Build individual applications
cd umalator && node build.mjs
cd umalator-global && node build.mjs
cd skill-visualizer && npm run build  # or use build.bat on Windows
cd build-planner && npm run build     # or use build.bat on Windows
```

Note: Build scripts are often `.bat` files or `.mjs` scripts. Check the directory for `build.bat` or `build.mjs`.

### umalator-global Development Server

```bash
cd umalator-global
node build.mjs --serve        # Dev server on http://localhost:8000
node build.mjs --serve 3000   # Custom port
node build.mjs --debug        # Debug build (unminified, with asserts)
```

**Access URL**: `http://localhost:8000/umalator-global/` (not just `/`)

The dev server:
- Serves files from project root (includes shared `icons/`, `fonts/`)
- Auto-rebuilds on source changes
- Strips `/uma-tools/` prefix from asset requests (production path rewriting)

### Working with uma-skill-tools

The core simulation library is in `uma-skill-tools/`. This uses TypeScript and is run via `ts-node`:

```bash
cd uma-skill-tools

# Run CLI tools (from tools/ directory)
ts-node tools/skillgrep.ts [options]    # Search skills by name or condition
ts-node tools/gain.ts [options]         # Calculate skill バ身 gain
ts-node tools/dump.ts [options]         # Dump race simulation data
ts-node tools/compare.ts [options]      # Compare two uma configurations
ts-node tools/speedguts.ts [options]    # Analyze speed/guts combinations

# Run tests
npm test  # Uses tape test framework
```

### Testing

```bash
cd uma-skill-tools
npm test  # Runs tape tests in test/ directory
```

There's also a benchmark: `ts-node test/bench/bench.ts`

### Python Visualization Tools

Some tools require Python 3 and matplotlib:

```bash
# Visualize race data (pipe dump.ts output into this)
ts-node tools/dump.ts [options] | python tools/plot.py [options]

# Show histogram of バ身 gain
ts-node tools/gain.ts --dump [options] | python tools/histogram.py [options]

# Visualize speed/guts analysis
ts-node tools/speedguts.ts [options] | python tools/speedguts_colormesh.py
```

## Architecture

### uma-skill-tools Core Components

**Race Simulation Pipeline:**
1. **RaceSolver.ts**: Numerically integrates position and velocity over the race course. The core physics simulation.
2. **ConditionParser.ts & ActivationConditions.ts**: Parse skill conditions from game data into activation regions and dynamic conditions.
3. **ActivationSamplePolicy.ts**: Samples activation regions to determine where skills actually trigger (handles randomness).
4. **RaceSolverBuilder.ts**: Orchestrates building a configured race solver with skills and conditions.

**Key Concepts:**
- **Static conditions/triggers**: Regions on the track where a skill *can* activate
- **Dynamic conditions**: Boolean functions based on race state that determine if a skill *will* activate
- **Sample policies**: Control how random/conditional skills are modeled (immediate, random, distribution-based)

Skills are defined by:
- Activation conditions (e.g., `phase==2&running_style==3`)
- Sample policy (immediate, random, or distribution-based)
- Effect duration and magnitude

### Frontend Applications

All frontend apps use:
- **Preact** (React alternative) with JSX via `jsxFactory: "h"`
- **D3.js** for charts and visualizations
- **Immutable.js** for state management
- **esbuild** for bundling (configured in build scripts)

TypeScript config uses `"moduleResolution": "bundler"` and targets ES2018.

**Application Structure:**
- `umalator/`: Main race simulator source code (shared by JP and Global builds)
- `umalator-global/`: Global version build config and English data files
- `skill-visualizer/`: Visualizes where skills activate on a course (using `RegionList` from uma-skill-tools)
- `build-planner/`: UI for planning skill builds
- `components/`: Shared UI components (HorseDef, SkillList, RaceTrack, etc.)

**Key Shared Components:**
- `HorseDef.tsx`: Horse configuration UI with save/load functionality (dropdowns for JSON/PNG/OCR)
- `HorseDefTypes.ts`: HorseState Record class (Immutable.js) with regional default stats
- `UmaCard.ts`: Uma Card feature - PNG export/import with embedded JSON metadata (similar to SillyTavern character cards)
- `OCRModal.tsx` + `GeminiOCR.ts`: Screenshot import using Google Gemini AI for OCR
- `Dropdown.tsx`: Reusable dropdown menu component

### Horse Data Save/Load

**JSON Export/Import:**
- Uses `horseStateToJson()` to serialize HorseState to plain object
- Skills exported as array of skill IDs (not key-value pairs from Immutable Map)
- Includes all stats, aptitudes, strategy, mood, skills, and forced skill positions

**Uma Card (PNG Export/Import):**
- Embeds JSON data in PNG tEXt metadata chunks with keyword "UmaCard"
- Fetches character portrait from `/icons/chara/trained_chr_icon_{uid}_{outfitId}_02.png`
- PNG remains viewable in any image viewer while carrying build data
- Compatible with sharing platforms - users can share horse builds as images
- Extraction reads PNG chunks, parses JSON, validates and loads into HorseState

**OCR Screenshot Import:**
- Uses Google Gemini AI to extract horse data from screenshots
- Supports drag & drop, paste, or file upload
- Review screen allows editing extracted data before loading (aptitudes, strategy as dropdowns)
- API key stored in localStorage (optional)

### umalator vs umalator-global

Both share the same source code (`umalator/app.tsx`, etc.) but differ in:
- **Build flag**: `CC_GLOBAL: 'true'` vs `'false'` (set by esbuild)
- **Data files**: Global uses English data in `umalator-global/*.json`
- **Presets**: Different Champions Meeting/LOH event presets per region

The `CC_GLOBAL` flag controls UI strings (e.g., "Firm/Good/Soft/Heavy" vs "良/稍重/重/不良") and which race presets are shown.

**See [.claude/UMALATOR-GLOBAL-MAPPING.md](.claude/UMALATOR-GLOBAL-MAPPING.md)** for detailed file mapping, build process comparison, and data redirect plugin documentation.

### Data Files

- `uma-skill-tools/data/skill_data.json`: Game skill definitions
- `uma-skill-tools/data/skillnames.json`: Skill name translations
- `uma-skill-tools/data/course_data.json`: Race course definitions
- `skill_meta.json`: Metadata about skills (root directory)
- `umas.json`: Uma character data (root directory)
- `icons.json`: Icon mappings (root directory)

Uma definition files (e.g., `uma-skill-tools/tools/nige.json`, `senkou.json`, `sasi.json`, `oikomi.json`) define horse parameters for different racing strategies.

### Data Generation Scripts

Perl scripts for extracting game data:
- `make_skill_data.pl`: Generates skill_data.json from master.mdb
- `make_skillnames.pl`: Generates skillnames.json
- `make_course_data.pl`: Generates course_data.json
- Root directory scripts: `make_skill_meta.pl`, `make_uma_info.pl`, `extract_resource.pl`

For Global version, use scripts in `umalator-global/`:
- `make_global_skill_data.pl`, `make_global_skillnames.pl`, etc.
- Windows: Run `update.bat [path-to-master.mdb]`

## Adding Race Event Presets

Race presets (Champions Meeting, League of Heroes) are in `umalator/app.tsx` lines 56-67.

### Finding Course IDs

```bash
# Find course ID by track and distance
jq 'to_entries | .[] | select(.value.raceTrackId == 10008 and .value.distance == 3000) | .key' umalator-global/course_data.json
# Returns: "10810" (Kyoto 3000m)
```

Track IDs (in `tracknames.json`): Tokyo=10006, Kyoto=10008, Nakayama=10005, Hanshin=10009

### Adding a Preset

Edit the `CC_GLOBAL ? [...]` array in `umalator/app.tsx`:

```typescript
// Example: CM 8 - Sagittarius Cup (added January 2026)
{id: 8, type: EventType.CM, name: 'Sagittarius Cup', date: '2026-01-22', courseId: 10506, season: Season.Winter, ground: GroundCondition.Good, weather: Weather.Sunny, time: Time.Midday}
```

Parameters:
- **id**: Unique numeric identifier for the preset (optional but recommended)
- **type**: `EventType.CM` or `EventType.LOH`
- **name**: Display name for the preset (required for Global with id)
- **date**: `'YYYY-MM'` or `'YYYY-MM-DD'`
- **courseId**: From `course_data.json` (e.g., 10506 = Nakayama 2500m inner)
- **season**: `Season.Spring|Summer|Autumn|Winter`
- **ground**: `GroundCondition.Good` (=Firm), `Yielding` (=Good), `Soft`, `Heavy`
- **weather**: `Weather.Sunny|Cloudy|Rainy|Snowy`
- **time**: `Time.Morning|Midday|Evening|Night`

**Note**: LOH events ignore ground/weather (always Firm/Sunny). Presets auto-sort by date.

## Simulation Limitations

The simulator intentionally only simulates one uma (not a full race with competitors) to isolate skill effects in a controlled environment. This affects:

- **Position keep**: Not fully simulated (except pace down for non-runners)
- **Order conditions**: Assumed always fulfilled by default
- **Lane differences**: Inner/outer lane distance differences not modeled
- **Skills with `accumulatetime` + probability distributions**: May activate earlier than expected

## Important Notes

- Course IDs: `uma-skill-tools/data/course_data.json` (JP) or `umalator-global/course_data.json` (Global)
- Skill IDs can be found using `skillgrep.ts -d` or from GameTora (with "Show skill IDs" enabled)
- The project uses "バ身" (bashin/horse lengths, 1 = 2.5m) as the unit for measuring distance gain
- Frontend apps use `CC_GLOBAL` flag (esbuild define) to toggle JP/Global variants
- Shared assets (`icons/`, `fonts/`) are at project root, referenced as `/uma-tools/` in production

## Japanese-to-English Terminology

**See [.claude/HORSE-DEFINITION-FLOW.md](.claude/HORSE-DEFINITION-FLOW.md)** for horse data flow documentation - how `HorseState` (UI) converts to `HorseParameters` (simulation), default stats by region, and character data structure.

**See [.claude/JP-GLOBAL-TERMINOLOGY.md](.claude/JP-GLOBAL-TERMINOLOGY.md)** for comprehensive mappings between Japanese and Global English terminology. This reference includes:

- Running styles (逃げ/Nige → Front, 先行/Senkou → Stalker, etc.)
- Stats, mood conditions, ground conditions, weather, seasons
- Code enum values and their locations
- Critical naming warnings (e.g., `GroundCondition.Good` = 良/Firm, not "Good")
- Global vs JP file organization (`umalator-global/` vs `uma-skill-tools/data/`)

Essential for working with skill conditions, race parameters, and understanding the codebase terminology.
