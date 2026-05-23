import { formatCurrency, formatDate, formatDuration, formatRelativeTime } from '../formatters';

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
