import { nextPriceSort, effectiveShowOnly } from '../offerFilters';

/**
 * The filter chips on the price-offers page.
 *
 * They replaced a modal with draft state, Apply and Clear. One tap now does
 * what four did — and the one thing the modal got for free, which the chips do
 * not, is that its controls were always reachable. A chip that disappears while
 * its filter is still applied is a list filtered to nothing with no way back.
 */

describe('tapping the Price chip', () => {
  it('sorts cheapest first the first time', () => {
    // What a client comparing quotes actually wants to see.
    expect(nextPriceSort(null)).toBe('price_asc');
  });

  it('flips to most expensive on the second tap', () => {
    expect(nextPriceSort('price_asc')).toBe('price_desc');
  });

  it('flips back on the third, so the chip cycles rather than sticking', () => {
    expect(nextPriceSort('price_desc')).toBe('price_asc');
  });

  it('starts from cheapest when arriving from another sort', () => {
    expect(nextPriceSort('stars')).toBe('price_asc');
  });

  it('never returns a non-price sort', () => {
    // The anchor: a toggle that fell through to null or 'stars' would turn the
    // Price chip into a way of leaving price sorting entirely.
    for (const from of ['price_asc', 'price_desc', 'stars', null] as const) {
      expect(['price_asc', 'price_desc']).toContain(nextPriceSort(from));
    }
  });
});

describe('the bundle-only filter when there are no bundles', () => {
  it('applies normally while bundles exist', () => {
    expect(effectiveShowOnly('bundle', true)).toBe('bundle');
  });

  it('stops applying the moment the last bundle goes', () => {
    // The hazard the chips introduced. The chip is only rendered when bundles
    // exist, so a filter that kept applying past that point would leave the
    // client looking at an empty list with nothing on screen to switch off.
    expect(effectiveShowOnly('bundle', false)).toBe('all');
  });

  it('leaves the unfiltered case alone either way', () => {
    // The anchor: always returning 'all' would pass the test above and silently
    // break the filter itself.
    expect(effectiveShowOnly('all', true)).toBe('all');
    expect(effectiveShowOnly('all', false)).toBe('all');
  });
});
