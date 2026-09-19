# Glass tab bar: Step 1 findings

## Tab layouts
There are three `Tabs` layouts (expo-router, JS bottom tabs). All share `src/core/navigation/floatingTabBar.ts`:

| Layout | Visible tabs | Hidden routes (`href: null`) |
|---|---|---|
| `src/app/(client)/(tabs)/_layout.tsx` | home, browse, chats, projects | switch |
| `src/app/(professional)/(tabs)/_layout.tsx` | dashboard, marketplace, chats, profile | browse, portfolio, bookings, switch |
| `src/app/admin/_layout.tsx` | index, money, operations (+ more) | courses, communities, marketplace, fees |

- **Client and pro layouts** are near-identical line for line. Both wrap `<Tabs>` in a `SafeAreaInsetsContext.Provider` with `top: 0, bottom: 0`. **So the tab bar currently cannot see the bottom safe-area inset**, and Step 2 has to pass the real inset in explicitly.
- **The admin layout** zeroes only `top`.

### Current screenOptions (client and pro)
```
headerShown: false
tabBarShowLabel: true
tabBarStyle: hidden ? { display: 'none' } : getFloatingTabBarStyle(isDark)
tabBarBackground: () => <SlidingTabBackground numTabs={4} tabNames={[...]} />
tabBarActiveTintColor: '#004aad'                      // hardcoded
tabBarInactiveTintColor: FLOATING_TAB_BAR_INACTIVE_COLOR.dark | .light
tabBarActive/InactiveBackgroundColor: 'transparent'
tabBarItemStyle: { paddingVertical: 4 }
tabBarLabelStyle: { fontSize: 10, ...font.regular, marginTop: -4 }
```
- Each `Tabs.Screen` repeats `tabBarItemStyle`:
  - native: height 48 with a `translateY: -7` nudge
  - web: height 65
- Badges use `#cb6ce6`.
- When the tab bar is hidden:
  - client: in a chat room and on the review screen (`/home/summary`)
  - pro: in a chat room, and while the profile is locked (incomplete)

### Current bar shape (`getFloatingTabBarStyle`)
A floating pill, not a docked bar:
- `position: 'absolute'`, `bottom: 24`, side inset 18 (web 50)
- `minHeight` 48 (web 65), padding 4 (web 8), `borderRadius: 32`
- background `rgba(255,255,255,0.85)` / dark `rgba(15,15,31,0.85)`
- border 1 `rgba(255,255,255,0.2)`, shadow 0.2 / radius 12, elevation 12
- blur on web only (`backdropFilter: blur(20px)`); **no blur on native**
- `SlidingTabBackground` draws the animated grey pill `rgba(180,180,180,0.35)` behind the active tab (`Animated.timing`, 240ms)

### Icons
All lucide-react-native at 20pt:

| Layout | Icons | Stroke |
|---|---|---|
| Client | Home, Search, MessageCircle, FolderKanban | 2.5 |
| Pro | LayoutDashboard, ShoppingBag, MessageCircle, User | 1.5 |
| Admin | Home, Flag, LogOut, UserCog, Wallet, Boxes | — |

## Colours: where they're set
- **Active tint:** hardcoded `'#004aad'` inline in the client and pro layouts. Admin uses `FLOATING_TAB_BAR_ACTIVE_COLOR` (also `#004aad`). **None of them read the theme.**
- **Inactive tint:** `FLOATING_TAB_BAR_INACTIVE_COLOR` (constants in `floatingTabBar.ts`), picked by `useUiStore().isDark`. Not from the theme either.
- **What the theme offers** (`useTheme`):
  - `primary: '#004aad'`
  - `accent: '#cb6ce6'` (pink)
  - `tabBar: '#ffffff' / '#0f0f1f'`
- **Conflict:** your spec says "active icon reads from the theme accent token". The theme's `accent` is pink `#cb6ce6`, while today's active colour, and the brand blue, is `primary`. See decision 3.

