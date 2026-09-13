import { showsOnBalance, balanceRowNote } from '../balance';
import type { ProjectFee } from '@core/types/project';

const NOW = 1_800_000_000_000;
const ts = (ms: number) => ({ seconds: Math.floor(ms / 1000), nanoseconds: 0 });
const DAY = 86400_000;

const fee = (over: Partial<ProjectFee> = {}): ProjectFee => ({
  professionalId: 'pro-1',
  feeStatus: 'owed',
  feeRate: 0.03,
  baseAmount: 4000,
  minFeeApplied: 6,
  slotActive: false,
  ...over,
} as ProjectFee);

/**
 * The bug this replaces: `.filter((r) => r.owed > 0)` on the balance screen — an
 * AMOUNT standing in for a STATE, which is the pattern this whole refactor has
 * been removing. It hid the two rows that most need to be seen.
 */
describe('showsOnBalance', () => {
  it('shows an ordinary outstanding fee', () => {
    expect(showsOnBalance(fee({ engagementStatus: 'completed', feeDue: 120 }), NOW)).toBe(true);
  });

  it('SHOWS a contested engagement whose fee was voided to zero', () => {
    // `didnt_happen` sets feeDue 0 and status 'not_owed'. Under the old filter
    // the row vanished from the money screen at the exact moment the
    // professional most needed to see that something was open and being looked
    // at — they raised an issue and it disappeared.
    expect(showsOnBalance(
      fee({ engagementStatus: 'disputed', feeDue: 0, status: 'not_owed' }), NOW,
    )).toBe(true);
  });

  it('SHOWS a contested engagement whose fee is merely held', () => {
    expect(showsOnBalance(fee({ engagementStatus: 'disputed', feeDue: 120 }), NOW)).toBe(true);
  });

  it('SHOWS a completed engagement inside its charge window, even at zero owed', () => {
    expect(showsOnBalance(
      fee({ engagementStatus: 'completed', feeDue: 0, feePaid: true, chargeDueAt: ts(NOW + 2 * DAY) }),
      NOW,
    )).toBe(true);
  });

  it('stops showing it once the window has closed and nothing is owed', () => {
    expect(showsOnBalance(
      fee({ engagementStatus: 'completed', feeDue: 0, feePaid: true, chargeDueAt: ts(NOW - 1) }),
      NOW,
    )).toBe(false);
  });

  it('falls back to disputeWindowEndsAt on records from before the collapse', () => {
    expect(showsOnBalance(
      fee({ engagementStatus: 'completed', feeDue: 0, feePaid: true, disputeWindowEndsAt: ts(NOW + DAY) }),
      NOW,
    )).toBe(true);
  });

  it('hides a settled engagement — the row genuinely is finished', () => {
    expect(showsOnBalance(
      fee({ engagementStatus: 'completed', feeDue: 0, feePaid: true }), NOW,
    )).toBe(false);
  });

  it('hides an exempt engagement, which never owed anything', () => {
    expect(showsOnBalance(fee({ feeStatus: 'exempt', engagementStatus: 'completed' }), NOW)).toBe(false);
  });

  it('still shows one in progress, exactly as before — this is the §5 early-payment case', () => {
    // PRE-EXISTING and deliberately unchanged. `feeDue` is unset until
    // completion, so outstandingFee derives the amount, which is what lets a
    // professional settle early. The old `owed > 0` filter admitted these rows
    // too; nothing about the change touches them, and quietly hiding them here
    // would remove an affordance the contract gives.
    expect(showsOnBalance(fee({ engagementStatus: 'hired' }), NOW)).toBe(true);
  });

  it('hides a withdrawn or cancelled engagement', () => {
    for (const engagementStatus of ['withdrawn', 'cancelled'] as const) {
      expect(showsOnBalance(fee({ engagementStatus, feeDue: 0, status: 'not_owed' }), NOW)).toBe(false);
    }
  });

  it('handles a missing fee', () => {
    expect(showsOnBalance(null, NOW)).toBe(false);
    expect(showsOnBalance(undefined, NOW)).toBe(false);
  });
});

describe('balanceRowNote', () => {
  it('reads engagementStatus, not the older settlement enum', () => {
    // A contest writes engagementStatus 'disputed' and, for didnt_happen,
    // status 'not_owed'. The line this replaced checked `status === 'disputed'`
    // and would therefore never have fired for a new contest — the row would sit
    // on screen showing ₪0 with no explanation at all.
    expect(balanceRowNote(fee({ engagementStatus: 'disputed', status: 'not_owed' }), NOW))
      .toBe('disputed');
  });

  it('still recognises a legacy dispute, which only carries the old enum', () => {
    expect(balanceRowNote(fee({ status: 'disputed' }), NOW)).toBe('disputed');
  });

  it('names a pending charge, whatever the amount', () => {
    expect(balanceRowNote(
      fee({ engagementStatus: 'completed', feeDue: 120, chargeDueAt: ts(NOW + DAY) }), NOW,
    )).toBe('pending_charge');
    expect(balanceRowNote(
      fee({ engagementStatus: 'completed', feeDue: 0, feePaid: true, chargeDueAt: ts(NOW + DAY) }), NOW,
    )).toBe('pending_charge');
  });

  it('says nothing extra once the window has closed', () => {
    expect(balanceRowNote(
      fee({ engagementStatus: 'completed', feeDue: 120, chargeDueAt: ts(NOW - 1) }), NOW,
    )).toBeNull();
  });

  it('says nothing on an ordinary owing row, which explains itself', () => {
    expect(balanceRowNote(fee({ engagementStatus: 'hired', feeDue: 120 }), NOW)).toBeNull();
  });

  it('never leaves a visible row unexplained when nothing is owed', () => {
    // The invariant that keeps a ₪0 line from reading as a bug: anything the
    // filter lets through with no amount must have something to say.
    const zeroOwed = [
      fee({ engagementStatus: 'disputed', feeDue: 0, status: 'not_owed' }),
      fee({ engagementStatus: 'completed', feeDue: 0, feePaid: true, chargeDueAt: ts(NOW + DAY) }),
    ];
    for (const f of zeroOwed) {
      expect(showsOnBalance(f, NOW)).toBe(true);
      expect(balanceRowNote(f, NOW)).not.toBeNull();
    }
  });
});
