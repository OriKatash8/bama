# Noticeboard Hebrew i18n + Role Answers Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove role-answer chips from noticeboard cards (they belong only in the detail popup), and translate all noticeboard UI text to Hebrew when the app is in RTL mode, including a city lookup table for Israeli cities.

**Architecture:** A new `cityTranslations.ts` utility and new i18n keys form the foundation (Task 1); `NoticeBoardCard` is cleaned and localised (Task 2); `ProjectDetailModal` is fully localised (Task 3). No new state, no new hooks — only display-layer changes.

**Tech Stack:** React Native, TypeScript, existing `useSettingsStore` / `useAppFont`, `CATEGORY_LABEL_KEY` from `src/features/crew/data/categories.ts`, `he.json` / `en.json` translation files.

## Global Constraints

- `npx tsc --noEmit` must pass zero errors after every task
- No `any` types
- Heebo font is already active app-wide via `useAppFont()` — no font changes needed
- Free-text user content (title, description, exec date, deadline, budget) stays as typed — only UI chrome and category names are translated
- Dark mode: untouched
- Only the professional dashboard noticeboard is in scope — client home and other screens are out of scope

---

## Files

| Action | Path |
|--------|------|
| Create | `src/core/utils/cityTranslations.ts` |
| Modify | `src/core/i18n/translations/en.json` |
| Modify | `src/core/i18n/translations/he.json` |
| Modify | `src/features/noticeboard/components/NoticeBoardCard.tsx` |
| Modify | `src/app/(professional)/(tabs)/dashboard/index.tsx` |
| Modify | `src/features/noticeboard/components/ProjectDetailModal.tsx` |

---

## Task 1: City lookup table + new i18n keys

**Files:**
- Create: `src/core/utils/cityTranslations.ts`
- Modify: `src/core/i18n/translations/en.json`
- Modify: `src/core/i18n/translations/he.json`

**Interfaces:**
- Produces: `translateCity(city: string, rtl: boolean): string` — used by Tasks 2 and 3

- [ ] **Step 1: Create `src/core/utils/cityTranslations.ts`** with this exact content:

```ts
const CITY_HE: Record<string, string> = {
  'tel aviv': 'תל אביב',
  'jerusalem': 'ירושלים',
  'haifa': 'חיפה',
  'rishon lezion': 'ראשון לציון',
  'petah tikva': 'פתח תקווה',
  'ashdod': 'אשדוד',
  'netanya': 'נתניה',
  'beersheba': 'באר שבע',
  'bnei brak': 'בני ברק',
  'holon': 'חולון',
  'ramat gan': 'רמת גן',
  'rehovot': 'רחובות',
  'bat yam': 'בת ים',
  'ashkelon': 'אשקלון',
  'herzliya': 'הרצליה',
  'kfar saba': 'כפר סבא',
  'modiin': 'מודיעין',
  "modiin maccabim re'ut": "מודיעין מכבים רעות",
  "ra'anana": 'רעננה',
  'lod': 'לוד',
  'ramla': 'רמלה',
  'nazareth': 'נצרת',
  'hadera': 'חדרה',
  'eilat': 'אילת',
  'tiberias': 'טבריה',
  'acre': 'עכו',
  'nahariya': 'נהריה',
  'afula': 'עפולה',
  'kiryat gat': 'קרית גת',
  'kiryat ata': 'קרית אתא',
  'kiryat bialik': 'קרית ביאליק',
  'kiryat motzkin': 'קרית מוצקין',
  'kiryat yam': 'קרית ים',
  'kiryat shmona': 'קרית שמונה',
  'dimona': 'דימונה',
  'arad': 'ערד',
  'safed': 'צפת',
  'rosh haayin': 'ראש העין',
  'yehud': 'יהוד',
  'givatayim': 'גבעתיים',
  'ramat hasharon': 'רמת השרון',
  'hod hasharon': 'הוד השרון',
  'even yehuda': 'אבן יהודה',
  'shoham': 'שוהם',
  'maalot tarshiha': 'מעלות תרשיחא',
  'migdal haemek': 'מגדל העמק',
  'yokneam': 'יקנעם',
  'nesher': 'נשר',
  'tirat carmel': 'טירת כרמל',
  'or yehuda': 'אור יהודה',
  'azor': 'אזור',
  'yavne': 'יבנה',
  'gan yavne': 'גן יבנה',
  'gedera': 'גדרה',
  'ness ziona': 'נס ציונה',
  'tel mond': 'תל מונד',
  'pardes hana': 'פרדס חנה',
  'zichron yaakov': 'זכרון יעקב',
  'caesarea': 'קיסריה',
  'beit shemesh': 'בית שמש',
  'mevasseret zion': 'מבשרת ציון',
  'maale adumim': 'מעלה אדומים',
  'ariel': 'אריאל',
};

export function translateCity(city: string, rtl: boolean): string {
  if (!rtl) return city;
  return CITY_HE[city.trim().toLowerCase()] ?? city;
}
```

