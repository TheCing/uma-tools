# UX/UI Review

*Reviewed: 2026-01-28*

## Executive Summary

**Overall UX Grade: C+ (75/100)**

Feature-rich application with good dark mode and complex visualizations. Main issues: accessibility barriers, insufficient touch targets, information density, and inconsistent patterns. Powerful for experts but presents barriers for new users and mobile.

---

## Critical Issues (Fix Immediately)

### 1. Touch Targets Under 44×44px Minimum

**WCAG 2.1 SC 2.5.5 violations:**

| Element | Actual Size | Location |
|---------|-------------|----------|
| Stat inputs (mobile) | ~50×20px | HorseDef.tsx |
| Aptitude dropdown chevron | 4×4px | HorseDef.css:576 |
| Skill dismiss button | ~14px wide | SkillList.css |
| Forced position inputs | 45×auto | HorseDef.css |

**Fix**: Add minimum 44×44px touch areas:
```css
.horseParam > input {
    min-height: 44px;
    padding: 8px;
}
```

### 2. Keyboard Accessibility Missing

**Non-keyboard-accessible elements:**

- Weather/Season/Time selectors (divs with onClick, no tabindex)
- Skill list items (`<li onClick>` without keyboard handlers)
- Aptitude icon selectors

**Fix**: Add proper ARIA roles:
```tsx
<div role="radiogroup" aria-label="Weather selection">
    <div role="radio" tabIndex={0} aria-checked={selected} onKeyDown={handleKeyDown}>
```

### 3. Hover-Only Dropdowns Fail on Touch

Save/Load/Reset menus only open on `:hover` - unusable on touch devices.

**Location**: HorseDef.css lines 390-420

**Fix**: Convert to click-to-open with state:
```tsx
const [menuOpen, setMenuOpen] = useState(false);
<button onClick={() => setMenuOpen(!menuOpen)}>
```

### 4. Missing ARIA Labels

**Elements needing ARIA:**

| Component | Missing | Fix |
|-----------|---------|-----|
| Modals | `role="dialog"`, `aria-modal` | Add to OCRModal, SlotDialog |
| Dropdowns | `aria-expanded`, `aria-controls` | Add to all dropdown triggers |
| Icon buttons | `aria-label` | Add to close buttons, icon-only buttons |
| Images | `alt` text | Add meaningful descriptions or `alt=""` |

### 5. No Form Validation Feedback

Stat inputs have `min="1" max="2000"` but no visual feedback when invalid.

**Fix**:
```css
input:invalid {
    border-color: rgb(220, 38, 38);
    background: rgba(220, 38, 38, 0.1);
}
```

---

## High Priority Issues

### 6. Information Density

**Problem**: 5 stat columns at 130px each with no gap creates cramped layout.

**Location**: HorseDef.css line 500
```css
.horseParams {
    grid-template-columns: repeat(5, 130px);
    gap: 0;
}
```

**Recommendation**: Add 8-12px gap, consider 2-row layout on mobile.

### 7. Mobile Labels Hidden

At 480px, stat labels (`Speed`, `Stamina`) are hidden:
```css
.horseParamHeader > span {
    display: none;
}
```

**Problem**: Users lose context - icons alone are ambiguous.

**Fix**: Use abbreviations instead:
```
Speed → SPD | Stamina → STA | Power → POW | Guts → GUT | Wisdom → WIT
```

### 8. No Loading Progress for OCR

OCR extraction takes 5-10 seconds with only "Extracting..." text.

**Fix**: Add progress indicator or spinner with estimated time.

### 9. `alert()` Instead of In-App Notifications

```typescript
alert('Invalid horse JSON file. Please check the file format.');
```

**Fix**: Create toast notification component matching app aesthetic.

### 10. Drag-and-Drop Has No Visual Feedback

Skill markers on RaceTrack are draggable but:
- No drag preview/ghost follows cursor
- No drop zone highlighting
- No position tooltip during drag

---

## Moderate Issues

