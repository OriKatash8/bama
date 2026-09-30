import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * cancelProject — the client's "delete project" — clears the project's pending
 * offers, after the cancellation itself has committed (so a cleanup failure can
 * never leave the project un-cancelled). Behaviour is in cancelOffersCleanup.test.ts.
 */

const SRC = readFileSync(join(__dirname, '..', 'completion.ts'), 'utf8');
const start = SRC.indexOf('export const cancelProject');
const body = SRC.slice(start, SRC.indexOf('\nexport ', start + 1));

it('cancelProject deletes the pending offers after its batch commits', () => {
  expect(SRC).toMatch(/import \{ deletePendingOffers \} from '\.\/offerCleanup';/);
  const commit = body.indexOf('await batch.commit()');
  const cleanup = body.indexOf('await deletePendingOffers(projectId)');
  expect(commit).toBeGreaterThan(-1);
  expect(cleanup).toBeGreaterThan(commit);
});
