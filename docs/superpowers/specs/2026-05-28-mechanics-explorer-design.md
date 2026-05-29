# Mechanics Explorer — Design Spec

**Date:** 2026-05-28
**Status:** Approved (design)

## Purpose

A standalone mini-app that lets a user configure an uma (via the existing v2
UmaDef pane) and a course, then see exactly how each stat feeds the underlying
race-mechanics formulas — target speed per phase, acceleration, max HP / HP
drain, spurt, and the wisdom-gated RNG systems. It pairs a **live readout** of
all computed mechanic values with a **sweep chart** that visualizes how a chosen
mechanic responds as one stat is varied across its range.

The goal is educational/analytical: surface the `sqrt`/`pow` diminishing-returns
shapes and strategy/phase coefficients that are otherwise buried in code, so a
player can reason about where the next stat point actually goes.

## User-confirmed design choices

- **Placement:** standalone sub-app with its own URL (`/mechanics-explorer`)
- **Display:** live readout **plus** sweep charts
- **Scope (v1):** all four mechanic groups — Speed & Accel, HP & Stamina, Spurt,
  Wisdom Rolls
- **Formula source:** transcribed from the Race Mechanics doc
  (`docs/Uma Musume Race Mechanics.md`), cross-checked against the simulator code
  to resolve prose ambiguity

## Placement & build

New directory **`umalator-global/mechanics-explorer/`**, mirroring the
`umalator-global/skill-visualizer/` sub-app pattern:

