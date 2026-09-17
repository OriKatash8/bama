import { isPendingReview } from '../review';

describe('isPendingReview (client)', () => {
  it('an accepted offer awaiting review is pending', () => {
    expect(isPendingReview({ status: 'accepted', review: 'pending' })).toBe(true);
  });

  it('confirmed, or accepted before reviews existed, is not pending', () => {
    expect(isPendingReview({ status: 'accepted', review: 'confirmed' })).toBe(false);
    expect(isPendingReview({ status: 'accepted' })).toBe(false);
  });

  it("a rejected candidate's REMOVED offer is not pending, whatever its stale flag says", () => {
    expect(isPendingReview({ status: 'removed', review: 'pending' })).toBe(false);
  });

  it('offers that were never accepted are not pending', () => {
    expect(isPendingReview({ status: 'pending', review: 'pending' })).toBe(false);
    expect(isPendingReview({ status: 'rejected', review: 'pending' })).toBe(false);
  });
});
