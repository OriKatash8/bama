import { chargeStateKey, payLinkUrl } from '../chargeState';

const done = { engagementStatus: 'completed' as const };

describe('chargeStateKey', () => {
  it('says nothing before the engagement completes, and for disputed or cancelled ones', () => {
    expect(chargeStateKey({ engagementStatus: 'hired' })).toBeNull();
    expect(chargeStateKey({ engagementStatus: 'disputed', chargeState: 'idle' })).toBeNull();
    expect(chargeStateKey({ engagementStatus: 'cancelled' })).toBeNull();
  });
  it('a completed fee with no charge state yet is waiting to be charged', () => {
    expect(chargeStateKey(done)).toBe('idle');
  });
  it.each(['idle', 'charging', 'failed', 'needs_card'] as const)('passes %s through', (s) => {
    expect(chargeStateKey({ ...done, chargeState: s })).toBe(s);
  });
  it('reports a successful charge', () => {
    expect(chargeStateKey({ ...done, chargeState: 'succeeded', feePaid: true, status: 'paid' })).toBe('succeeded');
  });
  it('says nothing about a fee settled another way (admin) or voided', () => {
    expect(chargeStateKey({ ...done, feePaid: true, status: 'paid' })).toBeNull();
    expect(chargeStateKey({ ...done, status: 'not_owed', chargeState: 'idle' })).toBeNull();
  });
});


describe('payLinkUrl', () => {
  const fee = (over: Record<string, unknown> = {}) => ({
    engagementStatus: 'completed', chargeState: 'awaiting_payment', feePaid: false, status: 'pending', feeDue: 30,
    paymentLink: { url: 'https://pay.example/x', processId: 'L', amount: 30 }, ...over,
  }) as never;
  it('returns the url only for a live, https, matching-amount link on an unpaid fee', () => {
    expect(payLinkUrl(fee())).toBe('https://pay.example/x');
  });
  it.each([
    ['amount moved on', { feeDue: 20 }],
    ['superseded', { paymentLink: { url: 'https://p/x', processId: 'L', amount: 30, superseded: true } }],
    ['not https', { paymentLink: { url: 'http://p/x', processId: 'L', amount: 30 } }],
    ['paid', { feePaid: true }],
    ['other state', { chargeState: 'idle' }],
    ['not completed', { engagementStatus: 'active' }],
  ])('null when %s', (_n, over) => expect(payLinkUrl(fee(over))).toBeNull());
});
