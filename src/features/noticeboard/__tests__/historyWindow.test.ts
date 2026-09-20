import { isWithinHistoryWindow, HISTORY_WINDOW_MS, HISTORY_WINDOW_DAYS } from '../history';

/**
 * History lists the last two days and nothing older. It is a read filter: an
 * offer that ages out is still live for the client, and a notice that ages out
 * stays hidden from the board — only the list forgets them.
 */

const NOW = 1_800_000_000_000;

it('spans two days', () => {
  expect(HISTORY_WINDOW_DAYS).toBe(2);
  expect(HISTORY_WINDOW_MS).toBe(2 * 24 * 60 * 60 * 1000);
});

it('keeps an entry until the window closes, and drops it after', () => {
  expect(isWithinHistoryWindow(NOW - 1000, NOW)).toBe(true);
  expect(isWithinHistoryWindow(NOW - HISTORY_WINDOW_MS + 1000, NOW)).toBe(true);
  expect(isWithinHistoryWindow(NOW - HISTORY_WINDOW_MS, NOW)).toBe(false);
  expect(isWithinHistoryWindow(NOW - 7 * 24 * 60 * 60 * 1000, NOW)).toBe(false);
});

/**
 * An offer written with serverTimestamp reads back as 0 seconds until the
 * server answers. Dropping it then would make a just-sent offer vanish from the
 * list it was sent from, so an undated entry is kept.
 */
it('keeps an entry whose moment is not known yet', () => {
  expect(isWithinHistoryWindow(0, NOW)).toBe(true);
  expect(isWithinHistoryWindow(undefined, NOW)).toBe(true);
});
