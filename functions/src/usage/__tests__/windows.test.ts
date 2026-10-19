import { nextDayStart, quotaReset, startOfDay, startOfMonth } from '../windows';

const iso = (d: Date) => d.toISOString();

describe('Pacific day / month windows', () => {
  it('summer (PDT, UTC-7): the day starts at 07:00Z', () => {
    expect(iso(startOfDay(new Date('2026-07-15T12:00:00Z')))).toBe('2026-07-15T07:00:00.000Z');
  });
  it('winter (PST, UTC-8): the day starts at 08:00Z', () => {
    expect(iso(startOfDay(new Date('2026-01-15T12:00:00Z')))).toBe('2026-01-15T08:00:00.000Z');
  });
  it('early UTC morning still belongs to the previous Pacific day', () => {
    expect(iso(startOfDay(new Date('2026-07-15T03:00:00Z')))).toBe('2026-07-14T07:00:00.000Z');
  });
  it('the exact boundary belongs to the new day', () => {
    expect(iso(startOfDay(new Date('2026-07-15T07:00:00Z')))).toBe('2026-07-15T07:00:00.000Z');
    expect(iso(startOfDay(new Date('2026-07-15T06:59:59Z')))).toBe('2026-07-14T07:00:00.000Z');
  });
  it('spring-forward day (2026-03-08) is 23 hours long', () => {
    const start = startOfDay(new Date('2026-03-08T20:00:00Z'));
    expect(iso(start)).toBe('2026-03-08T08:00:00.000Z');
    expect(nextDayStart(start).getTime() - start.getTime()).toBe(23 * 3600_000);
  });
  it('fall-back day (2026-11-01) is 25 hours long', () => {
    const start = startOfDay(new Date('2026-11-01T20:00:00Z'));
    expect(iso(start)).toBe('2026-11-01T07:00:00.000Z');
    expect(nextDayStart(start).getTime() - start.getTime()).toBe(25 * 3600_000);
  });
  it('month start is the 1st at Pacific midnight, across a DST change', () => {
    expect(iso(startOfMonth(new Date('2026-10-19T12:00:00Z')))).toBe('2026-10-01T07:00:00.000Z');
    expect(iso(startOfMonth(new Date('2026-11-19T12:00:00Z')))).toBe('2026-11-01T07:00:00.000Z'); // 1st is still PDT
    expect(iso(startOfMonth(new Date('2026-12-19T12:00:00Z')))).toBe('2026-12-01T08:00:00.000Z');
  });
  it('year boundary', () => {
    expect(iso(startOfMonth(new Date('2027-01-01T03:00:00Z')))).toBe('2026-12-01T08:00:00.000Z');
    expect(iso(nextDayStart(new Date('2026-12-31T12:00:00Z')))).toBe('2027-01-01T08:00:00.000Z');
  });
});

describe('quotaReset: when the daily quota resets, in Israel time', () => {
  const at = (s: string) => quotaReset(new Date(s)).israelHour;
  it('both on summer time: 10:00 Israel', () => {
    expect(at('2026-07-15T12:00:00Z')).toBe(10);
    expect(at('2026-10-19T12:00:00Z')).toBe(10); // today: Israel still IDT, US still PDT
  });
  it('Israel back on winter time before the US does: 09:00 (the mismatch weeks)', () => {
    expect(at('2026-10-27T12:00:00Z')).toBe(9);
    expect(at('2026-10-31T12:00:00Z')).toBe(9);
  });
  it('both on winter time: 10:00 Israel again', () => {
    expect(at('2026-11-15T12:00:00Z')).toBe(10);
    expect(at('2027-01-15T12:00:00Z')).toBe(10);
  });
  it('US on summer time before Israel does (spring mismatch): 09:00', () => {
    expect(at('2026-03-15T12:00:00Z')).toBe(9); // US PDT since Mar 8, Israel IST until Mar 27
  });
  it('is always on the hour', () => {
    expect(quotaReset(new Date('2026-10-19T12:00:00Z')).israelMinute).toBe(0);
  });
});
