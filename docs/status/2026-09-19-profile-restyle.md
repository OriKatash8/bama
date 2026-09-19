# Profile restyle (pro profile, both public profiles, onboarding): Step 2 report

**Status:** implemented and **not committed**. I couldn't check it visually: the Chrome extension is disconnected, so it hasn't been seen on web or on a device.

## 1. How the public profile looks now (client + pro `browse/profile/[userId]`)
- **Band** (gradient, padding 18/20/40, centred, gap 10):
  - the existing back + report row across the top
    - back chevron: now white
    - report flag: still `#ff4d6d`
    - positions and hit areas unchanged
  - then the identity block:
    - 88pt avatar with a 3pt `rgba(255,255,255,0.6)` ring. Without a photo, a translucent-white disc with white 800 initials (30pt).
    - name, 21/800 white, 2 lines max
    - roles line, 12.5 `rgba(255,255,255,0.8)`, 1 line with ellipsis. Absent when the pro has no roles.
    - rating line: `#FFD166` stars, white 700 average, 75% white count
  - The public screens have no עריכת פרופיל button.
- **Sheet** (`#FAFAFC`, radius 26, overlapping −22, padding 18/20, gap 14):
  - **About (קצת עליי):** label 13/700 `#1A1626`, then one white card (border `#EFEDF5`, radius 18, soft shadow, padding 13/15). Text `#4C4859`; empty text 13 `#9C99AD`.
  - **Tabs:** a segmented track (`#F1EFF8`, pill shape, padding 3, gap 3).
    - Segments are 34 tall, 13/600. The selected one is `#6D28D9`, sliding with the existing animation; the others are transparent on `#6B6880`.
    - Code order is unchanged.
  - **Tab content:** one white card (the same shell), padding 14, gap 14.
    - **Equipment:** each category with items, in the fixed order, as a 12.5/700 `#4C1D95` heading plus tinted chips (`#F3EEFE`, 1pt `#E4DBFA`, `#4C1D95` 12.5/600, pill shape, 6/13, gap 8). No nested boxes.
    - **Skills:** the same chips. Each role still has its own small inner block (`#FAF9FD` / `#EFEDF5`), as before, since the skills tab wasn't meant to change structurally.
    - **Reviews:** each review card is recoloured (`#FAF9FD` / `#EFEDF5`, name `#1A1626`, body `#4C4859`). The prev/next arrows are violet.
  - **Portfolio:** the same squares sized from the grid width. Gap 10, radius 14, play icon unchanged. It still has no title on the public screens, as before.
  - **ספר לי על הפרויקט שלך:** `#6D28D9`, 52 tall, radius 16, same position and logic.
- **Unchanged:** the loading, not-found and report-modal states are still the old colours (out of scope).

## 2. Edit mode and onboarding
**Edit mode** (pro screen) stays on the band:
- **Avatar "Edit" strip:** `rgba(26,22,38,0.55)` with white text.
- **Name field:** `rgba(255,255,255,0.18)` fill, white text, 60%-white placeholder, radius 10.
- **Hidden in edit mode:** the roles line, the rating and the עריכת פרופיל button, as the rating was before. That makes the band shorter while editing.
- **Save bar:** recoloured. Cancel is white with a violet border; save is `#6D28D9`, and `#C9C5D6` when disabled.
- **Other edit-mode pieces:** the equipment ✕ (violet), add row (`#F6F5FA` field, violet +), category pills, and skills checklist are all recoloured violet.
- **Not checked by eye.** On paper, a translucent white fill on the band's deep blue-violet end has good contrast. The risk is the lighter `#A855F7` end at the bottom-left, but the field sits in the centre of the band. Please look on device. If it reads muddy, moving edit mode off the band is a small change on the screen side only.

**Onboarding** gets `tone="light"`:
- It looks exactly as it did: no band, no ring, the old initials and name colours, and its 120pt editable avatar.
- It does pick up the shared BioSection / ContentTabs / PortfolioGrid restyle, if it renders them.

**Also changed in ProfileHeader, which you didn't specify:**
- On the band only, its own 16pt vertical padding is dropped and the gap is 10, so the band's padding governs.
- The band name uses plain `Text`, because AppText applies its font after the passed style and would override the 800 weight (Heebo-ExtraBold for Hebrew, Montserrat at weight 800 otherwise).

## 3. Where AverageRatingDisplay is used
Only in `ProfileHeader`, and only when not editing. So after this change it only ever sits on the band.

## 4. Checks
- `tsc --noEmit`: clean.
- `jest`: 97 suites and 996 tests, all passing.
- `eslint`, compared with HEAD per file (HEAD → now):
  - ContentTabs 2e/1w → 2e/1w
  - pro profile 5e/4w → 5e/4w
  - onboarding 1e/2w → 1e/2w
  - the rest 0 → 0
  - The existing errors are the same ones as before (refs read during render, setState inside effects), not new ones.

## Diff summary (profile files only)
```
 (client)/(tabs)/browse/profile/[userId].tsx        | 154 +++++++++-------
 (client)/onboarding.tsx                            |   3 +
 (professional)/(tabs)/browse/profile/[userId].tsx  | 144 +++++++++-------
 (professional)/(tabs)/profile/index.tsx            | 184 ++++++++++----------
 profile/components/BioSection.tsx                  |  42 ++---
 profile/components/ContentTabs.tsx                 | 173 +++++++++----------
 profile/components/PortfolioGrid.tsx               |  22 +--
 profile/components/ProfileHeader.tsx               |  83 +++++++++-
 profile/components/ReviewsList.tsx                 |  34 ++--
 reviews/components/AverageRatingDisplay.tsx        |  19 ++-
 10 files, +503 / −355
```

## Choices made without a spec (easy to revert)
- **`ReviewsList`** is used only by ContentTabs, so it's recoloured as part of "reviews in the card shell". Its stars are now amber `#F5A524` instead of pink `#cb6ce6`.
- **Touch targets:**
  - review prev/next buttons: `hitSlop` 4, bringing them to 44
  - equipment ✕: `hitSlop` 16
  - segments: +5 top and bottom
  - עריכת פרופיל: +3 top and bottom
- **Pro screen:** the complete-profile banner and missing-fields hint move from above the header into the top of the sheet. The banner is `#F3EEFE` / `#E4DBFA`; the hint is `#B4232A`.
- **Portfolio add tile:** dashed `#DED8EE` with a violet icon and label. The caption sheet's title and save button are violet.

## Still to verify on device or web
- Hebrew and English
- photo vs initials
- a long name (2 lines) and a long roles line (ellipsis)
- the empty bio, equipment, skills and reviews states
- edit mode on the band
- onboarding

The marketplace and pro chats restyles are also still uncommitted, in separate files.
