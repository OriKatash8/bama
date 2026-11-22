import { chatLeaveLock } from '../chatLeaveLock';

const NOW = Date.UTC(2026, 10, 22, 12);
const DAY = 86_400_000;
const ts = (ms: number) => ({ toMillis: () => ms });

describe('chatLeaveLock', () => {
  it('a cancelled project is open, whatever else it carries', () => {
    expect(chatLeaveLock({ status: 'cancelled', disputeWindowEndsAt: ts(NOW + DAY), adminReviewPending: true }, null, NOW))
      .toEqual({ kind: 'open' });
  });

  it('a running project offers no leaving at all', () => {
    expect(chatLeaveLock({ status: 'in_progress' }, null, NOW)).toEqual({ kind: 'active' });
    expect(chatLeaveLock({ status: 'open' }, null, NOW)).toEqual({ kind: 'active' });
  });

  it('completed, inside the window: locked until the window ends', () => {
    expect(chatLeaveLock({ status: 'completed', disputeWindowEndsAt: ts(NOW + 3 * DAY) }, null, NOW))
      .toEqual({ kind: 'until', date: new Date(NOW + 3 * DAY) });
  });

  it('completed, after the window: open', () => {
    expect(chatLeaveLock({ status: 'completed', disputeWindowEndsAt: ts(NOW - 1) }, null, NOW)).toEqual({ kind: 'open' });
  });

  it('completed with no window (none open, or a legacy project): open', () => {
    expect(chatLeaveLock({ status: 'completed', disputeWindowEndsAt: null }, null, NOW)).toEqual({ kind: 'open' });
    expect(chatLeaveLock({ status: 'completed' }, null, NOW)).toEqual({ kind: 'open' });
  });

  it('accepts the { seconds, nanoseconds } shape', () => {
    expect(chatLeaveLock({ status: 'completed', disputeWindowEndsAt: { seconds: (NOW + DAY) / 1000, nanoseconds: 0 } }, null, NOW))
      .toEqual({ kind: 'until', date: new Date(NOW + DAY) });
  });

  it('accepts a plain ms number as the window end', () => {
    expect(chatLeaveLock({ status: 'completed', disputeWindowEndsAt: NOW + DAY }, null, NOW).kind).toBe('until');
    expect(chatLeaveLock({ status: 'completed', disputeWindowEndsAt: NOW - DAY }, null, NOW).kind).toBe('open');
  });

  it('an open dispute on the project locks it, for everyone', () => {
    expect(chatLeaveLock({ status: 'completed', adminReviewPending: true }, null, NOW)).toEqual({ kind: 'dispute' });
  });

  it("a professional's own engagement under review locks it for them", () => {
    expect(chatLeaveLock({ status: 'completed', adminReviewPending: false }, { adminReviewPending: true }, NOW))
      .toEqual({ kind: 'dispute' });
  });

  it('a dispute is reported over the date', () => {
    expect(chatLeaveLock({ status: 'completed', disputeWindowEndsAt: ts(NOW + DAY), adminReviewPending: true }, null, NOW))
      .toEqual({ kind: 'dispute' });
  });
});
