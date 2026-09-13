// node --test scripts/__tests__/*.test.mjs
//
// The drift checker's list of functions that are exported but intentionally not
// deployed. The guards exist so "intentionally not deployed" can't quietly become
// "forgotten": every entry carries a reason and a date, and expires after 60 days.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAllowlist, ALLOWLIST_MAX_AGE_DAYS } from '../lib/driftAllowlist.mjs';

const entry = (over = {}) => ({
  name: 'resolveCommunityInvite',
  reason: 'public invite resolver; deploys with the web landing task',
  addedOn: '2026-09-13',
  ...over,
});
const base = { exported: ['resolveCommunityInvite', 'createCommunityInvite'], deployed: ['createCommunityInvite'], today: '2026-09-13' };

test('a valid entry for an undeployed export is allowed, with its age', () => {
  const r = evaluateAllowlist({ ...base, entries: [entry()] });
  assert.deepEqual(r.problems, []);
  assert.equal(r.allowed.length, 1);
  assert.equal(r.allowed[0].name, 'resolveCommunityInvite');
  assert.equal(r.allowed[0].ageDays, 0);
  assert.deepEqual([...r.allowedNames], ['resolveCommunityInvite']);
});

test('the limit is 60 days: day 60 is still allowed, day 61 fails', () => {
  assert.equal(ALLOWLIST_MAX_AGE_DAYS, 60);
  const day60 = evaluateAllowlist({ ...base, entries: [entry({ addedOn: '2026-07-15' })] }); // 60 days before 09-13
  assert.deepEqual(day60.problems, []);
  assert.equal(day60.allowed[0].ageDays, 60);
  const day61 = evaluateAllowlist({ ...base, entries: [entry({ addedOn: '2026-07-14' })] });
  assert.equal(day61.problems.length, 1);
  assert.equal(day61.problems[0].kind, 'expired');
  assert.match(day61.problems[0].message, /61 days/);
  assert.equal(day61.allowedNames.size, 0, 'an expired entry does not excuse the missing deploy');
});

test('a bare function name is malformed', () => {
  const r = evaluateAllowlist({ ...base, entries: ['resolveCommunityInvite'] });
  assert.equal(r.problems[0].kind, 'malformed');
  assert.equal(r.allowedNames.size, 0);
});

for (const [label, over] of [
  ['missing reason', { reason: undefined }],
  ['blank reason', { reason: '   ' }],
  ['missing name', { name: undefined }],
  ['missing addedOn', { addedOn: undefined }],
  ['addedOn not a date', { addedOn: 'last week' }],
  ['addedOn impossible date', { addedOn: '2026-02-30' }],
  ['addedOn wrong format', { addedOn: '13/09/2026' }],
]) {
  test(`malformed: ${label}`, () => {
    const r = evaluateAllowlist({ ...base, entries: [entry(over)] });
    assert.equal(r.problems.length, 1, JSON.stringify(r.problems));
    assert.equal(r.problems[0].kind, 'malformed');
  });
}

test('an addedOn in the future is malformed (it would dodge the expiry)', () => {
  const r = evaluateAllowlist({ ...base, entries: [entry({ addedOn: '2026-09-14' })] });
  assert.equal(r.problems[0].kind, 'malformed');
});

test('duplicate names are malformed', () => {
  const r = evaluateAllowlist({ ...base, entries: [entry(), entry()] });
  assert.ok(r.problems.some((p) => p.kind === 'malformed' && /duplicate/.test(p.message)));
});

test('stale: the name is not an exported function', () => {
  const r = evaluateAllowlist({ ...base, entries: [entry({ name: 'resolveCommunityInvit' })] });
  assert.equal(r.problems[0].kind, 'stale-not-exported');
});

test('stale: the name is deployed now, so the entry must go', () => {
  const r = evaluateAllowlist({ ...base, deployed: ['createCommunityInvite', 'resolveCommunityInvite'], entries: [entry()] });
  assert.equal(r.problems[0].kind, 'stale-deployed');
});

test('an empty or missing list is fine', () => {
  assert.deepEqual(evaluateAllowlist({ ...base, entries: [] }).problems, []);
  assert.deepEqual(evaluateAllowlist({ ...base, entries: undefined }).problems, []);
});

test('a non-array list is malformed', () => {
  assert.equal(evaluateAllowlist({ ...base, entries: { name: 'x' } }).problems[0].kind, 'malformed');
});
