# Horse Definition Flow

This document traces how horse data is defined, edited in the UI, and used in simulation.

---

## Quick Answer

**Yes, there's a single source of truth for horse state:**

```
components/HorseDefTypes.ts  →  HorseState class (Immutable Record)
                                    ↓
                             UI edits via HorseDef.tsx
                                    ↓
                             Sent to simulation worker
                                    ↓
uma-skill-tools/RaceSolverBuilder.ts  →  buildBaseStats() converts to HorseParameters
```

---

## The Two Horse Types

### 1. `HorseState` (UI State)

**Location**: [components/HorseDefTypes.ts](../components/HorseDefTypes.ts)

This is the **UI-facing state** - an Immutable Record used in React/Preact components:

```typescript
export class HorseState extends Record({
  outfitId: '',                           // Selected character outfit ID
  speed:   CC_GLOBAL ? 1200 : 1850,       // Base stats differ by region!
  stamina: CC_GLOBAL ? 1200 : 1700,
  power:   CC_GLOBAL ? 800 : 1700,
  guts:    CC_GLOBAL ? 400 : 1200,
  wisdom:  CC_GLOBAL ? 400 : 1300,
  strategy: 'Senkou',                     // String: 'Nige'|'Senkou'|'Sasi'|'Oikomi'|'Oonige'
  distanceAptitude: 'S',                  // String: 'S'|'A'|'B'|'C'|'D'|'E'|'F'|'G'
  surfaceAptitude: 'A',
  strategyAptitude: 'A',
  mood: 2 as Mood,                        // -2 to +2
  skills: SkillSet([]),                   // SortedSet of skill IDs
  forcedSkillPositions: ImmMap()          // Map<skillId, position in meters>
}) {}
```

**Key Points:**
- Uses **strings** for strategy/aptitude (easier for UI)
- Different default stats for Global vs JP (`CC_GLOBAL` flag)
- Includes UI-specific fields (`outfitId`, `forcedSkillPositions`)
- Immutable (state changes create new instances)

### 2. `HorseParameters` (Simulation Interface)

**Location**: [uma-skill-tools/HorseTypes.ts](../uma-skill-tools/HorseTypes.ts)

This is the **simulation-facing interface** - used by RaceSolver:

```typescript
export interface HorseParameters {
  readonly speed: number      // Adjusted stat (with mood, course modifiers)
  readonly stamina: number
  readonly power: number
  readonly guts: number
  readonly wisdom: number
  readonly strategy: Strategy           // Enum: Strategy.Nige = 1, etc.
  readonly distanceAptitude: Aptitude   // Enum: Aptitude.S = 0, etc.
  readonly surfaceAptitude: Aptitude
  readonly strategyAptitude: Aptitude
  readonly rawStamina: number           // Original stamina (before adjustments)
}
```

**Key Points:**
- Uses **enums** for strategy/aptitude (type-safe for simulation)
- Stats are already adjusted for mood
- No UI-specific fields

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        umas.json                                 │
│  Character data: names, outfits (e.g., "Special Week")          │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    components/HorseDef.tsx                       │
│  UI Component - renders stats form, skill picker, uma selector  │
│  Props: state (HorseState), setState (setter function)          │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                  components/HorseDefTypes.ts                     │
│  HorseState class - Immutable Record holding all horse data     │
│  Default values differ by CC_GLOBAL flag                        │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                      umalator/app.tsx                            │
│  Main app - creates HorseState instances with useState()        │
│  const [uma1, setUma1] = useState(() => new HorseState());      │
│  Passes state/setState to <HorseDef /> components               │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  │ postMessage (serialized to plain object)
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                 umalator/simulator.worker.ts                     │
│  Web Worker - receives plain object, recreates HorseState       │
│  const uma_ = new HorseState(uma)                               │
│    .set('skills', SkillSet(uma.skills))                         │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    umalator/compare.ts                           │
│  runComparison() - builds race solver from HorseState           │
│  Calls buildBaseStats() to convert to HorseParameters           │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│              uma-skill-tools/RaceSolverBuilder.ts                │
│  buildBaseStats(horseDesc, mood) → HorseParameters              │
│  buildAdjustedStats(baseStats, course, ground) → HorseParameters│
│  Converts strings to enums, applies mood multiplier             │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                uma-skill-tools/RaceSolver.ts                     │
│  Core simulation - uses HorseParameters for physics             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Files

