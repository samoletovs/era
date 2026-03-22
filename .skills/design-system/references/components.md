# Component Specifications

Exact CSS patterns for common UI components. Copy these directly into your code.
All values reference the design tokens from SKILL.md.

## Buttons

```css
/* PRIMARY — one per visible screen section. Accent-colored fill. */
.btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 38px;
  padding: 0 18px;
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 500;
  color: #FFFFFF;
  background: var(--accent);
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.15s ease;
}
.btn-primary:hover { background: var(--accent-hover); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

/* SECONDARY — outlined, for alternative actions */
.btn-secondary {
  height: 38px;
  padding: 0 18px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-body);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.btn-secondary:hover { background: var(--bg-hover); }

/* GHOST — minimal, for tertiary actions */
.btn-ghost {
  height: 32px;
  padding: 0 10px;
  font-size: 13px;
  font-weight: 400;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
}
.btn-ghost:hover { background: var(--bg-hover); color: var(--text-body); }

/* DESTRUCTIVE — for delete/remove. Red text, no red fill. */
.btn-destructive {
  height: 38px;
  padding: 0 18px;
  font-size: 14px;
  font-weight: 500;
  color: var(--error);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.btn-destructive:hover { background: var(--error-bg); border-color: var(--error); }
```

Rules:
- Button text is always font-weight 500, never 600 or 700
- Always verb-first labels: "Save changes", "Delete item"
- Minimum touch target: 44x44px on mobile (add invisible padding if needed)
- Loading state: show small spinner inside, keep width stable, disable

## Form Inputs

```css
.input {
  height: 38px;
  padding: 0 12px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-body);
  background: #FFFFFF;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.input::placeholder { color: var(--text-tertiary); }
.input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.1);
}
.input-error { border-color: var(--error); }
.input-error:focus {
  box-shadow: 0 0 0 3px rgba(255, 59, 48, 0.1);
}

/* Label */
.label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-body);
}

/* Helper / Error text */
.helper-text { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }
.error-text { font-size: 12px; color: var(--error); margin-top: 4px; }
```

Rules:
- Label is ALWAYS above the input, never inside (placeholder is NOT a label)
- Single-column form layout preferred
- Group related fields, separate groups with 24px gap
- Select dropdowns: use native for <10 items, custom for complex lists

## Cards

```css
.card {
  background: #FFFFFF;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 20px;
}

/* OR: no border, subtle shadow instead */
.card-shadow {
  background: #FFFFFF;
  border: none;
  border-radius: var(--radius-md);
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03);
}

/* Interactive card */
.card-interactive { cursor: pointer; transition: box-shadow 0.15s ease; }
.card-interactive:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.06);
}
```

Rules:
- NEVER use colored borders on cards (no blue, no orange, no accent)
- NEVER use colored backgrounds on cards (no yellow, beige, light blue)
- Background is always #FFFFFF. Border is always #E8E8E8. No exceptions.
- Pick border OR shadow for the project, don't mix both on same page

## Tables

```css
.table { width: 100%; border-collapse: collapse; }
.table th {
  text-align: left;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.02em;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
}
.table td {
  font-size: 14px;
  color: var(--text-body);
  padding: 12px 16px;
  border-bottom: 1px solid #F0F0F0;  /* Even lighter than --border */
}
.table tr:hover td { background: var(--bg-subtle); }
```

## Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.3);  /* Subtle dim, not dark */
  backdrop-filter: blur(4px);       /* Modern blur effect */
}
.modal {
  background: #FFFFFF;
  border-radius: var(--radius-lg);
  box-shadow: 0 16px 48px rgba(0,0,0,0.12);
  max-width: 480px;
  width: 90%;
  padding: 24px;
}
.modal-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 12px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 24px;
}
```

## Status Badges

```css
/* Default badge — muted, nearly invisible */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 9999px;
  background: var(--bg-subtle);
  color: var(--text-secondary);
}

/* Semantic badges — very muted backgrounds, darker text of same hue */
.badge-success { background: #F0FBF4; color: #1A7F37; }
.badge-warning { background: #FFFBF0; color: #9A6700; }
.badge-error   { background: #FFF5F5; color: #CF222E; }
.badge-info    { background: #F0F7FF; color: #0969DA; }
```

Rules:
- Badges are TINY and muted. Never large, never bright solid backgrounds.
- If emoji is used alongside badge text, the badge style stays subtle.
- Alternatively: skip badge background entirely, just use colored text.

## Progress Bars

```css
.progress {
  height: 4px;
  background: var(--bg-subtle);
  border-radius: 9999px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 9999px;
  transition: width 0.3s ease;
}
```

Rule: 4px height. Not 8px. Not 12px. **Thin is modern.**

## Chip / Selection Buttons

```css
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 400;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s ease;
}
.chip:hover { background: var(--bg-hover); color: var(--text-body); }
.chip-selected {
  background: var(--accent-bg);
  color: var(--accent);
  border-color: var(--accent);
  font-weight: 500;
}
```

Rule: Selected state uses faint accent background + accent text. NOT solid blue fill.

## Empty States

Structure: centered icon + heading + description + optional action button.
- Keep text concise: "No workouts yet" not "Sorry, we couldn't find any workouts"
- Icon/illustration: single color, simple, 48-64px
- Action button: primary style if it's the main path forward
