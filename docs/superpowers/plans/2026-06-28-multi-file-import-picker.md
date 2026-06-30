# Multi-File Import Picker (v2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a v2 uma panel import multiple game-export/native JSON files at once and pick which uma to load via a modal that reuses the Saved-umas trainee card.

**Architecture:** Fully v2, all `UmaState`. `storage.ts` gains a multi-file parse; `V2UmaPanel.handleImportJson` routes 0/1/≥2 candidates (≥2 opens a picker local to the panel); a new `import-picker.tsx` modal renders a grid of cards reusing a new shared `TraineeCardPreview` extracted from `TraineeCard`.

**Tech Stack:** Preact (JSX via `h`), v2 `Modal`/`Dropdown` components, esbuild + Vite builds. No automated UI test harness exists in v2 — verification is typecheck + build + manual (matches repo pattern).

**Spec:** `docs/superpowers/specs/2026-06-28-multi-file-import-picker-design.md`

---

## Files

- Create: `umalator-global/v2/trainee-card-preview.tsx` — shared presentational card (portrait + name + stats) (Task 1)
- Modify: `umalator-global/v2/trainees-tab.tsx` — `TraineeCard` renders `TraineeCardPreview` (Task 1)
- Modify: `umalator-global/v2/storage.ts` — `ImportCandidate` + `importHorseJsonMulti()` (Task 2)
- Create: `umalator-global/v2/import-picker.tsx` — `ImportPickerModal` (Task 3)
- Modify: `umalator-global/v2/uma-panel.tsx` — multi-aware `handleImportJson` + render picker (Task 4)

---

## Task 1: Shared `TraineeCardPreview` + refactor `TraineeCard`

**Files:**
- Create: `umalator-global/v2/trainee-card-preview.tsx`
- Modify: `umalator-global/v2/trainees-tab.tsx`

- [ ] **Step 1: Create the shared presentational card**

Create `umalator-global/v2/trainee-card-preview.tsx` with exactly:

```tsx
/**
 * Presentational uma card (portrait + name + 5-stat preview), shared by the
 * Saved-umas tab (TraineeCard) and the multi-file import picker. Read-only — no
 * memo/folder/delete/load actions; the caller wraps those around it.
 */
import { h, ComponentChildren } from 'preact';
import { useMemo } from 'preact/hooks';
import type { UmaState } from './uma-panel';
import umas from '../umas.json';
import icons from '../../icons.json';

const randomMobIcon = `/uma-tools/icons/mob/trained_mob_chr_icon_${8000 + Math.floor(Math.random() * 624)}_000001_01.png`;

/** Character name from an outfit id (e.g. "El Condor Pasa"), or the fallback. */
export function umaDisplayName(outfitId: string | undefined, fallback: string): string {
	if (outfitId) {
		const uma = (umas as any)[outfitId.slice(0, 4)];
		if (uma?.name?.[1]) return uma.name[1];
	}
	return fallback;
}

interface TraineeCardPreviewProps {
	data: Pick<UmaState, 'outfitId' | 'speed' | 'stamina' | 'power' | 'guts' | 'wisdom'>;
	/** Displayed name (slot name in the tab; character/file name in the picker). */
	name: string;
	/** Optional content rendered between the name and the stat preview (e.g. the memo editor). */
	children?: ComponentChildren;
}

export function TraineeCardPreview({ data, name, children }: TraineeCardPreviewProps) {
	const portraitIcon = useMemo(() => {
		if (!data.outfitId) return randomMobIcon;
		return (icons as Record<string, string>)[data.outfitId] || randomMobIcon;
	}, [data.outfitId]);

	const { speed, stamina, power, guts, wisdom } = data;

	return (
		<div class="v2-trainee-card-content">
			<img src={portraitIcon} alt={name} class="v2-trainee-portrait" loading="lazy" />
			<div class="v2-trainee-info">
				<div class="v2-trainee-name" title={name}>{name}</div>
				{children}
				<div class="v2-trainee-stats-preview">
					<span class="v2-trainee-stat">
						<img src="/uma-tools/icons/status_00.png" alt="SPD" class="v2-trainee-stat-icon" />
						{speed}
					</span>
					<span class="v2-trainee-stat">
						<img src="/uma-tools/icons/status_01.png" alt="STA" class="v2-trainee-stat-icon" />
						{stamina}
					</span>
					<span class="v2-trainee-stat">
						<img src="/uma-tools/icons/status_02.png" alt="POW" class="v2-trainee-stat-icon" />
						{power}
					</span>
					<span class="v2-trainee-stat">
						<img src="/uma-tools/icons/status_03.png" alt="GUT" class="v2-trainee-stat-icon" />
						{guts}
					</span>
					<span class="v2-trainee-stat">
						<img src="/uma-tools/icons/status_04.png" alt="WIS" class="v2-trainee-stat-icon" />
						{wisdom}
					</span>
				</div>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Refactor `TraineeCard` to use the preview**

In `umalator-global/v2/trainees-tab.tsx`:

(a) Add to the imports near the top (after the existing local imports, e.g. after the `./storage` import block):

```ts
import { TraineeCardPreview } from './trainee-card-preview';
```

(b) Delete the now-unused module-level `randomMobIcon` line (currently line ~184):

```ts
const randomMobIcon = `/uma-tools/icons/mob/trained_mob_chr_icon_${8000 + Math.floor(Math.random() * 624)}_000001_01.png`;
```

(c) Inside `TraineeCard`, delete the `portraitIcon` and `characterName` `useMemo` blocks (currently lines ~190-201) — they move into the preview. Keep the `memo` state, `memoTimeoutRef`, `handleMemoChange`, the cleanup `useEffect`, `handleDelete`, and the `const { speed, ... } = slot.data;` line may be removed too (now unused).

(d) Replace the card-content JSX block — from `<div class="v2-trainee-card-content">` through its matching closing `</div>` (currently lines ~236-282, i.e. the portrait `<img>`, the `v2-trainee-info` div with name + memo `<textarea>` + stats) — with:

```tsx
				<TraineeCardPreview data={slot.data} name={slot.name}>
					<textarea
						class="v2-trainee-memo"
						placeholder="Add notes..."
						value={memo}
						onInput={(e) => handleMemoChange((e.target as HTMLTextAreaElement).value)}
						rows={1}
					/>
				</TraineeCardPreview>
