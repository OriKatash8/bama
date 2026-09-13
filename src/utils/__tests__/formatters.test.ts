import { execFileSync } from 'child_process';
import { formatCurrency, formatDate, formatDuration, formatRelativeTime, formatIsoDay } from '../formatters';

describe('formatCurrency', () => {
  it('formats USD by default', () => {
    expect(formatCurrency(1000)).toBe('$1,000.00');
    expect(formatCurrency(99.5)).toBe('$99.50');
  });
  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });
});

describe('formatDate', () => {
  it('returns a non-empty string for a valid timestamp', () => {
    const result = formatDate({ seconds: 1700000000 });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
  it('includes the year in the output', () => {
    expect(formatDate({ seconds: 1700000000 })).toMatch(/202\d/);
  });
});

describe('formatDuration', () => {
  it('shows only minutes for under 60 mins', () => {
    expect(formatDuration(30)).toBe('30m');
    expect(formatDuration(59)).toBe('59m');
  });
  it('shows only hours when no remainder', () => {
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(120)).toBe('2h');
  });
  it('shows hours and minutes when there is a remainder', () => {
    expect(formatDuration(90)).toBe('1h 30m');
    expect(formatDuration(75)).toBe('1h 15m');
  });
});

describe('formatRelativeTime', () => {
  it('returns "just now" for timestamps under 60 seconds ago', () => {
    const seconds = Math.floor(Date.now() / 1000) - 10;
    expect(formatRelativeTime({ seconds })).toBe('just now');
  });
  it('returns minutes ago', () => {
    const seconds = Math.floor(Date.now() / 1000) - 120;
    expect(formatRelativeTime({ seconds })).toBe('2m ago');
  });
  it('returns hours ago', () => {
    const seconds = Math.floor(Date.now() / 1000) - 7200;
    expect(formatRelativeTime({ seconds })).toBe('2h ago');
  });
  it('returns days ago', () => {
    const seconds = Math.floor(Date.now() / 1000) - 172800;
    expect(formatRelativeTime({ seconds })).toBe('2d ago');
  });
});

/**
 * Project dates are stored as ISO day strings ('2026-09-14') and shown as DD/MM/YYYY.
 * The string is reformatted directly, never through `new Date(iso)`, which reads an
 * ISO day as UTC midnight and shows the PREVIOUS day in any timezone west of UTC.
 */
describe('formatIsoDay', () => {
  it('shows an ISO day as DD/MM/YYYY', () => {
    expect(formatIsoDay('2026-09-14')).toBe('14/09/2026');
    expect(formatIsoDay('2027-01-05')).toBe('05/01/2027');
    expect(formatIsoDay('2026-12-31')).toBe('31/12/2026');
  });

  it('never shifts the day, whatever the timezone', () => {
    // A timezone can't be changed inside a running jest process, so run the real
    // function in fresh node processes started with TZ set. West of UTC is where a
    // `new Date(iso)` implementation shows the previous day.
    const fn = formatIsoDay.toString();
    for (const tz of ['America/Los_Angeles', 'UTC', 'Asia/Jerusalem', 'Pacific/Kiritimati']) {
      const out = execFileSync(process.execPath, ['-e', `const f = (${fn}); process.stdout.write(f('2026-03-01'))`], {
        env: { ...process.env, TZ: tz },
        encoding: 'utf8',
      });
      expect({ tz, out }).toEqual({ tz, out: '01/03/2026' });
    }
  });

  it('leaves anything that is not an ISO day unchanged', () => {
    expect(formatIsoDay('')).toBe('');
    expect(formatIsoDay('flexible')).toBe('flexible');
    expect(formatIsoDay('14/09/2026')).toBe('14/09/2026');
    expect(formatIsoDay('2026-09-14T10:00:00Z')).toBe('2026-09-14T10:00:00Z');
  });
});
