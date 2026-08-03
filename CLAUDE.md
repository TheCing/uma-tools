# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Important Guidelines

- **Do not add "Co-Authored-By" trailers to git commits** - Keep commit messages clean without attribution

## Project Overview

**Moomoolator** is a modern Uma Musume race simulator with bilingual JP/EN support, forked from alpha123/umalator and kachi-dev/umalator.

### Live Applications

| Application | URL | Description |
|------------|-----|-------------|
| **V2 simulator (default landing)** | [umalator.app](https://umalator.app/) | V2 modern Global UI — served at the root. Old `/umalator-global/v2` and `/v2` paths 301 here (`_redirects`). |
| **V1 Global simulator** | [/umalator-global](https://umalator.app/umalator-global) | Original Global simulator (English) |
| **JP simulator** | [/umalator](https://umalator.app/umalator) | Bilingual JP simulator |
| **Skill visualizer (v2 — primary)** | [/skill-visualizer](https://umalator.app/skill-visualizer) | Modern Global v2 skill activation visualizer. Rewrite (URL stays) to `/umalator-global/skill-visualizer/v2/` via `_redirects`. |
| **Skill visualizer (JP — legacy)** | [/skill-visualizer-jp](https://umalator.app/skill-visualizer-jp) | Original JP-data visualizer (was at `/skill-visualizer/` before the v2 reshuffle). |
| **Skill visualizer (Global v1 — legacy)** | [/umalator-global/skill-visualizer](https://umalator.app/umalator-global/skill-visualizer) | Original Global-data visualizer; unchanged path. |
| **HP calculator** | [/hp-calculator](https://umalator.app/hp-calculator) | HP survival rate calculator |
| **Mechanics Explorer** | [/mechanics-explorer](https://umalator.app/mechanics-explorer) | Stat → race-mechanics formula explorer (live readout + stat-sweep charts). Rewrite to `/umalator-global/mechanics-explorer/` via `_redirects`. |
| **Events** | [/events](https://umalator.app/events) | Upcoming race tracker with gacha banners |
| **Team Trials planner** | [/team-trials](https://umalator.app/team-trials) | Team Stadium lineup planner (5 teams × 3 runners) |
| **Release timeline** | [/release-timeline](https://umalator.app/release-timeline) | JP support card + uma release timeline browser |
| **Canva guides** | [canva.umalator.app](https://canva.umalator.app/) | Dynamic Canva guide registry by numbered slug (e.g. `/14-yasuda`) on its own subdomain. Routing + registry in `functions/[[catchall]].ts`. |

### Project Structure

```
├── umalator/                    # JP simulator source (v1)
├── umalator-global/             # Global simulator (v1 + v2)
│   ├── v2/                      # V2 modern UI (experimental)
│   │   ├── app-v2.tsx          # Main v2 application
│   │   ├── components/         # V2-specific components
│   │   ├── tour/               # Onboarding tour system
│   │   ├── velocity-overlay.tsx
│   │   ├── results-pane.tsx
│   │   └── vite.config.ts      # V2 uses Vite
│   ├── mechanics-explorer/      # Stat → mechanics formula explorer (standalone sub-app)
│   ├── build.mjs               # Builds both v1 and v2
│   ├── skill_data.json         # English game data
│   └── course_data.json
├── hp-calculator/               # HP calculator tool
├── events/                      # Events page
├── uma-skill-tools/             # Core simulation library
├── tools/                       # Utility scripts
│   └── pull-master-mdb.sh      # Pull latest Global master.mdb from MEGA
├── docs/                        # Documentation and reference data
│   └── master.mdb              # Global master.mdb (source of truth for in-game data)
├── uma-tools-worker/            # Cloudflare Worker for webhooks
├── components/                  # Shared UI components
│   ├── HorseDef.tsx
│   ├── RaceTrack.tsx
│   ├── RacetrackCow.tsx         # Visual cow easter egg
│   └── RacetrackCowMooCoins.tsx # MooCoins wrapper (dev only)
└── skill-visualizer/            # Skill visualization tool
```

## Development Commands

### Building Frontend Applications

**Umalator (v1 + v2):**
```bash
cd umalator-global
node build.mjs              # Build both v1 and v2 (production)
node build.mjs --serve      # Dev server with hot reload
node build.mjs --serve 3000 # Custom port
node build.mjs --debug      # Unminified with assertions
```

**Access URLs:**
- V1: `http://localhost:8000/umalator-global/`
- V2: `http://localhost:8000/umalator-global/v2/`

The dev server:
- Serves files from project root (includes shared `icons/`, `fonts/`)
- Auto-rebuilds on source changes
- Strips `/uma-tools/` prefix from asset requests

**Other Applications:**
```bash
cd hp-calculator && node build.mjs
cd events && node build.mjs
cd skill-visualizer && npm run build  # or build.bat on Windows
cd build-planner && npm run build
```

### V2 Development with Vite

V2 can optionally use Vite for development (faster HMR):

```bash
cd umalator-global/v2
npm run dev    # Vite dev server on http://localhost:5173
npm run build  # Production build
```

**Note**: `build.mjs` is the primary build system. Vite is optional for v2-only development.

### IDE Errors to Ignore

**CC_GLOBAL errors**: The IDE may show errors like `Cannot find name 'CC_GLOBAL'` in `.tsx` files. These are **safe to ignore** - `CC_GLOBAL` is a build-time constant defined by esbuild. The build will succeed despite these IDE warnings.

### Working with uma-skill-tools

The core simulation library is in `uma-skill-tools/`. This uses TypeScript and is run via `ts-node`:

```bash
cd uma-skill-tools

# Run CLI tools
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

Benchmark: `ts-node test/bench/bench.ts`

### Python Visualization Tools

Some tools require Python 3 and matplotlib:

```bash
# Visualize race data
ts-node tools/dump.ts [options] | python tools/plot.py [options]

# Show histogram of バ身 gain
ts-node tools/gain.ts --dump [options] | python tools/histogram.py [options]

# Visualize speed/guts analysis
ts-node tools/speedguts.ts [options] | python tools/speedguts_colormesh.py
```

## Architecture

### uma-skill-tools Core Components

**Race Simulation Pipeline:**
1. **RaceSolver.ts**: Numerically integrates position and velocity over the race course
2. **ConditionParser.ts & ActivationConditions.ts**: Parse skill conditions into activation regions
3. **ActivationSamplePolicy.ts**: Samples activation regions (handles randomness)
4. **RaceSolverBuilder.ts**: Orchestrates building a configured race solver with skills

**Key Concepts:**
- **Static conditions/triggers**: Regions where a skill *can* activate
- **Dynamic conditions**: Boolean functions that determine if a skill *will* activate
- **Sample policies**: Control how random/conditional skills are modeled

Skills are defined by:
- Activation conditions (e.g., `phase==2&running_style==3`)
- Sample policy (immediate, random, or distribution-based)
- Effect duration and magnitude

### Frontend Architecture

All frontend apps use:
- **Preact** (React alternative) with JSX via `jsxFactory: "h"`
- **D3.js** for charts and visualizations
- **Immutable.js** for state management
- **esbuild** for bundling (v1)
- **Vite** for v2 development (optional)

TypeScript config uses `"moduleResolution": "bundler"` and targets ES2018.

### V1 vs V2

**V1 (Classic):**
- Original UI in `umalator/app.tsx`
- Single-page layout with sidebars
- Built with esbuild
- Served at `/umalator-global/`

**V2 (Experimental):**
- Modern redesigned UI in `umalator-global/v2/`
- Component-based architecture
- Mobile-first responsive design
- Guided onboarding tour
- Modal dialogs, feedback drawer, mobile navigation
- Built with esbuild (can use Vite for dev)
- Served at `/umalator-global/v2/`

Both versions:
- Share the same simulation engine (`uma-skill-tools`)
- Share data files (skill_data.json, course_data.json)
- Share core components (`components/`)
- Use `CC_GLOBAL` flag to toggle JP/Global variants

### V2 Component Architecture

**Core Application:**
- `app-v2.tsx` - Main application with state management
- `results-pane.tsx` - Results display and statistics
- `velocity-overlay.tsx` - Track overlay for velocity/HP visualization
- `velocity-chart.tsx` - Standalone velocity chart

**UI Components:**
```
v2/components/
├── Modal.tsx           # Native-feeling modal dialogs
├── Button.tsx          # Styled button component
├── CustomSelect.tsx    # Dropdown select with icons
├── IconSelect.tsx      # Icon-based selector
├── Dropdown.tsx        # Generic dropdown menu
└── Tooltip.tsx         # Tooltip component
```

**Feature Modules:**
```
v2/
├── tour/               # Onboarding tour system
│   ├── TourContext.tsx   # Tour state management
│   ├── TourOverlay.tsx   # Tour UI overlay
│   ├── TourTooltip.tsx   # Tour step tooltips
│   ├── steps.ts          # Tour step definitions
│   └── types.ts          # Tour types
├── feedback-drawer.tsx   # Discord feedback integration
├── mobile-nav.tsx        # Mobile navigation drawer
├── track-select.tsx      # Track/course selector
├── conditions.tsx        # Race conditions panel
├── sim-settings.tsx      # Simulation settings
├── skills.tsx            # Skill selector
├── skill-charts.tsx      # Skill comparison charts
└── uma-panel.tsx         # Uma configuration panel
```

**V2 Features:**
- **Guided Tour**: Multi-step onboarding for new users
- **URL State**: Shareable URLs via Copy Link (hash-based state serialization)
- **Preset URLs**: `?preset=X` parameter for quick race loading
- **Feedback System**: Discord webhook integration for user feedback
- **Mobile Navigation**: Responsive bottom nav for mobile devices
- **Modal Dialogs**: OCR import, feedback, settings in native-feeling modals
- **Velocity Toggles**: Independent velocity/HP line toggles

### Key Shared Components

**Horse Configuration:**
- `HorseDef.tsx`: Horse configuration UI with save/load functionality
- `HorseDefTypes.ts`: HorseState Record class (Immutable.js) with regional defaults
- `UmaCard.ts`: PNG export/import with embedded JSON metadata
- `OCRModal.tsx` + `GeminiOCR.ts`: Screenshot import using Google Gemini AI
- `Dropdown.tsx`: Reusable dropdown menu component

**Race Visualization:**
- `RaceTrack.tsx`: Interactive track visualization with corners, slopes, skill regions
- `RacetrackCow.tsx`: Visual cow easter egg (walks, idles, sleeps)
- `RacetrackCowMooCoins.tsx`: MooCoins investment wrapper (dev branch only)
- `VelocityOverlay.tsx` (v2): SVG overlay for velocity/HP curves

**Skill Management:**
- `SkillList.tsx`: Skill selector with filtering and search
- `SkillIcon.tsx`: Skill icon display
- `SkillBox.tsx`: Skill card component

### Horse Data Save/Load

**JSON Export/Import:**
- Uses `horseStateToJson()` to serialize HorseState
- Skills exported as array of skill IDs
- Includes all stats, aptitudes, strategy, mood, skills, and forced positions

**Uma Card (PNG Export/Import):**
- Embeds JSON data in PNG tEXt metadata chunks with keyword "UmaCard"
- Fetches character portrait from `/icons/chara/trained_chr_icon_{uid}_{outfitId}_02.png`
- PNG remains viewable while carrying build data
- Compatible with sharing platforms
- Extraction reads PNG chunks, parses JSON, validates and loads

**OCR Screenshot Import:**
- Uses Google Gemini AI to extract horse data from screenshots
- Supports drag & drop, paste, or file upload
- Review screen allows editing before loading
- API key stored in localStorage (optional)

### OCR Pipeline (screenshot → uma)

Imports a uma from a game screenshot via Google Gemini. Three consumers share the
flow across two environments:

| Consumer | File | Env | Auth |
|---|---|---|---|
| v2 + v1 web modals | `components/GeminiOCR.ts` (shared lib) | Browser | Proxy (no key) → user-key fallback |
| OCR proxy | `uma-tools-worker/webhook-proxy.js` | Cloudflare Worker | Server `GEMINI_API_KEY` secret |
| Discord bot | `uma-tools-bot/src/gemini-ocr.ts` | Node | Server key |

**SDK + model:** uses the unified **`@google/genai`** SDK against **`gemini-3.5-flash`**
— a GA model with a **free tier** (vision + structured output). Do **not** use
`gemini-flash-latest` (floating alias, no guaranteed free tier). **Model retirements
break OCR with a 404 `NOT_FOUND` "no longer available to new users"** — `gemini-2.0-flash*`
shut down 2026-06-01, and `gemini-2.5-flash` was retired for new users ~2026-06 (that's why
we moved to 3.5-flash on 2026-07-23). Prefer a stable free-tier **Flash** model; avoid the
bleeding-edge one until its free tier is confirmed. The model is a `MODEL` constant in
`components/GeminiOCR.ts` and `uma-tools-bot/src/gemini-ocr.ts` (2 places); the worker is
model-agnostic.

**Structured output:** the call sets `responseMimeType: 'application/json'` +
`responseSchema` (the `OCRHorseData` shape, with `enum`s for aptitude/strategy), so
Gemini returns guaranteed-valid JSON — no markdown-fence stripping needed. The strategy
enum is the four on-screen styles (Nige/Senkou/Sasi/Oikomi); Oonige isn't screenshot-
derivable, so the user sets it manually after import if needed.

**Proxy:** the browser points the SDK at the worker via
`httpOptions.baseUrl = OCR_PROXY_URL + '/gemini'`. The worker's `/gemini/*` route is a
transparent reverse proxy: it forwards `/v1beta/models/<model>:generateContent` to
Google, injecting `env.GEMINI_API_KEY` as `x-goog-api-key` (only inference paths are
allowed; any client-sent key is ignored). Most users never need a key; if the proxy
fails, the client falls back to a user-supplied key (entered in the modal, optionally
saved to `localStorage`). `OCR_PROXY_URL` is provided to the build via the
`CC_OCR_PROXY` esbuild/vite define (from `OCR_PROXY_URL` in `.env.local`). After
deploying the worker, set the secret with `wrangler secret put GEMINI_API_KEY`.

**Abuse protection:** the `/gemini` proxy is gated so only the real apps can spend the
server key. The worker enforces (1) an **Origin allowlist** (`umalator.app`,
`dev.umalator.app`, `localhost`) and (2) a **Cloudflare Turnstile** token — the browser
gets a single-use token from `components/turnstile.ts` (a hidden Managed-mode widget) and
sends it as the `X-Turnstile-Token` header; the worker verifies it via Turnstile
`siteverify` before proxying. No token / failed check → `403` → the client's user-key
fallback. Setup: create a Turnstile widget in the Cloudflare dashboard, put its **sitekey**
in the Pages build env `TURNSTILE_SITEKEY` (public; baked in via `CC_TURNSTILE_SITEKEY`)
and its **secret** in the worker via `wrangler secret put TURNSTILE_SECRET`. The worker
fails closed (`503`) until `TURNSTILE_SECRET` is set. Local dev: Cloudflare's always-pass
test pair (sitekey `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`).

**To change the model:** edit the `MODEL` constant in the two files above (and confirm
the new model has a free tier if you rely on the proxy).

### URL State Features (V2)

**Hash-based State Serialization:**
- Copy Link button generates shareable URLs
- Serializes: course, conditions, samples, uma1, uma2 configurations
- Compressed using LZ-string for shorter URLs
- Example: `https://umalator.app/umalator-global/v2/#H4sIAAAA...`

**Preset Parameter:**
- `?preset=X` parameter for quick race loading
- Example: `https://umalator.app/umalator-global/v2/?preset=8`
- Loads Champions Meeting/LoH event settings
- Takes priority over hash-based state

### umalator vs umalator-global

Both share the same source code (`umalator/app.tsx`, etc.) but differ in:
- **Build flag**: `CC_GLOBAL: 'true'` vs `'false'` (set by esbuild)
- **Data files**: Global uses English data in `umalator-global/*.json`
- **Presets**: Different Champions Meeting/LOH event presets per region

The `CC_GLOBAL` flag controls UI strings (e.g., "Firm/Good/Soft/Heavy" vs "良/稍重/重/不良") and which race presets are shown.

**See [.claude/UMALATOR-GLOBAL-MAPPING.md](.claude/UMALATOR-GLOBAL-MAPPING.md)** for detailed file mapping, build process comparison, and data redirect plugin documentation.

### Data Files

**Game Data:**
- `docs/master.mdb`: Global master.mdb — source of truth for what's in-game on Global (pulled from MEGA)
- `uma-skill-tools/data/skill_data.json`: JP game skill definitions
- `uma-skill-tools/data/skillnames.json`: JP skill name translations
- `uma-skill-tools/data/course_data.json`: JP race course definitions
- `umalator-global/skill_data.json`: Global/English skill definitions
- `umalator-global/skillnames.json`: Global/English skill names
- `umalator-global/course_data.json`: Global/English course data
- `umalator-global/not-in-game.json`: Auto-generated list of fast-forwarded skills/outfits (built from master.mdb diff)

**Metadata:**
- `skill_meta.json`: Metadata about skills (root directory)
- `umas.json`: Uma character data (root directory)
- `icons.json`: Icon mappings (root directory)

**Uma Presets:**
- `uma-skill-tools/tools/nige.json`, `senkou.json`, `sasi.json`, `oikomi.json`: Default horse parameters for different racing strategies

### Data Generation Scripts

**JP Version (Perl scripts):**
- `make_skill_data.pl`: Generates skill_data.json from master.mdb
- `make_skillnames.pl`: Generates skillnames.json
- `make_course_data.pl`: Generates course_data.json
- Root directory: `make_skill_meta.pl`, `make_uma_info.pl`, `extract_resource.pl`

**Global Version:**
```bash
cd umalator-global

# Windows
update.bat [path-to-master.mdb]

# Linux/Mac
perl make_global_skillnames.pl /path/to/master.mdb > skillnames.json
perl make_global_course_data.pl /path/to/master.mdb courseeventparams > course_data.json
```

Requires Perl with `DBI` and `DBD::SQLite` modules.

⚠️ **There is no `make_global_skill_data.pl`** — it does not exist in this repo or upstream.
The JP `uma-skill-tools/tools/make_skill_data.pl` does run against the Global mdb, but it
predates the current schema: it emits only `modifier`/`target`/`type` per effect, so its
output **drops `scaling`** (which `RaceSolverBuilder.ts` reads), plus `wisdomCheck` and
`tags`. Don't regenerate `skill_data.json` with it. See "Keeping skill_data.json in sync"
below.

### Keeping skill_data.json in sync

`umalator-global/skill_data.json` is a **JP superset** (~1530 entries): ~680 skills live on
Global, plus ~850 fast-forwarded from JP. Two rules follow from that:

1. **Never *replace* it wholesale from the Global mdb** — that wipes the fast-forwarded JP
   entries, which are the point of the superset.
2. **But it does need periodic *merging*.** For skills already live on Global, `master.mdb`
   is authoritative, and Cygames rebalances them. `tools/fast-forward-global.ts` only ever
   ADDS entries (see its `existingIds` guard), so it can never refresh a skill it already
   imported. Left alone, live-skill definitions freeze at whatever they were on first import.

   This is not hypothetical: by 2026-07-30, **79 Global-live skills** had conditions that
   disagreed with `master.mdb` — e.g. `100051` Lights of Vaudeville still carried the JP
   definition (`is_finalcorner==1&corner==0&order_rate<=30&behind_near_lane_time_set1>=1`)
   where Global is simply `remain_distance<=300`.

**The correct operation is a merge:** take the current definition for every skill live in
`docs/master.mdb`; leave every JP-only entry untouched. Two things to preserve when doing it:

- `make_skill_data.pl`'s `patch_modifier()` deliberately multiplies ~23 scenario-skill IDs
  (`210011`…`210291`) by **1.2**. Re-apply it, or those magnitudes silently drop ~17%.
- Match the file's existing format — tab indent, original top-level key order — or the diff
  becomes unreviewable whitespace churn.

`fast-forward-global.ts` now **detects and reports this drift** on every run
(`⚠️ [STALE DATA] N Global-live skill(s) no longer match master.mdb`). It cannot fix it —
that warning is your cue to re-run the merge.

### Updating Global master.mdb

The Global `master.mdb` (SQLite database extracted from the game client) is the source of truth for what skills, characters, and courses are currently in the Global version. It is stored at `docs/master.mdb` and automatically synced to MEGA (`/uma/master.mdb`) from another machine.

**Pull the latest DB:**
```bash
./tools/pull-master-mdb.sh          # Download latest from MEGA → docs/master.mdb
./tools/pull-master-mdb.sh --check  # Check if a newer version is available
```

**Prerequisites:**
- `brew install megatools`
- `~/.megarc` with MEGA credentials:
  ```
  [Login]
  Username = your@email.com
  Password = yourpassword
  ```

After pulling a new DB, rebuild to update the not-in-game filter:
```bash
cd umalator-global && node build.mjs
```

### Not-In-Game Filter

The build generates `umalator-global/not-in-game.json` listing skills and outfits that exist in our data files but aren't in the Global game yet (fast-forwarded from JP). The UI uses this to show a "Not in game" badge and allow filtering.

**How it works** (in `umalator-global/build.mjs` → `generateNotInGame()`):
1. **Primary**: Diffs `skill_data.json` and `umas.json` against `docs/master.mdb` via `sqlite3` CLI
2. **Fallback**: If `master.mdb` is unavailable (e.g., on Cloudflare Pages CI), diffs against `kachi-dev/master` git remote

**UI usage**: Skills filter in `v2/skills.tsx`, uma panel in `v2/uma-panel.tsx`, skill charts in `v2/skill-chart-pane.tsx`

### Fast-Forwarding Characters from JP

To add a character/outfit that exists in JP but not yet on Global:

1. **Find the JP master.mdb** — typically at `docs/master(1).mdb`

2. **Extract outfit data** from the JP DB:
   ```sql
   -- Aptitudes (short,mile,mid,long,nige,senkou,sashi,oikomi,turf,dirt)
   SELECT proper_distance_short, proper_distance_mile, proper_distance_middle,
          proper_distance_long, proper_running_style_nige, proper_running_style_senkou,
          proper_running_style_sasi, proper_running_style_oikomi,
          proper_ground_turf, proper_ground_dirt
   FROM card_rarity_data WHERE card_id = <outfit_id> AND rarity = 5;

   -- Growth rates
   SELECT default_rarity FROM card_data WHERE id = <outfit_id>;

   -- Awakenings (skill IDs unlocked at each rank)
   SELECT skill_id FROM available_skill_set
   WHERE card_id = <outfit_id> ORDER BY need_rank, id;
   ```

3. **Add to `umalator-global/umas.json`**:
   ```json
   "<chara_id>": {
     "outfits": {
       "<outfit_id>": {
         "aptitudes": [short,mile,mid,long,nige,senkou,sashi,oikomi,turf,dirt],
         "awakenings": ["skill1", "skill2", ...],
         "epithet": "[Epithet Name]",
         "rarity": 3,
         "strategy": 1
       }
     }
   }
   ```
   - **Aptitude values**: 1=G, 2=F, 3=E, 4=D, 5=C, 6=B, 7=A, 8=S
   - **Strategy**: 1=Nige, 2=Senkou, 3=Sashi, 4=Oikomi (based on highest aptitude)
   - Keep keys sorted numerically

4. **Add skills to `umalator-global/skill_data.json`** — extract from JP `skill_data` table

5. **Add skill names to `umalator-global/skillnames.json`**:
   ```json
   "<skill_id>": ["English Skill Name"]
   ```
   **Important**: Values must be arrays, not strings. The code does `names?.[0]` — a bare string would return just the first character.

6. **Add character icon** to `icons/chara/trained_chr_icon_<uid>_<outfitId>_02.png`

7. **Rebuild**: `cd umalator-global && node build.mjs` — the new skills/outfits will automatically appear in `not-in-game.json`

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
{
  id: 8,
  type: EventType.CM,
  name: 'Sagittarius Cup',
  date: '2026-01-22',
  courseId: 10506,
  season: Season.Winter,
  ground: GroundCondition.Good,
  weather: Weather.Sunny,
  time: Time.Midday
}
```

**Parameters:**
- **id**: Unique numeric identifier (optional but recommended)
- **type**: `EventType.CM` or `EventType.LOH`
- **name**: Display name (required for Global with id)
- **date**: `'YYYY-MM'` or `'YYYY-MM-DD'`
- **courseId**: From `course_data.json` (e.g., 10506 = Nakayama 2500m inner)
- **season**: `Season.Spring|Summer|Autumn|Winter`
- **ground**: `GroundCondition.Good` (=Firm), `Yielding` (=Good), `Soft`, `Heavy`
- **weather**: `Weather.Sunny|Cloudy|Rainy|Snowy`
- **time**: `Time.Morning|Midday|Evening|Night`

**Note**: LOH events ignore ground/weather (always Firm/Sunny). Presets auto-sort by date.

## Security and Environment Variables

### Environment Variables

**V2 uses environment variables for sensitive data:**

```bash
# .env.local (gitignored)
VITE_DISCORD_WEBHOOK=https://uma-tools-webhook-proxy.YOUR-SUBDOMAIN.workers.dev
```

**Setup:**
1. Copy `umalator-global/v2/.env.example` to `.env.local`
2. Fill in actual values
3. Never commit `.env.local` (already in `.gitignore`)

### Discord Webhook Proxy

**Architecture:**
- Client → Cloudflare Worker → Discord Webhook
- Real Discord URL hidden from client-side code
- Worker adds metadata (IP, location, browser) to feedback

**Files:**
```
uma-tools-worker/
├── webhook-proxy.js    # Worker script
├── wrangler.toml       # Cloudflare config
├── .gitignore          # Ignore secrets
└── README.md           # Deployment instructions
```

**Deployment:**
```bash
cd uma-tools-worker
npx wrangler login
npx wrangler deploy
npx wrangler secret put DISCORD_WEBHOOK  # Set real webhook URL
```

**Security Best Practices:**
- ✅ Real Discord webhook URL never exposed to clients
- ✅ CORS restricted (can be tightened to specific domains)
- ✅ Only POST requests allowed
- ✅ Payload validation prevents malformed requests
- ✅ Encrypted secrets via Cloudflare

## Modern Features

### Guided Onboarding Tour

**Location:** `umalator-global/v2/tour/`

**Components:**
- `TourContext.tsx`: State management (current step, completed tours)
- `TourOverlay.tsx`: Dark overlay with spotlight effect
- `TourTooltip.tsx`: Step tooltip with controls
- `steps.ts`: Tour step definitions
- `types.ts`: TypeScript interfaces

**Usage:**
```tsx
import { TourProvider, useTour } from './tour/TourContext';

// Wrap app in TourProvider
<TourProvider>
  <App />
</TourProvider>

// Access tour state
const { startTour, currentStep } = useTour();
```

**Tour Steps:**
1. Welcome (header)
2. Track & Course Selection
3. Race Conditions
4. Run Button
5. Uma Configuration
6. Skills Panel
7. Results Panel

### Mobile Navigation

**Component:** `v2/mobile-nav.tsx`

**Features:**
- Bottom navigation bar on mobile (<768px)
- Tabs: Track, Uma, Skills, Results
- Smooth tab switching
- Persistent across page reloads

### Velocity/HP Overlay

**Component:** `v2/velocity-overlay.tsx`

**Features:**
- Independent velocity/HP line toggles
- Pacer gap visualization (dashed lines)
- D3.js-based rendering inside RaceTrack SVG
- Responsive to simulation data updates

**Props:**
```tsx
interface VelocityOverlayProps {
  data: RaceSnapshot | null;
  courseDistance: number;
  width: number;
  height: number;
  xOffset: number;
  showVelocity?: boolean;  // Toggle velocity lines
  showHp?: boolean;        // Toggle HP lines
  showPacerGap?: boolean;  // Toggle pacer gap lines
}
```

**Bug Fix (Feb 2026):**
- Fixed velocity/HP toggles being coupled together
- Now independently controlled via checkboxes

### Easter Eggs

**RacetrackCow:**
- Visual cow that walks, idles, and sleeps on the track
- Click to change direction or wake up
- Double-click to hide/show
- Component: `components/RacetrackCow.tsx` (pure visual)
- CSS: `components/RacetrackCow.css`

**MooCoins System (Dev Only):**
- Investment game wrapper around RacetrackCow
- Earn MooCoins by walking
- Trade ShnailCoin, RamenCoin, AderynCoin in MooMarket
- Wallet copy/paste for sharing balances
- Component: `components/RacetrackCowMooCoins.tsx` (dev branch only)
- CSS: `components/RacetrackCowMooCoins.css`

**Note**: On master branch, only the visual cow exists. MooCoins wrapper is dev-only.

**Still In Love (Dev Only):**
- Type "STILL" anywhere (not in an input field) to trigger yandere mode
- Theme becomes bright red with subtle pulsing border effect
- Type "STILL" again to toggle off
- Reference to the "Still In Love" skill
- Files: `v2/app-v2.tsx` (keyboard listener), `v2/v2.css` (yandere theme)
- Dev branch only - do not merge to master

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
- V2 is experimental and may have breaking changes

## Japanese-to-English Terminology

**See [.claude/HORSE-DEFINITION-FLOW.md](.claude/HORSE-DEFINITION-FLOW.md)** for horse data flow documentation - how `HorseState` (UI) converts to `HorseParameters` (simulation), default stats by region, and character data structure.

**See [.claude/JP-GLOBAL-TERMINOLOGY.md](.claude/JP-GLOBAL-TERMINOLOGY.md)** for comprehensive mappings between Japanese and Global English terminology. This reference includes:

- Running styles (逃げ/Nige → Front, 先行/Senkou → Stalker, etc.)
- Stats, mood conditions, ground conditions, weather, seasons
- Code enum values and their locations
- Critical naming warnings (e.g., `GroundCondition.Good` = 良/Firm, not "Good")
- Global vs JP file organization (`umalator-global/` vs `uma-skill-tools/data/`)

Essential for working with skill conditions, race parameters, and understanding the codebase terminology.

## Deployment

### Production Build

```bash
# Build all applications
node umalator/build.mjs
node umalator-global/build.mjs  # Builds both v1 and v2
node hp-calculator/build.mjs
node events/build.mjs
```

### Cache Busting

V1 uses manual version query parameters for cache busting. When deploying significant changes (especially bug fixes), bump the version string to force browsers to fetch fresh bundles.

**Files to update:**
- `umalator-global/index.html`: Update `?v=YYYYMMDD[x]` on `bundle.css` and `bundle.js`
- `umalator/app.tsx`: Update `?v=YYYYMMDD[x]` on `simulator.worker.js` (line ~1632)

**Example:**
```html
<!-- Before -->
<link rel="stylesheet" href="bundle.css?v=20260220">
<script src="bundle.js?v=20260220"></script>

<!-- After (bump with letter suffix for same-day changes) -->
<link rel="stylesheet" href="bundle.css?v=20260220a">
<script src="bundle.js?v=20260220a"></script>
```

**When to bump:**
- Bug fixes that users with cached bundles would miss
- Breaking changes to the worker protocol
- After updating skill_data.json or other embedded data

**Note:** V2 uses Vite for production builds, which handles cache busting automatically via content hashing.

### Cloudflare Pages

**Project**: `uma-tools`

**Build Configuration:**
- Build command: `./build-all.sh` (builds all apps)
- Build output directory: `/`
- Root directory: `/`

**Environment Variables:**
- `VITE_DISCORD_WEBHOOK`: Cloudflare Worker URL for feedback

**Custom Domains:**
- `umalator.app` (primary)
- `dev.umalator.app` (dev branch)
- `canva.umalator.app` (Canva guides — see below)
- `www.umalator.app` (301s to apex via the Pages Function)

### Branch Deployment

- **master**: Production (`umalator.app`)
- **dev**: Development preview (`dev.umalator.app`)

**Note**: Dev branch includes MooCoins easter egg. Master has only the visual cow.

### Canva guides — `canva.umalator.app`

Community guides are Canva embeds addressed by a numbered slug, reachable at both
`canva.umalator.app/<slug>` and `umalator.app/canva/<slug>`:

- `/14-yasuda`, `/15-takarazuka`, … (`<number>-<name>`)
- bare root (`canva.umalator.app/` or `umalator.app/canva/`) → 302 to the
  highest-numbered (newest) guide
- number-only (`/14`) → 302 to the full slug

**Registry lives in `canva-embeds.json`** (single source of truth, repo root).

**`umalator.app/canva/<slug>` is served by STATIC pages**, not the Function. Cloudflare
Pages Functions are not currently executing on the production project (the
`functions/[[catchall]].ts` canva routing — and the events OG function, and the
`www`→apex redirect — never run in prod; everything falls through to static). So
`tools/gen-canva-static.mjs` reads `canva-embeds.json` and writes static
`canva/<slug>/index.html` wrapper pages (+ `canva/index.html` = newest) on every build
(wired into `build-all.sh`). These are plain static assets and always serve. The
`functions/[[catchall]].ts` still reads the same `canva-embeds.json` and would serve the
`canva.umalator.app` subdomain (and number-only slugs) **if/when Functions are revived**
— that requires a Cloudflare dashboard fix (Functions enablement / compatibility date),
not a repo change. The subdomain + number-slug `/14`→`/14-yasuda` redirects are currently
inactive in prod as a result.

**To add a guide:** add one entry to `canva-embeds.json`:

```json
{ "slug": "16-sprinters", "title": "CM 16 Guide — Sprinters",
  "canvaId": "XXXX", "viewToken": "YYYY" }
```

Get `canvaId` + `viewToken` from Canva › Share › More › Embed — the embed URL is
`https://www.canva.com/design/<canvaId>/<viewToken>/view?embed`. The highest-numbered
entry automatically becomes `canva/index.html` (the bare-`/canva` target). Changes ship
with `master` — merge `dev` → master to publish.

## Credits

Built on the work of:
- **alpha123/umalator** - Original Global simulator by alpha123 & pecan
- **kachi-dev/umalator (VFalator)** - VFcord version by kachi & Jecht
- **Skill Data** - [GameTora](https://gametora.com/umamusume)
- **Game** - Uma Musume: Pretty Derby © Cygames
- **Community** - [Moomoo Discord](https://discord.gg/moomoocows)

## License

GPL-3.0-or-later - See [LICENSE](uma-skill-tools/LICENSE)