- [ ] **Step 2: Add new keys to `en.json`** — find the `"noticeboard"` object (currently ends with `"make_offer": "Make Offer"`) and add before the closing `}`:

```json
"role_singular": "role",
"role_plural": "roles",
"execution_label": "Execution",
"deadline_label": "Deadline",
"location_label": "Location",
"description_label": "Description",
"roles_needed": "Roles Needed",
"make_offer_action": "✦  Make an Offer",
"not_interested": "✕  Not interested",
"back_to_details": "← Back to Details",
"submit_offer_header": "Submit Your Offer",
"submit_offer_btn": "Submit Offer",
"sending": "Sending…",
"needed": "needed",
"individual_total": "Individual total"
```

- [ ] **Step 3: Add the same keys to `he.json`** — same location in the `"noticeboard"` object:

```json
"role_singular": "תפקיד",
"role_plural": "תפקידים",
"execution_label": "ביצוע",
"deadline_label": "דדליין",
"location_label": "מיקום",
"description_label": "תיאור",
"roles_needed": "תפקידים נדרשים",
"make_offer_action": "✦  הגש הצעה",
"not_interested": "✕  לא מעניין",
"back_to_details": "→ חזרה לפרטים",
"submit_offer_header": "שלח את ההצעה שלך",
"submit_offer_btn": "שלח הצעה",
"sending": "שולח…",
"needed": "נדרש",
"individual_total": "סה״כ פרטני"
```

- [ ] **Step 4: Run `npx tsc --noEmit`** — expect zero errors

- [ ] **Step 5: Commit**

```bash
git add src/core/utils/cityTranslations.ts \
        src/core/i18n/translations/en.json \
        src/core/i18n/translations/he.json
git commit -m "feat: city lookup table and noticeboard Hebrew i18n keys"
```

---

## Task 2: Clean up NoticeBoardCard + apply Hebrew

**Files:**
- Modify: `src/features/noticeboard/components/NoticeBoardCard.tsx`
- Modify: `src/app/(professional)/(tabs)/dashboard/index.tsx`

**Interfaces:**
- Consumes: `translateCity` from `src/core/utils/cityTranslations` (Task 1)
- Consumes: `CATEGORY_LABEL_KEY` from `src/features/crew/data/categories`
- Consumes: new `noticeboard.role_singular`, `noticeboard.role_plural` keys (Task 1)

- [ ] **Step 1: Update imports in `NoticeBoardCard.tsx`**

Remove this import entirely (no longer needed in the card):
```ts
import { CATEGORY_QUESTION_MAP, ROLE_QUESTIONS, questionLabel } from '@features/projects/constants/roleQuestions';
```

Add these imports:
```ts
import { CATEGORY_LABEL_KEY } from '@features/crew/data/categories';
import { translateCity } from '@core/utils/cityTranslations';
```

- [ ] **Step 2: Update the `Props` type** — remove `professionalCategories?: string[]`

The Props type currently has:
```ts
type Props = {
  ...
  professionalCategories?: string[];
};
```
Remove `professionalCategories?: string[]` from it.

- [ ] **Step 3: Remove role-answer computation from the component body**

Remove these lines near the top of `NoticeBoardCard` (currently lines ~54–58):
```ts
const myRoleKeys = (professionalCategories ?? [])
  .map(cat => CATEGORY_QUESTION_MAP[cat])
  .filter((k): k is string => !!k);
const myAnswers = Object.entries(request.roleAnswers ?? {})
  .filter(([roleKey]) => myRoleKeys.includes(roleKey));
```

Also remove `professionalCategories` from the destructured props parameter.

- [ ] **Step 4: Add a `translatedRoles` helper** just below the existing `allRoles` line:

```ts
const allRoles = [...new Set(request.crewSlots.map((s) => s.category))];
const translatedRoles = allRoles.map(r =>
  rtl && CATEGORY_LABEL_KEY[r] ? t(CATEGORY_LABEL_KEY[r]) : r
);
```

- [ ] **Step 5: Update the compact view JSX**

