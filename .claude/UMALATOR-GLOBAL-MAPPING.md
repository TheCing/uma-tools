# Umalator ↔ Umalator-Global File Mapping

This document maps the relationship between `/umalator` (JP) and `/umalator-global` (Global/English) builds.

---

## Quick Reference

| Category | umalator (JP) | umalator-global |
|----------|---------------|-----------------|
| Source code | ✅ Original | ❌ References JP |
| Build config | `build.mjs` (simple) | `build.mjs` (extended + dev server) |
| Data files | Uses `uma-skill-tools/data/` | Has own `*.json` files |
| Build flag | `CC_GLOBAL: 'false'` | `CC_GLOBAL: 'true'` |
| Dev server | ❌ None | ✅ `--serve` option |

---

## File Categories

### 🔵 Shared Source Files (from /umalator)

These files are **used by both builds**. The Global build references them via `../umalator/`:

```
umalator/
├── app.tsx                 # Main application (entry point for both builds)
├── app.css                 # Main styles
├── simulator.worker.ts     # Web worker for parallel simulation
├── BasinnChart.tsx         # Performance chart component
├── BasinnChart.css
├── IntroText.tsx           # Help/intro text component
├── IntroText.css
├── compare.ts              # Race comparison utilities
└── telemetry.ts            # Analytics/telemetry
```

**How it works**: The Global `build.mjs` uses:
```javascript
entryPoints: [{in: '../umalator/app.tsx', out: 'bundle'}, '../umalator/simulator.worker.ts']
```

### 🟢 Global-Only Files (in /umalator-global)

These files are **unique to umalator-global**:

#### Build & Configuration
```
umalator-global/
├── build.mjs               # Extended build script with:
│                           #   - Dev server (--serve)
│                           #   - Data redirect plugin
│                           #   - seedrandom polyfill
│                           #   - Path rewriting for /uma-tools/
├── index.html              # Slightly different title
└── (update.bat removed: data refresh is tools/ingest-master-mdb.mjs)
```

#### English Data Files (replace JP data)
```
umalator-global/
├── skill_data.json         # English skill definitions
├── skillnames.json         # English skill name translations
├── skill_meta.json         # Skill metadata (icons, rarities)
├── course_data.json        # Course definitions (same structure, different IDs possible)
├── tracknames.json         # English track names
├── umas.json               # Character data with English names
└── courseeventparams/      # Course event parameter files (112 files)
```

#### Data Generation Scripts
```
umalator-global/
├── make_global_skill_data.pl
├── make_global_skillnames.pl
├── make_global_skill_meta.pl
├── make_global_course_data.pl
├── make_global_uma_info.pl
├── convert_old_course_data.pl
└── old_course_data.json    # Legacy data for conversion
```

#### Generated Build Artifacts
```
umalator-global/
├── bundle.js               # Compiled application
├── bundle.css              # Compiled styles
└── simulator.worker.js     # Compiled web worker
```

---

## Build Process Comparison

### JP Build (`umalator/build.mjs`)

```
Entry Points:
  ./app.tsx → bundle.js
  ./simulator.worker.ts → simulator.worker.js

Plugins:
  1. mockAssert      - Replaces node:assert for browser
  2. redirectTable   - Redirects @tanstack/* to vendor/

Defines:
  CC_GLOBAL: 'false'
  CC_DEBUG: 'false'|'true'

Data Sources:
  ../uma-skill-tools/data/skill_data.json
  ../uma-skill-tools/data/skillnames.json
  ../skill_meta.json
  ../umas.json
```

### Global Build (`umalator-global/build.mjs`)

```
Entry Points:
  ../umalator/app.tsx → bundle.js          ← References JP source!
  ../umalator/simulator.worker.ts → simulator.worker.js

Plugins:
  1. redirectData    - ⭐ Redirects data imports to local files
  2. mockAssert      - Same as JP
  3. redirectTable   - Same as JP
  4. seedrandomPlugin - ⭐ Provides seedrandom polyfill

Defines:
  CC_GLOBAL: 'true'                        ← Key difference!
  CC_DEBUG: 'false'|'true'

Data Sources (via redirectData plugin):
  ./skill_data.json      (instead of ../uma-skill-tools/data/)
  ./skillnames.json      (instead of ../uma-skill-tools/data/)
  ./skill_meta.json      (instead of ../skill_meta.json)
  ./umas.json            (instead of ../umas.json)
```

---

## Data Redirect Plugin Detail

The `redirectData` plugin in Global's `build.mjs` intercepts imports:

```javascript
const redirectData = {
  name: 'redirectData',
  setup(build) {
    // Redirect: ../uma-skill-tools/data/*.json → ./local/*.json
    build.onResolve({filter: /^\.\.?(?:\/uma-skill-tools)?\/data\//}, args => ({
      path: path.join(dirname, args.path.split('/data/')[1])
    }));

    // Redirect: ../skill_meta.json → ./skill_meta.json
    build.onResolve({filter: /skill_meta.json$/}, args => ({
      path: path.join(dirname, 'skill_meta.json')
    }));

    // Redirect: ../umas.json → ./umas.json
    build.onResolve({filter: /umas.json$/}, args => ({
      path: path.join(dirname, 'umas.json')
    }));
  }
};
```

**Import Mappings:**

