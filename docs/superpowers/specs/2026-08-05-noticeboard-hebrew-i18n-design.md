# Noticeboard Hebrew i18n + Role Answers Cleanup

**Date:** 2026-08-05

## Goal

1. Remove role-answer chips from the noticeboard card — they already appear in the detail popup, so the card is the wrong place for them.
2. Translate all visible UI text in the noticeboard card and detail modal to Hebrew when the app is in Hebrew (RTL) mode, using the existing Heebo font.
3. Translate city/location values using a hardcoded Israeli city lookup table.

---

## Scope

- `src/features/noticeboard/components/NoticeBoardCard.tsx`
- `src/features/noticeboard/components/ProjectDetailModal.tsx`
- `src/app/(professional)/(tabs)/dashboard/index.tsx` (remove `professionalCategories` prop from card call-site)
- `src/core/utils/cityTranslations.ts` (new file)
- `src/core/i18n/translations/en.json` + `he.json` (new keys)

---

## Change 1: Remove role answers from NoticeBoardCard

### What to remove

In `NoticeBoardCard.tsx`, the compact view (lines ~54–111) currently:
1. Computes `myRoleKeys` and `myAnswers` from `professionalCategories` + `request.roleAnswers`
2. Renders a `roleAnswersBlock` with answer text chips

Remove all of this:
- The `myRoleKeys` / `myAnswers` derived values
- The `{myAnswers.length > 0 && <View style={styles.roleAnswersBlock}>…</View>}` JSX
- The `roleAnswersBlock` and `roleAnswerText` style entries
- The `CATEGORY_QUESTION_MAP, ROLE_QUESTIONS, questionLabel` imports (no longer needed in the card)
- The `professionalCategories?: string[]` prop from the card's `Props` type

### Call-site cleanup

In `src/app/(professional)/(tabs)/dashboard/index.tsx`, remove `professionalCategories={categories ?? []}` from the `<NoticeBoardCard>` call. The same prop remains on `<ProjectDetailModal>` — do not touch that.

### What stays

`ProjectDetailModal` already shows role-answer chips in its details view (lines 192–216). No change needed there.

---

## Change 2: City lookup table

### New file: `src/core/utils/cityTranslations.ts`

```ts
const CITY_HE: Record<string, string> = {
  // Major cities
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
  'ra\'anana': 'רעננה',
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
  'adam': 'אדם',
};

export function translateCity(city: string, rtl: boolean): string {
  if (!rtl) return city;
  return CITY_HE[city.trim().toLowerCase()] ?? city;
}
```

### Usage

In both `NoticeBoardCard` and `ProjectDetailModal`, import `translateCity` and replace the raw `{request.location}` display with `{translateCity(request.location, rtl)}`.

---

## Change 3: Hebrew i18n on NoticeBoardCard

### New translation keys

Add to `en.json` and `he.json` under `noticeboard`:

| Key | English | Hebrew |
|-----|---------|--------|
| `noticeboard.role_singular` | `role` | `תפקיד` |
| `noticeboard.role_plural` | `roles` | `תפקידים` |

### Category names

Use `CATEGORY_LABEL_KEY` (already exported from `src/features/crew/data/categories.ts`) to translate `allRoles` entries when `rtl`:

```ts
import { CATEGORY_LABEL_KEY } from '@features/crew/data/categories';

// In render:
const translatedRoles = allRoles.map(r => rtl && CATEGORY_LABEL_KEY[r] ? t(CATEGORY_LABEL_KEY[r]) : r);
// display as translatedRoles.join(' · ')
```

Same for the slot category in the non-compact view (the `allRoles.join(' | ')` line).

### "N role/roles" count

Replace the hardcoded `{roleCount} role{roleCount === 1 ? '' : 's'}` with:
```tsx
{roleCount} {roleCount === 1 ? t('noticeboard.role_singular') : t('noticeboard.role_plural')}
```

---

## Change 4: Hebrew i18n on ProjectDetailModal

### New translation keys

Add to `en.json` and `he.json` under `noticeboard`:

| Key | English | Hebrew |
|-----|---------|--------|
| `noticeboard.execution_label` | `Execution` | `ביצוע` |
| `noticeboard.deadline_label` | `Deadline` | `דדליין` |
| `noticeboard.location_label` | `Location` | `מיקום` |
| `noticeboard.description_label` | `Description` | `תיאור` |
| `noticeboard.roles_needed` | `Roles Needed` | `תפקידים נדרשים` |
| `noticeboard.make_offer_action` | `✦  Make an Offer` | `✦  הגש הצעה` |
| `noticeboard.not_interested` | `✕  Not interested` | `✕  לא מעניין` |
| `noticeboard.back_to_details` | `← Back to Details` | `← חזרה לפרטים` |
| `noticeboard.submit_offer_header` | `Submit Your Offer` | `שלח את ההצעה שלך` |
| `noticeboard.submit_offer_btn` | `Submit Offer` | `שלח הצעה` |
| `noticeboard.sending` | `Sending…` | `שולח…` |
| `noticeboard.needed` | `needed` | `נדרש` |
| `noticeboard.individual_total` | `Individual total` | `סה״כ פרטני` |

### Category names in modal

In the slots list and bid rows, replace `{s.category}` and `{b.category}` with the same `CATEGORY_LABEL_KEY` lookup pattern.

### Location value

Replace `{request.location}` with `{translateCity(request.location, rtl)}` in the location meta box.

---

## Out of scope

- Free-text fields entered by the client (title, description, exec date, deadline, budget) — these are user-entered and stay as typed.
- Dark mode styling.
- Any screen outside the professional dashboard noticeboard (client home, etc.).
