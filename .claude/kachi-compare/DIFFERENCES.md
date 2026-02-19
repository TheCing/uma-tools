# Kachi-dev Dueling & Spot Struggle Implementation

This document summarizes the changes needed to implement dueling and spot struggle features from kachi-dev.

## Files Extracted

| File | Purpose |
|------|---------|
| `RaceSolver.ts` | Core dueling/spot struggle simulation logic |
| `RaceSolverBuilder.ts` | Builder methods for configuring dueling rates |
| `app.tsx` | UI checkboxes, settings modal, serialization |
| `compare.ts` | Compare mode integration for dueling stats |
| `SkillList.tsx` | "View Proc Data" button in skill details |
| `SkillProcDataDialog.tsx` | **NEW** Dialog for viewing skill proc graphs |
| `HorseDef.css` | CSS for SkillProcDataDialog overlay/modal |

---

## 1. Core Simulation (RaceSolver.ts)

### New Properties (lines 317-323, 325-330)
```typescript
duelingRates: {
    runaway: number,
    frontRunner: number,
    paceChaser: number,
    lateSurger: number,
    endCloser: number
} | null

leadCompetitionEnabled: boolean
leadCompetition: boolean
leadCompetitionStart: number | null
leadCompetitionEnd: number | null
leadCompetitionTimer: Timer
```

### Dueling Logic (lines 1050-1084)
- Checks if uma has >15% HP and is on final straight
- Uses per-strategy dueling rate to determine if uma CAN enter compete fight
- 40% chance to actually trigger compete fight each second
- Compete fight provides speed boost

### Spot Struggle Logic (lines 1088-1116)
- Only for Front Runner strategy
- Triggers when 2+ Front Runners are within 3.75m (5m for Runaway)
- Duration: 8 sections

---

## 2. UI Changes (app.tsx)

### New State Variables (lines 1433-1441)
```typescript
const [competeFight, setCompeteFight] = useState(false);
const [leadCompetition, setLeadCompetition] = useState(true);
const [duelingConfigOpen, setDuelingConfigOpen] = useState(false);
const [duelingRates, setDuelingRates] = useState({
    runaway: 10,
    frontRunner: 20,
    paceChaser: 30,
    lateSurger: 40,
    endCloser: 50
});
```

### Checkboxes UI (lines 2594-2613)
```tsx
<div style="display: flex; flex-direction: column; gap: 0;">
    <div>
        <label for="leadCompetition">Spot Struggle</label>
        <input type="checkbox" id="leadCompetition" checked={leadCompetition} onClick={() => setLeadCompetition(!leadCompetition)} />
    </div>
    <div style="display: flex; align-items: center; gap: 8px;">
        <label for="competeFight">Dueling</label>
        <input type="checkbox" id="competeFight" checked={competeFight} onClick={() => setCompeteFight(!competeFight)} />
        <button onClick={() => setDuelingConfigOpen(true)} title="Configure dueling rates">
            <Settings size={14} />
        </button>
    </div>
</div>
```

### Dueling Configuration Modal (lines 2664-2740)
- Opens when Settings button clicked
- Contains 5 range sliders (0-100%) for each strategy:
  - Runaway: 10% default
  - Front Runner: 20% default
  - Pace Chaser: 30% default
  - Late Surger: 40% default
  - End Closer: 50% default
- Warning note about rates being estimates from in-game data

### Results Display (lines 1001-1006)
```tsx
{runData?.allruns?.leadCompetition && (
    <tr><th>Spot Struggle frequency</th><td>{...}</td></tr>
)}
{runData?.allruns?.competeFight && (
    <tr><th>Dueling frequency</th><td>{...}</td></tr>
)}
```

---

## 3. Compare Mode (compare.ts)

### New Options Handling (lines 49-64)
```typescript
if (options.competeFight !== undefined) {
    standard.competeFight(options.competeFight);
    compare.competeFight(options.competeFight);
}

if (options.duelingRates) {
    standard.duelingRates(options.duelingRates);
    compare.duelingRates(options.duelingRates);
}

if (options.leadCompetition !== undefined) {
    standard.leadCompetition(options.leadCompetition);
    compare.leadCompetition(options.leadCompetition);
}
```

### Stats Collection (lines 449-458)
```typescript
if (solver.competeFightStart != null) {
    const start = solver.competeFightStart;
    const end = solver.competeFightEnd != null ? solver.competeFightEnd : course.distance;
    const length = end - start;
    const competeFightStat = isUma1 ? competeFightStats.uma1 : competeFightStats.uma2;
    competeFightStat.lengths.push(length);
    competeFightStat.count++;
}
```

---

## 4. Skill Proc Data Dialog

### New Component: SkillProcDataDialog.tsx
- Displays skill activation charts in a modal
- Uses existing `LengthDifferenceChart`, `ActivationFrequencyChart`, `VelocityChart` from app.tsx
- Shows total samples, skill procs, effectiveness rate
- ESC key to close

### CSS (HorseDef.css lines 491-564)
```css
.skillProcDataOverlay { z-index: 30; background: rgba(25,25,25,0.6); }
.skillProcDataDialog { z-index: 31; width: 800px; border: 2px solid rgb(170,221,154); }
.skillProcDataHeader { background: linear-gradient(rgb(153,219,68), rgb(112,190,18)); }
```

### SkillList.tsx Integration (lines 435-446)
```tsx
{props.runData != null && props.umaIndex != null && props.onViewProcData && (
    <div class="skillDetailsSection">
        <button
            class="runAdditionalSamples"
            onClick={(e) => { e.stopPropagation(); props.onViewProcData(); }}
        >
            View Proc Data
        </button>
    </div>
)}
```

---

## 5. Serialization Changes

### serialize() function signature updated to include:
- `competeFight: boolean`
- `leadCompetition: boolean`
- `duelingRates: { runaway, frontRunner, paceChaser, lateSurger, endCloser }`

### deserialize() function updated to read these values

### localStorage auto-save includes all new settings

---

## Implementation Strategy

1. **Phase 1**: Add RaceSolver dueling/spot struggle logic
2. **Phase 2**: Add RaceSolverBuilder configuration methods
3. **Phase 3**: Add UI checkboxes and settings modal to app.tsx
4. **Phase 4**: Update compare.ts for stats collection
5. **Phase 5**: Add SkillProcDataDialog and integrate into SkillList
6. **Phase 6**: Add CSS for new components
7. **Phase 7**: Update serialization for URL/localStorage persistence

Each phase can be done incrementally to minimize merge conflicts with our existing dark mode/mobile changes.
