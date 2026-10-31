import { chargeIssueRowOf } from '../adminChargeIssues';
import { Timestamp } from '../__fixtures__/memoryHelpers';

jest.mock('../../lifecycle/helpers', () => require('../__fixtures__/memoryHelpers').mockHelpers);

const review = (over = {}) => ({ reason: 'settle_mismatch', at: Timestamp.fromMillis(5000), chargedAmount: 100, feeDueAtReview: 60, providerRef: 'r9', ...over });

describe('chargeIssueRowOf', () => {
  it('describes a charge that was taken but not recorded', () => {
    const row = chargeIssueRowOf('p1', 'u1', {
      chargeState: 'succeeded', feeDue: 60, chargeAttempts: 1, chargeReview: review(),
    } as never, 'Shoot', 'Dana');
    expect(row).toEqual({
      projectId: 'p1', title: 'Shoot', professionalId: 'u1', displayName: 'Dana',
      reason: 'settle_mismatch', chargeState: 'succeeded', chargedAmount: 100, feeDue: 60,
      attempts: 1, providerRef: 'r9', lastErrorCode: null, flaggedAt: 5000, note: '',
    });
  });
  it('describes an exhausted fee with its last error', () => {
    const row = chargeIssueRowOf('p1', 'u1', {
      chargeState: 'failed', feeDue: 100, chargeAttempts: 3, chargeExhausted: true,
      lastChargeError: { code: 'fake_declined', class: 'retryable', at: Timestamp.fromMillis(1) },
      chargeReview: review({ reason: 'attempts_exhausted', chargedAmount: 0, providerRef: undefined }),
    } as never, '', '');
    expect(row).toMatchObject({ reason: 'attempts_exhausted', attempts: 3, lastErrorCode: 'fake_declined', providerRef: null });
  });
  it('returns null for a fee with nothing to review', () => {
    expect(chargeIssueRowOf('p1', 'u1', { chargeState: 'failed' } as never, '', '')).toBeNull();
  });
});
