/**
 * The pure core of community invites, imported from the ENFORCING copy in
 * functions/src. The functions themselves are exercised end to end on the
 * emulator by scripts/probe-invite-functions.mjs; these pin the decisions.
 */
import {
  CODE_ALPHABET,
  generateToken,
  generateShortCode,
  canCreateInvite,
  canRevokeInvite,
  publicResolveBody,
  PUBLIC_MISS,
  authedInviteBody,
  rateKeyFromRequest,
  buildInviteUrl,
  SlidingWindowCounter,
  isTokenShape,
  isCodeShape,
} from '../communities/inviteCore';

const community = (over: Record<string, unknown> = {}) => ({
  type: 'community', ownerId: 'owner', members: ['owner', 'member'], name: 'Gaffers', ...over,
});

describe('generateToken', () => {
  it('is 22 URL-safe characters from 16 random bytes', () => {
    for (let i = 0; i < 200; i++) {
      const t = generateToken();
      expect(t).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(isTokenShape(t)).toBe(true);
    }
  });

  it('draws from crypto, not Math.random', () => {
    const spy = jest.spyOn(Math, 'random');
    generateToken();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not repeat', () => {
    expect(new Set(Array.from({ length: 1000 }, generateToken)).size).toBe(1000);
  });
});

describe('generateShortCode', () => {
  it('is 6 characters from the misread-safe alphabet, never 0 O 1 I L', () => {
    expect(CODE_ALPHABET).toBe('23456789ABCDEFGHJKMNPQRSTUVWXYZ');
    for (const c of '0O1IL') expect(CODE_ALPHABET).not.toContain(c);
    for (let i = 0; i < 500; i++) {
      const code = generateShortCode();
      expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
      expect(isCodeShape(code)).toBe(true);
    }
  });

  it('draws from crypto, not Math.random', () => {
    const spy = jest.spyOn(Math, 'random');
    generateShortCode();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('canCreateInvite', () => {
  it.each([
    ['owner', false, community(), true],
    ['app admin who is not a member', true, community(), true],
    ['plain member, no allowMemberInvites', false, community(), false],
    ['plain member, allowMemberInvites false', false, community({ allowMemberInvites: false }), false],
    ['plain member, allowMemberInvites "true" (string)', false, community({ allowMemberInvites: 'true' }), false],
    ['plain member, allowMemberInvites true', false, community({ allowMemberInvites: true }), true],
    ['non-member, allowMemberInvites true', false, community({ allowMemberInvites: true }), false],
  ])('%s', (who, isAppAdmin, c, expected) => {
    const uid = who.startsWith('owner') ? 'owner' : who.startsWith('non-member') ? 'stranger'
      : who.startsWith('app admin') ? 'admin' : 'member';
    expect(canCreateInvite({ uid, isAppAdmin, community: c })).toBe(expected);
  });

  it('never for something that is not a community', () => {
    expect(canCreateInvite({ uid: 'owner', isAppAdmin: false, community: community({ type: 'group' }) })).toBe(false);
    expect(canCreateInvite({ uid: 'owner', isAppAdmin: true, community: null })).toBe(false);
  });
});

describe('canRevokeInvite', () => {
  const invite = (createdBy: string) => ({ communityId: 'c1', createdBy });
  it.each([
    ['owner revokes anyone\'s invite', 'owner', false, 'member', true],
    ['app admin revokes anyone\'s invite', 'admin', true, 'member', true],
    ['member revokes their own invite', 'member', false, 'member', true],
    ['member revokes someone else\'s invite', 'member', false, 'owner', false],
    ['stranger revokes an invite', 'stranger', false, 'member', false],
  ])('%s', (_label, uid, isAppAdmin, createdBy, expected) => {
    expect(canRevokeInvite({ uid, isAppAdmin, community: community(), invite: invite(createdBy) })).toBe(expected);
  });
});

describe('public resolver body', () => {
  it('a hit carries exactly name, description, avatar — no ids, members or counts', () => {
    const body = publicResolveBody({
      ...community({ description: 'Lights', photoURL: 'https://x/y.jpg', members: ['a', 'b', 'c'] }),
    });
    expect(body).toEqual({ exists: true, revoked: false, communityName: 'Gaffers', description: 'Lights', avatarUrl: 'https://x/y.jpg' });
    expect(Object.keys(body).sort()).toEqual(['avatarUrl', 'communityName', 'description', 'exists', 'revoked']);
  });

  it('missing optional fields become null, never undefined keys', () => {
    expect(publicResolveBody(community({ name: undefined }))).toEqual({
      exists: true, revoked: false, communityName: '', description: null, avatarUrl: null,
    });
  });

  it('every miss is the same object shape', () => {
    expect(PUBLIC_MISS).toEqual({ exists: false });
    expect(JSON.stringify(PUBLIC_MISS)).toBe('{"exists":false}');
  });
});

describe('authenticated invite body', () => {
  it('a revoked invite says only that — no name, id or token', () => {
    const body = authedInviteBody({ revoked: true, token: 'T'.repeat(22), communityId: 'c1', community: community(), membership: 'none' });
    expect(body).toEqual({ exists: true, revoked: true });
  });

  it('a live invite carries what the preview screen needs', () => {
    const body = authedInviteBody({ revoked: false, token: 'T'.repeat(22), communityId: 'c1', community: community({ description: 'd', photoURL: null }), membership: 'pending' });
    expect(body).toEqual({
      exists: true, revoked: false, token: 'T'.repeat(22), communityId: 'c1',
      communityName: 'Gaffers', description: 'd', avatarUrl: null, membership: 'pending',
    });
  });
});

describe('rateKeyFromRequest', () => {
  it('uses the RIGHTMOST X-Forwarded-For entry: left entries are client-supplied and spoofable', () => {
    expect(rateKeyFromRequest({ xForwardedFor: '6.6.6.6, 203.0.113.9', ip: '10.0.0.1' })).toBe('ip:203.0.113.9');
    expect(rateKeyFromRequest({ xForwardedFor: '1.1.1.1, 2.2.2.2, 203.0.113.9', ip: undefined })).toBe('ip:203.0.113.9');
  });

  it('falls back to the socket ip without the header', () => {
    expect(rateKeyFromRequest({ xForwardedFor: undefined, ip: '198.51.100.7' })).toBe('ip:198.51.100.7');
  });

  it('keys IPv6 by /64 so one subscriber cannot rotate addresses', () => {
    const a = rateKeyFromRequest({ xForwardedFor: '2001:db8:1234:5678:aaaa::1', ip: undefined });
    const b = rateKeyFromRequest({ xForwardedFor: '2001:0db8:1234:5678:ffff:ffff:ffff:ffff', ip: undefined });
    const other = rateKeyFromRequest({ xForwardedFor: '2001:db8:1234:5679::1', ip: undefined });
    expect(a).toBe('ip6:2001:0db8:1234:5678');
    expect(b).toBe(a);
    expect(other).not.toBe(a);
  });

  it('treats IPv4-mapped IPv6 as IPv4', () => {
    expect(rateKeyFromRequest({ xForwardedFor: '::ffff:203.0.113.9', ip: undefined })).toBe('ip:203.0.113.9');
  });

  it('one shared bucket for anything unparseable — never a free pass', () => {
    expect(rateKeyFromRequest({ xForwardedFor: 'garbage', ip: undefined })).toBe('ip:unknown');
    expect(rateKeyFromRequest({ xForwardedFor: undefined, ip: undefined })).toBe('ip:unknown');
  });
});

describe('buildInviteUrl', () => {
  it('joins the configured base and token', () => {
    expect(buildInviteUrl('https://bama-af0a0.web.app', 'T'.repeat(22))).toBe(`https://bama-af0a0.web.app/c/${'T'.repeat(22)}`);
    expect(buildInviteUrl('https://bama.app/', 'T'.repeat(22))).toBe(`https://bama.app/c/${'T'.repeat(22)}`);
  });

  it.each([[''], ['http://bama.app'], ['bama.app'], [undefined], [42], ['https://bama.app/path']])(
    'refuses a base that is not a bare https origin: %p', (base) => {
      expect(buildInviteUrl(base as never, 'T'.repeat(22))).toBeNull();
    });
});

describe('SlidingWindowCounter (in-memory first pass — NOT the limit)', () => {
  it('allows up to the limit per key within the window, then refuses', () => {
    const c = new SlidingWindowCounter({ limit: 3, windowMs: 60_000, maxKeys: 100 });
    expect([1, 2, 3, 4].map(() => c.hit('k', 1000))).toEqual([true, true, true, false]);
    expect(c.hit('other', 1000)).toBe(true);
  });

  it('forgets hits older than the window', () => {
    const c = new SlidingWindowCounter({ limit: 1, windowMs: 60_000, maxKeys: 100 });
    expect(c.hit('k', 0)).toBe(true);
    expect(c.hit('k', 59_999)).toBe(false);
    expect(c.hit('k', 60_000)).toBe(true);
  });

  it('stays bounded in memory: evicts the oldest key past maxKeys', () => {
    const c = new SlidingWindowCounter({ limit: 1, windowMs: 60_000, maxKeys: 2 });
    c.hit('a', 0); c.hit('b', 1); c.hit('c', 2);
    expect(c.size).toBe(2);
    expect(c.hit('a', 3)).toBe(true); // 'a' was evicted, so it starts fresh
  });
});
