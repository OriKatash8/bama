import { endDateNotice } from '../endDateNotice';

/**
 * The project chat warns everyone from 1 day before the end date until the
 * project auto-closes, 2 days after it — only when it will actually auto-close:
 * a live project with at least one hired pro.
 */

const END = new Date(2026, 9, 5); // Oct 5, local midnight — how endDate is stored
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h);
const base = { endDate: END, status: 'in_progress', hasHires: true };

it('is hidden more than a day before the end date', () => {
  expect(endDateNotice({ ...base, now: at(2026, 9, 3, 23) }).show).toBe(false);
});

it('shows from one day before the end date', () => {
  expect(endDateNotice({ ...base, now: at(2026, 9, 4, 0) }).show).toBe(true);
});

it('keeps showing through the 2-day grace after the end date', () => {
  expect(endDateNotice({ ...base, now: at(2026, 9, 5) }).show).toBe(true);
  expect(endDateNotice({ ...base, now: at(2026, 9, 6, 23) }).show).toBe(true);
});

it('is hidden once the close time has passed', () => {
  expect(endDateNotice({ ...base, now: at(2026, 9, 7, 0) }).show).toBe(false);
});

it('says the project closes 2 days after the end date', () => {
  expect(endDateNotice({ ...base, now: at(2026, 9, 4) }).closesOn).toBe('2026-10-07');
});

it('also shows on an open project that has hires', () => {
  expect(endDateNotice({ ...base, status: 'open', now: at(2026, 9, 4) }).show).toBe(true);
});

it('is hidden when nothing will auto-close', () => {
  const now = at(2026, 9, 4);
  expect(endDateNotice({ ...base, hasHires: false, now }).show).toBe(false);
  expect(endDateNotice({ ...base, status: 'completed', now }).show).toBe(false);
  expect(endDateNotice({ ...base, status: 'cancelled', now }).show).toBe(false);
  expect(endDateNotice({ ...base, endDate: undefined, now }).show).toBe(false);
});
