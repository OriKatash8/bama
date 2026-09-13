import { isAllowedDeepLink, isInviteTokenOrCode } from '../allowlist';

/**
 * A saved deep-link href is replayed into router.replace after sign-in. Anything
 * that can reach that store — a crafted link today, a future writer tomorrow —
 * must not be able to steer the app somewhere it chooses. So an href is replayed
 * only if it matches a route we know, exactly: no prefixes, no query, no
 * traversal, no scheme.
 */

const TOKEN_22 = 'AbCdEfGhIjKlMnOpQr_-12';
const CODE_6 = 'K7MX9P';

describe('isAllowedDeepLink', () => {
  it.each([
    [`/c/${TOKEN_22}`],
    [`/c/${CODE_6}`],
  ])('accepts the invite route %s', (href) => {
    expect(isAllowedDeepLink(href)).toBe(true);
  });

  it.each([
    ['protocol-relative', '//evil.example/c/K7MX9P'],
    ['another app route', '/admin'],
    ['a group route', '/(professional)/(tabs)/dashboard'],
    ['path traversal', '/c/../admin'],
    ['encoded traversal', '/c/%2e%2e%2fadmin'],
    ['custom scheme', 'bama://c/K7MX9P'],
    ['absolute url', 'https://bama-af0a0.web.app/c/K7MX9P'],
    ['query string', `/c/${CODE_6}?next=/admin`],
    ['fragment', `/c/${CODE_6}#x`],
    ['trailing slash', `/c/${CODE_6}/`],
    ['extra segment', `/c/${CODE_6}/admin`],
    ['over length', `/c/${TOKEN_22}X`],
    ['under length', '/c/K7MX9'],
    ['whitespace', `/c/${CODE_6} `],
    ['newline', `/c/${CODE_6}\n/admin`],
    ['empty', ''],
  ])('rejects %s', (_label, href) => {
    expect(isAllowedDeepLink(href)).toBe(false);
  });

  it.each([[null], [undefined], [42], [{ href: `/c/${CODE_6}` }]])('rejects non-string %p', (href) => {
    expect(isAllowedDeepLink(href)).toBe(false);
  });
});

describe('isInviteTokenOrCode', () => {
  it('accepts a 22-char token and a 6-char code', () => {
    expect(isInviteTokenOrCode(TOKEN_22)).toBe(true);
    expect(isInviteTokenOrCode(CODE_6)).toBe(true);
  });

  it.each([['../x'], ['K7MX9'], [`${TOKEN_22}X`], ['K7 MX9'], ['']])('rejects %p', (v) => {
    expect(isInviteTokenOrCode(v)).toBe(false);
  });
});
