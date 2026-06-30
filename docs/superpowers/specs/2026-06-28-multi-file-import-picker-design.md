# Multi-File Import Picker (v2) — Design Spec

**Date:** 2026-06-28
**Status:** Approved (design)

## Purpose

v2's per-uma **"Import JSON file…"** imports a single game-export/native JSON file and
loads it into that uma panel. Users with several training-log exports want to upload
**multiple** files at once and **pick** which uma to load from a visual chooser that
reuses the Saved-umas tab's card look.

Confirmed scope from brainstorming:
- **Ephemeral picker → load.** Pick one card → it loads into the invoking uma panel.
  Nothing is persisted (no auto-save to trainees).
- **Entry point: the existing per-uma Import button** (`V2UmaPanel` "Import JSON file…").
  The picked uma loads into the panel whose button was clicked.
- **One uma per file** (training-log shape; no multi-uma-per-file extraction).
- **Skip the picker when only one file** resolves — load directly (today's UX).
- **Reuse the trainee card** visual via a shared presentational component.

## Architecture (fully v2, all `UmaState`)

v2 does not use the shared `components/HorseDef.tsx`; it has its own `V2UmaPanel`
(`uma-panel.tsx`) and IO in `storage.ts`, all typed `UmaState`. This feature lives
entirely in v2 — no shared-component or `HorseState` bridging.

```
V2UmaPanel "Import JSON file…"  (uma-panel.tsx)
   └─ importHorseJsonMulti()    (storage.ts)  → ImportCandidate[]
        ├─ 0 valid → notify "no valid files"
        ├─ 1 valid → onLoad(data)              (no picker)
        └─ ≥2 valid → <ImportPickerModal>      (local to the panel)
                          └─ click card → onLoad(data) + close   (ephemeral)
```

## Components

### 1. `storage.ts` — multi-file parse

Add:

```ts
export interface ImportCandidate {
  name: string;      // source file name, for display/fallback
  data: UmaState;    // parsed + validated
}

// Opens a multi-select JSON file picker, parses each file (one uma per file),
// returns all valid candidates. Invalid/unparseable files are skipped.
export function importHorseJsonMulti(): Promise<ImportCandidate[]>;
```

- File input: `type=file`, `accept='.json,application/json'`, **`multiple = true`**.
- For each `File`: read text → `tryParseImportText` (existing — handles native JSON and
  game-export shapes) → `validateAndParseUmaJson` (existing). On success push
  `{ name: file.name, data }`; on failure (parse error or `null`) skip and count it.
- Resolve with the candidate array (possibly empty). Never reject on a single bad file;
  per-file `try/catch`.
- The existing single-file `importHorseJson()` stays for any other caller, or is
  reimplemented as `importHorseJsonMulti().then(c => c[0]?.data ?? null)` — implementer's
  choice as long as the single-file menu path keeps working.

### 2. `uma-panel.tsx` — `handleImportJson` becomes multi-aware

`V2UmaPanel` gains local picker state and routes on candidate count:

```ts
const [pickerCandidates, setPickerCandidates] = useState<ImportCandidate[] | null>(null);

const handleImportJson = useCallback(async () => {
  const candidates = await importHorseJsonMulti();
  if (candidates.length === 0) return;            // (optional: surface "no valid files")
  if (candidates.length === 1) { onLoad?.(candidates[0].data); return; }
  setPickerCandidates(candidates);                // ≥2 → open picker
}, [onLoad]);
```

Render (when `pickerCandidates`):

```tsx
<ImportPickerModal
  candidates={pickerCandidates}
  onPick={(data) => { onLoad?.(data); setPickerCandidates(null); }}
  onClose={() => setPickerCandidates(null)}
/>
```

Because each `V2UmaPanel` (Uma 1, Uma 2) owns its `onLoad` and its picker state, the
pick loads into the correct panel with no app-level wiring.

### 3. `import-picker.tsx` (new) — the picker modal

```ts
interface ImportPickerModalProps {
  candidates: ImportCandidate[];
  onPick: (data: UmaState) => void;
  onClose: () => void;
}
export function ImportPickerModal(props: ImportPickerModalProps): JSX.Element;
```

- Built on the existing v2 `Modal` (`./components`), title e.g. "Choose a uma to import".
- Renders a responsive grid of clickable cards — one per candidate — using the shared
  `TraineeCardPreview` (below). Clicking a card → `onPick(candidate.data)`.
- Backdrop/Cancel → `onClose`. Keyboard: Esc closes (via `Modal`).
- The card's caption shows the character name (derived from `data.outfitId`); the file
  name is a secondary line / `title` tooltip so duplicate characters stay distinguishable.

### 4. `trainee-card-preview.tsx` (new) — shared presentational card

Extract the read-only visual from `TraineeCard` (portrait + character name + 5-stat
preview) so it is reused verbatim by both the Saved-umas tab and the picker:

```ts
interface TraineeCardPreviewProps {
  data: Pick<UmaState, 'outfitId' | 'speed' | 'stamina' | 'power' | 'guts' | 'wisdom'>;
  name?: string;        // display name override (falls back to character name / "Unknown")
}
export function TraineeCardPreview({ data, name }: TraineeCardPreviewProps): JSX.Element;
```

- Portrait: `icons[data.outfitId]` else the random-mob fallback (same logic as `TraineeCard`).
- Name: `umas[data.outfitId.slice(0,4)].name[1]` else `name` else "Unknown".
- Stat preview: the existing `v2-trainee-stats-preview` markup + `status_0x.png` icons.
- Reuses existing `v2-trainee-*` CSS classes (no new stylesheet needed; the picker grid
  may add a thin wrapper class for layout).
- `trainees-tab.tsx`'s `TraineeCard` is refactored to render `TraineeCardPreview` for its
  portrait/name/stats block, keeping its own memo/folder/delete/load actions around it.
  This guarantees the picker and the tab stay visually identical.

## Error handling

- Per-file `try/catch` in `importHorseJsonMulti`; bad files are skipped, not fatal.
- If some files were skipped, surface a brief summary (e.g. an `alert` / existing toast):
  "Imported N of M files (skipped: a.json, b.json)." 0 valid → "No valid uma JSON found."
- File input is not reused after resolve (a fresh input per call), so re-selecting the
  same files works.

## Out of scope

- Persisting picked umas as trainees (ephemeral by decision).
- Multi-uma-per-file extraction (training-log files hold one uma).
- PNG uma-card multi-import (v2 single import is JSON-only; multi stays JSON-only).
- Any change to v1 / the shared `HorseDef` selector.

## Verification

No automated harness for v2 UI (repo pattern). Verify by:

1. **Build:** `cd umalator-global && node build.mjs` and `cd umalator-global/v2 && npx vite build` succeed.
2. **Single file:** import one JSON → loads directly into the panel, **no** picker (unchanged UX).
3. **Multiple files:** select 2–3 training-log JSONs → picker opens with a card per file
   (correct portrait, character name, stats) → clicking a card loads that uma into the
   invoking panel (Uma 1 vs Uma 2 respected) → modal closes; nothing saved to trainees.
4. **Mixed valid/invalid:** include a malformed file → it's skipped, valid ones still
   appear, summary shown.
5. **Visual parity:** picker cards match the Saved-umas tab cards (shared `TraineeCardPreview`).
