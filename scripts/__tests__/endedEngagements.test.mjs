// node --test scripts/__tests__/*.test.mjs
//
// The backfill for `projects/{id}.endedEngagementIds`. It must write exactly what
// the server's derivation (functions/src/lifecycle/derive.ts) would write on the
// project's next state change, so the button and the server cannot disagree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveEndedEngagementIds, planEndedEngagementIds } from '../lib/endedEngagements.mjs';

// The server's predicate, passed in: the script takes it from functions/lib.
const frozen = (s) => ['completed', 'disputed', 'withdrawn', 'cancelled'].includes(s ?? '');

test('lists the professionals whose engagement has ended, in fee order', () => {
  const fees = [
    { professionalId: 'a', engagementStatus: 'completed' },
    { professionalId: 'b', engagementStatus: 'hired' },
    { professionalId: 'c', engagementStatus: 'disputed' },
  ];
  assert.deepEqual(deriveEndedEngagementIds(fees, frozen).ids, ['a', 'c']);
});

test('the two-step end request is still open, so it is not ended', () => {
  const fees = [{ professionalId: 'a', engagementStatus: 'end_requested_by_pro' }];
  assert.deepEqual(deriveEndedEngagementIds(fees, frozen).ids, []);
});

test('an ended fee doc with no professionalId is skipped, as derive does, and reported', () => {
  const r = deriveEndedEngagementIds([{ engagementStatus: 'completed', _docId: 'x' }], frozen);
  assert.deepEqual(r.ids, []);
  assert.deepEqual(r.missingProfessionalId, ['x']);
});

test('writes when the project has no array yet and someone has finished', () => {
  const plan = planEndedEngagementIds(undefined, [{ professionalId: 'a', engagementStatus: 'completed' }], frozen);
  assert.deepEqual(plan, { write: true, next: ['a'], missingProfessionalId: [] });
});

test('does not write an empty array onto a project that has none — absent already reads as nobody', () => {
  const plan = planEndedEngagementIds(undefined, [{ professionalId: 'a', engagementStatus: 'hired' }], frozen);
  assert.equal(plan.write, false);
});

test('does not rewrite an array that already holds the same ids in another order', () => {
  const fees = [
    { professionalId: 'a', engagementStatus: 'completed' },
    { professionalId: 'b', engagementStatus: 'completed' },
  ];
  assert.equal(planEndedEngagementIds(['b', 'a'], fees, frozen).write, false);
});

test('corrects an array that disagrees with the fee docs', () => {
  const plan = planEndedEngagementIds(['stale'], [{ professionalId: 'a', engagementStatus: 'completed' }], frozen);
  assert.deepEqual(plan.next, ['a']);
  assert.equal(plan.write, true);
});