5a. Replace the role count text (currently `{roleCount} role{roleCount === 1 ? '' : 's'}`):
```tsx
<Text style={[styles.metaCompact, { ...font.regular, color: textColor }]}>
  {roleCount} {roleCount === 1 ? t('noticeboard.role_singular') : t('noticeboard.role_plural')}
</Text>
```

5b. Replace the roles display (currently `{allRoles.join(' · ')}`):
```tsx
<Text style={[styles.rolesCompact, { ...font.semiBold, color: textColor }]} numberOfLines={2}>
  {translatedRoles.join(' · ')}
</Text>
```

5c. Replace the location display (currently `{request.location}`):
```tsx
<Text style={[styles.locationCompact, { ...font.regular, color: textColor }]} numberOfLines={1}>
  {translateCity(request.location, rtl)}
</Text>
```

5d. Remove the entire `{myAnswers.length > 0 && ...}` block — the block that renders `roleAnswersBlock` with answer text chips.

- [ ] **Step 6: Update the non-compact view JSX**

6a. Replace the location display (currently `{request.location}`):
```tsx
<Text style={[styles.location, { ...font.regular, color: textColor }]} numberOfLines={1}>
  {translateCity(request.location, rtl)}
</Text>
```

6b. Replace the roles+exec meta line. Currently:
```tsx
{request.exec ?? ''}  ·  {roleCount} role{roleCount === 1 ? '' : 's'}
```
Replace with:
```tsx
{request.exec ?? ''}  ·  {roleCount} {roleCount === 1 ? t('noticeboard.role_singular') : t('noticeboard.role_plural')}
```

6c. Replace `{allRoles.join(' | ')}` with `{translatedRoles.join(' | ')}`.

- [ ] **Step 7: Remove unused styles** from the `StyleSheet` at the bottom:
- `roleAnswersBlock`
- `roleAnswerText`

- [ ] **Step 8: Update dashboard call-site** in `src/app/(professional)/(tabs)/dashboard/index.tsx`

Find the `<NoticeBoardCard>` usage and remove the `professionalCategories={categories ?? []}` prop. The `<ProjectDetailModal>` still keeps `professionalCategories={categories ?? []}` — do NOT remove it from there.

- [ ] **Step 9: Run `npx tsc --noEmit`** — expect zero errors

- [ ] **Step 10: Commit**

```bash
git add src/features/noticeboard/components/NoticeBoardCard.tsx \
        src/app/\(professional\)/\(tabs\)/dashboard/index.tsx
git commit -m "feat: remove role answers from noticeboard card, add Hebrew localisation"
```

---

## Task 3: Hebrew localisation on ProjectDetailModal

**Files:**
- Modify: `src/features/noticeboard/components/ProjectDetailModal.tsx`

**Interfaces:**
- Consumes: `translateCity` from `src/core/utils/cityTranslations` (Task 1)
- Consumes: `CATEGORY_LABEL_KEY` from `src/features/crew/data/categories`
- Consumes: all new `noticeboard.*_label`, `noticeboard.make_offer_action`, etc. keys (Task 1)

Note: `ProjectDetailModal.tsx` already imports `useSettingsStore`, `en`, `he`, and has `makeT` + `rtl` set up. It does NOT yet import `useAppFont` or `CATEGORY_LABEL_KEY`.

- [ ] **Step 1: Add imports**

Add to the import block:
```ts
import { useAppFont } from '@core/hooks/useAppFont';
import { CATEGORY_LABEL_KEY } from '@features/crew/data/categories';
import { translateCity } from '@core/utils/cityTranslations';
```

- [ ] **Step 2: Add `font` inside the component**

Inside `ProjectDetailModal`, after `const rtl = language === 'he';`, add:
```ts
const font = useAppFont();
```

- [ ] **Step 3: Replace hardcoded labels in the details view**

3a. Three meta boxes — replace hardcoded label strings:
```tsx
// Execution
<Text style={[styles.metaLabel, { color: colors.textMuted }]}>{t('noticeboard.execution_label')}</Text>

// Deadline
<Text style={[styles.metaLabel, { color: colors.textMuted }]}>{t('noticeboard.deadline_label')}</Text>

// Location
<Text style={[styles.metaLabel, { color: colors.textMuted }]}>{t('noticeboard.location_label')}</Text>
```

3b. Location value — replace `{request.location}`:
```tsx
<Text style={styles.metaValue} numberOfLines={1}>{translateCity(request.location, rtl)}</Text>
```