| Original Import (in app.tsx) | JP Build Resolves To | Global Build Resolves To |
|------------------------------|----------------------|--------------------------|
| `../uma-skill-tools/data/skill_data.json` | `uma-skill-tools/data/skill_data.json` | `umalator-global/skill_data.json` |
| `../uma-skill-tools/data/skillnames.json` | `uma-skill-tools/data/skillnames.json` | `umalator-global/skillnames.json` |
| `../skill_meta.json` | `skill_meta.json` (root) | `umalator-global/skill_meta.json` |
| `../umas.json` | `umas.json` (root) | `umalator-global/umas.json` |

---

## Shared Dependencies (from other directories)

Both builds import from these shared locations:

### /components (Shared UI Components)
```
components/
├── HorseDef.tsx          # Horse definition form
├── HorseDef.css
├── HorseDefTypes.ts      # TypeScript types
├── RaceTrack.tsx         # Race track visualization
├── RaceTrack.css
├── SkillList.tsx         # Skill selection list
├── SkillList.css
├── Language.tsx          # Language selector
├── Language.css
├── Tooltip.tsx           # Tooltip component
├── Tooltip.css
├── autocomplete.jsx      # Autocomplete input
└── icon_types.json       # Icon type mappings
```

### /uma-skill-tools (Core Simulation Library)
```
uma-skill-tools/
├── RaceSolver.ts         # Core physics simulation
├── RaceSolverBuilder.ts  # Race configuration builder
├── CourseData.ts         # Course data structures
├── HorseTypes.ts         # Horse parameter types
├── RaceParameters.ts     # Race condition enums
├── ConditionParser.ts    # Skill condition parser
├── ActivationConditions.ts
├── ActivationSamplePolicy.ts
├── Region.ts             # Track region utilities
├── Random.ts             # PRNG implementation
├── HpPolicy.ts           # HP calculation
├── EnhancedHpPolicy.ts
└── SpurtCalculator.ts    # Final spurt calculations
```

### /strings (Localization)
```
strings/
└── common.ts             # Track name constants (TRACKNAMES_ja, TRACKNAMES_en)
```

### /vendor (Third-party Libraries)
```
vendor/
├── preact-table/         # Table component
└── table-core/           # Table utilities
```

### Root Directory (Shared Assets)
```
/
├── icons/                # Character, skill, status icons
├── fonts/                # Font files
├── icons.json            # Icon metadata
├── courseimages/         # Track images
├── skill_meta.json       # JP skill metadata (JP build only)
└── umas.json             # JP character data (JP build only)
```

---

## CC_GLOBAL Flag Effects

The `CC_GLOBAL` compile-time flag affects runtime behavior in `app.tsx`:

### Race Presets (lines 56-67)
```typescript
const presets = (CC_GLOBAL ? [
  // Global presets (English events)
  {type: EventType.CM, date: '2025-12', courseId: 10810, ...},
  ...
] : [
  // JP presets (Japanese events)
  {type: EventType.LOH, date: '2025-11', courseId: 11502, ...},
  ...
])
```

### Ground Condition Labels (lines 128-147)
```typescript
function GroundSelect(props) {
  if (CC_GLOBAL) {
    return <select>
      <option value="1">Firm</option>    // English
      <option value="2">Good</option>
      ...
    </select>;
  }
  return <select>
    <option value="1">良</option>        // Japanese
    <option value="2">稍重</option>
    ...
  </select>;
}
```

### Icon Paths
Some icons use `/uma-tools/icons/global/` prefix for Global-specific assets.

---

## Development Workflow

### Editing Source Code

1. **Edit files in `/umalator/`** - These are the source of truth
2. **Rebuild Global**: `cd umalator-global && node build.mjs`
3. **Changes apply to both** builds (JP and Global)

### Editing Data Files

1. **Global data**: Edit files directly in `/umalator-global/*.json`
2. **JP data**: Edit files in `/uma-skill-tools/data/` or root
3. **Regenerate from game**: `node tools/ingest-master-mdb.mjs --mdb <path>` (see CLAUDE.md, "Updating Global master.mdb")

### Adding Global-Only Features

If you need Global-specific code:
```typescript
if (CC_GLOBAL) {
  // Global-only code here
}
```

### Testing

```bash
# Test Global build
cd umalator-global
node build.mjs --serve
# Access: http://localhost:8000/umalator-global/

# Test JP build
cd umalator
node build.mjs
# Serve index.html with any static server
```

---

## Common Tasks

| Task | Where to Edit |
|------|---------------|
| Fix UI bug | `/umalator/app.tsx` or `/components/` |
| Add race preset | `/umalator/app.tsx` (presets array) |
| Update English skill names | `/umalator-global/skillnames.json` |
| Update course data | `/umalator-global/course_data.json` |
| Add new component | `/components/` (shared) |
| Modify simulation logic | `/uma-skill-tools/` |
| Change build process | `/umalator-global/build.mjs` |
| Add dev server feature | `/umalator-global/build.mjs` (runServer) |

---

## File Size Comparison

| File | umalator (JP) | umalator-global |
|------|---------------|-----------------|
| bundle.js | 1,399 KB | 816 KB |
| bundle.css | 21 KB | 26 KB |
| simulator.worker.js | 808 KB | 395 KB |
| skill_data.json | ~231 KB (shared) | 90 KB |
| course_data.json | ~50 KB (shared) | 115 KB |

Note: Global builds are smaller because they have fewer skills/courses (Global release is newer).
