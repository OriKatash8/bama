/**
 * Deep links the app is willing to REPLAY from storage.
 *
 * A saved destination is fed to router.replace after sign-in. Without a
 * gate, anything that can write that value — a crafted link today, a careless
 * writer tomorrow — becomes an in-app open redirect. So an href is replayed only
 * if it matches one of these patterns EXACTLY: anchored at both ends, a fixed
 * path, no query string, no fragment, no traversal, no scheme.
 *
 * To support a new deep link, add its pattern here (and a test). Do not loosen an
 * existing pattern to cover a second route.
 */

/** An invite token (22 base64url chars) or short code (6 chars from the code alphabet). */
const INVITE_TOKEN_OR_CODE = '(?:[A-Za-z0-9_-]{22}|[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6})';

export const DEEP_LINK_PATTERNS: readonly RegExp[] = [
  new RegExp(`^/c/${INVITE_TOKEN_OR_CODE}$`),
];

const INVITE_TOKEN_OR_CODE_RE = new RegExp(`^${INVITE_TOKEN_OR_CODE}$`);

export function isAllowedDeepLink(href: unknown): href is string {
  return typeof href === 'string' && DEEP_LINK_PATTERNS.some((re) => re.test(href));
}

export function isInviteTokenOrCode(value: unknown): value is string {
  return typeof value === 'string' && INVITE_TOKEN_OR_CODE_RE.test(value);
}