3c. Description section label:
```tsx
<Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{t('noticeboard.description_label')}</Text>
```

3d. Roles Needed section label:
```tsx
<Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{t('noticeboard.roles_needed')}</Text>
```

3e. Category in slot rows — currently `{s.category}`:
```tsx
<Text style={styles.slotSub}>
  {rtl && CATEGORY_LABEL_KEY[s.category] ? t(CATEGORY_LABEL_KEY[s.category]) : s.category}
</Text>
```

3f. "Make an Offer" button — currently `'✦  Make an Offer'`:
```tsx
<Text style={styles.applyText}>{t('noticeboard.make_offer_action')}</Text>
```

3g. "Not interested" button — currently `'✕  Not interested'`:
```tsx
<Text style={styles.dismissText}>{t('noticeboard.not_interested')}</Text>
```

- [ ] **Step 4: Replace hardcoded strings in the bid view**

4a. Modal header title — currently `'Submit Your Offer'`:
```tsx
view === 'bid' ? t('noticeboard.submit_offer_header') : t('noticeboard.bundle_title')
```

4b. "Back to Details" link:
```tsx
<Text style={styles.backText}>{t('noticeboard.back_to_details')}</Text>
```

4c. Category in bid rows — currently `{b.category}`:
```tsx
<Text style={styles.bidSub}>
  {rtl && CATEGORY_LABEL_KEY[b.category] ? t(CATEGORY_LABEL_KEY[b.category]) : b.category}
</Text>
```

4d. "N needed" — currently `{b.quantity} needed`:
```tsx
<Text style={[styles.bidCat, { color: colors.textMuted }]}>
  {b.quantity} {t('noticeboard.needed')}
</Text>
```

4e. Submit button text — currently `isSubmitting ? 'Sending…' : \`Submit Offer (${validBids.length} role...)\``:
```tsx
{isSubmitting
  ? t('noticeboard.sending')
  : `${t('noticeboard.submit_offer_btn')} (${validBids.length} ${validBids.length === 1 ? t('noticeboard.role_singular') : t('noticeboard.role_plural')})`
}
```

- [ ] **Step 5: Replace hardcoded strings in the bundle view**

5a. "Individual total" label:
```tsx
<Text style={[styles.bundleTotalLabel, { color: colors.textMuted }]}>{t('noticeboard.individual_total')}</Text>
```

5b. Category in bundle role list — currently `· {b.category} — ₪...`:
```tsx
· {rtl && CATEGORY_LABEL_KEY[b.category] ? t(CATEGORY_LABEL_KEY[b.category]) : b.category} — ₪{Number(b.price).toLocaleString()}
```

- [ ] **Step 6: Apply `font` to key text elements** — add `{ ...font.bold }` or `{ ...font.semiBold }` inline to the header title, section labels, button texts, and slot category names. Match the weight used in similar elements in `NoticeBoardCard`.

Specifically:
- `headerTitle` style: add `{ ...font.bold }` inline
- `applyText`: add `{ ...font.bold }`
- `dismissText`: add `{ ...font.semiBold }`
- `slotSub`: add `{ ...font.semiBold }`
- `bidSub`: add `{ ...font.semiBold }`

- [ ] **Step 7: Run `npx tsc --noEmit`** — expect zero errors

- [ ] **Step 8: Commit**

```bash
git add src/features/noticeboard/components/ProjectDetailModal.tsx
git commit -m "feat: Hebrew localisation on ProjectDetailModal"
```

---

## Verification

1. Switch to Hebrew mode in Settings
2. **Noticeboard card (compact):** category names in Hebrew (צלם וידאו, עורך…), location in Hebrew for known Israeli cities, role count shows "תפקיד" / "תפקידים" — no role-answer text visible on the card
3. **Noticeboard card (non-compact):** same Hebrew display, no role answers
4. **Detail popup (details view):** all section labels in Hebrew (ביצוע, דדליין, מיקום, תיאור, תפקידים נדרשים), slot categories in Hebrew, location value translated, buttons say "הגש הצעה" / "לא מעניין"
5. **Detail popup (bid view):** header "שלח את ההצעה שלך", categories in Hebrew, "נדרש" suffix, submit button shows "שלח הצעה (N תפקיד/ים)"
6. **Detail popup (bundle view):** "סה״כ פרטני" label, categories in Hebrew
7. **Role answers still appear** in the detail popup (unchanged) — confirmed missing from the card
8. Switch back to English — all labels revert to English, cities show original typed value
9. `npx tsc --noEmit` → zero errors
