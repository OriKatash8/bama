import { HttpsError } from 'firebase-functions/v2/https';

/**
 * The server's twin of the rules' verified(): callables that create
 * user-visible content, or cost money, refuse an unverified PASSWORD account.
 * Google and Apple sign-ins arrive verified and are exempt — the same test the
 * client gate makes (needsEmailVerification) and the rules make
 * (`sign_in_provider != 'password'`).
 *
 * Throws failed-precondition / 'email_not_verified', which the app can tell
 * apart from a permission problem.
 */
export function assertVerifiedEmail(request: { auth?: { token?: Record<string, unknown> } | null }): void {
  const token = request.auth?.token;
  if (!token) throw new HttpsError('unauthenticated', 'Sign in required');
  const provider = (token.firebase as { sign_in_provider?: string } | undefined)?.sign_in_provider;
  if (token.email_verified === true || provider !== 'password') return;
  throw new HttpsError('failed-precondition', 'email_not_verified');
}
