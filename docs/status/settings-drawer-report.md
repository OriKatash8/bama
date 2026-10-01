# Settings drawer: Step 1 report (no code changes)

> **Outcome (2026-10-01):** decisions as recommended, except "צור קשר" moved into
> Help & info per the spec. Shipped: `f3c667f` (the drawer scrolls),
> `aaac260` ("Information" holds the three policies), `8a0a446` (the redesign).
> The "uncommitted changes" noted below have since been committed. This file is
> the Step 1 report as it was written.

## Component and where it renders
- **Component:** `src/components/layout/AppHeader.tsx`. The drawer is a `Modal` with a right-side `Animated.View` panel (280px), opened by the `settings-gear` button in the header.
- **Rendered from three layouts:**
  - `src/app/(professional)/(tabs)/_layout.tsx`
  - `src/app/(client)/(tabs)/_layout.tsx`
  - `src/app/(client)/chat/_layout.tsx`
- **Tests:** `src/components/layout/__tests__/AppHeaderBalance.test.tsx` and `AppHeaderLegal.test.tsx`.
- **Uncommitted changes of mine already in this file** (not yet committed, both done at your request):
  - the content scrolls (a `ScrollView` under the close bar, with safe-area bottom padding);
  - "Information" now opens in place to show the three policies.

## Rows (in today's order)
| # | Row | i18n key (he / en) | Icon | onPress | Shown in |
|---|---|---|---|---|---|
| — | Profile header | — (displayName + `user.email`) | avatar 52px + camera badge | `handleAvatarPress`: picks and uploads a new photo | both modes |
| 1 | Language | `settings.language` (שפה / Language), with the עב/EN toggle | `Globe` | `setLanguage(lang)` (toggle, not a link) | both |
| 2 | Notifications | `settings.notifications` (התראות) | `Bell` | `/settings/notifications` | both |
| 3 | Phone number | `settings.phone` (מספר טלפון) | `Phone` | `/settings/phone` | both |
| 4 | Pricing | `settings.pricing` (תעריפים) | `Percent` | `/settings/pricing` | **professional only** |
| 5 | Balance | `balance.title` (יתרת תיווך / Brokerage balance) | `Wallet` | `/settings/payment` | **professional only** |
| 6 | Information | `settings.information` (מידע) | `Info` | opens in place: privacy (`Shield`), terms (`FileText`), refunds (`Receipt`), each `Linking.openURL(legalUrl(key, language))` | both |
| 7 | Delete account | `settings.delete_account` (מחיקת חשבון) | `Trash2` | `/settings/delete-account` (a separate screen that does the confirming) | both |
| 8 | Log out | `settings.logout` (התנתק) | `LogOut`, red `#ff4d6d` | `logout()` | both |
| 9 | Contact us | `settings.contact_us` (צרו קשר) | `MessageCircle` | `/settings/contact` | both |

There's no "edit profile" link today. Tapping the avatar only changes the photo.

## The balance label
- The Hebrew string is **"יתרת תיווך"**, not "יתרת תיוון". "תיווך" means brokerage, and it matches the English "Brokerage balance". So the screenshot most likely shows "תיווך" rendered small, and there's no typo in the string.
- The same key (`balance.title`) is also the **title of the balance screen** (`src/app/settings/payment.tsx:145`).
- Changing it to "יתרת חיוב" would change that screen's title too, unless the drawer gets its own key.

## RTL today
- The app **forces LTR layout**: `I18nManager.forceRTL(false)` and `allowRTL(false)` in `src/app/_layout.tsx:1-3`. `I18nManager.isRTL` is therefore always false and can't be used.
- Every screen handles Hebrew **by hand**: `const rtl = language === 'he'`, `flexDirection: rtl ? 'row-reverse' : 'row'`, and `textAlign`.
- **The drawer doesn't do this at all.** `rtl` is defined (`AppHeader.tsx:69`) but unused. Every row is fixed `flexDirection: 'row'`, so in Hebrew the icon sits on the left, the label reads left-aligned, and the chevron is always `ChevronRight` on the right. That's the mismatch your spec describes.
- **The fix in Step 2:** rows use `rtl ? 'row-reverse' : 'row'`, labels `textAlign`, and the chevron is `ChevronLeft` in Hebrew and `ChevronRight` in English, all from `rtl`.

## Things to decide before Step 2
1. **"עריכת פרופיל" target.**
   - The only profile editor is the **professional** profile screen, which opens straight in edit mode with `?edit=1` (`src/app/(professional)/(tabs)/profile/index.tsx:91-96`).
   - **Client mode has no profile screen.** Options: (a) show the link only in professional mode (recommended); (b) also show it in client mode, opening the professional editor (that's a navigation change).
2. **The balance label.** Keep "יתרת תיווך" (recommended, it's correct), or change it. If it changes, should the balance screen's title change too?
3. **"צור קשר".** Your earlier request put it **under log out**, and this spec puts it in **Help & info**. I'll follow this spec unless you say otherwise.
4. **"מידע".** It opens in place to the three policies. That stays inside the Help & info card.
5. **App version** comes from `expo-constants` (already installed). On web, `Constants.expoConfig?.version` is still available from `app.json`.
