# Umalator Global

**Uma Musume: Pretty Derby** race simulator with English localization for the Global release.

This is the Global version of the race simulator that uses English translations for skills, characters, and UI elements. It shares the same core simulation engine ([uma-skill-tools](../uma-skill-tools/)) as the Japanese version but uses English game data.

## Quick Start

### Development Server

```bash
node build.mjs --serve        # Starts dev server on http://localhost:8000
node build.mjs --serve 3000   # Custom port
```

The dev server automatically rebuilds when you make changes to source files.

**Access the app at**: `http://localhost:8000/umalator-global/`

The server serves files from the project root, which includes shared assets (`icons/`, `fonts/`) and all applications. The URL path rewriter automatically handles the `/uma-tools/` prefix used in production.

### Production Build

```bash
node build.mjs                # Creates minified bundle.js, bundle.css, simulator.worker.js
```

### Debug Build

```bash
node build.mjs --debug        # Creates unminified build with console.assert enabled
```

## Features

- **Race Simulation**: Simulate Uma Musume races with customizable parameters
- **Skill Analysis**: Visualize skill activation regions and measure performance gain in horse lengths (bashin/バ身)
- **Interactive UI**: Configure horse stats, skills, race conditions, and view real-time charts
- **Uma Card Export/Import**: Save and share horse builds as PNG images with embedded JSON data
- **OCR Screenshot Import**: Extract horse stats and skills from in-game screenshots using Google Gemini AI
- **Web Worker Support**: Parallel race simulations for faster results
- **English Localization**: All game data translated to English

## What Makes This "Global"?

This build differs from the JP version ([umalator](../umalator/)) in several ways:

1. **English game data**: Uses English skill names, character names, and UI text
2. **Build flag**: Compiled with `CC_GLOBAL: 'true'` which enables English strings and Global-specific presets
3. **Local data files**: Contains its own `skill_data.json`, `skillnames.json`, `course_data.json`, etc. with English translations
4. **Ground condition terminology**: Uses "Firm/Good/Soft/Heavy" instead of Japanese 良/稍重/重/不良

## File Structure

```
umalator-global/
├── build.mjs                    # Build script with esbuild
├── index.html                   # Entry HTML file
├── bundle.js                    # Generated: Main application bundle
├── bundle.css                   # Generated: Compiled styles
├── simulator.worker.js          # Generated: Web worker for parallel simulation
├── skill_data.json              # English skill definitions
├── skillnames.json              # English skill name translations
├── skill_meta.json              # Skill metadata (rarities, icons)
├── course_data.json             # Race course definitions
├── umas.json                    # Character data with English names
├── tracknames.json              # Race track English names
├── courseeventparams/           # Course event parameter files
├── make_global_*.pl             # Data generation scripts
└── update.bat                   # Windows batch script to regenerate all data
```

## Updating Game Data

When the game updates with new skills, characters, or courses, regenerate the data files:

### Windows

```batch
update.bat [path-to-master.mdb]
```

If no path is provided, defaults to: `%APPDATA%\..\LocalLow\Cygames\Umamusume\master\master.mdb`

### Manual Update (Linux/Mac)

```bash
# Extract master.mdb from your game installation
MASTER_MDB="/path/to/master.mdb"

# Generate English game data
perl make_global_skill_data.pl $MASTER_MDB > skill_data.json
perl make_global_skillnames.pl $MASTER_MDB > skillnames.json
perl make_global_skill_meta.pl $MASTER_MDB > skill_meta.json
perl make_global_uma_info.pl $MASTER_MDB

# Generate course data (requires courseeventparams directory)
perl make_global_course_data.pl $MASTER_MDB courseeventparams > course_data.json

# Rebuild the application
node build.mjs
```

**Requirements**: Perl with `DBI` and `DBD::SQLite` modules installed

## Source Code

The application source is located in [../umalator/](../umalator/) and [../components/](../components/):

**Umalator Core:**
- `app.tsx`: Main application component with UI and state management
- `simulator.worker.ts`: Web worker for parallel race simulation
- `BasinnChart.tsx`: Chart visualization for race performance
- `IntroText.tsx`: Introduction/help text
- `compare.ts`: Race comparison utilities

