import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertVerifiedEmail } from '../auth/verifiedEmail';

/**
 * The server's twin of the rules' verified(): a callable that creates content or
 * costs money refuses an unverified PASSWORD account with
 * failed-precondition / 'email_not_verified'. Google and Apple are exempt.
 */

const req = (token: Record<string, unknown> | null) => ({ auth: token ? { uid: 'u1', token } : null });
const pw = (email_verified: boolean) => ({ email_verified, firebase: { sign_in_provider: 'password' } });

it('lets a verified password account through', () => {
  expect(() => assertVerifiedEmail(req(pw(true)))).not.toThrow();
});

it('refuses an unverified password account, with the agreed code and message', () => {
  expect.assertions(2);
  try { assertVerifiedEmail(req(pw(false))); } catch (e) {
    expect((e as { code: string }).code).toBe('failed-precondition');
    expect((e as Error).message).toBe('email_not_verified');
  }
});

it.each(['google.com', 'apple.com'])('exempts a %s sign-in', (provider) => {
  expect(() => assertVerifiedEmail(req({ email_verified: false, firebase: { sign_in_provider: provider } }))).not.toThrow();
});

it('an unauthenticated call is refused as such', () => {
  expect.assertions(1);
  try { assertVerifiedEmail(req(null)); } catch (e) { expect((e as { code: string }).code).toBe('unauthenticated'); }
});

describe('wired into the content callables', () => {
  it.each([
    ['claude/index.ts', 'callClaude'],
    ['communities/invites.ts', 'createCommunityInvite'],
  ])('%s → %s checks it before doing any work', (file, name) => {
    const src = readFileSync(join(__dirname, '..', file), 'utf8');
    const body = src.slice(src.indexOf(`export const ${name}`));
    const guard = body.indexOf('assertVerifiedEmail(request)');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(body.search(/fetch\(|db\.|\.get\(\)|checkRateLimit\(/));
  });
});
