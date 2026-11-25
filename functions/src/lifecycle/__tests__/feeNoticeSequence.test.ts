import { feeNoticeFor, v2Schedule, type V2Plan, type V2Timing } from '../feeOverdue';
import { endOfDay, feeTimeline, instantAt } from '../businessDays';

/**
 * The v2 notice sequence — A (window closed), B (day before the block), C (block
 * day), D (blocked) — as one pure decision over the fee doc. Idempotency lives in
 * `reminders`: the sweep writes the plan's marks before sending, and these tests
 * apply the marks the same way.
 */

const TIMING: V2Timing = { hour: 10, extraNonBusinessDays: [] };
const CONFIG = { disputeWindowBusinessDays: 2, blockGraceBusinessDays: 2, extraNonBusinessDays: [] };
const ts = (ms: number) => ({ toMillis: () => ms }) as never;
const at = (ymd: string, h = 10, m = 0) => instantAt(ymd, h, m);

type Fee = Record<string, unknown>;

/** An unpaid v2 fee completed at 15:00 Israel time on `ymd`. */
function feeCompleted(ymd: string, over: Fee = {}): Fee {
  const t = feeTimeline(CONFIG, instantAt(ymd, 15));
  return {
    feeStatus: 'owed', status: 'pending', feePaid: false, feeDue: 30,
    engagementStatus: 'completed', feeTimingVersion: 2,
    chargeDueAt: ts(t.windowEndsAt), overdueAt: ts(t.blockAt), reminders: {},
    ...over,
  };
}

/** What the sweep does: decide, then write the marks. */
function step(fee: Fee, now: number, timing = TIMING): V2Plan | null {
  const plan = feeNoticeFor(fee as never, now, timing);
  if (plan) {
    const reminders = { ...(fee.reminders as object) } as Record<string, unknown>;
    for (const st of plan.mark) reminders[st] = ts(now);
    fee.reminders = reminders;
  }
  return plan;
}

describe('Sunday completion — the normal week', () => {
  // Window ends Tue 1 Dec, block Thu 3 Dec. A and B are both Wed 2 Dec 10:00.
  const fee = () => feeCompleted('2026-11-29');

  it('sends nothing while the window is open, nor on the day it closes', () => {
    const f = fee();
    expect(step(f, at('2026-11-30'))).toBeNull();
    expect(step(f, at('2026-12-01', 23, 59))).toBeNull();
  });

  it('merges A and B into one message at 10:00 on business day 3', () => {
    const f = fee();
    expect(step(f, at('2026-12-02', 9, 59))).toBeNull();
    const plan = step(f, at('2026-12-02'));
    expect(plan).toEqual({ kind: 'window_end_day_before', mark: ['windowEnd', 'dayBefore'] });
  });

  it('then C on the block day, then D the next allowed morning (Friday)', () => {
    const f = fee();
    step(f, at('2026-12-02'));
    expect(step(f, at('2026-12-02', 15))).toBeNull();
    expect(step(f, at('2026-12-03'))).toEqual({ kind: 'block_day', mark: ['blockDay'] });
    // The block takes effect at 23:59:59; D waits for Friday 10:00.
    expect(step(f, endOfDay('2026-12-03') + 1000)).toBeNull();
    expect(step(f, at('2026-12-04', 9, 59))).toBeNull();
    expect(step(f, at('2026-12-04'))).toEqual({ kind: 'blocked', mark: ['blocked'] });
    expect(step(f, at('2026-12-04', 11))).toBeNull();
  });
});

describe('Tuesday completion — A and B on different days', () => {
  // Window ends Thu 26 Nov, block Mon 30 Nov. A = Fri 27 Nov, B = Sun 29 Nov.
  it('sends A on Friday and B separately on Sunday', () => {
    const f = feeCompleted('2026-11-24');
    expect(step(f, at('2026-11-26', 23, 59))).toBeNull();
    expect(step(f, at('2026-11-27'))).toEqual({ kind: 'window_end', mark: ['windowEnd'] });
    expect(step(f, at('2026-11-28'))).toBeNull(); // Shabbat
    expect(step(f, at('2026-11-29'))).toEqual({ kind: 'day_before', mark: ['dayBefore'] });
    expect(step(f, at('2026-11-30'))).toEqual({ kind: 'block_day', mark: ['blockDay'] });
    expect(step(f, at('2026-12-01'))).toEqual({ kind: 'blocked', mark: ['blocked'] });
  });
});

describe('Thursday completion — the window closes Monday', () => {
  // Window ends Mon 30 Nov, block Wed 2 Dec: A and B merge on Tue 1 Dec.
  it('merges A and B on Tuesday', () => {
    const f = feeCompleted('2026-11-26');
    expect(step(f, at('2026-11-30', 23, 59))).toBeNull();
    expect(step(f, at('2026-12-01'))?.kind).toBe('window_end_day_before');
    expect(step(f, at('2026-12-02'))?.kind).toBe('block_day');
    expect(step(f, at('2026-12-03'))?.kind).toBe('blocked');
  });
});

