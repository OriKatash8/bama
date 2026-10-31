// node --test scripts/__tests__/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffRules, isYes } from '../lib/rulesDiff.mjs';

test('identical rules: nothing to deploy', () => {
  assert.deepEqual(diffRules('a\nb\n', 'a\nb\n'), { identical: true, text: '', added: 0, removed: 0 });
});

test('a changed ruleset is shown as live -> local, with counts', () => {
  const live = 'rules_version = 2;\nallow read;\nallow delete: if false;\n';
  const local = 'rules_version = 2;\nallow read;\nallow delete: if isAdmin();\nallow update;\n';
  const d = diffRules(live, local);
  assert.equal(d.identical, false);
  assert.equal(d.added, 2);
  assert.equal(d.removed, 1);
  assert.match(d.text, /^--- LIVE \(production\)/m);
  assert.match(d.text, /^\+\+\+ LOCAL firestore\.rules/m);
  assert.match(d.text, /^-allow delete: if false;/m);
  assert.match(d.text, /^\+allow delete: if isAdmin\(\);/m);
});

test('a ruleset that only loses lines (a stale branch) shows removals, not just additions', () => {
  const d = diffRules('keep\npayments rule\nrental rule\n', 'keep\n');
  assert.equal(d.added, 0);
  assert.equal(d.removed, 2);
});

test('only the exact word "yes" confirms', () => {
  assert.equal(isYes('yes'), true);
  for (const no of ['y', 'Yes', 'YES', 'yes ', ' yes', 'yes please', 'no', '', undefined]) assert.equal(isYes(no), false, JSON.stringify(no));
});