**Shared Components:**
- `HorseDef.tsx`: Horse configuration UI with save/load functionality
- `HorseDefTypes.ts`: HorseState data structure definition
- `UmaCard.ts`: PNG export/import with embedded JSON (Uma Card feature)
- `OCRModal.tsx`: Screenshot import modal UI
- `GeminiOCR.ts`: Google Gemini AI integration for OCR
- `SkillList.tsx`, `RaceTrack.tsx`, `Dropdown.tsx`: UI components

This directory only contains the build configuration and English data files. All TypeScript source code is shared with the JP version.

## Build System

Uses **esbuild** via `build.mjs` with custom plugins:

- **redirectData**: Redirects imports to local English data files instead of `../uma-skill-tools/data/`
- **mockAssert**: Replaces Node.js `assert` module for browser compatibility
- **redirectTable**: Redirects vendor dependencies
- **seedrandomPlugin**: Provides browser-compatible PRNG implementation

The build compiles `../umalator/app.tsx` with `CC_GLOBAL: 'true'` to enable English UI strings.

## Race Parameters

Configure races with these parameters:

- **Horse Stats**: Speed, Stamina, Power, Guts, Wit (0-2000+)
- **Aptitudes**: S/A/B/C/D/E/F/G for Distance, Surface, Running Style
- **Running Style**: Front (逃げ), Stalker (先行), Late (差し), End (追込)
- **Mood**: Great/Good/Normal/Bad/Terrible (+2 to -2)
- **Ground Condition**: Firm/Good/Soft/Heavy
- **Weather**: Sunny/Cloudy/Rainy/Snowy
- **Season**: Spring/Summer/Autumn/Winter
- **Time of Day**: Morning/Midday/Evening/Night

See [../.claude/JP-GLOBAL-TERMINOLOGY.md](../.claude/JP-GLOBAL-TERMINOLOGY.md) for detailed terminology mappings.

## Skill Analysis

The simulator measures skill effectiveness in **horse lengths** (bashin/バ身):
- 1 horse length = 2.5 meters
- Reports min/max/mean/median distance gain
- Visualizes skill activation regions on course map
- Compares races with/without skills

## Save/Load Uma Builds

### Uma Card (PNG Export/Import)

Uma Cards are PNG images with embedded JSON data, similar to SillyTavern character cards. They combine a character portrait with the horse's complete build data.

**Exporting Uma Cards:**
1. Configure your horse (stats, skills, aptitudes, etc.)
2. Click the "Save" button dropdown
3. Select "Uma Card (PNG)"
4. Downloads a PNG with the selected character's portrait and embedded build data

**Importing Uma Cards:**
1. Click the "Load" button dropdown
2. Select "JSON/PNG" to open file picker
3. Choose a `.png` Uma Card file
4. Uma build automatically loads with all stats and skills

**Technical Details:**
- Uses PNG tEXt metadata chunks with keyword "UmaCard"
- Character portraits from `/icons/chara/trained_chr_icon_{uid}_{outfitId}_02.png`
- JSON data includes version number for future compatibility
- Can be shared directly - image viewers display the portrait, simulator reads the build data

### JSON Export/Import

Traditional JSON export is also available for text-based sharing and version control:
- **Export**: Save dropdown → "JSON File"
- **Import**: Load dropdown → "JSON/PNG" → select `.json` file

### OCR Screenshot Import

