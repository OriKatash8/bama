import {
  addBusinessDays, addBusinessDaysYmd, endOfDay, feeTimeline, firstNoticeAtOrAfter,
  formatEndOfDayHe, instantAt, isBusinessDay, isIsraeliHoliday, isNoticeDay, previousBusinessDay,
  ymdOf,
} from '../businessDays';

/**
 * The Israeli business-day calendar behind the fee dispute window and block.
 * Holidays come from @hebcal/core (il: true); nothing here hardcodes a date list —
 * the dates below are only the inputs and the expected answers.
 *
 * 2026 reference: Rosh Hashana 12–13 Sep (Sat–Sun), Yom Kippur Mon 21 Sep, Sukkot
 * Sat 26 Sep, Shmini Atzeret Sat 3 Oct, Pesach Thu 2 Apr and Wed 8 Apr, Yom
 * HaAtzmaut Wed 22 Apr, Shavuot Fri 22 May.
 */

/** A completion at 15:00 Israel time on `ymd`. */
const done = (ymd: string) => instantAt(ymd, 15);
/** The Nth business day after completion, as a date. */
const nth = (ymd: string, n: number, extra: string[] = []) =>
  addBusinessDaysYmd(done(ymd), n, { extraNonBusinessDays: extra });

describe('isBusinessDay', () => {
  it('is Sunday–Thursday, never Friday or Saturday', () => {
    expect(isBusinessDay('2026-11-29')).toBe(true); // Sun
    expect(isBusinessDay('2026-11-26')).toBe(true); // Thu
    expect(isBusinessDay('2026-11-27')).toBe(false); // Fri
    expect(isBusinessDay('2026-11-28')).toBe(false); // Sat
  });

  it('excludes a chag, Yom HaAtzmaut and extraNonBusinessDays', () => {
    expect(isBusinessDay('2026-09-21')).toBe(false); // Yom Kippur (Monday)
    expect(isBusinessDay('2026-04-22')).toBe(false); // Yom HaAtzmaut (Wednesday)
    expect(isBusinessDay('2026-11-29', { extraNonBusinessDays: ['2026-11-29'] })).toBe(false);
  });

  it('keeps Chol HaMoed an ordinary business day', () => {
    expect(isIsraeliHoliday('2026-04-05')).toBe(false); // Sunday of Pesach
    expect(isBusinessDay('2026-04-05')).toBe(true);
  });
});

describe('isNoticeDay', () => {
  it('allows Friday, refuses Saturday and a chag', () => {
    expect(isNoticeDay('2026-11-27')).toBe(true);
    expect(isNoticeDay('2026-11-28')).toBe(false);
    expect(isNoticeDay('2026-09-21')).toBe(false);
    expect(isNoticeDay('2026-05-22')).toBe(false); // Shavuot, a Friday
  });
});

describe('the completion day never counts', () => {
  it('Thursday completion: Sun = 1, Mon = 2 → window; Tue = 3, Wed = 4 → block', () => {
    expect(nth('2026-11-26', 2)).toBe('2026-11-30');
    expect(nth('2026-11-26', 4)).toBe('2026-12-02');
  });

  it('Sunday completion (a business day itself): Mon = 1, Tue = 2', () => {
    expect(nth('2026-11-29', 2)).toBe('2026-12-01');
    expect(nth('2026-11-29', 4)).toBe('2026-12-03');
  });

  it('Friday and Saturday completions start counting on Sunday', () => {
    expect(nth('2026-11-27', 2)).toBe('2026-11-30');
    expect(nth('2026-11-28', 2)).toBe('2026-11-30');
    expect(nth('2026-11-27', 4)).toBe('2026-12-02');
    expect(nth('2026-11-28', 4)).toBe('2026-12-02');
  });

  it('judges the day in Israel time, not UTC', () => {
    // 23:30 Israel (UTC+2) on Thursday 26 Nov is 21:30 UTC the same day; 01:30 on
    // Friday is still Thursday in UTC. Both must read as their Israeli day.
    expect(ymdOf(Date.UTC(2026, 10, 26, 21, 30))).toBe('2026-11-26');
    expect(ymdOf(Date.UTC(2026, 10, 26, 23, 30))).toBe('2026-11-27');
    expect(addBusinessDaysYmd(Date.UTC(2026, 10, 26, 23, 30), 2)).toBe('2026-11-30');
  });

  it('zero days is the completion day itself', () => {
    expect(addBusinessDaysYmd(done('2026-11-26'), 0)).toBe('2026-11-26');
  });
});

