jest.mock('@core/firebase/firestore', () => ({ subscribeToCollection: jest.fn() }));
jest.mock('@core/firebase/functions', () => ({ callFunction: () => jest.fn() }));
jest.mock('firebase/firestore', () => ({ where: jest.fn() }));

import { groupPendingByPro, proReviewState, proPrice, candidateErrorKey } from '../candidateService';

const offer = (over: Record<string, unknown>) => ({
  id: String(over.id ?? Math.random()), projectId: 'p1', professionalId: 'a', category: 'Editor',
  price: 100, status: 'accepted', createdAt: null, ...over,
}) as never;
const bundle = (over: Record<string, unknown>) => ({
  id: 'b1', projectId: 'p1', professionalId: 'a', slots: [{ category: 'Editor' }, { category: 'Sound Recordist' }],
  individualTotal: 700, bundlePrice: 600, offerIds: ['bo1', 'bo2'], status: 'accepted', createdAt: null, ...over,
}) as never;

describe('groupPendingByPro', () => {
  it('lists only accepted offers still under review', () => {
    const rows = groupPendingByPro([
      offer({ professionalId: 'a', review: 'pending' }),
      offer({ professionalId: 'b', review: 'confirmed' }),
      offer({ professionalId: 'c' }),
    ], [], 'en');
    expect(rows.map((r) => r.proId)).toEqual(['a']);
  });

  it("a rejected candidate's REMOVED offer with a stale review: 'pending' is not listed", () => {
    expect(groupPendingByPro([offer({ status: 'removed', review: 'pending' })], [], 'en')).toEqual([]);
  });

  it('counts a bundle once at bundlePrice and skips its component offers', () => {
    const rows = groupPendingByPro(
      [offer({ id: 'bo1', bundleId: 'b1', price: 400, review: 'pending' }), offer({ id: 'bo2', bundleId: 'b1', category: 'Sound Recordist', price: 300, review: 'pending' })],
      [bundle({ review: 'pending' })],
      'en',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].roles).toHaveLength(1);
    expect(rows[0].roles[0].bundleId).toBe('b1');
    expect(rows[0].total).toBe(600);
  });

  it('groups two roles of one professional into one row with both repriceable units', () => {
    const rows = groupPendingByPro([
      offer({ category: 'Editor', price: 100, review: 'pending' }),
      offer({ category: 'Sound Recordist', price: 250, review: 'pending' }),
    ], [], 'he');
    expect(rows).toHaveLength(1);
    expect(rows[0].roles.map((r) => r.category)).toEqual(['Editor', 'Sound Recordist']);
    expect(rows[0].total).toBe(350);
  });
});

describe('proReviewState', () => {
  it('pending wins over confirmed', () => {
    expect(proReviewState([offer({ review: 'confirmed' }), offer({ review: 'pending' })], [])).toBe('pending');
  });
  it('confirmed when every flagged offer is confirmed', () => {
    expect(proReviewState([offer({ review: 'confirmed' })], [])).toBe('confirmed');
  });
  it('null for a hire from before the review card (no field)', () => {
    expect(proReviewState([offer({})], [])).toBeNull();
  });
  it('ignores removed offers', () => {
    expect(proReviewState([offer({ status: 'removed', review: 'pending' })], [])).toBeNull();
  });
});

describe('proPrice', () => {
  it('sums individual roles and a bundle once', () => {
    const p = proPrice(
      [offer({ price: 100 }), offer({ bundleId: 'b1', price: 999 })],
      [bundle({ bundlePrice: 600 })],
      'en',
    );
    expect(p.total).toBe(700);
  });
});

describe('candidateErrorKey', () => {
  it.each([
    ['price-change-pending', 'candidate_review.err_price_pending'],
    ['not-under-review', 'candidate_review.err_not_under_review'],
    ['engagement-not-open', 'candidate_review.err_engagement_not_open'],
    ['boom', 'candidate_review.err_generic'],
  ])('%s', (message, key) => {
    expect(candidateErrorKey({ message })).toBe(key);
  });
});
