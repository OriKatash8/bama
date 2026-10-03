import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { confirmationCloses } from '../confirmPolicy';
import { deriveProjectState } from '../derive';

/**
 * A client confirming completion (or the auto-close) must not complete a
 * DISPUTED engagement — that would settle the dispute against the professional
 * with nobody deciding it. It stays disputed and holds the project open.
 */

it('a disputed engagement is not closed by a confirmation', () => {
  expect(confirmationCloses('disputed')).toBe(false);
});

it('finished engagements are not re-processed', () => {
  for (const s of ['completed', 'withdrawn', 'cancelled']) expect(confirmationCloses(s)).toBe(false);
});

it('open engagements are closed: hired, and either side\'s end request', () => {
  for (const s of ['hired', 'end_requested_by_pro', 'end_requested_by_client', undefined]) expect(confirmationCloses(s)).toBe(true);
});

it('after a confirmation the disputed engagement still holds the project open', () => {
  // What confirmCompletionInternal leaves behind: the others completed, the disputed one untouched.
  const after = [
    { professionalId: 'a', engagementStatus: 'completed' },
    { professionalId: 'b', engagementStatus: 'disputed' },
  ] as never[];
  const state = deriveProjectState(after as never, Date.UTC(2026, 9, 3));
  expect(state.isComplete).toBe(false);
  expect(state.reason).toContain('disputed');
  // …and the contrast, so this can't pass by derive returning no status at all.
  const allDone = deriveProjectState([{ professionalId: 'a', engagementStatus: 'completed' }, { professionalId: 'b', engagementStatus: 'completed' }] as never, Date.UTC(2026, 9, 3));
  expect(allDone.isComplete).toBe(true);
});

it('wiring: confirmCompletionInternal skips with confirmationCloses before writing anything for that pro', () => {
  const src = readFileSync(join(__dirname, '..', 'completion.ts'), 'utf8');
  const fn = src.slice(src.indexOf('export async function confirmCompletionInternal'));
  const body = fn.slice(0, fn.indexOf('\nexport '));
  const skip = body.indexOf('if (fee && !confirmationCloses(fee.engagementStatus)) continue;');
  expect(skip).toBeGreaterThan(-1);
  expect(skip).toBeLessThan(body.indexOf('closedPros.push(proId)'));
  expect(skip).toBeLessThan(body.indexOf('batch.update(feeRef(projectId, proId)'));
});