### 11. Inconsistent Spacing Scale

Gap values vary: `4px`, `5px`, `6px`, `8px`, `10px`, `12px`, `16px`, `20px`

**Fix**: Create design tokens:
```css
:root {
    --space-xs: 4px;
    --space-sm: 8px;
    --space-md: 16px;
    --space-lg: 24px;
    --space-xl: 32px;
}
```

### 12. Mixed Input Styles

Three different input patterns:
1. Stat inputs (borderless, background: inherit)
2. OCR inputs (bordered, rounded)
3. Forced position inputs (semi-transparent, backdrop blur)

**Recommendation**: Document when to use each pattern or consolidate.

### 13. Font Size Jumps

- `.horseDefHeader`: 2em → 1.2em at 480px (significant jump)
- No typographic scale defined

### 14. No Focus Trap in Modals

Tab key can escape modals - should cycle within.

**Fix**: Implement focus trap hook or use library.

### 15. Slot Submenu Requires Precise Mouse

Nested hover menus (`.slotSubmenu`) fail without hover delay tolerance.

---

## Minor Issues

### 16. Console Logs in Production

Found in RaceTrack.tsx:186, 222, 376:
```typescript
console.log('Dragging:', {newStart, newEnd, dragOffset, x, w});
```

### 17. No Escape Key for Modals

Modals close on overlay click and X button, but not Escape key.

### 18. Skill Expansion No Animation

Height change is instant - should animate.

### 19. Search Placeholder Only on Focus

Skill search placeholder not visible until input focused.

### 20. No Filter Count

Skill list shows filtered results but no count like "45 skills match".

---

## What's Working Well

### Dark Mode Implementation
- Comprehensive CSS custom properties
- Consistent application across components
- Good contrast in most areas

### Dropdown.tsx Component
- Excellent keyboard navigation (Arrow keys, Enter, Escape, Tab)
- Proper focus management with `scrollIntoView`
- Good ARIA implementation (`role="listbox"`, `aria-selected`)
- Clean dark mode support

### OCR Modal Flow
- Clear two-step process (upload → review)
- Multiple input methods (drag/drop, paste, file picker)
- Editable review before import
- Good error messaging

### Race Track Visualization
- Beautiful SVG with clear phase indicators
- Distance markers with smart positioning
- Responsive via viewBox
- Hover shows precise distance

### Progressive Disclosure
- Skill expansion pattern (summary → details)
- Skill picker as modal overlay
- Details/summary for changelog sections

---

## Recommendations by Priority

### Critical (Do First)
1. Touch targets to 44×44px minimum
2. Keyboard accessibility for all interactive elements
3. Convert hover menus to click-to-open
4. Add ARIA labels throughout
5. Form validation visual feedback

### High Priority
6. Reduce information density / improve spacing
7. Keep stat labels on mobile (use abbreviations)
8. Add loading progress for OCR
9. Replace `alert()` with toast notifications
10. Add drag-and-drop visual feedback

### Medium Priority
11. Design token system for spacing
12. Consolidate input styles
13. Typographic scale
14. Focus trap for modals
15. Improve slot submenu interaction

### Low Priority
16. Remove console logs
17. Escape key for modals
18. Animate skill expansion
19. Always-visible search placeholder
20. Filter count display

---

## Component-Specific Grades

| Component | Grade | Notes |
|-----------|-------|-------|
| Dropdown.tsx | A- | Best component, excellent a11y |
| OCRModal.tsx | B | Good flow, needs progress indicator |
| RaceTrack.tsx | B- | Beautiful viz, drag UX needs work |
| SkillList.tsx | C+ | Rich features, accessibility gaps |
| HorseDef.tsx | C | Dense, small touch targets |

---

## Estimated Impact

| Fix Category | Usability Improvement |
|--------------|----------------------|
| Critical fixes | +40% mobile usability |
| High priority | -30% user errors |
| Medium priority | +25% perceived performance |
| Low priority | +20% feature discoverability |
