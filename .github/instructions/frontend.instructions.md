---
description: "Use when editing React components, pages, hooks, or CSS. Covers component patterns, styling, and text formatting."
applyTo: "src/frontend/**/*.{tsx,ts,css}"
---

# Frontend conventions

- Use functional components with hooks
- Follow the design-system skill for all styling decisions
- Sentence case for all UI text
- Use Inter font family
- Co-locate component styles (CSS modules or adjacent .css files)
- Keep components small — extract when over ~100 lines
- No `any` types — all API responses and state must be typed with entities from `src/shared/types/`
- Extract shared components to `src/frontend/components/` when used in 2+ pages
- Use toast/notification system for errors — never `alert()` or `confirm()`
- Use loading skeletons instead of "Loading..." text
- Accessibility: all interactive elements need `aria-label` or visible label, keyboard nav, 4.5:1 contrast ratio
- See `docs/development-standards.md` §9 for full frontend standards

## Standard list page pattern

Every data list page (Invoices, Contacts, Items, Fixed Assets, Journal Entries, etc.) must follow this consistent structure:

### Layout order
1. **Page header** (`page-header-bar`) — Title + primary action button(s)
   - Primary action: `btn-primary` (e.g. "+ Create invoice", "+ Add contact")
   - Secondary actions: `btn-secondary` (e.g. "Upload", "Run depreciation")
   - Always use `page-header-bar` class (not `coa-header`)
2. **Toggleable create panel** — Shown only when action button clicked. Contains:
   - `AiInput` component at top — **AI-first pattern** (see below)
   - Form fields conditionally rendered only after AI fills them
   - Save/Reset buttons
3. **Filter tabs** (`coa-level-controls` + `coa-level-btn`) — Type/status filter below panels
   - Always include "All" as first option
   - Examples: All/Purchase/Sales, All/Vendors/Customers, All/Products/Services
4. **UniversalGrid** — Consistent data grid with built-in search, sort, column filters

### AI-first create pattern (CRITICAL)
All create forms follow the **AI-first** pattern where AI input is the primary entry point:

1. User clicks the create button → toggleable panel opens
2. Panel shows **only** the `AiInput` component (form fields are hidden)
3. User types a natural-language description and submits
4. Backend AI parses the description → returns structured fields
5. Form fields appear below the AiInput, pre-filled with parsed data
6. User reviews, edits any field, then clicks Save/Create

**Implementation pattern:**
```tsx
// Computed boolean — true when AI (or manual) has populated any field
const formFilled = form.name.trim() !== "" || /* other field checks */;

// In JSX:
<div className="settings-card" style={{ marginBottom: 20 }}>
  <div style={{ marginBottom: formFilled ? 16 : 0 }}>
    <AiInput
      placeholder="e.g. ..."
      onSubmit={handleAiParse}
      clearOnSubmit={false}
    />
  </div>
  {formFilled && (
    <div>
      {/* Form fields pre-filled from AI */}
      {/* Save + Reset buttons */}
    </div>
  )}
</div>
```

**Key rules:**
- Always use `clearOnSubmit={false}` so user can see/edit their prompt
- Form fields render conditionally: `{formFilled && <div>...</div>}`
- `formFilled` checks if any meaningful field has been populated
- Use "Reset" button label (not "Cancel") for the secondary action
- The AiInput `marginBottom` is `16` when form is shown, `0` when hidden

### AiInput rules
- **Never** show AiInput permanently on the page — always inside a toggleable panel
- Use `btn-secondary` for the Fill fields button (not `btn-primary`)
- Include voice input button when SpeechRecognition is available

### Detail view pattern
All entity detail views follow a consistent two-column layout:

1. **Navigation**: `← Back to list` button at top
2. **Page title**: `<h2 className="page-title">{entity name/number}</h2>`
3. **Two-column layout**: `<div className="detail-layout">`
   - **Left sidebar** (`detail-sidebar`): `settings-card` with `onboarding-details` → `detail-row` + `detail-label` pairs
   - **Right content** (`flex: 1`): Line items, GL postings, transactions in `settings-card` blocks

```tsx
<div className="detail-layout">
  <div className="detail-sidebar">
    <div className="settings-card">
      <div className="onboarding-details">
        <div className="detail-row">
          <span className="detail-label">Field name</span>
          <span>Value</span>
        </div>
      </div>
    </div>
  </div>
  <div style={{ flex: 1 }}>
    <div className="settings-card">
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Section</h3>
      {/* Content */}
    </div>
  </div>
</div>
```

### Filter tab rules
- Use `coa-level-controls` class (not `segmented-control` or raw buttons)
- Use `coa-level-btn` + `.active` class (not `btn-primary`/`btn-secondary`)
- Place **below** create panels, **above** UniversalGrid

### Grid rules
- Use `UniversalGrid` for all flat data lists
- Provide `onRowClick` for drill-down to detail view
- Use `EmptyState` component for empty/no-company states
