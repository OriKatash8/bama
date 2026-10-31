import { chargeStateKey } from '../chargeState';

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
