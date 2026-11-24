# Moomoolator

*A modern Uma Musume race simulator with bilingual JP/EN support*

[![Live Demo](https://img.shields.io/badge/demo-umalator.app-blue)](https://umalator.app/umalator-global)
[![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-green)](uma-skill-tools/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178c6)](https://www.typescriptlang.org/)
[![Preact](https://img.shields.io/badge/Preact-10.x-673ab8)](https://preactjs.com/)
[![Bilingual](https://img.shields.io/badge/lang-JP%20%2B%20EN-red)](https://umalator.app/umalator)

> A hybrid fork of [alpha123/umalator](https://github.com/alpha123/umalator) and [kachi-dev/umalator](https://github.com/kachi-dev/umalator) with a redesigned interface and quality-of-life improvements.

![Moomoolator Interface](docs/screenshot.png)

## Live Tools

| Tool | Description |
|------|-------------|
| **[/umalator-global](https://umalator.app/umalator-global)** | Global simulator (English) |
| **[/umalator](https://umalator.app/umalator)** | Bilingual JP simulator |
| **[/hp-calculator](https://umalator.app/hp-calculator)** | HP survival rate calculator |

---

## Why Moomoolator?

### True Bilingual Support
The only simulator with full JP/EN language mixing:
- UI in English, skill names in Japanese (or vice versa)
- Switch languages without losing your build
- Perfect for players who learned on JP but play Global

### Mobile-First Design
Fully responsive interface with dedicated mobile navigation—theorycraft from anywhere.

### Modern UX
- Guided onboarding tour for new users
- Uma Card export (shareable PNG with embedded build data)
- AI-powered OCR import from screenshots
- Native-feeling modal dialogs
- Dark/light themes

---

## Comparison

| | Moomoolator | VFalator | alpha123 |
|---|:-----------:|:--------:|:--------:|
| **Bilingual JP+EN** | **Yes** | - | - |
| **English UI** | Yes | Yes | Yes |
| **Japanese UI** | Yes | Yes | - |
| **Modern UI** | Yes | Yes | - |
| **Mobile** | Yes | - | - |
| **Uma Card PNG** | Yes | - | - |
| **OCR Import** | Yes | - | - |
| **Onboarding Tour** | Yes | - | - |

---

## Quick Start

### Using the Simulator

1. Visit one of the [live tools](#live-tools) above
2. Select a track and course from the header
3. Click **Uma** to configure your horse's stats, aptitudes, and skills
4. Click **RUN** to simulate races
5. View results in the track overlay and results panel

### Understanding Results

Results are measured in **horse lengths** (bashin):
- **1 horse length = 2.5 meters**
- **Positive values**: Uma 2 finishes ahead
- **Negative values**: Uma 1 finishes ahead

---

## Features

### Race Simulation
- **Compare Mode**: Pit two Uma builds head-to-head across hundreds of simulated races
- **Statistical Analysis**: View min/max/mean/median results
- **Track Visualization**: Interactive course with corners, slopes, and skill regions

### Build Management
- **Save/Load Builds**: Store multiple horse configurations locally
- **Uma Card Export**: Save builds as shareable PNG images with embedded data
- **OCR Import**: Extract stats from in-game screenshots using Google Gemini AI
- **JSON Import/Export**: For backup and sharing

### Champions Meeting Presets
Quick-load race conditions for upcoming CM and LoH events with correct track, weather, season, and ground settings.

---

## Development

### Prerequisites
- Node.js 20+

### Local Development

```bash
cd umalator-global

# Start dev server with hot reload
node build.mjs --serve

# Access at http://localhost:8000/umalator-global/
```

### Production Build

```bash
node build.mjs          # Minified production build
node build.mjs --debug  # Unminified with assertions
```

### Project Structure

```
umalator-global/
├── v2/                      # V2 UI source
│   ├── app-v2.tsx          # Main application
│   ├── components/         # Reusable UI components
│   └── *.css               # Styles
├── build.mjs               # esbuild configuration
├── skill_data.json         # English skill definitions
├── course_data.json        # Race course data
└── umas.json               # Character data
```

### Updating Game Data

Global game data comes from the Steam Global client's `master.mdb`. The DB is no longer stored in git and is no longer pulled from MEGA.

1. **The PC stages a snapshot.** A watcher on the gaming PC reads `%USERPROFILE%\AppData\LocalLow\Cygames\Umamusume\master\master.mdb` (read-only, via SQLite's backup API), writes `master-<sha256>.mdb` plus `latest.json` (sha256, file, source mtime, Steam build id, skill/table counts, integrity) to `%USERPROFILE%\Dev\uma-master-staging\`, and keeps the newest 5 copies.
2. **The Mac pulls it:**
   ```bash
   mkdir -p ~/.local/share/uma-tools
   scp <pc>:Dev/uma-master-staging/latest.json ~/.local/share/uma-tools/latest.json
   FILE=$(node -p "require(process.env.HOME + '/.local/share/uma-tools/latest.json').file")
   scp "<pc>:Dev/uma-master-staging/$FILE" ~/.local/share/uma-tools/master.mdb
   ```
3. **Ingest it into the data files:**
   ```bash
   node tools/ingest-master-mdb.mjs --mdb ~/.local/share/uma-tools/master.mdb --dry-run --summary /tmp/ingest.md
   node tools/ingest-master-mdb.mjs --mdb ~/.local/share/uma-tools/master.mdb --summary /tmp/ingest.md
   ```
   Exit codes: `0` data changed, `3` no data change, `2` refused by a safety check (nothing written), `1` error.
   It only writes `umalator-global/*.json` data files (skill data/meta/names merge, umas names, live-skill list, not-in-game, CM presets when the JP DB is present, and `global-master-snapshot.json`, the baseline for the next run).
4. **Build and test:** `cd umalator-global && node build.mjs`, `cd umalator-global/v2 && npx vite build`, `cd uma-skill-tools && npm test`.
5. **Open a PR into `dev`** with the changed data files and the summary as the description.

Scripts find the DB in this order: `$UMA_MASTER_MDB`, `~/.local/share/uma-tools/master.mdb`, then the legacy `docs/master.mdb` (see `tools/lib/master-db-path.cjs`). Requires the `sqlite3` CLI (shipped with macOS).

Do not use `update.bat` (removed) or the Perl generators `make_skill_data.pl`, `make_global_skillnames.pl` and `make_global_skill_meta.pl` for Global data: they overwrite whole files, which wipes the fast-forwarded JP entries, search aliases and "(obsolete)" markers. `make_global_course_data.pl` is still the course-data generator (the ingest does not touch course data):

```bash
cd umalator-global
perl make_global_course_data.pl /path/to/master.mdb courseeventparams > course_data.json
```

Requires Perl with `DBI` and `DBD::SQLite` modules.

---

## Technology

- **Preact** - Lightweight UI framework
- **TypeScript** - Type-safe development
- **D3.js** - Data visualization
- **esbuild** - Fast bundling
- **Web Workers** - Parallel simulation

---

## Credits

Built on the work of:

- **alpha123/umalator** - Original Global simulator by alpha123 & pecan
- **kachi-dev/umalator (VFalator)** - VFcord version by kachi & Jecht
- **Skill Data** - [GameTora](https://gametora.com/umamusume)
- **Game** - Uma Musume: Pretty Derby © Cygames
- **Community** - [Moomoo Discord](https://discord.gg/moomoocows)

---

## License

GPL-3.0-or-later - See [LICENSE](uma-skill-tools/LICENSE)
