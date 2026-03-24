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
1. **Page header** (`page-header-bar` or `coa-header`) — Title + primary action button(s)
   - Primary action: `btn-primary` (e.g. "+ Create invoice", "+ Add contact")
   - Secondary actions: `btn-secondary` (e.g. "Upload", "Run depreciation")
2. **Toggleable create panel** — Shown only when action button clicked. Contains:
   - `AiInput` component at top (describe → auto-fill fields)
   - Form fields below
   - Save/Cancel buttons
3. **Filter tabs** (`coa-level-controls` + `coa-level-btn`) — Type/status filter below panels
   - Always include "All" as first option
   - Examples: All/Purchase/Sales, All/Vendors/Customers, All/Products/Services
4. **UniversalGrid** — Consistent data grid with built-in search, sort, column filters

### AiInput rules
- **Never** show AiInput permanently on the page — always inside a toggleable panel
- Use `btn-secondary` for the Fill fields button (not `btn-primary`)
- Include voice input button when SpeechRecognition is available

### Filter tab rules
- Use `coa-level-controls` class (not `segmented-control` or raw buttons)
- Use `coa-level-btn` + `.active` class (not `btn-primary`/`btn-secondary`)
- Place **below** create panels, **above** UniversalGrid

### Grid rules
- Use `UniversalGrid` for all flat data lists
- Provide `onRowClick` for drill-down to detail view
- Use `EmptyState` component for empty/no-company states
