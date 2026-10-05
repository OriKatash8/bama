import { inviteErrorKey, inviteErrorI18nKey, type InviteErrorKey } from '../inviteErrors';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

// Codes/messages exactly as functions/src/communities/invites.ts and
// auth/verifiedEmail.ts throw them, as the client SDK reports them.
const err = (code: string, message = '') => ({ code: `functions/${code}`, message });

describe('inviteErrorKey', () => {
  const cases: [string, unknown, InviteErrorKey][] = [
    ['unauthenticated', err('unauthenticated', 'Sign in required'), 'signed_out'],
    ['unverified email', err('failed-precondition', 'email_not_verified'), 'email_not_verified'],
    ['demo isolation', err('failed-precondition', 'demo-isolation'), 'demo_isolation'],
    ['appLinks missing', err('failed-precondition', 'config/appLinks.baseUrl is missing or not an https origin'), 'links_unavailable'],
    ['not the owner', err('permission-denied', 'Not allowed to invite to this community'), 'not_allowed'],
    ['bad argument', err('invalid-argument', 'communityId required'), 'invalid'],
    ['no such invite', err('not-found', 'No such invite'), 'not_found'],
    ['rate limited', err('resource-exhausted', 'rate_limited'), 'rate_limited'],
    ['code collision', err('aborted', 'Could not allocate an invite code, try again'), 'try_again'],
    ['offline', err('unavailable'), 'network'],
    ['timeout', err('deadline-exceeded'), 'network'],
    ['unknown code', err('internal', 'boom'), 'generic'],
    ['no code at all', new Error('boom'), 'generic'],
    ['nullish', undefined, 'generic'],
  ];
  it.each(cases)('%s', (_name, e, key) => {
    expect(inviteErrorKey(e)).toBe(key);
  });

  it('never leaks the raw server message', () => {
    const e = err('failed-precondition', 'config/appLinks.baseUrl is missing or not an https origin');
    expect(en.community_invite.errors[inviteErrorKey(e)]).not.toMatch(/appLinks/);
    expect(he.community_invite.errors[inviteErrorKey(e)]).not.toMatch(/appLinks/);
  });

  it('shows the exact Hebrew sentence for an unverified email', () => {
    expect(he.community_invite.errors.email_not_verified).toBe('אמת את כתובת האימייל שלך כדי ליצור קישור הזמנה');
    expect(inviteErrorI18nKey(err('failed-precondition', 'email_not_verified'))).toBe('community_invite.errors.email_not_verified');
  });

  it('has a non-empty string in BOTH languages for every key', () => {
    const keys = cases.map((c) => c[2]);
    for (const k of new Set(keys)) {
      expect(typeof en.community_invite.errors[k]).toBe('string');
      expect(en.community_invite.errors[k].length).toBeGreaterThan(0);
      expect(typeof he.community_invite.errors[k]).toBe('string');
      expect(he.community_invite.errors[k].length).toBeGreaterThan(0);
    }
    expect(Object.keys(he.community_invite.errors).sort()).toEqual(Object.keys(en.community_invite.errors).sort());
  });
});
