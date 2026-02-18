# v1 UI Layout Diagram

*Reference for v2 redesign*

## Desktop Layout (Two-Level CSS Grid)

### Root Grid (body or #app)
```
┌─────────────────────────┬───────────────────────────────────────────────────────────┐
│                         │                                                           │
│                         │                      #topPane                             │
│                         │  ┌─────────────────────────────────┬───────────────────┐ │
│                         │  │                                 │                   │ │
│       #umaPane          │  │         RaceTrack               │    #runPane       │ │
│    (LEFT SIDEBAR)       │  │        (960×240 SVG)            │  (controls)       │ │
│       700px wide        │  │                                 │                   │ │
│                         │  │  • Track visualization          │  • Mode selector  │ │
│  ┌───────────────────┐  │  │  • VelocityLines overlay        │  • RUN button     │ │
│  │ [Uma 1] [Uma 2] > │  │  │  • Skill activation regions    │  • Samples/Seed   │ │
│  ├───────────────────┤  │  ├─────────────────────────────────┤  • Toggles        │ │
│  │ Portrait + Name   │  │  │        #buttonsRow              │  • Presets        │ │
│  │ Save/Load/Reset   │  │  │  Track│Time│Ground│Season      │                   │ │
│  ├───────────────────┤  │  └─────────────────────────────────┴───────────────────┘ │
│  │ Stats (5 inputs)  │  ├───────────────────────────────────────────────────────────┤
│  │ Aptitudes (3)     │  │                                                           │
│  │ Mood / Strategy   │  │              Results / Changelog                          │
│  ├───────────────────┤  │   • Histogram (Compare mode)                              │
│  │      Skills       │  │   • BasinnChart (Chart modes)                             │
│  │  [skill] [skill]  │  │   • Caveats (collapsible)                                 │
│  │  [skill] [skill]  │  │   • Changelog (collapsible)                               │
│  │  + Add Skill      │  │                                                           │
│  └───────────────────┘  │                                                           │
│                         │                                                           │
└─────────────────────────┴───────────────────────────────────────────────────────────┘
```

### CSS Grid Structure (Two Levels)

```css
/* ROOT GRID - Line 27-28 in app.css */
/* This creates the left sidebar + main content split */
{
    display: grid;
    grid-template-columns: auto 1fr;    /* Uma panel (700px) | Main content */
    grid-template-rows: auto 1fr;
    height: 98vh;
}

#umaPane {
    grid-row: 1 / 3;                    /* Spans full height as LEFT SIDEBAR */
    width: 700px;
}

/* INNER GRID - #topPane has its own grid */
#topPane {
    display: grid;
    grid-template-columns: 2fr 1fr;     /* Track area | Run controls */
    grid-template-rows: 3fr 1fr;        /* Track | Buttons row */
    gap: 10px;
}

#runPane {
    grid-column-start: 2;
    grid-row-start: span 2;             /* Spans both rows on RIGHT side of topPane */
}
```

## Component → Element Mapping

