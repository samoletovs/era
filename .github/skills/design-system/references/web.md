# Web Platform Guidelines

## Framework-Agnostic Principles

These guidelines apply whether you're using React, Vue, Svelte, or vanilla HTML/CSS.

## CSS Architecture

### Use CSS Custom Properties for All Design Tokens
```css
:root {
  /* Import all design tokens from SKILL.md */
  color-scheme: light dark;
}

[data-theme="dark"] {
  /* Override light tokens with dark values */
}
```

### Component Styling Strategy
1. **CSS Modules** or **CSS-in-JS** for component-scoped styles
2. **Utility classes** (Tailwind-style) for layout and spacing
3. **Global styles** only for resets, tokens, and typography

### CSS Reset
Use a modern reset. At minimum:
```css
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; min-height: 100dvh; }
img, picture, video, canvas, svg { display: block; max-width: 100%; }
input, button, textarea, select { font: inherit; }
p, h1, h2, h3, h4, h5, h6 { overflow-wrap: break-word; }
```

## Responsive Design

### Mobile-First
Write base styles for mobile, then add complexity at larger breakpoints.

```css
.container {
  padding-inline: var(--space-4);
}

@media (min-width: 768px) {
  .container {
    padding-inline: var(--space-6);
    max-width: var(--container-xl);
    margin-inline: auto;
  }
}
```

### Container Queries (Preferred Over Media Queries)
Components should respond to their container, not the viewport:
```css
.card-grid {
  container-type: inline-size;
}

@container (min-width: 600px) {
  .card { flex-direction: row; }
}
```

## Performance

- Lazy-load images below the fold with `loading="lazy"`
- Use `font-display: swap` for web fonts
- Preload critical fonts: `<link rel="preload" as="font" crossorigin>`
- Avoid layout shifts — set explicit dimensions on images and embeds
- Prefer CSS animations over JS — they run on the compositor thread

## SPA Navigation
- Use View Transitions API where supported for page transitions
- Show loading skeleton states, not spinners, for content areas
- Preserve scroll position on back navigation
- Keep the URL meaningful — every view should have a shareable URL

## Forms
- Use native HTML validation first (`required`, `type="email"`, `pattern`)
- Display inline errors below each field, not in a summary at top
- Auto-focus the first error field on submit
- Save form state to prevent data loss on navigation
- Submit buttons should show loading state and disable on submit

## Dark Mode Implementation
```css
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    /* dark token values */
  }
}

[data-theme="dark"] {
  /* dark token values — explicit override */
}
```

Respect system preference by default, allow manual toggle, persist choice in localStorage.

## State Indicators

### Loading
- Skeleton screens for content areas (not spinners)
- Subtle pulse animation: `opacity: 0.6 → 1.0` with `duration-slow`
- Button loading: show inline spinner, disable, keep width stable

### Empty States
- Center in the content area
- Icon + headline + description + action button
- Never show a blank page — always explain what goes here

### Error States
- Inline errors near the cause, not generic alerts
- Offer recovery actions ("retry", "go back")
- Be specific: "Could not save — check your connection" not "Something went wrong"