## Scrolling screens inside the tabs, and their bottom padding
- **Nothing uses `useBottomTabBarHeight`** or `contentInset`.
- **Every screen clears the bar with a hardcoded number** sized for the floating pill: 24 gap + about 48–56 tall ≈ 80, rounded up to 100.
- **FABs** also sit at hardcoded bottoms: 96 on marketplace, 110 on pro chats.

| Screen | Scrolls | Clears the bar with |
|---|---|---|
| client home/index (wizard) | yes | `sheet.paddingBottom: 56` ("clears the floating tab bar") |
| client home/builder | yes | `paddingBottom: 100` |
| client home/details | yes | none |
| client home/summary | yes | n/a (tab bar hidden; own `BOTTOM_INSET`) |
| client browse/index | yes | `paddingBottom: 100` |
| client browse/profile/[userId] | yes | `screenContent.paddingBottom: 100` (+40 spacer) |
| client chats/index | yes | `paddingBottom: 100` |
| client chats/community-details | yes | `paddingBottom: 100` |
| client chats/project-details | yes | `100` + its own `BOTTOM_BAR_PAD` / `insets.bottom` bar |
| client chats/[chatId] | via ChatRoomScreen | n/a (tab bar hidden) |
| client projects/index | yes | `paddingBottom: 100` |
| pro dashboard/index | yes | `paddingBottom: 100` (×2), `140` |
| pro marketplace/index | yes | `scrollContent.paddingBottom: 170` (FAB at 96) |
| pro chats/index | yes | `100`; courses list `180`; communities spacer 180 (FABs at 110) |
| pro browse/index | yes | `paddingBottom: 100` |
| pro browse/profile/[userId] | yes | `100` (+40 spacer) |
| pro profile/index | yes | `content.paddingBottom: 100`, editing `120` (tab bar hidden while editing) |
| pro chats/[chatId] | via ChatRoomScreen | n/a (tab bar hidden) |
| pro bookings, portfolio, switch | no | hidden routes / no scroll |
| admin index, money, operations | yes | `40` (under-padded for the floating bar) |
| admin users, reports, marketplace, fees | yes | `100` |
| admin courses, communities | yes | none / 12 |