```

The outer `<div class="v2-trainee-card">` and the `<div class="v2-trainee-actions">…</div>` block (load/move/delete buttons) stay exactly as they are.

- [ ] **Step 3: Typecheck the two files**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1/umalator-global/v2
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "trainee-card-preview|trainees-tab" | head
echo "clean for these two files if empty above"
```
Expected: no errors referencing `trainee-card-preview.tsx` or `trainees-tab.tsx`. (If the v2 dir has no `tsconfig.json`, run from repo root: `npx tsc --noEmit --skipLibCheck --moduleResolution bundler --module esnext --target es2018 --jsx react-jsx --jsxImportSource preact --lib es2018,dom umalator-global/v2/trainee-card-preview.tsx 2>&1 | grep trainee | head`. Pre-existing errors in *other* files are out of scope.)

- [ ] **Step 4: Build v2 to confirm visual block compiles**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1/umalator-global/v2
npx vite build 2>&1 | tail -3
```
Expected: `✓ built in …`, no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1
git add umalator-global/v2/trainee-card-preview.tsx umalator-global/v2/trainees-tab.tsx
git commit -m "v2: extract shared TraineeCardPreview from TraineeCard"
```

---

## Task 2: `importHorseJsonMulti()` in storage.ts

**Files:**
- Modify: `umalator-global/v2/storage.ts`

- [ ] **Step 1: Add the candidate type + multi-file importer**

In `umalator-global/v2/storage.ts`, immediately **after** the existing `importHorseJson()` function (ends at the line with its closing `}` around line 421), insert:

```ts
/**
 * A parsed import candidate: one uma from one uploaded file.
 */
export interface ImportCandidate {
	name: string;     // source file name (display + fallback)
	data: UmaState;   // parsed + validated
}

/**
 * Open a MULTI-select JSON file picker, parse each file (one uma per file), and
 * return all valid candidates plus the names of files that failed to parse.
 * Never rejects; invalid files are skipped.
 */
export function importHorseJsonMulti(): Promise<{ candidates: ImportCandidate[]; skipped: string[] }> {
	return new Promise((resolve) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json,application/json';
		input.multiple = true;

		input.onchange = async (e) => {
			const files = Array.from((e.target as HTMLInputElement).files || []);
			if (files.length === 0) {
				resolve({ candidates: [], skipped: [] });
				return;
			}

			const candidates: ImportCandidate[] = [];
			const skipped: string[] = [];

			for (const file of files) {
				try {
					const text = await file.text();
					const json = tryParseImportText(text);
					const parsed = json ? validateAndParseUmaJson(json) : null;
					if (parsed) {
						candidates.push({ name: file.name, data: parsed });
					} else {
						skipped.push(file.name);
					}
				} catch (err) {
					console.error('Failed to parse JSON file:', file.name, err);
					skipped.push(file.name);
				}
			}

			resolve({ candidates, skipped });
		};

		input.oncancel = () => resolve({ candidates: [], skipped: [] });
		input.click();
	});
}
```

`tryParseImportText` and `validateAndParseUmaJson` are already imported/defined in this file (used by `importHorseJson`). Leave `importHorseJson` unchanged — the single-file menu path keeps working.

- [ ] **Step 2: Typecheck storage.ts**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1/umalator-global/v2
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "storage.ts" | head
echo "clean if empty"
```
Expected: no new errors in `storage.ts`.

- [ ] **Step 3: Build v2**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1/umalator-global/v2 && npx vite build 2>&1 | tail -2
```
Expected: builds clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1
git add umalator-global/v2/storage.ts
git commit -m "v2 storage: add importHorseJsonMulti for multi-file import"
```

---

## Task 3: `ImportPickerModal`

**Files:**
- Create: `umalator-global/v2/import-picker.tsx`

- [ ] **Step 1: Create the picker modal**

Create `umalator-global/v2/import-picker.tsx` with exactly:

```tsx
/**
 * Modal that shows uploaded import candidates as trainee-style cards and lets the
 * user pick one to load. Ephemeral — nothing is persisted.
 */
import { h } from 'preact';
import { Modal } from './components';
import { TraineeCardPreview, umaDisplayName } from './trainee-card-preview';
import type { ImportCandidate } from './storage';
import type { UmaState } from './uma-panel';

interface ImportPickerModalProps {
	candidates: ImportCandidate[];
	onPick: (data: UmaState) => void;
	onClose: () => void;
}