| File | Purpose |
|---|---|
| `index.html` | Entry HTML (mirrors skill-visualizer's, `#app` mount) |
| `build.mjs` | esbuild build; includes the `redirectData` plugin (aliases `uma-skill-tools/data/*` → Global `umalator-global/*`) and `CC_GLOBAL: 'true'` define. Supports `--serve` and `--debug` like the others |
| `app.tsx` | Main application + state wiring |
| `mechanics.ts` | Pure formula module (transcribed, cited) |
| `mechanics-readout.tsx` | The four live-value readout cards |
| `sweep-chart.tsx` | Reusable small D3 line chart for stat sweeps |
| `mechanics-explorer.css` | App-specific styles (reuses v2 tokens/`v2.css`) |

**Routing:** add to `_redirects`:
```
/mechanics-explorer/* /umalator-global/mechanics-explorer/:splat 200
```
(status 200 = rewrite, URL stays `/mechanics-explorer`). Asset paths use the
existing `/uma-tools/*` prefix which is already globally rewritten to the repo
root.

**Wiring:** add a build step to `build-all.sh`; add a row to the app table in
`CLAUDE.md`.

## Component reuse

No new shared primitives. Imports from `../v2/`:

- **`V2UmaPanel`** (`../v2/uma-panel`) — the UmaDef pane: outfit portrait, stat
  inputs, aptitudes, mood, strategy, save/load. Drives a `UmaState`.
- **`V2TrackSelect`** (`../v2/track-select`) — course selector. Mechanics depend
  on `distance` and `surface`, so a course must be chosen.
- **`SegmentedControl`** (`../v2/components`) — ground condition selector
  (Firm / Good / Soft / Heavy).
- **`CollapsibleSection`** (exported from `../v2/uma-panel`) — readout card
  containers.
- **`Tooltip`, `Badge`** (`../v2/components`) — per-value formula explanations
  and the dominant-stat tag.

Only genuinely new UI component is the local **`SweepChart`** (D3, lives in this
sub-app; not promoted to the shared library in v1).

## Data flow

```
UmaState  +  courseId  +  ground          (UI state)
     │
     │  reuse the existing adjusted-stats pipeline
     │  (buildHorseParameters: motivation 1+0.02*mood → overcap adjust →
     │   courseSpeedModifier → GroundSpeed/PowerModifier → strategy-proficiency wisdom)
     ▼
HorseParameters (adjusted)
     │
     ├──►  mechanics.ts  ──►  readout values  ──►  MechanicsReadout
     │
     └──►  sweep(statName, x) closures  ──►  SweepChart
```

The HorseState→HorseParameters conversion is **not** re-derived. The app reuses
the canonical pipeline (`buildHorseParameters` in
`uma-skill-tools/tools/ToolCLI.ts`, or the browser-safe `buildAdjustedStats` in
`RaceSolverBuilder.ts` if ToolCLI carries node-only deps — resolved during
implementation). The v2 `UmaState` maps directly onto the `horseDesc` argument
(raw stats, aptitude strings, strategy string, mood).

## `mechanics.ts` — pure formula module

Single module of pure functions, each annotated with the Race Mechanics doc
section it comes from and verified against `RaceSolver.ts` / `HpPolicy.ts`
(the two agree). All take an adjusted `HorseParameters` and `CourseData`/ground
as needed.

### Speed & Accel (doc: §Speed, §Acceleration; code: RaceSolver.ts:21–72)

- `baseSpeed(distance) = 20 - (distance - 2000)/1000`
- `baseTargetSpeed(horse, course, phase)`
  `= baseSpeed * Speed.StrategyPhaseCoefficient[strategy][phase]`
  `+ (phase==2 ? sqrt(500*speed) * Speed.DistanceProficiencyModifier[distApt] * 0.002 : 0)`
- `lastSpurtSpeed = (baseTargetSpeed(2) + 0.01*baseSpeed)*1.05 + sqrt(500*speed)*DistProf*0.002 + pow(450*guts, 0.597)*0.0001`
- `minSpeed = 0.85*baseSpeed + sqrt(200*guts)*0.001`
- `startingSpeed = 0.85*baseSpeed`
- `baseAccel(horse, phase, uphill) = (uphill?0.0004:0.0006) * sqrt(500*power) * Accel.StrategyPhaseCoefficient[strategy][phase] * Accel.GroundTypeProficiencyModifier[surfApt] * Accel.DistanceProficiencyModifier[distApt]`
- Start-dash accel bonus: `+24.0` (flat, shown as a note)

Coefficient tables (transcribed verbatim from RaceSolver):
- Speed.StrategyPhaseCoefficient (idx by strategy 1–5; Nige/Senkou/Sasi/Oikomi/Oonige)
- Speed.DistanceProficiencyModifier `[1.05,1.0,0.9,0.8,0.6,0.4,0.2,0.1]` (S→G)
- Accel.StrategyPhaseCoefficient
- Accel.GroundTypeProficiencyModifier `[1.05,1.0,0.9,0.8,0.7,0.5,0.3,0.1]`
- Accel.DistanceProficiencyModifier `[1.0,1.0,1.0,1.0,1.0,0.6,0.5,0.4]`

### HP & Stamina (doc: §HP; code: HpPolicy.ts:27–94)

- `maxHp = 0.8 * HpStrategyCoefficient[strategy] * stamina + distance`
  with `HpStrategyCoefficient = [0,0.95,0.89,1.0,0.995,0.86]`
- `gutsModifier = 1 + 200/sqrt(600*guts)` (applies phase ≥ 2)
- `hpPerSecond(velocity, phase, status=1) = 20 * (velocity - baseSpeed + 12)^2 / 144 * statusModifier * groundModifier * (phase>=2 ? gutsModifier : 1)`
  with `groundModifier = HpConsumptionGroundModifier[surface][ground]`
- Readout shows HP/s at each phase's target speed and a "max-spurt survivable?"
  check using the `getLastSpurtPair` decision (`hp >= hpNeeded` for full spurt).

### Spurt (doc: §Last Spurt; code: HpPolicy.getLastSpurtPair, RaceSolver.ts:44–49)

- `lastSpurtSpeed` (max spurt speed, from above)
- Full-spurt feasibility: distance of phase-2 zone `maxDist = distance - phaseStart(2)`,
  `s = (maxDist - 60)/maxSpeed`, `hpNeeded = hpPerSecond(maxSpeed, spurt) * s`; full
  spurt iff `maxHp >= hpNeeded`. Show `hpNeeded` vs `maxHp` and the surplus/deficit.
- `subparAcceptChance = (15 + 0.05*wisdom)` % per fallback candidate (the
  wisdom-gated acceptance roll).

### Wisdom Rolls (doc: §Skill Activation Chance, §downhill; memory: skill-activation.md)

- `skillActivationChance = max(100 - 9000/wisdom, 20)` %
- `downhillTriggerRate = wisdom * 0.0004` per check
- `subparAcceptChance = 15 + 0.05*wisdom` % (also surfaced here)

## UI layout

```
┌───────────────────────────────────────────────────────────┐
│  Mechanics Explorer                                         │
├──────────────────┬────────────────────────────────────────┤
│  [V2UmaPanel]    │  Course: [V2TrackSelect]                │
│  - outfit        │  Ground: [SegmentedControl Firm/.../Heavy]│
│  - stats         │                                          │
│  - aptitudes     │  ▸ Speed & Accel        (CollapsibleSection)│
│  - mood/strategy │     baseTargetSpeed[0/1/2], lastSpurt,    │
│                  │     minSpeed, baseAccel[ph], start-dash   │
│                  │  ▸ HP & Stamina                          │
│                  │     maxHp, gutsModifier, HP/s per phase   │
│                  │  ▸ Spurt                                  │
│                  │     lastSpurtSpeed, full-spurt feasibility │
│                  │  ▸ Wisdom Rolls                          │
│                  │     skill-activation %, downhill, subpar  │
│                  │                                          │
│                  │  ── Sweep Explorer ──                    │
│                  │  Mechanic: [select]  Vary: [stat select] │
│                  │  [ SweepChart: curve + current-value mark ]│
└──────────────────┴────────────────────────────────────────┘
```

Mobile: panel stacks above the readout (reuse v2 responsive conventions).

### Readout rows
Each value row: `label · value · Tooltip(formula) · Badge(dominant stat)`.
Values recompute live (memoized) on any UmaState / course / ground change.

### Sweep Explorer
- **Mechanic select:** target speed (phase 2), last-spurt speed, base accel,
  max HP, HP/s, skill-activation %, subpar-accept %.
- **Vary select:** the stat axis (speed / stamina / power / guts / wisdom),
  defaulted to the mechanic's dominant stat.
- `SweepChart` props: `{ label, xLabel, xMin, xMax, compute: (x:number)=>number, currentX, yLabel }`.
  Plots `compute` across `[xMin, xMax]` (other stats held at current adjusted
  values), draws a vertical marker + dot at `currentX`. Small D3 line chart
  (~360×180), axis ticks, hover readout.

## Edge cases

1. **No outfit selected** — UmaState defaults give a valid mob; readout still
   renders from default stats. No special-casing needed.
2. **Stat = 0 / very low** — `sqrt`/`pow`/`9000/wisdom` stay finite for x>0;
   sweep ranges start at a sensible floor (e.g. 1) to avoid div-by-zero at x=0;
   `skillActivationChance` floors at 20% by formula.
3. **Overcapped stats (>1200)** — reuse the same `adjustOvercap` the simulator
   uses so readout matches in-game effective stats.
4. **Dirt vs turf ground modifier** — `groundModifier` indexes by
   `course.surface`; selector + course both feed it.
5. **LOH-style "always Firm"** — not modeled; ground is always user-selectable
   here (this is an explorer, not a preset runner).

## Verification

1. **Build:** `cd umalator-global/mechanics-explorer && node build.mjs --debug`
   builds with no errors.
2. **Dev serve:** `node build.mjs --serve 3000`, visit `/mechanics-explorer/`.
3. **Numeric parity spot-check:** pick a known uma+course, compare a couple of
   readout values (maxHp, baseTargetSpeed[2]) against the same horse run through
   the simulator's debug output — should match to floating-point.
4. **Sweep sanity:** skill-activation % curve flattens to a flat 20% floor at low
   wisdom and approaches ~99% at high wisdom; maxHp is linear in stamina; base
   accel is `sqrt`-shaped in power.
5. **Reuse check:** UmaPanel save/load and TrackSelect behave identically to the
   simulator.

## Out of scope (follow-ups)

- **Skill modifiers** — skills change target speed/accel during the sim but not
  the base formulas; not surfaced in v1.
- **URL/hash state sharing** — session-only in v1.
- **Slope / per-section randomness curves** — the slope target-speed penalty and
  per-section random band exist in code; could add later as additional readout
  rows.
- **Two-uma comparison** — single uma in v1.
- **Promoting `SweepChart` to the shared v2 component library** — keep local
  until a second consumer appears.
