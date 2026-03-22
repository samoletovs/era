# Desktop Platform Guidelines

## General Desktop Principles

Desktop applications have more screen real estate but also higher expectations for 
productivity, keyboard shortcuts, and professional polish.

## Window Management

### Layout Zones
- **Title bar**: App name, window controls (min/max/close). Menu bar on macOS.
- **Toolbar**: Contextual actions for the current view. Keep sparse.
- **Sidebar**: Navigation or hierarchy. Collapsible. 240-320px wide.
- **Content area**: Primary workspace. Fill remaining space.
- **Status bar** (optional): Contextual info at bottom. Small text.

### Window Sizing
- Minimum window size: 800x600px
- Default window size: ~1200x800px
- Remember user's window position and size between sessions
- Responsive layout within the window — content should reflow gracefully

## Keyboard & Mouse

### Keyboard Shortcuts
- Follow platform conventions (Ctrl/Cmd+C, Ctrl/Cmd+V, etc.)
- Show shortcuts in tooltips and menus
- Support Tab/Shift+Tab for focus navigation
- Escape to dismiss modals, cancel operations
- Space/Enter to activate focused elements

### Right-Click Context Menus
- Provide context menus for all interactive elements
- Keep menus short (5-10 items max per section)
- Group related items with separators
- Show keyboard shortcuts right-aligned

### Cursor Feedback
- Pointer cursor on clickable elements
- Text cursor on editable text
- Resize cursors on resizable borders
- Grab/grabbing cursors on draggable items

## Multi-Panel Layouts

### Sidebar + Content
```
┌──────┬────────────────────────┐
│      │                        │
│ Nav  │   Content Area         │
│      │                        │
│      │                        │
│      │                        │
└──────┴────────────────────────┘
```

### Three-Pane (Master-Detail)
```
┌──────┬──────────┬──────────────┐
│      │          │              │
│ Nav  │  List    │  Detail      │
│      │          │              │
│      │          │              │
└──────┴──────────┴──────────────┘
```

### Resizable Panels
- Allow users to resize panels with drag handles
- Save panel sizes between sessions
- Set minimum panel widths (200px sidebar, 300px content)
- Collapse panels when below minimum size

## Desktop Typography
- Body text: 14px is acceptable (unlike mobile). 13px for dense UIs.
- Monospaced text for data/code: 13-14px
- Higher information density is expected on desktop
- Support system font preferences

## Electron / Web-Based Desktop

### Native Feel
- Disable text selection on UI elements (labels, buttons) — keep it on content
- Use native window chrome or custom title bar with proper window controls
- Implement native drag-and-drop
- Support system dark/light mode toggle
- Use native file dialogs, not custom ones

### Performance
- Desktop users expect instant response (<100ms for interactions)
- Virtualize long lists (thousands of items are common)
- Background operations should not block the UI
- Show progress for operations >1 second

## WPF / Native Windows
- Follow Fluent 2 design language
- Support Windows 11 visual features (Mica, Acrylic materials)
- High DPI awareness — test at 100%, 125%, 150%, 200% scaling
- Use Segoe UI Variable for text

## macOS Native
- Follow Human Interface Guidelines
- Use SF Pro for text
- Support macOS materials (vibrant backgrounds, translucency)
- Menu bar integration
- Support Trackpad gestures (pinch, swipe, force touch)

## Dialogs & Modals
- Center modals in the window
- Dim the background behind modals
- Focus trap within modal (Tab stays inside)
- Escape to dismiss
- Confirmation dialogs: destructive action button should be red/warning, cancel button should be default focus
