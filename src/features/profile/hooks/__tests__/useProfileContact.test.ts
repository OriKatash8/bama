import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Backstop: useProfile.save refuses a profile with a phone in the bio or
 * equipment before writing anything, whoever calls it. The screen checks
 * first and shows the inline errors; this is the second line.
 */
const SRC = readFileSync(join(__dirname, '..', 'useProfile.ts'), 'utf8');

it('checks the profile before any write', () => {
  const check = SRC.indexOf('profileContactErrors(');
  expect(check).toBeGreaterThan(-1);
  expect(check).toBeLessThan(SRC.indexOf("updateDocument(`users/${user.id}`"));
  expect(SRC).toMatch(/throw new ProfileContactError\(/);
});