export function ImportPickerModal({ candidates, onPick, onClose }: ImportPickerModalProps) {
	return (
		<Modal isOpen={true} onClose={onClose} title="Choose a uma to import">
			<div class="v2-import-picker-grid">
				{candidates.map((c, i) => (
					<button
						key={`${c.name}-${i}`}
						type="button"
						class="v2-import-picker-card"
						onClick={() => onPick(c.data)}
						title={c.name}
					>
						<TraineeCardPreview data={c.data} name={umaDisplayName(c.data.outfitId, c.name)} />
					</button>
				))}
			</div>
		</Modal>
	);
}
```

- [ ] **Step 2: Add picker grid CSS**

Append to `umalator-global/v2/v2.css` (the v2 stylesheet imported by the app; if the project keeps trainee styles in a different file, append there instead — confirm with `grep -rl "v2-trainee-card" umalator-global/v2/*.css`):

```css
/* Multi-file import picker */
.v2-import-picker-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
	gap: 12px;
	max-height: 60vh;
	overflow-y: auto;
	padding: 4px;
}
.v2-import-picker-card {
	display: block;
	width: 100%;
	text-align: left;
	background: var(--v2-card-bg, rgba(255, 255, 255, 0.04));
	border: 1px solid var(--v2-border, rgba(255, 255, 255, 0.12));
	border-radius: 8px;
	padding: 8px;
	cursor: pointer;
	transition: border-color 120ms ease, background 120ms ease;
}
.v2-import-picker-card:hover,
.v2-import-picker-card:focus-visible {
	border-color: var(--v2-accent, #7fbf7e);
	background: var(--v2-card-bg-hover, rgba(255, 255, 255, 0.08));
	outline: none;
}
```

- [ ] **Step 3: Typecheck + build**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1/umalator-global/v2
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "import-picker" | head
npx vite build 2>&1 | tail -2
```
Expected: no `import-picker` type errors; build clean. (`Modal` is exported from `./components` — verify with `grep -n "Modal" umalator-global/v2/components/index.ts` if the import fails.)

- [ ] **Step 4: Commit**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1
git add umalator-global/v2/import-picker.tsx umalator-global/v2/v2.css
git commit -m "v2: add ImportPickerModal for multi-file import"
```

---

## Task 4: Wire multi-import into `V2UmaPanel`

**Files:**
- Modify: `umalator-global/v2/uma-panel.tsx`

- [ ] **Step 1: Add imports**

In `umalator-global/v2/uma-panel.tsx`, extend the existing `./storage` import (currently includes `importHorseJson`, `pasteHorseFromClipboard`, etc.) to also pull `importHorseJsonMulti` and the `ImportCandidate` type, and add the picker import. Concretely, add `importHorseJsonMulti,` to the `from './storage'` import list, and add these two lines after the storage import:

```ts
import type { ImportCandidate } from './storage';
import { ImportPickerModal } from './import-picker';
```

(If `useState` is not already imported from `preact/hooks` in this file, add it — it is used below. It is already imported.)

- [ ] **Step 2: Add picker state + make `handleImportJson` multi-aware**

Inside `V2UmaPanel`, add picker state near the other `useState` hooks (e.g. beside `savedSlots`):

```ts
	const [pickerCandidates, setPickerCandidates] = useState<ImportCandidate[] | null>(null);
```

Replace the existing `handleImportJson` (currently lines ~661-666):

```ts
	const handleImportJson = useCallback(async () => {
		const imported = await importHorseJson();
		if (imported && onLoad) {
			onLoad(imported);
		}
	}, [onLoad]);
```

with:

```ts
	const handleImportJson = useCallback(async () => {
		const { candidates, skipped } = await importHorseJsonMulti();
		if (skipped.length > 0) {
			alert(`Skipped ${skipped.length} file(s) that weren't valid uma JSON:\n${skipped.join('\n')}`);
		}
		if (candidates.length === 0) return;
		if (candidates.length === 1) {
			onLoad?.(candidates[0].data);
			return;
		}
		setPickerCandidates(candidates);
	}, [onLoad]);
```

- [ ] **Step 3: Render the picker**

In `V2UmaPanel`'s returned JSX, render the modal when candidates are present. Find where the panel renders its other modals (the OCR modal / save dialogs near the end of the returned tree) and add, as a sibling:

```tsx
			{pickerCandidates && (
				<ImportPickerModal
					candidates={pickerCandidates}
					onPick={(data) => { onLoad?.(data); setPickerCandidates(null); }}
					onClose={() => setPickerCandidates(null)}
				/>
			)}
```

If you can't locate an existing modal render site, add it just before the final closing tag of the component's top-level returned fragment/element. (Preact renders it via portal inside `Modal`, so its exact position in the tree doesn't matter visually.)

- [ ] **Step 4: Typecheck + build both v1 and v2**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1/umalator-global/v2
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "uma-panel" | head
npx vite build 2>&1 | tail -3
cd /Users/jptyndalljr/Dev/uma-tools-1/umalator-global && node build.mjs 2>&1 | tail -3
```
Expected: no `uma-panel` type errors; both the v2 Vite build and the esbuild `build.mjs` succeed.

- [ ] **Step 5: Commit**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1
git add umalator-global/v2/uma-panel.tsx
git commit -m "v2: multi-file import opens a picker (single file loads directly)"
```

---

## Manual verification (after all tasks)

Run the v2 dev server (`cd umalator-global/v2 && npx vite`), then in a uma panel's import menu → "Import JSON file…":
1. **One file** → loads directly into that panel; no picker.
2. **Two or three training-log JSONs** → picker opens with one card per file (correct portrait, character name, stats); clicking a card loads that uma into the **invoking** panel (verify Uma 1 vs Uma 2); modal closes; the Saved-umas tab is unchanged (nothing saved).
3. **A malformed file mixed in** → skip alert lists it; valid files still appear.
4. **Visual parity** → picker cards look like the Saved-umas tab cards.

## Done criteria

- Multi-select JSON import; 0 → notice, 1 → direct load, ≥2 → picker.
- Picker loads into the correct panel, ephemeral.
- `TraineeCardPreview` shared by the tab and the picker (single source for the card visual).
- v1 and the shared `HorseDef` untouched; both builds green.
