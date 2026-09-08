/**
 * One case per parent/child state that can occur in production. The fourth is
 * the bug this module exists to fix: an individually-accepted child of a
 * REJECTED bundle used to be priced at the whole bundlePrice.
 *
 * Imported directly from functions/src — the fee base has ONE implementation and
 * the test reads it, rather than a hand-synced copy under src/.
 */
import { sumProAmount, type AcceptedOffer, type BundleSummary } from '../proAmount';

const bundles = (entries: Record<string, BundleSummary>) =>
  new Map<string, BundleSummary | undefined>(Object.entries(entries));

describe('sumProAmount', () => {
  it('prices an accepted bundle once, not per child', () => {
    const offers: AcceptedOffer[] = [
      { price: 300, bundleId: 'b1' },
      { price: 500, bundleId: 'b1' },
      { price: 200, bundleId: 'b1' },
    ];
    expect(sumProAmount(offers, bundles({ b1: { status: 'accepted', bundlePrice: 800 } }))).toBe(800);
  });

  it('is zero when a rejected bundle has no accepted children', () => {
    // The children are pending/rejected, so they never reach this function —
    // computeProAmount queries status == 'accepted'.
    expect(sumProAmount([], bundles({ b1: { status: 'rejected', bundlePrice: 800 } }))).toBe(0);
  });

  it('THE FIX: an individually-accepted child of a REJECTED bundle is worth its own price', () => {
    // Production: SFcYTLyTfW on tN7DoF4irST6XJe95PEX. The Editor offer was taken
    // individually at ₪500; the parent bundle (₪800, covering three slots) was
    // rejected in the same batch by hire.ts:195.
    const offers: AcceptedOffer[] = [{ price: 500, bundleId: 'wOw5' }];
    const map = bundles({ wOw5: { status: 'rejected', bundlePrice: 800 } });
    expect(sumProAmount(offers, map)).toBe(500);
    expect(sumProAmount(offers, map)).not.toBe(800);
  });

  it('treats a PENDING parent the same as a rejected one', () => {
    const offers: AcceptedOffer[] = [{ price: 500, bundleId: 'b1' }];
    expect(sumProAmount(offers, bundles({ b1: { status: 'pending', bundlePrice: 800 } }))).toBe(500);
  });

  it('falls back to the child price when the parent bundle is missing entirely', () => {
    // An orphaned child must not silently contribute 0 — that would undercharge.
    expect(sumProAmount([{ price: 500, bundleId: 'gone' }], bundles({}))).toBe(500);
  });

  it('sums plain individual offers', () => {
    expect(sumProAmount([{ price: 300 }, { price: 200 }], bundles({}))).toBe(500);
  });

  it('mixes an accepted bundle with a separate individual offer', () => {
    const offers: AcceptedOffer[] = [
      { price: 300, bundleId: 'b1' },
      { price: 500, bundleId: 'b1' },
      { price: 250 },
    ];
    expect(sumProAmount(offers, bundles({ b1: { status: 'accepted', bundlePrice: 700 } }))).toBe(950);
  });

  it('counts two DIFFERENT accepted bundles separately', () => {
    const offers: AcceptedOffer[] = [
      { price: 100, bundleId: 'b1' },
      { price: 200, bundleId: 'b2' },
    ];
    expect(sumProAmount(offers, bundles({
      b1: { status: 'accepted', bundlePrice: 400 },
      b2: { status: 'accepted', bundlePrice: 600 },
    }))).toBe(1000);
  });

  it('mixes an accepted bundle with a rejected one, pricing the rejected child individually', () => {
    const offers: AcceptedOffer[] = [
      { price: 100, bundleId: 'ok' },
      { price: 500, bundleId: 'no' },
    ];
    expect(sumProAmount(offers, bundles({
      ok: { status: 'accepted', bundlePrice: 400 },
      no: { status: 'rejected', bundlePrice: 800 },
    }))).toBe(900); // 400 + 500
  });

  it('is zero for a pro with no accepted offers (removed, or never hired)', () => {
    expect(sumProAmount([], bundles({}))).toBe(0);
  });

  it('treats a missing price as 0 rather than NaN', () => {
    expect(sumProAmount([{}, { price: 100 }], bundles({}))).toBe(100);
  });

  it('treats an accepted bundle with no bundlePrice as 0, not NaN', () => {
    expect(sumProAmount([{ price: 500, bundleId: 'b1' }], bundles({ b1: { status: 'accepted' } }))).toBe(0);
  });
});