describe('chagim and other non-business days', () => {
  it('Rosh Hashana (Sat–Sun) pushes the window past Sunday', () => {
    // Wed 9 Sep: Thu 10 = 1; Fri, Sat 12 (RH), Sun 13 (RH) skipped; Mon 14 = 2.
    expect(nth('2026-09-09', 2)).toBe('2026-09-14');
    expect(nth('2026-09-09', 4)).toBe('2026-09-16');
  });

  it('Yom Kippur on a Monday is skipped', () => {
    // Thu 17 Sep: Sun 20 = 1; Mon 21 (YK) skipped; Tue 22 = 2.
    expect(nth('2026-09-17', 2)).toBe('2026-09-22');
  });

  it('Pesach: first day (Thu 2 Apr) is skipped, Chol HaMoed counts', () => {
    // Mon 30 Mar: Tue 31 = 1, Wed 1 Apr = 2 (window). Then Thu 2 (chag), Fri, Sat
    // skipped; Sun 5 (Chol HaMoed) = 3; Mon 6 = 4.
    expect(nth('2026-03-30', 2)).toBe('2026-04-01');
    expect(nth('2026-03-30', 4)).toBe('2026-04-06');
  });

  it('Pesach: the seventh day (Wed 8 Apr) is skipped too', () => {
    // Sun 5 Apr: Mon 6 = 1, Tue 7 = 2 (window). Wed 8 (chag) skipped; Thu 9 = 3;
    // Fri, Sat skipped; Sun 12 = 4.
    expect(nth('2026-04-05', 2)).toBe('2026-04-07');
    expect(nth('2026-04-05', 4)).toBe('2026-04-12');
  });

  it('Sukkot: the first day (Sat 26 Sep) and Shmini Atzeret (Sat 3 Oct) are chagim', () => {
    expect(isIsraeliHoliday('2026-09-26')).toBe(true);
    expect(isIsraeliHoliday('2026-10-03')).toBe(true);
    expect(isIsraeliHoliday('2026-09-27')).toBe(false); // Chol HaMoed
    // Wed 23 Sep: Thu 24 = 1; Sun 27 (Chol HaMoed) = 2.
    expect(nth('2026-09-23', 2)).toBe('2026-09-27');
  });

  it('Yom HaAtzmaut (Wed 22 Apr) is skipped', () => {
    // Mon 20 Apr: Tue 21 = 1; Wed 22 skipped; Thu 23 = 2.
    expect(nth('2026-04-20', 2)).toBe('2026-04-23');
  });

  it('a date in extraNonBusinessDays is skipped', () => {
    // Thu 26 Nov normally ends the window Mon 30 Nov; with Sun 29 off it is Tue 1 Dec.
    expect(nth('2026-11-26', 2, ['2026-11-29'])).toBe('2026-12-01');
    expect(nth('2026-11-26', 2, [])).toBe('2026-11-30');
  });

  it('counts across the year end', () => {
    // Wed 30 Dec 2026: Thu 31 = 1; Fri, Sat skipped; Sun 3 Jan 2027 = 2; Mon 4 = 3; Tue 5 = 4.
    expect(nth('2026-12-30', 2)).toBe('2027-01-03');
    expect(nth('2026-12-30', 4)).toBe('2027-01-05');
  });
});

describe('deadlines are 23:59:59 Israel time', () => {
  it('in winter (UTC+2)', () => {
    expect(new Date(endOfDay('2026-12-02')).toISOString()).toBe('2026-12-02T21:59:59.000Z');
  });

  it('in summer (UTC+3), and across the March DST change', () => {
    // Wed 25 Mar 2026: Thu 26 = 1; Sun 29 = 2. Israel moved to UTC+3 on Fri 27 Mar.
    const out = addBusinessDays(done('2026-03-25'), 2);
    expect(new Date(out).toISOString()).toBe('2026-03-29T20:59:59.000Z');
  });

  it('feeTimeline returns the window end and the block time', () => {
    const t = feeTimeline(
      { disputeWindowBusinessDays: 2, blockGraceBusinessDays: 2, extraNonBusinessDays: [] },
      done('2026-11-26'),
    );
    expect(new Date(t.windowEndsAt).toISOString()).toBe('2026-11-30T21:59:59.000Z');
    expect(new Date(t.blockAt).toISOString()).toBe('2026-12-02T21:59:59.000Z');
  });
});

describe('helpers', () => {
  it('previousBusinessDay skips the weekend and a chag', () => {
    expect(previousBusinessDay('2026-11-29')).toBe('2026-11-26'); // Sun → Thu
    expect(previousBusinessDay('2026-09-22')).toBe('2026-09-20'); // Tue after YK Monday → Sun
  });

  it('firstNoticeAtOrAfter lands on the first notice day at the given hour', () => {
    const at = (ymd: string, h = 10) => instantAt(ymd, h);
    // Thu 26 Nov 23:59:59 → Friday 10:00 (Friday is allowed).
    expect(firstNoticeAtOrAfter(endOfDay('2026-11-26'), 10)).toBe(at('2026-11-27'));
    // Fri 27 Nov 23:59:59 → Saturday is out → Sunday.
    expect(firstNoticeAtOrAfter(endOfDay('2026-11-27'), 10)).toBe(at('2026-11-29'));
    // Sun 20 Sep 23:59:59 → Monday is Yom Kippur → Tuesday.
    expect(firstNoticeAtOrAfter(endOfDay('2026-09-20'), 10)).toBe(at('2026-09-22'));
    // Before the hour on a notice day → that same day.
    expect(firstNoticeAtOrAfter(instantAt('2026-11-29', 8), 10)).toBe(at('2026-11-29'));
  });

  it('formats the pay-by date in Hebrew', () => {
    expect(formatEndOfDayHe(endOfDay('2026-12-02'))).toBe('סוף יום רביעי 02.12');
    expect(formatEndOfDayHe(endOfDay('2026-11-26'))).toBe('סוף יום חמישי 26.11');
  });
});
