# Component Architecture Review

*Reviewed: 2026-01-28*

## Executive Summary

This Preact/TypeScript codebase is functionally complete with solid foundations. Key strengths include Immutable.js state management, clean utility separation (UmaCard, GeminiOCR), and excellent accessibility in Dropdown.tsx. Main weaknesses are component size (HorseDef.tsx at 975 lines), type safety gaps, and duplicated patterns.

---

## Component Inventory

| Component | Lines | Responsibility | Health |
|-----------|-------|----------------|--------|
| HorseDef.tsx | 975 | Horse config UI, stats, skills, save/load | Needs refactoring |
| SkillList.tsx | 678 | Skill picker with filtering | Large, could split |
| RaceTrack.tsx | 525 | SVG track visualization | Well-memoized |
| RaceSummaryUtils.ts | 526 | Race event extraction logic | Good separation |
| OCRModal.tsx | 388 | Screenshot OCR import | Good |
| GeminiOCR.ts | 287 | AI OCR service | Good separation |
| UmaCard.ts | 203 | PNG metadata utils | Excellent |
| SkillProcDataDialog.tsx | 146 | Skill data visualization | OK |
| Dropdown.tsx | 137 | Reusable dropdown | Excellent |
| SlotDialog.tsx | 100 | Save slot modal | OK |
| HorseDefTypes.ts | 44 | Immutable.js Record | Good |
| Language.tsx | 32 | Language context | Good |
| Tooltip.tsx | 12 | Tooltip wrapper | Good |

---

## Critical Issues

### 1. HorseDef.tsx is Too Large (975 lines)

**Problem**: Single component handling Uma selection, stat management, aptitude selection, skill management, save/load (JSON/PNG/slots), OCR integration, and forced skill positions.

**Recommended Split**:
```
HorseDef.tsx →
  ├── UmaSelector.tsx (~200 lines) - autocomplete, search, selection
  ├── StatEditor.tsx (~50 lines) - 5 stat inputs
  ├── AptitudeEditor.tsx (~80 lines) - surface/distance/strategy aptitudes
  ├── SkillEditor.tsx (~150 lines) - skill list with expansion
  └── HorseDef.tsx (~300 lines) - orchestration only
```

### 2. Type Safety Gaps

**`any` usage found**:
```typescript
// HorseDef.tsx:28
function getHorseSlots(): Record<string, any>

// HorseDef.tsx:122
function validateAndParseHorseJson(json: any): HorseState | null

// RaceSummaryUtils.ts:96
function buildEventTimeline(medianrun: any, ...)

// SkillProcDataDialog.tsx:6
function extractSkillRunData(compareRunData: any, umaIndex: number): any
```

**Fix**: Define proper interfaces for all data boundaries.

### 3. Missing Memoization

**List items not memoized**:
- `Skill` component in SkillList.tsx (rendered 100+ times)
- `EventLine` component in RaceSummary.tsx
- `AptitudeIcon` in HorseDef.tsx

**Handler functions recreated every render**:
```typescript
// HorseDef.tsx:712-714 - should use useCallback
function setter(prop: keyof HorseState) {
    return (x) => setState(state.set(prop, x));
}
```

### 4. No List Virtualization

SkillList renders ALL skills (100+) with CSS `hidden` class instead of virtualizing. Consider `react-window` or `react-virtual`.

### 5. Circular Dependency

`SkillProcDataDialog.tsx` imports from `umalator/app.tsx`:
```typescript
import { LengthDifferenceChart, ... } from '../umalator/app';
```

---

## Code Duplication

### Dropdown Pattern (3 custom implementations)
- Load dropdown (HorseDef.tsx:244-276)
- Save dropdown (HorseDef.tsx:246-356)
- Reset dropdown (HorseDef.tsx:501-526)

Should use existing `Dropdown.tsx` component.

### Select Components (3 similar implementations)
- `AptitudeSelect` (HorseDef.tsx:587-609)
- `MoodSelect` (HorseDef.tsx:611-641)
- `StrategySelect` (HorseDef.tsx:643-665)