describe('a chag on a notice day', () => {
  it('Yom Kippur (Mon 21 Sep) moves A to Tuesday, where it merges with B', () => {
    // Wed 16 Sep completion: Thu 17 = 1, Sun 20 = 2 → window ends Sun 20; Mon 21 is
    // skipped, Tue 22 = 3, Wed 23 = 4 → block Wed 23. A would be Monday but that is
    // Yom Kippur → Tue 22; B (day before Wed 23) is Tue 22.
    const f = feeCompleted('2026-09-16');
    expect(step(f, at('2026-09-21'))).toBeNull();
    expect(step(f, at('2026-09-22'))?.kind).toBe('window_end_day_before');
  });

  it('Shavuot (Fri 22 May) and Shabbat push A to Sunday, where it merges with B', () => {
    // Tue 19 May completion: window ends Thu 21 May; block Mon 25 May.
    const f = feeCompleted('2026-05-19');
    expect(step(f, at('2026-05-22'))).toBeNull();
    expect(step(f, at('2026-05-23'))).toBeNull();
    expect(step(f, at('2026-05-24'))?.kind).toBe('window_end_day_before');
  });

  it('D after a block that ends before a chag waits for the next notice day', () => {
    const s = v2Schedule(endOfDay('2026-09-17'), endOfDay('2026-09-20'), TIMING);
    expect(s.blocked).toBe(at('2026-09-22')); // Mon 21 is Yom Kippur
  });

  it('an extraNonBusinessDay also moves a notice', () => {
    const timing = { hour: 10, extraNonBusinessDays: ['2026-12-02'] };
    // Sunday completion: window Tue 1 Dec; A would be Wed 2 Dec, now off → Thu 3.
    const f = feeCompleted('2026-11-29');
    const t = feeTimeline({ ...CONFIG, extraNonBusinessDays: ['2026-12-02'] }, instantAt('2026-11-29', 15));
    f.chargeDueAt = ts(t.windowEndsAt);
    f.overdueAt = ts(t.blockAt);
    expect(step(f, at('2026-12-02'), timing)).toBeNull();
    expect(step(f, at('2026-12-03'), timing)).not.toBeNull();
  });
});

describe('idempotency', () => {
  it('a merged message marks both stages, so neither goes out again', () => {
    const f = feeCompleted('2026-11-29');
    const now = at('2026-12-02');
    expect(step(f, now)?.kind).toBe('window_end_day_before');
    // Re-run at the same moment and an hour later: nothing.
    expect(step(f, now)).toBeNull();
    expect(step(f, now + 3600_000)).toBeNull();
    expect(Object.keys(f.reminders as object).sort()).toEqual(['dayBefore', 'windowEnd']);
  });

  it('when A already went alone, B is never merged and A never repeats', () => {
    const f = feeCompleted('2026-11-24');
    expect(step(f, at('2026-11-27'))?.kind).toBe('window_end');
    expect(step(f, at('2026-11-29'))?.kind).toBe('day_before');
    expect(step(f, at('2026-11-29', 12))).toBeNull();
  });

  it('after an outage only the latest stage goes out, and the earlier ones are closed with it', () => {
    const f = feeCompleted('2026-11-29');
    // The cron was down until Thursday 10:00 (the block day).
    const plan = step(f, at('2026-12-03'));
    expect(plan).toEqual({ kind: 'block_day', mark: ['windowEnd', 'dayBefore', 'blockDay'] });
    expect(step(f, at('2026-12-03', 11))).toBeNull();
  });

  it('never sends a stale "tomorrow" once the block has passed — only D', () => {
    const f = feeCompleted('2026-11-29');
    expect(step(f, at('2026-12-04'))).toEqual({ kind: 'blocked', mark: ['blocked'] });
  });
});

describe('what stops the sequence', () => {
  const NOW = at('2026-12-02');
  it('a paid fee', () => {
    expect(feeNoticeFor(feeCompleted('2026-11-29', { feePaid: true, status: 'paid' }) as never, NOW, TIMING)).toBeNull();
  });

  it('a disputed engagement', () => {
    expect(feeNoticeFor(feeCompleted('2026-11-29', { engagementStatus: 'disputed' }) as never, NOW, TIMING)).toBeNull();
  });

  it('a fee with no block time (stamped while the switch was off)', () => {
    expect(feeNoticeFor(feeCompleted('2026-11-29', { overdueAt: undefined }) as never, NOW, TIMING)).toBeNull();
  });

  it('a legacy calendar-day fee (no feeTimingVersion) — the old sweep owns it', () => {
    expect(feeNoticeFor(feeCompleted('2026-11-29', { feeTimingVersion: undefined }) as never, NOW, TIMING)).toBeNull();
  });
});

describe('reminderHourIL', () => {
  it('follows the configured hour', () => {
    const f = feeCompleted('2026-11-29');
    const timing = { hour: 14, extraNonBusinessDays: [] };
    expect(step(f, at('2026-12-02', 13, 59), timing)).toBeNull();
    expect(step(f, at('2026-12-02', 14), timing)?.kind).toBe('window_end_day_before');
  });
});
