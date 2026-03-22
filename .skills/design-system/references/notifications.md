# Notifications Design Guidelines

## Notification Types

### 1. In-App Toast / Snackbar
Quick, non-intrusive messages within the application.

**Position:** Top-right (desktop), top-center (mobile)
**Duration:** 5 seconds (info/success), persistent (error/warning with action)
**Max visible:** 3 stacked, oldest dismissed first

```
┌──────────────────────────────────┐
│ ✓  Changes saved successfully    │  ← success toast
│                                  │
│                           Undo   │  ← optional action
└──────────────────────────────────┘
```

**Styling:**
- Background: `bg-elevated` with `shadow-md`
- Border-left: 3px solid with severity color (success/warning/error/info)
- Icon: matching severity
- Text: brief, 1-2 sentences max
- Entrance: slide in from right (desktop) or top (mobile), `duration-normal`
- Exit: fade + slide out, `duration-fast`

### 2. Push Notifications (Mobile/Desktop)
System-level notifications delivered via OS.

**Content structure:**
- **Title**: App name or sender (bold, 1 line)
- **Body**: Clear, actionable message (2-3 lines max)
- **Action buttons**: Max 2 (e.g., "Reply" + "Mark as read")
- **Icon**: App icon or sender avatar

**Guidelines:**
- Never send notifications the user didn't opt into
- Group related notifications (e.g., "3 new messages from Sam")
- Time-sensitive notifications only — don't notify for non-urgent info
- Deep-link to the relevant screen in the app when tapped
- Support notification categories with different urgency levels

### 3. Email Notifications
Transactional and informational emails triggered by app events.

**Structure:**
```
┌──────────────────────────────────────┐
│  [Logo]              View in browser │
├──────────────────────────────────────┤
│                                      │
│  Hi [Name],                          │
│                                      │
│  [Clear headline of what happened]   │
│                                      │
│  [Brief context, 2-3 sentences]      │
│                                      │
│       [ Primary Action Button ]      │
│                                      │
│  [Secondary details or links]        │
│                                      │
├──────────────────────────────────────┤
│  Footer: Unsubscribe | Preferences   │
└──────────────────────────────────────┘
```

**Styling:**
- Max width: 600px (email client standard)
- Background: warm white, not pure white
- Single-column layout (no multi-column in email)
- Font: system font stack fallback (email clients don't load web fonts reliably)
- Button: 44px height minimum, 200px+ width, centered, accent color
- Always include unsubscribe link (legal requirement in many places)

### 4. Banner Notifications (In-App)
Persistent or semi-persistent messages at the top of the app.

**Use for:**
- System maintenance warnings
- Version update prompts
- Account status (trial expiring, overdue payment)
- Feature announcements (sparingly)

**Styling:**
- Full-width, above main content
- Background: severity-appropriate color at low opacity
- Dismissible (unless critical)
- Height: compact (40-48px with icon + text + dismiss)

```css
.banner {
  background: var(--color-warning-subtle);
  border-bottom: 1px solid var(--color-warning);
  padding: var(--space-2) var(--space-4);
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
```

### 5. Badge Notifications
Small counters on icons indicating unread/pending items.

**Rules:**
- Circle or pill shape
- Background: `color-error` (red) for counts, `color-accent` for status dots
- Font: bold, `text-xs`
- Min size: 18px diameter
- Numbers > 99: show "99+"
- Position: top-right of the parent icon, offset by ~25%
- Don't badge everything — only items that require attention

## Notification Preferences

Every app should give users control over their notifications:
- Per-category opt-in/opt-out
- Frequency controls (immediate, digest, weekly)
- Channel controls (push, email, in-app)
- Quiet hours / Do Not Disturb respect
- Easy one-click unsubscribe from email

## Sound & Haptics

- Use subtle, non-alarming sounds
- Different sounds for different urgency levels
- Always allow sound to be disabled independently
- Mobile: match OS haptic patterns (light tap for info, heavy for error)
- Desktop: respect OS notification sound settings

## Grouping & Stacking

- Group notifications from the same source
- Show the count of grouped items
- Expand to see individual items
- "Mark all as read" action for notification centers
- Auto-dismiss info notifications after viewing (keep errors persistent)
