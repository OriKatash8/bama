/**
 * The machine half of the project's end date.
 *
 * `deadline` on the project stays exactly what the client typed — an ISO day, or
 * the literal `'flexible'` — because that is what 69 live projects carry and what
 * the UI shows. This derives the date automation runs on from that same answer,
 * so the builder never asks twice.
 *
 * Returns a plain `Date`, not a Timestamp, so this file imports nothing from the
 * Firestore SDK and can be unit-tested. The SDK converts a Date on write; three
 * test suites in this repo already fail on an ESM import of `firebase/firestore`,
 * and pure logic does not belong behind that wall.
 *
 * `'flexible'`, empty and unparseable all yield `undefined`, which means the
 * project has NO end date: nothing auto-completes on it and every engagement
 * waits for its professional to mark it, indefinitely. The builder says that out
 * loud rather than leaving it to be discovered.
 */
export function endDateFromDeadline(deadline: string | undefined): Date | undefined {
  if (!deadline || deadline === 'flexible') return undefined;
  // Local midnight, deliberately. Parsing bare `YYYY-MM-DD` as UTC would make a
  // project due "the 31st" fall due on the 30th for anyone west of Greenwich —
  // and the server's parseDeadline reads it the same way.
  const parsed = new Date(`${deadline}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
