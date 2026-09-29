import { needsProfileSetup } from '../needsProfileSetup';

/** Only accounts created with the flag set go through first-time setup. */
it('a new account flagged for setup needs it', () => {
  expect(needsProfileSetup({ needsProfileSetup: true })).toBe(true);
});
it('an existing account (no flag) or a finished one does not', () => {
  expect(needsProfileSetup({})).toBe(false);
  expect(needsProfileSetup({ needsProfileSetup: false })).toBe(false);
  expect(needsProfileSetup(null)).toBe(false);
});