| UI Region | Element ID | Component/File | Lines |
|-----------|------------|----------------|-------|
| Track visualization | (inside #topPane) | `<RaceTrack>` | app.tsx:2564 |
| Velocity overlay | (child of RaceTrack) | `<VelocityLines>` | app.tsx:2565 |
| Run controls | `#runPane` | Inline JSX | app.tsx:2575-2731 |
| Track selector | `#buttonsRow` | `<TrackSelect>` + selects | app.tsx:2732-2741 |
| Results histogram | `#resultsPane` | `<Histogram>` | app.tsx:2439 |
| Results summary | `#resultsSummary` | Inline table | app.tsx:2379-2400 |
| Race summary | (in resultsPaneWrapper) | `<RaceSummary>` | (conditional) |
| Skill chart | (in resultsPane) | `<BasinnChart>` | BasinnChart.tsx |
| Horse config | `#umaPane` | `<HorseDef>` × 1-3 | app.tsx:2746-2767 |

## Mobile Layout (< 768px)

On mobile, the left sidebar disappears and becomes a full-screen overlay:

```
┌─────────────────────────┐
│      RaceTrack          │  (order: 1, full width, horizontal scroll)
├─────────────────────────┤
│      #buttonsRow        │  (order: 2, wrapped)
│  Track │ Time │ Ground  │
│  Weather │ Season       │
├─────────────────────────┤
│      #runPane           │  (order: 3, full width)
│  [Compare][Skill][Uma]  │
│  [RUN]  Samples: ___    │
│  toggles...             │
├─────────────────────────┤
│      Results            │  (stacked vertically)
├─────────────────────────┤
│   [⚙️ Uma Config btn]   │  (floating button, bottom right)
└─────────────────────────┘

When Uma Config clicked → Full screen #umaOverlay
```

## Key State Connections

```
App State                    → UI Element
─────────────────────────────────────────
courseId                     → TrackSelect, RaceTrack
racedef (mood/ground/etc)    → Weather/Season/Ground selects
mode (Compare/Chart/Uma)     → #runPane fieldset, results display
uma1, uma2, pacer           → HorseDef components
results[]                    → Histogram, resultsSummary table
chartData                    → VelocityLines overlay
runData                      → BasinnChart, skill details
expanded                     → #umaPane vs #umaOverlay
darkMode                     → html.dark class
```

## Modes

| Mode | Uma Panels | Results Display | RUN Button |
|------|------------|-----------------|------------|
| Compare | Uma 1, Uma 2, (Pacemaker) | Histogram + stats | "COMPARE" |
| Skill Chart | Uma 1 only | BasinnChart table | "RUN" |
| Uma Chart | Uma 1 only | BasinnChart (unique skills) | "RUN" |

## Modals/Overlays

1. **Uma Config Overlay** (`#umaOverlay`) - Mobile horse config
2. **Dueling Config Modal** - Dueling rate sliders
3. **Skill Picker** - In HorseDef, full-screen on mobile
4. **OCR Modal** - Screenshot import flow
5. **Slot Dialog** - Save slot management
6. **BasinnChart Popover** - Detailed skill charts on hover/click

## Files Involved

| File | Purpose |
|------|---------|
| `umalator/app.tsx` | Main app, layout, state management |
| `umalator/app.css` | All layout styles |
| `umalator/BasinnChart.tsx` | Skill analysis table + charts |
| `components/RaceTrack.tsx` | Track SVG + TrackSelect |
| `components/HorseDef.tsx` | Horse configuration panel |
| `components/RaceSummary.tsx` | Race event timeline |
| `components/SkillList.tsx` | Skill picker modal |

## v2 Redesign Opportunities

1. **Extract #runPane** → Separate `<SimulationControls>` component
2. **Extract #buttonsRow** → Separate `<RaceConditions>` component
3. **Extract results logic** → Separate `<ResultsPane>` component
4. **Simplify mode switching** → Could use tabs or separate routes
5. **Mobile-first approach** → Currently desktop-first with mobile overrides
6. **Reduce inline styles** → Many styles are inline in JSX (2700+ lines)
7. **Consider different layouts**:
   - Current: Left sidebar (uma) + right content (track/results)
   - Alternative: Top track + bottom panels (like many racing games)
   - Alternative: Tabs for different sections
   - Alternative: Collapsible sidebar

## Visual Reference (Matches Screenshot)

```
┌──────────────────────┬──────────────────────────────────────────────────────┐
│  Umamusume 1 │ Uma 2 │ >│        Tokyo Dirt 1600m (counterclockwise)        │
├──────────────────────┤  │  ┌──────────────────────────────────────────────┐ │
│ [Portrait]  Name     │  │  │            RaceTrack SVG                     │ │
│ [Save][Load][Reset]  │  │  │   (phases, slopes, corners, skill regions)  │ │
├──────────────────────┤  │  └──────────────────────────────────────────────┘ │
│ Spd│Sta│Pow│Gut│Wit  │  │  Tokyo ▼ │ Dirt 1600m ▼ │ ☀☁☂ │ Firm ▼ │ Seasons │
│ 1200│601│1000│500│1000│  ├──────────────────────────────────────────────────┤
├──────────────────────┤  │  ▶ Caveats                                        │
│ Surface│Distance│Mood│  │  ▼ Changelog                                      │
│   B   │   S    │Great│  │     2026-01-26 - Skill Chart Fix...              │
├──────────────────────┤  │     2026-01-18 - Horse Slots...                   │
│ Style: Pace Chaser   │  │     2026-01-11 - Uma Cards, OCR...               │
├──────────────────────┤  │                                                    │
│        Skills        │  │  (Note: #runPane with RUN button is              │
│ [Victoria★][Prof..]  │  │   scrolled below or to the right of              │
│ [It's On!][No Stop]  │  │   the visible area in the screenshot)            │
│ [Mile Corn][Pace..]  │  │                                                    │
│ [Uma Stan]           │  │                                                    │
│ [+ Add Skill]        │  │                                                    │
└──────────────────────┴──────────────────────────────────────────────────────┘
         700px                              ~960px+ (flexible)
```