**Abstraction opportunity**:
```typescript
interface IconSelectProps<T> {
    value: T;
    onChange: (value: T) => void;
    options: Array<{ value: T; icon: string; label: string }>;
}
```

### File Upload Pattern (duplicated)
- HorseDef.tsx (lines 196-238): JSON/PNG upload
- OCRModal.tsx (lines 47-107): Image upload

**Hook opportunity**: `useFileUpload()`

### LocalStorage Pattern (duplicated)
- HorseDef.tsx:28-69 (horse slots)
- GeminiOCR.ts:264-286 (API key)

**Hook opportunity**: `useLocalStorage<T>(key, defaultValue)`

### Modal Pattern (3 similar implementations)
- OCRModal
- SlotDialog
- SkillProcDataDialog

Should share base `Modal` component with focus trap, escape handling, overlay click.

---

## Accessibility Issues

### Good Example: Dropdown.tsx
```typescript
<div role="listbox" tabIndex={0} onKeyDown={handleKeyDown}>
    <li role="option" aria-selected={option.value === value}>
```

### Missing ARIA Elsewhere

**Uma Selector** (HorseDef.tsx:528-540):
```typescript
<ul class="umaSuggestions">  // Missing: role, aria-expanded, aria-activedescendant
```

**Skill List** (SkillList.tsx:670):
```typescript
<ul class="skillList" onClick={toggleSelected}>  // No keyboard navigation
```

**Modals** (OCRModal.tsx:181):
```typescript
<div className="ocrModalOverlay">  // Missing: role="dialog", aria-labelledby, focus trap
```

**Buttons as divs**:
```typescript
<div class="skillPickerClose" onClick={...}>✕</div>  // Should be <button aria-label="Close">
```

---

## Specific Code Issues

### Unsafe JSON Parsing
```typescript
// HorseDef.tsx:219 - no try-catch, no validation
const json = JSON.parse(event.target.result as string);
```

### Direct DOM Manipulation in React
```typescript
// HorseDef.tsx:852-854
useLayoutEffect(function () {
    document.querySelectorAll('.horseExpandedSkill').forEach(e => {
        (e as HTMLElement).style.gridRow = 'span ' + ...
    });
}, [expanded]);
```

### Memory Leak Risk
```typescript
// OCRModal.tsx:110-114 - handlePaste not in dependency array
useEffect(() => {
    if (open) {
        document.addEventListener('paste', handlePaste);
        return () => document.removeEventListener('paste', handlePaste);
    }
}, [open]);  // handlePaste recreated each render
```

### Magic Numbers
```typescript
// HorseDef.tsx:555-569
function rankForStat(x: number) {
    if (x > 1200) { ... }      // What is 1200?
    else if (x >= 1150) { ... } // What is 1150?
}
```

### Console Logs in Production
Found in RaceTrack.tsx:186, 222, 376, and more.

---

## Recommendations Priority

### High Priority
1. Split HorseDef.tsx into smaller components
2. Add proper TypeScript interfaces (eliminate `any`)
3. Add React.memo to list item components
4. Fix accessibility (ARIA, keyboard nav)

### Medium Priority
5. Create reusable hooks (useFileUpload, useLocalStorage)
6. Create generic IconSelect component
7. Create base Modal component
8. Consistent error handling strategy

### Low Priority
9. Remove console.logs
10. Extract magic numbers to named constants
11. Consider CSS Modules
12. Add unit tests for utilities

---

## Strengths

- **Clean utility separation**: UmaCard.ts, GeminiOCR.ts, RaceSummaryUtils.ts
- **Immutable data patterns**: Prevents accidental mutations
- **Co-located CSS**: Each component has matching .css file
- **Good internationalization**: preact-i18n with STRINGS objects
- **Excellent Dropdown.tsx**: Full keyboard nav, ARIA, focus management