Extract horse data directly from in-game screenshots using AI:
1. Click "Load" → "OCR Screenshot"
2. Enter your Google Gemini API key (get free key from [Google AI Studio](https://aistudio.google.com/app/apikey))
3. Upload, drag & drop, or paste a screenshot
4. Review and edit extracted data (stats, aptitudes, strategy, skills)
5. Click "Confirm & Load" to apply

**Supports:**
- Stats extraction (Speed, Stamina, Power, Guts, Wisdom)
- Aptitude detection (Surface, Distance, Running Style)
- Skill recognition with Japanese/English name matching

## Updating Race Event Presets

The preset dropdown in the UI is hardcoded in the source file `../umalator/app.tsx` (lines 54-84). To add new Champions Meeting (CM) or League of Heroes (LOH) race events:

### 1. Find the Course ID

Look up the course in `course_data.json`:

```bash
# Example: Find Tokyo 1600m course
jq 'to_entries | .[] | select(.value.raceTrackId == 10006 and .value.distance == 1600) | .key' course_data.json
# Returns: "10602"
```

Track IDs are in `tracknames.json`:
- `10006` = Tokyo
- `10008` = Kyoto
- `10005` = Nakayama
- `10009` = Hanshin
- etc.

### 2. Edit the Presets Array

Edit `../umalator/app.tsx` around line 56-67. Add entries to the `CC_GLOBAL ? [...]` array for Global presets:

```typescript
const presets = (CC_GLOBAL ? [
  // New preset - add at top for most recent events
  {type: EventType.CM, date: '2025-12', courseId: 10905, season: Season.Winter, ground: GroundCondition.Good, weather: Weather.Sunny, time: Time.Midday},

  // Existing presets...
  {type: EventType.CM, date: '2025-10', courseId: 10602, season: Season.Summer, ground: GroundCondition.Good, weather: Weather.Sunny, time: Time.Midday},
  {type: EventType.CM, date: '2025-09', courseId: 10811, season: Season.Spring, ground: GroundCondition.Good, weather: Weather.Sunny, time: Time.Midday},
] : [ /* JP presets */ ])
```

### 3. Preset Configuration

Each preset requires:

- **type**: `EventType.CM` (Champions Meeting) or `EventType.LOH` (League of Heroes)
- **date**: `'YYYY-MM'` or `'YYYY-MM-DD'` format
- **courseId**: Course ID from `course_data.json` (e.g., `10602` for Tokyo 1600m)
- **season**: `Season.Spring|Summer|Autumn|Winter`
- **ground**: `GroundCondition.Good` (Firm), `Yielding` (Good), `Soft`, or `Heavy`
  - **Note**: LOH events ignore ground/weather (always use defaults)
- **weather**: `Weather.Sunny|Cloudy|Rainy|Snowy`
- **time**: `Time.Morning|Midday|Evening|Night`

### 4. Event Type Differences

**Champions Meeting (CM):**
- Uses specified ground and weather conditions
- Typically reflects announced race conditions

**League of Heroes (LOH):**
- Always uses `GroundCondition.Good` (Firm) and `Weather.Sunny`
- Ground/weather params ignored (see line 74-75)

### 5. Rebuild

After editing, rebuild the application:

```bash
node build.mjs
```

### 6. How Presets Work

- Presets are **sorted by date** (newest first, line 81)
- Default preset is auto-selected based on current date (line 83)
- Dropdown displays as `YYYY-MM CM` or `YYYY-MM LOH` (line 1206)

### Example: Adding December 2025 Capricorn Cup

```typescript
// Add to CC_GLOBAL array in app.tsx
{type: EventType.CM, date: '2025-12-15', courseId: 10905, season: Season.Winter, ground: GroundCondition.Soft, weather: Weather.Cloudy, time: Time.Midday}
```

This would appear as `2025-12 CM` in the dropdown.

## Technology Stack

- **TypeScript**: Type-safe application code
- **Preact**: Lightweight React alternative for UI
- **D3.js**: Data visualization and charts
- **Immutable.js**: Immutable state management
- **esbuild**: Fast bundling and compilation
- **Web Workers**: Parallel simulation processing

## Development Tips

1. **Hot reload**: Use `--serve` mode for live development
2. **Debugging**: Use `--debug` to enable console.assert and readable output
3. **Data updates**: Run `update.bat` (Windows) or manual Perl scripts after game updates
4. **Port conflicts**: Specify custom port with `--serve PORT`
5. **Build artifacts**: `.js` and `.css` files are gitignored; rebuild after pulling changes
6. **Dev server path handling**: The dev server automatically strips `/uma-tools/` prefix from asset requests. Access app at `http://localhost:8000/umalator-global/`, not just `http://localhost:8000/`

## Related Projects

- [uma-skill-tools](../uma-skill-tools/): Core race simulation library
- [umalator](../umalator/): Japanese version of the simulator
- [skill-visualizer](../skill-visualizer/): Standalone skill visualization tool
- [build-planner](../build-planner/): Skill build planning interface

## Credits

- English skill names from [GameTora](https://gametora.com/umamusume)
- Game data extracted from Uma Musume: Pretty Derby (Cygames)
- Race simulation engine by pecan

## License

GPL-3.0-or-later (see [LICENSE](../uma-skill-tools/LICENSE))
