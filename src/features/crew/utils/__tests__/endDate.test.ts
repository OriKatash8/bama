import { endDateFromDeadline } from '../endDate';

describe('endDateFromDeadline — one picker answer, two fields', () => {
  it('converts an ISO day at LOCAL midnight', () => {
    const d = endDateFromDeadline('2026-08-31')!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);      // August
    expect(d.getDate()).toBe(31);
    // Parsing as UTC would make a project due "the 31st" fall due on the 30th
    // for anyone west of Greenwich. The server's parseDeadline agrees.
    expect(d.getHours()).toBe(0);
  });

  it('returns undefined for flexible — no date means it never auto-completes', () => {
    expect(endDateFromDeadline('flexible')).toBeUndefined();
  });

  it('returns undefined for an empty or absent answer', () => {
    expect(endDateFromDeadline('')).toBeUndefined();
    expect(endDateFromDeadline(undefined)).toBeUndefined();
  });

  it('returns undefined for anything unparseable, never an Invalid Date', () => {
    // A Date of NaN written to Firestore throws deep inside the SDK with nothing
    // pointing back here.
    expect(endDateFromDeadline('not-a-date')).toBeUndefined();
    expect(endDateFromDeadline('2026-13-45')).toBeUndefined();
  });
});
