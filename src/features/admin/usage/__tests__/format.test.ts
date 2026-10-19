import { formatBytes, formatCount, formatResetHour, quotaFraction, quotaLevel } from '../format';

it('formatCount', () => {
  expect(formatCount(12345)).toBe('12,345');
  expect(formatCount(0)).toBe('0');
  expect(formatCount(null)).toBe('—');
  expect(formatCount(NaN)).toBe('—');
});

it('formatBytes', () => {
  expect(formatBytes(0)).toBe('0 B');
  expect(formatBytes(1023)).toBe('1023 B');
  expect(formatBytes(1536)).toBe('1.5 KB');
  expect(formatBytes(64_941_754)).toBe('61.9 MB');
  expect(formatBytes(5_990_109_522)).toBe('5.6 GB');
  expect(formatBytes(1024 * 1024 * 200)).toBe('200 MB');
  expect(formatBytes(undefined)).toBe('—');
});

it('quota fraction and level bands (warn from 80%, bad at 100%)', () => {
  expect(quotaFraction(25_000, 50_000)).toBe(0.5);
  expect(quotaFraction(null, 50_000)).toBe(0);
  expect(quotaFraction(10, 0)).toBe(0);
  expect(quotaLevel(0.79)).toBe('ok');
  expect(quotaLevel(0.8)).toBe('warn');
  expect(quotaLevel(0.999)).toBe('warn');
  expect(quotaLevel(1)).toBe('bad');
  expect(quotaLevel(2.5)).toBe('bad');
});

it('formatResetHour', () => {
  expect(formatResetHour(10)).toBe('10:00');
  expect(formatResetHour(9, 30)).toBe('09:30');
});
