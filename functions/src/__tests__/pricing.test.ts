/**
 * Bounds and status predicates, imported from the ENFORCING copy in
 * functions/src — not a client mirror. The client constants file duplicates the
 * numbers for its error message only; the logic has one home.
 */
import {
  isOfferPriceValid, canHireOnStatus, MIN_OFFER_PRICE, MAX_OFFER_PRICE, HIREABLE_STATUSES,
} from '../pricing';

describe('isOfferPriceValid', () => {
  it('rejects the two real production typos', () => {
    expect(isOfferPriceValid(554_545)).toBe(false);    // observed in production
    expect(isOfferPriceValid(10_000_000)).toBe(false); // observed in production
    expect(isOfferPriceValid(70_000)).toBe(false);     // above the ceiling
  });

  it('accepts the real prices on the platform', () => {
    for (const p of [12, 100, 300, 1000, 1799.9, 2000, 10_000, 50_000]) {
      expect(isOfferPriceValid(p)).toBe(true);
    }
  });

  it('holds at the boundaries', () => {
    expect(isOfferPriceValid(MIN_OFFER_PRICE - 1)).toBe(false); // 0
    expect(isOfferPriceValid(MIN_OFFER_PRICE)).toBe(true);
    expect(isOfferPriceValid(MAX_OFFER_PRICE)).toBe(true);
    expect(isOfferPriceValid(MAX_OFFER_PRICE + 1)).toBe(false);
  });

  it('rejects zero and negatives', () => {
    expect(isOfferPriceValid(0)).toBe(false);
    expect(isOfferPriceValid(-1)).toBe(false);
    expect(isOfferPriceValid(-50_000)).toBe(false);
  });

  it('rejects non-finite and non-numeric values', () => {
    for (const v of [NaN, Infinity, -Infinity, '500', null, undefined, {}, []]) {
      expect(isOfferPriceValid(v)).toBe(false);
    }
  });

  it('allows non-integers — a live bundle is priced 1799.9', () => {
    expect(isOfferPriceValid(1799.9)).toBe(true);
  });
});

describe('canHireOnStatus', () => {
  it('permits the live statuses', () => {
    expect(canHireOnStatus('open')).toBe(true);
    expect(canHireOnStatus('in_progress')).toBe(true);
  });

  it('refuses the terminal statuses', () => {
    expect(canHireOnStatus('completed')).toBe(false);
    expect(canHireOnStatus('cancelled')).toBe(false);
  });

  it('refuses anything unrecognised, including missing', () => {
    for (const v of ['', 'draft', 'filled', undefined, null, 0, {}]) {
      expect(canHireOnStatus(v)).toBe(false);
    }
  });

  /**
   * Pins the set against ProjectRequest['status'] = open | in_progress |
   * completed | cancelled. If a status is ever added, this fails and forces a
   * decision instead of silently defaulting to un-hireable.
   */
  it('covers every ProjectRequest status explicitly', () => {
    const ALL = ['open', 'in_progress', 'completed', 'cancelled'] as const;
    const hireable = ALL.filter(canHireOnStatus);
    expect(hireable).toEqual([...HIREABLE_STATUSES]);
    expect(ALL.length - hireable.length).toBe(2);
  });
});
