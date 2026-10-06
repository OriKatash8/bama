// node --test scripts/__tests__/jestChecked.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { failedToLoad, summarize } from '../jest-checked.mjs';

const pass = (name, n = 3) => ({ name, status: 'passed', message: '', assertionResults: Array.from({ length: n }, (_, i) => ({ status: 'passed', fullName: `${name} ${i}` })) });
const failAssert = (name) => ({ name, status: 'failed', message: 'expect(...)', assertionResults: [{ status: 'passed', fullName: 'a' }, { status: 'failed', fullName: 'b breaks' }] });
const noLoad = (name) => ({ name, status: 'failed', message: 'Test suite failed to run\n\nCannot find module x', assertionResults: [] });
const run = (suites, over = {}) => ({ success: suites.every((s) => s.status === 'passed'), numTotalTestSuites: suites.length, numTotalTests: suites.reduce((n, s) => n + s.assertionResults.length, 0), testResults: suites, ...over });

test('an all-green run is ok', () => {
  const s = summarize(run([pass('a'), pass('b')]));
  assert.equal(s.ok, true);
  assert.deepEqual([s.loadFailures.length, s.failedAssertions.length, s.fewerThanBefore], [0, 0, 0]);
});

test('a failed ASSERTION is not a load failure', () => {
  const s = summarize(run([pass('a'), failAssert('b')]));
  assert.equal(s.ok, false);
  assert.deepEqual(s.failedAssertions, [{ file: 'b', title: 'b breaks' }]);
  assert.equal(s.loadFailures.length, 0);
});

test('THE authStore CASE: a suite that fails to LOAD is reported on its own, with its error text', () => {
  const s = summarize(run([pass('a'), noLoad('authStore.test.ts')]));
  assert.equal(s.ok, false);
  assert.equal(s.loadFailures.length, 1);
  assert.equal(s.loadFailures[0].file, 'authStore.test.ts');
  assert.match(s.loadFailures[0].message, /Cannot find module x/);
  assert.equal(s.failedAssertions.length, 0, 'it ran no assertions, so none failed');
  assert.equal(failedToLoad(noLoad('x')), true);
  assert.equal(failedToLoad(failAssert('x')), false);
  assert.equal(failedToLoad(pass('x')), false);
});

test('a load failure makes the run not-ok even if Jest claimed success (success=true with a missing suite must not pass)', () => {
  const s = summarize(run([pass('a'), noLoad('b')], { success: true }));
  assert.equal(s.ok, false);
});

test('fewer tests than the last run is surfaced, more or equal is not', () => {
  assert.equal(summarize(run([pass('a', 5)]), 8).fewerThanBefore, 3);
  assert.equal(summarize(run([pass('a', 5)]), 5).fewerThanBefore, 0);
  assert.equal(summarize(run([pass('a', 5)]), 2).fewerThanBefore, 0);
  assert.equal(summarize(run([pass('a', 5)]), null).fewerThanBefore, 0);
});
