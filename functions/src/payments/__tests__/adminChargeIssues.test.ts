import { chargeIssueRowOf, paymentLinkRowOf } from '../adminChargeIssues';
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

describe('link review rows', () => {
  const lr = (over = {}) => ({ reason: 'link_superseded', at: Timestamp.fromMillis(7000), transactionId: 'T1', amount: 100, note: 'n', ...over });
  it('a link payment that was not applied shows as its own reason, with the transaction', () => {
    const row = chargeIssueRowOf('p1', 'u1', { chargeState: 'awaiting_payment', feeDue: 60, linkReview: lr() } as never, 'Shoot', 'Dana');
    expect(row).toMatchObject({
      reason: 'link_superseded', chargedAmount: 100, feeDue: 60, providerRef: 'T1', flaggedAt: 7000, note: 'n',
    });
  });
  it('an acknowledged link review no longer produces a row', () => {
    expect(chargeIssueRowOf('p1', 'u1', {
      linkReview: lr({ acknowledgedAt: Timestamp.fromMillis(8000) }),
    } as never, '', '')).toBeNull();
  });
  it('a charge review wins when a fee somehow has both', () => {
    const row = chargeIssueRowOf('p1', 'u1', { chargeReview: review(), linkReview: lr() } as never, '', '');
    expect(row?.reason).toBe('settle_mismatch');
  });
});

describe('paymentLinkRowOf', () => {
  const link = { url: 'u', processId: 'L1', amount: 100, createdAt: Timestamp.fromMillis(1000) };
  it('is null without a link', () => expect(paymentLinkRowOf('p', 'u', {} as never, '', '')).toBeNull());
  it('an awaiting link that still matches feeDue is not stale', () => {
    expect(paymentLinkRowOf('p', 'u', { paymentLink: link, feeDue: 100 } as never, 'T', 'D'))
      .toMatchObject({ amount: 100, processId: 'L1', createdAt: 1000, stale: false, paidAt: null, transactionId: null });
  });
  it('is stale when feeDue moved on or it was superseded', () => {
    expect(paymentLinkRowOf('p', 'u', { paymentLink: link, feeDue: 60 } as never, '', '')?.stale).toBe(true);
    expect(paymentLinkRowOf('p', 'u', { paymentLink: { ...link, superseded: true }, feeDue: 100 } as never, '', '')?.stale).toBe(true);
  });
  it('a paid fee carries the transaction and time', () => {
    expect(paymentLinkRowOf('p', 'u', {
      paymentLink: link, feeDue: 0, paidBy: 'link', providerRef: 'T7', feePaidAt: Timestamp.fromMillis(9000),
    } as never, '', '')).toMatchObject({ paidAt: 9000, transactionId: 'T7' });
  });
});
