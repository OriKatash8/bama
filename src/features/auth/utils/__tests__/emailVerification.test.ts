import { needsEmailVerification } from '../emailVerification';

/**
 * Who must verify their email before using the app: a PASSWORD account that has
 * not verified. Google and Apple accounts arrive verified, so any account with no
 * password provider is exempt — whatever its emailVerified flag says.
 */

const user = (providers: string[], emailVerified: boolean) =>
  ({ emailVerified, providerData: providers.map((providerId) => ({ providerId })) });

it('nobody signed in: unknown', () => {
  expect(needsEmailVerification(null)).toBeNull();
});

it('an unverified password account must verify', () => {
  expect(needsEmailVerification(user(['password'], false))).toBe(true);
});

it('a verified password account passes', () => {
  expect(needsEmailVerification(user(['password'], true))).toBe(false);
});

it.each([['google.com'], ['apple.com']])('a %s account is exempt, even if not flagged verified', (p) => {
  expect(needsEmailVerification(user([p], false))).toBe(false);
});

it('an account with a password AND a social provider still needs its email verified', () => {
  expect(needsEmailVerification(user(['google.com', 'password'], false))).toBe(true);
});
