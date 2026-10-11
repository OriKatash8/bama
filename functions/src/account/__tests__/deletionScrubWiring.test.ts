import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * deleteMyAccount scrubs the closing cards, before the irreversible Auth
 * deletion, with the same tombstone name the user doc gets; and removes any
 * legacy email from the user doc. Behaviour is in closingScrub.test.ts.
 */

const SRC = readFileSync(join(__dirname, '..', 'deletion.ts'), 'utf8');
const call = SRC.slice(SRC.indexOf('export const deleteMyAccount'));

it('scrubs the closing cards before deleting the Auth account', () => {
  const scrub = call.indexOf('scrubClosingCards(uid, DELETED_ACCOUNT_NAME)');
  expect(scrub).toBeGreaterThan(-1);
  expect(scrub).toBeLessThan(call.indexOf('admin.auth().deleteUser(uid)'));
});

it('the tombstone and the scrub use one name', () => {
  expect(SRC).toMatch(/export const DELETED_ACCOUNT_NAME = 'חשבון שנמחק';/);
  expect(call).toMatch(/displayName: DELETED_ACCOUNT_NAME,/);
});

it('removes a legacy email from the user doc', () => {
  expect(call).toMatch(/email: FieldValue\.delete\(\),/);
});