- **Shared list components** that set their own bottom padding: `ChatsScreen` (`listContent.paddingBottom: 16`, plus the host's 100) and `CommunityDiscoveryTab`.
- **Home is the special case:** its content isn't a list, but the white sheet runs down behind the bar.

## Dependencies
- **expo-blur: NOT installed.** It isn't in `package.json` or `node_modules`, so Step 2 needs `npx expo install expo-blur`.
- **Expo SDK: 57** (`expo ~57.0.9`, `expo-router ~57.0.9`, RN 0.86). `AGENTS.md` still points at the v56 docs; I'll read the v57 expo-blur page.
- **expo-glass-effect ~57.0.1 is already installed but unused.** It provides `GlassView`, `GlassContainer`, `isLiquidGlassAvailable()` and `isGlassEffectAPIAvailable()`. On non-iOS it falls back to a plain `View`. That's the ready-made iOS 26 Liquid Glass upgrade path: `GlassView` as the background when `isLiquidGlassAvailable()`, `BlurView` otherwise.
- **react-native-reanimated ^4.5.1** is installed, for a spring-driven active indicator if we keep one.

## RTL today
- **The app forces LTR layout** (`I18nManager.allowRTL(false)` in `_layout.tsx`), and the tab bar doesn't reverse itself. So tab order is the same in Hebrew and English: home, browse, chats, projects from left to right.
- **No tab icon is directional** (no arrows or chevrons), so mirroring isn't needed.
- **The edge-swipe tab switching** in both layouts follows that same left-to-right order.

## Decisions before Step 2
1. **Docked or floating.**
   - "Instagram-style" means a full-width bar docked to the bottom edge: hairline on top, safe area inside it. That replaces today's floating rounded pill.
   - My reading is docked. Confirm?
2. **Active-tab indicator.**
   - Today there's a sliding grey pill behind the active tab.
   - Instagram has none; only the icon changes.
   - Keep it (spring-driven, critically damped), or drop it and rely on tint alone?
3. **Which token is the "accent".**
   - The theme's `accent` is pink `#cb6ce6`, and its `primary` is `#004aad`, which is what the tabs use today. The pro screens you just recoloured use `#1D4ED8`.
   - I can't change `useTheme` values, so the active tint has to be one of the existing tokens.
   - I'd use `primary`; say if you really mean the pink `accent`.
4. **Admin.** Its layout shares the same floating style. Include it, or client and pro only?
5. **Hebrew tab order.** Today it's the same left-to-right order as English. Keep that, or reverse it in Hebrew? Reversing would also change which way the edge-swipe moves, which I'd have to flip to match.
6. **Bottom padding approach.**
   - I'd replace the hardcoded 100 / 140 / 170 / 180 with `useBottomTabBarHeight()` (plus a small gap) on each listed screen, and move the two FABs to sit relative to it.
   - The hook only works inside the Tabs navigator, which all of these screens are.
   - One catch: the layout currently zeroes the bottom inset for everything below it, so the hook would report the bar height without the home-indicator area. I'd give the bar the real inset explicitly, so the hook's number includes it.

---

## Phase B notes: the padding sweep (commit B)

### How screens clear the bar now
- **Helpers:** `useTabBarHeight()` and `useTabBarClearance()` in `src/core/navigation/floatingTabBar.ts`.
  - They read `BottomTabBarHeightContext` (from `expo-router/js-tabs`) directly, not `useBottomTabBarHeight()`, which throws outside a navigator.
  - `useTabBarClearance()` = bar height + `TAB_BAR_CONTENT_GAP` (16).
- **The bar owns the bottom safe-area inset.** Its measured height already includes the home indicator, so **never add `insets.bottom` on top**. Doing so double-counts the inset on notched devices.
- **Fallback when the context is missing:** `TAB_BAR_CONTENT_HEIGHT`, the content band **only, excluding the safe-area inset**, and it `console.warn`s in `__DEV__`.
  - Expected only outside a bottom-tab navigator. Today that's the six tests that render home/index, home/builder or projects/index directly; they print the warning.
  - Inside the app, the warning means a screen is using the helper somewhere it shouldn't.

### Hidden-bar screens: the value is stale, not 0
- On a screen where the tab bar is hidden (`tabBarStyle: { display: 'none' }`), the hook returns the navigator's **last laid-out bar height**: a stale value, **not 0**.
- A screen that mounts with the bar already hidden gets the navigator's initial estimate: 49 plus the bottom inset.
- **No swept screen is hidden-bar today.** The hidden-bar screens are:
  - the chat rooms and the chat-detail screens under `/chats/…`
  - `/home/summary`
  - the locked pro profile, which is always in edit mode and uses its own save-bar padding
- None of them uses the helper. Anyone who makes a swept screen hidden-bar, or adds the helper to a hidden-bar screen, must not rely on it for clearance.

### Where the clearance lives
**Once per scroll, on the outermost scroll that meets the screen bottom.** Lists nested inside that scroll don't add it again.
- **Pro dashboard:** the page scroll carried 140, and both inner lists (the notice board and the in-progress list, which don't scroll on their own) carried another 100 each. That stacked to 240. Now the page scroll clears the bar once, and the inner lists keep only their 8pt rhythm.
- **Pro chats:** the page scroll clears the bar. The courses list and the communities spacer (`CommunityDiscoveryTab`) add only the + button's room (`FAB_SIZE` + gap), where they used to add 180 each on top of the page's 100.
- **Pro marketplace:** one page scroll, cleared by bar + + button + 2 gaps. The + buttons on marketplace and pro chats sit at `bottom: bar + gap`.
- **Client home steps:** the sheet clears the bar by its height **only, with no gap**. Each step's last child, the next-step bar, already carries 14pt under the button.

### Not changed
- Admin: floating bar, separate commit C.
- The pro profile's edit-mode 120: it clears the save bar, and the tab bar is hidden.
- Hidden-bar screens.
- Decorative in-sheet spacers.
