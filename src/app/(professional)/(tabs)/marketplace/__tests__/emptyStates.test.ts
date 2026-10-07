import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

/**
 * The marketplace's empty branch is the animated 'listings' empty state, with
 * the right copy and action for each case; the + is hidden while it shows, and
 * the sheet reaches the tab bar. (The cases themselves: utils/emptyCase.test.)
 */
const SRC = readFileSync(join(__dirname, '..', 'index.tsx'), 'utf8');

it('renders AnimatedEmptyState with the listings variant, spanning the sheet', () => {
  expect(SRC).toMatch(/<AnimatedEmptyState[\s\S]*?variant="listings"/);
  expect(SRC).toMatch(/bleed=\{20\}/);
  expect(SRC).toMatch(/bottomInset=\{tabBarHeight \+ TAB_BAR_CONTENT_GAP\}/);
  expect(SRC).not.toMatch(/marketplace\.no_listings/);
});

it('picks the case from all listings vs the filtered ones', () => {
  expect(SRC).toMatch(/emptyCase\(\{ tab: activeTab, isLoading, total: listings\.length, shown: filtered\.length \}\)/);
});

it('market: posts through the same sheet as the +; rental: asks to join as a supplier by mail; filtered: clears everything', () => {
  expect(SRC).toMatch(/'marketplace\.empty_market_cta'[\s\S]{0,200}onPress: \(\) => setPostSheetVisible\(true\)/);
  expect(SRC).toMatch(/empty === 'rental'\s*\?\s*\{ label: t\('marketplace\.rental_apply_cta'\), onPress: \(\) => void rentalMail\.open\(\) \}/);
  expect(SRC).toMatch(/function clearSearchAndFilters\(\) \{\s*setSearchQuery\(''\);\s*setSelectedCategory\('all'\);\s*clearFilters\(\);/);
  expect(SRC).toMatch(/'marketplace\.empty_filtered_cta'[\s\S]{0,120}onPress: clearSearchAndFilters/);
});

it('the + hides while the empty state shows', () => {
  expect(SRC).toMatch(/\{!empty && \(\s*<>\s*\{canPost && \(/);
});

it('the sheet fills to the tab bar: the scroll content grows, the sheet goes lavender while empty', () => {
  expect(SRC).toMatch(/contentContainerStyle=\{\[styles\.scrollContent, empty \? null :/);
  expect(SRC).toMatch(/scrollContent: \{ flexGrow: 1 \}/);
  expect(SRC).toMatch(/style=\{\[styles\.sheet, empty && styles\.sheetEmpty\]\}/);
  expect(SRC).toMatch(/sheetEmpty: \{ backgroundColor: '#F4F2FB' \}/);
});

describe('copy', () => {
  const keys = ['empty_market_title', 'empty_market_desc', 'empty_market_cta', 'empty_rental_title', 'empty_rental_desc',
    'empty_filtered_title', 'empty_filtered_desc', 'empty_filtered_cta'] as const;

  // `marketplace.no_listings` stays: the admin marketplace page still uses it.
  it('every key exists in Hebrew and English', () => {
    for (const k of keys) {
      expect(typeof (he.marketplace as Record<string, unknown>)[k]).toBe('string');
      expect(typeof (en.marketplace as Record<string, unknown>)[k]).toBe('string');
    }
  });

  it('Hebrew as specced', () => {
    const m = he.marketplace as Record<string, string>;
    expect([m.empty_market_title, m.empty_market_desc, m.empty_market_cta]).toEqual(
      ['עוד אין כאן ציוד', 'היו הראשונים לפרסם ציוד יד שנייה למכירה', 'פרסמו ציוד']);
    expect([m.empty_rental_title, m.empty_rental_desc]).toEqual(['עדיין אין ציוד להשכרה', 'משכירים ציוד? הצטרפו כמשכירים ראשונים ב-BAMA']);
    expect([m.rental_apply_cta, m.rental_apply_subject]).toEqual(['הגשת בקשה', 'בקשה להצטרף כמשכיר ציוד - BAMA']);
    expect([m.empty_filtered_title, m.empty_filtered_desc, m.empty_filtered_cta]).toEqual(
      ['לא נמצא ציוד שמתאים לחיפוש', 'נסו מילת חיפוש אחרת או נקו את הסינון', 'נקו סינון']);
  });
});
