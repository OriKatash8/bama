import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RULES_CONTACT_PATTERN } from '../contactFilter';
import { EQUIPMENT_MAX } from '@features/profile/utils/profileContact';

/**
 * firestore.rules enforces the same contact pattern (phone or email) and equipment cap as the app.
 * The rules copy is a literal; this fails if it drifts from contactFilter.ts.
 */
const RULES = readFileSync(join(__dirname, '..', '..', '..', 'firestore.rules'), 'utf8');

it('hasContact carries exactly RULES_CONTACT_PATTERN (phone or email)', () => {
  expect(RULES).toContain(`s.matches('${RULES_CONTACT_PATTERN}')`);
  expect(RULES).not.toMatch(/function hasPhone\(/);
});

it('equipment is capped at EQUIPMENT_MAX, and every position up to it is checked', () => {
  const fn = RULES.slice(RULES.indexOf('function equipmentOk(l)'), RULES.indexOf('function priceListOk(l)'));
  expect(fn).toContain(`l.size() <= ${EQUIPMENT_MAX}\n`);
  for (let i = 0; i < EQUIPMENT_MAX; i++) expect(fn).toContain(`textItemOk(l[${i}])`);
  expect(fn).not.toContain(`l[${EQUIPMENT_MAX}]`);
});

it('the profile doc is guarded by profileWriteOk', () => {
  const block = RULES.slice(RULES.indexOf('match /profile/data {'));
  expect(block.slice(0, 300)).toMatch(/allow create, update: if isOwner\(userId\) && verified\(\) && profileWriteOk\(\);/);
});
