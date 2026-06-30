# Professional Browse Screen — Design Spec

**Date:** 2026-06-30  
**Status:** Approved

## Summary

Add a Browse screen to professional mode that lets professionals discover other professionals by skill category. It reuses the client browse screen's UI and hook verbatim, with two targeted changes: a contextual heading and self-exclusion of the logged-in user from results.

---

## Architecture

### New file
`src/app/(professional)/(tabs)/browse/index.tsx`

Near-identical copy of `src/app/(client)/(tabs)/browse/index.tsx`. No shared abstraction is introduced — the two screens are independent and may diverge in the future.

### Changed file
`src/app/(professional)/(tabs)/_layout.tsx`

Add a `browse` `Tabs.Screen` entry between `marketplace` and `chats`.

### Unchanged
- `src/features/crew/hooks/useSearchProfessionals.ts` — no modifications
- `src/features/crew/components/ProfessionalCard.tsx` — no modifications

---

## Screen Behaviour

The screen is a copy of the client browse screen with two differences:

1. **Heading**: "Browse Professionals" (client uses "Search Professionals").
2. **Self-exclusion**: Inside `ResultsView`, filter the hook's `results` before rendering:
   ```ts
   const filtered = results.filter(r => r.user.id !== auth.currentUser?.uid);
   ```
   This is done purely client-side after the hook resolves. The hook is not modified.

All other behaviour is identical:
- Accordion category list with animated expand/collapse
- Search-by-query flow with `getSearchTarget()` inline matching
- Empty state ("No professionals yet")
- Loading spinner while `isLoading` is true
- `ProfessionalCard` with Message button — `useSegments()` already resolves to `(professional)/chats/<chatId>` in this context, so routing is correct without any changes

---

## Tab Registration

Tab order after change: Dashboard → Marketplace → **Browse** → Chats → Profile → Switch

```tsx
// in src/app/(professional)/(tabs)/_layout.tsx
import { Search, ... } from 'lucide-react-native';

<Tabs.Screen
  name="browse"
  options={{
    title: 'Browse',
    tabBarIcon: ({ color }) => <Search size={28} color={color} strokeWidth={1.5} />,
  }}
/>
```

Placed between `marketplace` and `chats` screens.

---

## Data Flow

```
User selects category/subcategory
  → useSearchProfessionals(category, subcategory)
    → fetches all users from Firestore
    → fetches each user's profile
    → returns ProfessionalResult[]
  → ResultsView filters out auth.currentUser.uid
  → renders ProfessionalCard per result
    → Message button → getOrCreateDM → router.push to (professional)/chats/[chatId]
```

---

## Error Handling

- Hook already handles fetch errors (sets `isLoading: false`, leaves `results` empty)
- Empty results after filtering renders the same empty state as the client screen
- If `auth.currentUser` is null (should not happen in an authenticated screen), the filter condition `r.user.id !== null` is always true — no crash, no user is incorrectly excluded

---

## Testing

- Manually verify: logged-in professional's own card does not appear in any category results
- Manually verify: Message button navigates to `(professional)/chats/[chatId]` (not the client route)
- Manually verify: tab appears and is tappable in the professional tab bar
- Manually verify: accordion expand/collapse animation works identically to the client screen
