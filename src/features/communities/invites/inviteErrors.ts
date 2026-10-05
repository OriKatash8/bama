/**
 * Maps what the invite callables throw to ONE i18n key under
 * community_invite.errors, so a screen never shows a raw function error.
 *
 * The client SDK reports `code` as 'functions/<code>' and `message` as the
 * server's HttpsError message (functions/src/communities/invites.ts and
 * auth/verifiedEmail.ts). `failed-precondition` carries three different
 * reasons, told apart by that message.
 */
export type InviteErrorKey =
  | 'signed_out'
  | 'email_not_verified'
  | 'demo_isolation'
  | 'links_unavailable'
  | 'not_allowed'
  | 'invalid'
  | 'not_found'
  | 'rate_limited'
  | 'try_again'
  | 'network'
  | 'generic';

export function inviteErrorKey(err: unknown): InviteErrorKey {
  const e = (err ?? {}) as { code?: unknown; message?: unknown };
  const code = typeof e.code === 'string' ? e.code.replace(/^functions\//, '') : '';
  const message = typeof e.message === 'string' ? e.message : '';
  switch (code) {
    case 'unauthenticated': return 'signed_out';
    case 'failed-precondition':
      if (message.includes('email_not_verified')) return 'email_not_verified';
      if (message.includes('demo-isolation')) return 'demo_isolation';
      return 'links_unavailable';
    case 'permission-denied': return 'not_allowed';
    case 'invalid-argument': return 'invalid';
    case 'not-found': return 'not_found';
    case 'resource-exhausted': return 'rate_limited';
    case 'aborted': return 'try_again';
    case 'unavailable':
    case 'deadline-exceeded': return 'network';
    default: return 'generic';
  }
}

export const inviteErrorI18nKey = (err: unknown) => `community_invite.errors.${inviteErrorKey(err)}`;
