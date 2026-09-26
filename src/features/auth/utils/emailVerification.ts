type VerifiableUser = { emailVerified: boolean; providerData: { providerId: string }[] } | null;

/**
 * True when the signed-in user must verify their email before using the app:
 * a PASSWORD account that has not verified. Google and Apple accounts arrive
 * verified, so an account with no password provider is exempt outright — the
 * same test the rules' verified() makes with `sign_in_provider != 'password'`.
 * Null while nobody is signed in.
 */
export function needsEmailVerification(user: VerifiableUser): boolean | null {
  if (!user) return null;
  if (user.providerData.every((p) => p.providerId !== 'password')) return false;
  return !user.emailVerified;
}
