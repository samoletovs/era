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
