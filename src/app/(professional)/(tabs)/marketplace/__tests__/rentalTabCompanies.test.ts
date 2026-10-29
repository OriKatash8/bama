import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

/**
 * The rental tab with rental companies' synced items: paged from the server,
 * merged with the admin's own rentals, never for demo accounts; a partner row
 * that filters; no condition filter; more items as the page nears its end.
 * (The paging itself: features/rentals/__tests__/useRentalItems.test.)
 */
const SRC = readFileSync(join(__dirname, '..', 'index.tsx'), 'utf8');

it('company items only on the rental tab, and never for a demo account', () => {
  expect(SRC).toMatch(/const companyRentalsOn = isRentalTab && !hidesRentals\(demoConfig, me\);/);
  expect(SRC).toMatch(/useRentalItems\(\{[\s\S]*?enabled: companyRentalsOn,[\s\S]*?\}\)/);
  expect(SRC).toMatch(/usePartnerCompanies\(companyRentalsOn\)/);
});

it('the server filters company items by the tab\'s own category, partner, search, brands and price order', () => {
  expect(SRC).toMatch(/category: selectedCategory === 'all' \? null : selectedCategory,\s*companyId: partnerId,/);
  expect(SRC).toMatch(/search: searchQuery,\s*brands: filterBrands,/);
});

it('merged with the own rentals (hidden while a partner is chosen); "price on request" last in a price order', () => {
  expect(SRC).toMatch(/const merged = \[\.\.\.\(partnerId \? \[\] : filteredOwn\), \.\.\.companyListings\];/);
  expect(SRC).toMatch(/return \[\.\.\.sortByPrice\(priced, priceSort\), \.\.\.merged\.filter\(\(l\) => l\.priceOnRequest\)\];/);
});

it('a partner row that filters, shown as a removable filter tag; clearing everything clears it', () => {
  expect(SRC).toMatch(/<PartnerRow[\s\S]*?selectedId=\{partnerId\}[\s\S]*?onSelect=\{setPartnerId\}/);
  expect(SRC).toMatch(/key: 'partner',[\s\S]*?onRemove: \(\) => setPartnerId\(null\)/);
});

it('the condition filter is second-hand only', () => {
  expect(SRC).toMatch(/\{activeTab !== 'rental' && \(<>\s*<AppText[^>]*>\s*\{t\('marketplace\.condition'\)\}/);
});

it('scrolling near the end loads the next page, with a spinner row', () => {
  expect(SRC).toMatch(/onScroll=\{companyRentalsOn \? onPageScroll : undefined\}/);
  expect(SRC).toMatch(/contentSize\.height - 600\) companyItems\.loadMore\(\)/);
  expect(SRC).toMatch(/testID="rentals-loading-more"/);
});

it('every new string exists in Hebrew and English', () => {
  for (const k of Object.keys(en.rentals)) expect(typeof (he.rentals as Record<string, string>)[k]).toBe('string');
  expect(he.rentals.rent_through).toBe('השכרה דרך {{company}}');
});

describe('the filter popup\'s "Rental company" section', () => {
  it('rental tab only, and only with partners', () => {
    expect(SRC).toMatch(/\{companyRentalsOn && partners\.length > 0 && \(\s*<>\s*<AppText[^>]*>\s*\{t\('rentals\.filter_company'\)\}/);
  });

  it('a draft of the same partnerId the row sets: opened from it, applied to it, cleared with it', () => {
    expect(SRC).toMatch(/function openFilterModal\(\) \{[\s\S]*?setDraftPartnerId\(partnerId\);/);
    expect(SRC).toMatch(/function applyFilters\(\) \{[\s\S]*?setPartnerId\(draftPartnerId\);/);
    expect(SRC).toMatch(/function clearFilters\(\) \{[\s\S]*?setDraftPartnerId\(null\);[\s\S]*?setPartnerId\(null\);/);
    expect(SRC).toMatch(/<CompanyFilterChips[\s\S]*?value=\{draftPartnerId\}[\s\S]*?onChange=\{setDraftPartnerId\}/);
  });

  it('a chosen company counts as an active filter', () => {
    expect(SRC).toMatch(/const filtersActive = [^;]*!!partnerId;/);
  });

  it('Hebrew and English', () => {
    expect([he.rentals.filter_company, he.rentals.all_companies]).toEqual(['חברת השכרה', 'כל החברות']);
    expect([en.rentals.filter_company, en.rentals.all_companies]).toEqual(['Rental company', 'All companies']);
  });
});
