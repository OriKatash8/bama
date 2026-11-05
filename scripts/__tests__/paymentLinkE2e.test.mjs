// node --test scripts/__tests__/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { assertUid, buildSeed, cleanupPlan, E2E_TAG } from '../lib/paymentLinkE2e.mjs';

const UID = 'AbCdEfGhIjKlMnOpQrStUvWxYz12';
const ts = (ms) => ({ ms });

test('assertUid accepts a Firebase uid and rejects anything else', () => {
  assert.equal(assertUid(UID), UID);
  for (const bad of [undefined, '', 'short', 'has space in it ok', '../../x', `${UID}/x`]) assert.throws(() => assertUid(bad));
});

test('the seed is a due, tagged, small fee for the test account that cannot trigger other users', () => {
  const { projectId, project, fee } = buildSeed(UID, 1_000_000_000, ts);
  assert.equal(projectId, `${E2E_TAG}-1000000000`);
  assert.equal(project.status, 'in_progress');                 // onProjectCreate acts on 'open' only
  for (const k of ['chatId', 'endDate', 'slotActive', 'filledSlots', 'crewSlots']) assert.ok(!(k in project), k);
  assert.equal(project.e2eTest, true);
  assert.equal(fee.e2eTest, true);
  assert.equal(fee.professionalId, UID);
  assert.equal(fee.feeDue, Math.round(fee.baseAmount * fee.feeRate));
  assert.equal(fee.feeDue, 6);
  assert.ok(fee.chargeDueAt.ms < 1_000_000_000);               // window already closed
  assert.ok(!('overdueAt' in fee), 'no overdueAt, so it can never block the account');
  assert.equal(fee.feePaid, false);
  assert.equal(fee.engagementStatus, 'completed');
});

test('cleanup plan: lists the fee, its pointer, its payment event, then the project', () => {
  const pid = `${E2E_TAG}-1`;
  const plan = cleanupPlan(pid, { e2eTest: true }, [{ id: UID, data: {
    e2eTest: true, paymentLink: { processId: 'L9' }, paidBy: 'link', providerRef: 'T5',
  } }], { L9: { projectId: pid } });
  assert.deepEqual(plan, { ok: true, paths: ['paymentLinks/L9', 'paymentEvents/link_T5', `projects/${pid}/fees/${UID}`, `projects/${pid}`] });
});

test('cleanup refuses a real project, an untagged fee, and never deletes another project\'s pointer', () => {
  assert.equal(cleanupPlan('abc123', { e2eTest: true }, [], {}).ok, false);                     // wrong id prefix
  assert.equal(cleanupPlan(`${E2E_TAG}-1`, { title: 'real' }, [], {}).ok, false);               // not tagged
  assert.equal(cleanupPlan(`${E2E_TAG}-1`, { e2eTest: true }, [{ id: UID, data: {} }], {}).ok, false);
  const plan = cleanupPlan(`${E2E_TAG}-1`, { e2eTest: true }, [{ id: UID, data: { e2eTest: true, paymentLink: { processId: 'X' } } }],
    { X: { projectId: 'someone-elses' } });
  assert.ok(!plan.paths.includes('paymentLinks/X'));
});

test('the script refuses without --prod and without a valid --uid, before any Firestore access', () => {
  const run = (...a) => spawnSync('node', ['scripts/seed-payment-link-test.mjs', ...a], { encoding: 'utf8', timeout: 20000 });
  assert.equal(run().status, 2);
  assert.equal(run('--emulator', '--uid', UID).status, 2);
  const r = run('--prod'); assert.equal(r.status, 2); assert.match(r.stderr, /--uid/);
});
