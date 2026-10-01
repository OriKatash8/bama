import { emptyCase } from '../emptyCase';

/**
 * Which empty state the marketplace shows: nothing listed at all on this tab
 * (market / rental), or listings exist but the search, category or filters hide
 * them all. Null while loading or when something is shown.
 */
it('nothing listed on the market tab → market', () => {
  expect(emptyCase({ tab: 'secondhand', isLoading: false, total: 0, shown: 0 })).toBe('market');
});

it('nothing listed on the rental tab → rental', () => {
  expect(emptyCase({ tab: 'rental', isLoading: false, total: 0, shown: 0 })).toBe('rental');
});

it('listings exist but none match → filtered, on either tab', () => {
  expect(emptyCase({ tab: 'secondhand', isLoading: false, total: 3, shown: 0 })).toBe('filtered');
  expect(emptyCase({ tab: 'rental', isLoading: false, total: 1, shown: 0 })).toBe('filtered');
});

it('no empty state while loading or when something shows', () => {
  expect(emptyCase({ tab: 'secondhand', isLoading: true, total: 0, shown: 0 })).toBeNull();
  expect(emptyCase({ tab: 'rental', isLoading: false, total: 2, shown: 2 })).toBeNull();
});
