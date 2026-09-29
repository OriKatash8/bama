import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Every place a user's profile photo is uploaded shrinks it first. */
const SRC = join(__dirname, '..', '..', '..', '..');
it.each([
  ['features', 'profile', 'hooks', 'useProfile.ts'],
  ['features', 'auth', 'components', 'ProfileSetupForm.tsx'],
  ['components', 'layout', 'AppHeader.tsx'],
])('%s/%s/%s…', (...p) => {
  const src = readFileSync(join(SRC, ...p), 'utf8');
  expect(src).toMatch(/fetch\(await shrinkAvatar\(/);
});
