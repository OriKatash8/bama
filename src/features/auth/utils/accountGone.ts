/**
 * Whether the signed-in account no longer exists on the server.
 *
 * Firebase keeps a session cached on the device. When the account is deleted
 * elsewhere (an admin, a wipe, deletion from another device), the cached user
 * still looks signed in until the ID token expires — up to an hour — and the
 * app opened onto mode select and the home screen with no name. Reloading the
 * user asks the server; these codes mean the account is gone, so the app signs
 * out and lands on login.
 *
 * NOT `auth/user-disabled`: that is a suspension, which useAuth handles from the
 * user document so the reason can be shown. Network failures are not "gone" —
 * an offline launch must not sign anyone out.
 */
export const ACCOUNT_GONE_CODES: ReadonlySet<string> = new Set([
  'auth/user-not-found',
  'auth/user-token-expired',
]);

export async function accountGone(user: { reload?: () => Promise<void> }): Promise<boolean> {
  if (typeof user.reload !== 'function') return false;
  try {
    await user.reload();
    return false;
  } catch (e) {
    return ACCOUNT_GONE_CODES.has((e as { code?: string } | null)?.code ?? '');
  }
}
