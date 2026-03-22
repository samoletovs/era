# Mobile Platform Guidelines

## Cross-Platform Principles

These apply to React Native, Flutter, iOS (SwiftUI), and Android (Compose/XML).

## Touch Interaction

### Tap Targets
- Minimum tap target: **44x44pt** (iOS) / **48x48dp** (Android)
- Spacing between tap targets: minimum 8dp
- Primary actions in thumb-reachable zones (bottom 60% of screen)

### Gestures
- Swipe to dismiss, pull to refresh — use platform conventions
- Provide alternative tap actions for all gesture-based interactions
- Long-press should enhance, not replace, tap behavior
- Haptic feedback on significant actions (toggle, delete, success)

## Navigation Patterns

### Bottom Tab Navigation
- Maximum 5 tabs. 3-4 is ideal.
- Active state: filled icon + label. Inactive: outlined icon + label.
- Never hide the tab bar on scroll — it should always be accessible.
- Tab bar height: 49pt (iOS) / 56dp (Android) minimum.

### Stack Navigation
- Use native platform back buttons (iOS swipe-back, Android back gesture)
- Large titles on root screens, small titles on detail screens (iOS pattern)
- Transition animations should match platform conventions

### Sheet/Modal Navigation
- Use bottom sheets for contextual actions
- Full-screen modals only for creation flows (new post, compose, settings)
- Bottom sheets should be dismissible via drag

## Layout

### Safe Areas
Always respect safe area insets (notch, status bar, home indicator, navigation bar).

```
/* React Native */
import { SafeAreaView } from 'react-native-safe-area-context';
```

### Typography for Mobile
- Body text: 16-17pt (not smaller)
- Caption/secondary: 13-14pt minimum
- Dynamic type support on iOS — text should respond to user's font size preference
- Android: follow Material type scale

### Spacing
- Screen edge padding: 16dp/pt
- Section spacing: 24-32dp/pt
- Between list items: 8-12dp/pt

## Lists & Scrolling
- Standard row height: 44pt (iOS) / 48dp (Android)
- Use sections with clear headers for long lists
- Show separator lines between items (subtle, 0.5pt)
- Virtualize long lists (FlatList in RN, LazyColumn in Compose)
- Pull-to-refresh for content that updates

## Status Bar
- Light content on dark backgrounds, dark content on light backgrounds
- Match status bar style to navigation bar color
- Never ignore the status bar — content should respect its space

## Offline & Loading
- Show cached content when offline — gray out stale data
- Display connectivity status banner at top (yellow for offline, green for reconnected)
- Queue actions taken offline, sync when reconnected
- Skeleton screens for initial load, inline spinners for user-triggered actions

## Platform-Specific Considerations

### iOS (Apple HIG)
- Use SF Pro for text, SF Symbols for icons
- Follow HIG for control sizing and spacing
- Support Dynamic Type (accessibility font sizes)
- Match iOS visual language: translucency, vibrancy, rounded corners

### Android (Material 3)
- Follow Material You theming for dynamic color
- Use Material icons
- Navigation: prefer NavigationDrawer (large) or BottomNavigation
- Edge-to-edge layouts (draw behind system bars)

## Notifications (In-App)
- Banners: slide down from top, auto-dismiss after 4-5s
- Never cover navigation controls with notifications
- Group related notifications
- Provide "undo" for destructive actions via snackbar/toast
