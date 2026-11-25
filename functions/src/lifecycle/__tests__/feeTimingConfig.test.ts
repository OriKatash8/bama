import { CONFIG_DEFAULTS, resolveConfig } from '../../pricing';

describe('fee timing config', () => {
  it('defaults: 2 + 2 business days, notices at 10:00, no extra days', () => {
    expect(CONFIG_DEFAULTS.disputeWindowBusinessDays).toBe(2);
    expect(CONFIG_DEFAULTS.blockGraceBusinessDays).toBe(2);
    expect(CONFIG_DEFAULTS.reminderHourIL).toBe(10);
    expect(CONFIG_DEFAULTS.extraNonBusinessDays).toEqual([]);
  });

  it('reads valid values from config/pricing', () => {
    const c = resolveConfig({
      disputeWindowBusinessDays: 3, blockGraceBusinessDays: 1, reminderHourIL: 0,
      extraNonBusinessDays: ['2026-12-24', '2027-01-01'],
    });
    expect(c.disputeWindowBusinessDays).toBe(3);
    expect(c.blockGraceBusinessDays).toBe(1);
    expect(c.reminderHourIL).toBe(0); // midnight is a valid hour
    expect(c.extraNonBusinessDays).toEqual(['2026-12-24', '2027-01-01']);
  });

  it('rejects unusable values field by field', () => {
    const c = resolveConfig({
      disputeWindowBusinessDays: -1, blockGraceBusinessDays: 'two', reminderHourIL: 25,
      extraNonBusinessDays: ['2026-12-24', '24/12/2026', 5, null],
    });
    expect(c.disputeWindowBusinessDays).toBe(2);
    expect(c.blockGraceBusinessDays).toBe(2);
    expect(c.reminderHourIL).toBe(10);
    expect(c.extraNonBusinessDays).toEqual(['2026-12-24']);
  });

  it('a missing or non-array list is empty', () => {
    expect(resolveConfig({}).extraNonBusinessDays).toEqual([]);
    expect(resolveConfig({ extraNonBusinessDays: 'x' }).extraNonBusinessDays).toEqual([]);
  });
});