| File | Purpose |
|------|---------|
| `components/HorseDefTypes.ts` | **HorseState class** - UI state definition |
| `components/HorseDef.tsx` | **HorseDef component** - UI for editing horse |
| `uma-skill-tools/HorseTypes.ts` | **HorseParameters interface** - simulation interface |
| `uma-skill-tools/RaceSolverBuilder.ts` | **buildBaseStats()** - converts UI→simulation |
| `umalator/app.tsx` | Creates HorseState, passes to HorseDef |
| `umalator/simulator.worker.ts` | Recreates HorseState from serialized data |
| `umalator/compare.ts` | Uses buildBaseStats for simulation |
| `umalator-global/umas.json` | Character data (names, outfits) |

---

## Conversion: HorseState → HorseParameters

**Location**: [uma-skill-tools/RaceSolverBuilder.ts:182](../uma-skill-tools/RaceSolverBuilder.ts#L182)

```typescript
export function buildBaseStats(horseDesc: HorseDesc, mood: Mood) {
  const motivCoef = 1 + 0.02 * mood;  // Mood multiplier: 0.96 to 1.04

  return Object.freeze({
    speed: adjustOvercap(horseDesc.speed) * motivCoef,
    stamina: adjustOvercap(horseDesc.stamina) * motivCoef,
    power: adjustOvercap(horseDesc.power) * motivCoef,
    guts: adjustOvercap(horseDesc.guts) * motivCoef,
    wisdom: adjustOvercap(horseDesc.wisdom) * motivCoef,
    strategy: parseStrategy(horseDesc.strategy),       // String → Enum
    distanceAptitude: parseAptitude(horseDesc.distanceAptitude),
    surfaceAptitude: parseAptitude(horseDesc.surfaceAptitude),
    strategyAptitude: parseAptitude(horseDesc.strategyAptitude),
    rawStamina: horseDesc.stamina * motivCoef
  });
}
```

Then course/ground adjustments:

```typescript
export function buildAdjustedStats(baseStats: HorseParameters, course: CourseData, ground: GroundCondition) {
  return Object.freeze({
    speed: baseStats.speed * raceCourseModifier + GroundSpeedModifier[ground],
    power: baseStats.power + GroundPowerModifier[ground],
    wisdom: baseStats.wisdom * StrategyProficiencyModifier[aptitude],
    // ... other stats unchanged
  });
}
```

---

## Default Stats by Region

**Global (CC_GLOBAL=true)**:
```typescript
speed: 1200, stamina: 1200, power: 800, guts: 400, wisdom: 400
```

**JP (CC_GLOBAL=false)**:
```typescript
speed: 1850, stamina: 1700, power: 1700, guts: 1200, wisdom: 1300
```

The JP defaults are higher because JP players have been playing longer and have better developed horses.

---

## Character Data (umas.json)

**Location**: `umalator-global/umas.json` or root `umas.json`

Structure:
```json
{
  "1001": {
    "name": ["", "Special Week"],
    "outfits": {
      "100101": "[Special Dreamer]",
      "100102": "[Hopp'n♪Happy Heart]"
    }
  },
  ...
}
```

- **Key**: Character ID (4 digits, e.g., "1001")
- **name**: `[JP name, EN name]`
- **outfits**: Map of outfit ID → outfit name
  - Outfit ID format: `{char_id}{variant}{version}` (e.g., "100101" = char 1001, variant 01)

### How Character Selection Works

In `HorseDef.tsx`:
```typescript
function setUma(id) {
  // id = outfit ID like "100101"
  let newSkills = state.skills.filter(id => skilldata(id).rarity < 3);
  if (id) newSkills = newSkills.add(uniqueSkillForUma(id));  // Add unique skill
  setState(
    state.set('outfitId', id)
         .set('skills', newSkills)
  );
}

function uniqueSkillForUma(oid) {
  // Converts outfit ID to unique skill ID
  // e.g., "100101" → "100011" (unique skill for Special Week variant 01)
  const i = +oid.slice(1, -2), v = +oid.slice(-2);
  return (100000 + 10000 * (v - 1) + i * 10 + 1).toString();
}
```

---

## Adding/Modifying Horse Defaults

### To Change Default Stats

Edit `components/HorseDefTypes.ts`:
```typescript
export class HorseState extends Record({
  speed:   CC_GLOBAL ? 1200 : 1850,  // Change these values
  ...
}) {}
```

### To Add New Character

1. Add to `umalator-global/umas.json` (Global) or `umas.json` (JP)
2. Add character icon to `icons/chara/`
3. If they have a unique skill, ensure it exists in `skill_data.json`

### To Modify Stat Calculations

Edit `uma-skill-tools/RaceSolverBuilder.ts`:
- `buildBaseStats()` for mood multiplier and overcap adjustments
- `buildAdjustedStats()` for course/ground modifiers

---

## Common Patterns

### Reading Horse State in App

```typescript
// In app.tsx or components
const speed = uma1.speed;              // Direct property access
const strategy = uma1.strategy;        // String: 'Senkou'
const skills = uma1.skills;            // SortedSet of skill IDs
```

### Updating Horse State

```typescript
// Create setter for specific property
function setter(prop: keyof HorseState) {
  return (x) => setState(state.set(prop, x));
}

// Use in component
<input value={state.speed} onInput={e => setter('speed')(+e.target.value)} />

// Or update multiple properties
setState(state
  .set('speed', 1500)
  .set('strategy', 'Nige')
);
```

### Creating Fresh Horse

```typescript
const newHorse = new HorseState();  // Uses defaults based on CC_GLOBAL
```

### Resetting Horse

```typescript
function resetThisHorse() {
  setState(new HorseState());
}
```

---

## Horse Data Serialization

### JSON Export/Import

**Location**: [components/HorseDef.tsx](../components/HorseDef.tsx) lines 35-100

**Export Function** (`horseStateToJson`):
```typescript
function horseStateToJson(horse: HorseState) {
  return {
    outfitId: horse.outfitId,
    speed: horse.speed,
    stamina: horse.stamina,
    power: horse.power,
    guts: horse.guts,
    wisdom: horse.wisdom,
    strategy: horse.strategy,
    distanceAptitude: horse.distanceAptitude,
    surfaceAptitude: horse.surfaceAptitude,
    strategyAptitude: horse.strategyAptitude,
    mood: horse.mood,
    skills: Array.from(horse.skills.values()),  // Extract skill IDs from Map
    forcedSkillPositions: horse.forcedSkillPositions.toObject()
  };
}
```

**Import Function** (`validateAndParseHorseJson`):
```typescript
function validateAndParseHorseJson(json: any): HorseState | null {
  // Type checking and validation...
  return new HorseState({
    outfitId: json.outfitId || '',
    speed: json.speed,
    // ... other stats
    skills: SkillSet(json.skills.filter(id =>
      typeof id === 'string' && skilldata[id.split('-')[0]]
    )),
    forcedSkillPositions: ImmMap(json.forcedSkillPositions || {})
  });
}
```

**Key Points:**
- Skills exported as array of skill IDs (not key-value pairs)
- Type validation ensures skills exist in skill_data.json
- Handles debuff skills (appends `-N` suffix to group ID)

### Uma Card (PNG Export/Import)

**Location**: [components/UmaCard.ts](../components/UmaCard.ts)

Uma Cards embed JSON data in PNG tEXt metadata chunks, similar to SillyTavern character cards.

**Data Structure:**
```typescript
interface UmaCardData {
  version: number;      // Format version (currently 1)
  horse: any;           // HorseState JSON from horseStateToJson()
}
```

**Export Process** (`createUmaCard`):
1. Fetch uma portrait from `/icons/chara/trained_chr_icon_{uid}_{outfitId}_02.png`
2. Convert HorseState to JSON using `horseStateToJson()`
3. Create PNG tEXt chunk with keyword "UmaCard" and JSON data
4. Insert chunk before IEND chunk in PNG file
5. Calculate CRC32 checksum for chunk validation

**Import Process** (`extractDataFromPng`):
1. Verify PNG signature (8 bytes)
2. Iterate through PNG chunks looking for tEXt with keyword "UmaCard"
3. Parse JSON from chunk data
4. Extract `horse` field and validate with `validateAndParseHorseJson()`

**Technical Details:**
- PNG chunk format: Length (4) + Type (4) + Data (variable) + CRC (4)
- tEXt chunk data: Keyword + null byte + text
- CRC32 checksum calculated over Type + Data bytes
- Compatible with standard PNG viewers (display portrait, ignore metadata)

**File Naming:**
- Export: `{character_name}_card.png` (e.g., `Special_Week_card.png`)
- Character name from `umas.json` based on outfit ID

---

## Related Files

- [JP-GLOBAL-TERMINOLOGY.md](JP-GLOBAL-TERMINOLOGY.md) - Strategy/aptitude enum mappings
- [UMALATOR-GLOBAL-MAPPING.md](UMALATOR-GLOBAL-MAPPING.md) - Build process and data file locations
