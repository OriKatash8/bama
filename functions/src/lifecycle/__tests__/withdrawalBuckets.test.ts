import { splitWithdrawals } from '../derive';

const f = (engagementStatus: string, releaseReason?: string) =>
  ({ engagementStatus, ...(releaseReason ? { releaseReason } : {}) }) as never;

describe('splitWithdrawals — reliability buckets (C5)', () => {
  it('a candidate rejection is counted apart and never as a withdrawal', () => {
    const counts = splitWithdrawals([
      f('withdrawn', 'candidate_rejected'),
      f('withdrawn', 'candidate_rejected'),
      f('withdrawn', 'pro_withdrew'),
      f('withdrawn', 'client_removed'),
      f('completed'),
    ]);
    expect(counts).toEqual({ withdrawn: 2, byOwnChoice: 1, byClientRemoval: 1, candidateRejections: 2 });
  });

  it('legacy withdrawals with no reason still count as withdrawals', () => {
    expect(splitWithdrawals([f('withdrawn')]).withdrawn).toBe(1);
  });
});
