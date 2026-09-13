/**
 * config/appLinks: the base URL every invite link is built from, plus store links.
 *
 * isBareHttpsOrigin mirrors buildInviteUrl in functions/src/communities/inviteCore.ts
 * (tested for parity in scripts/__tests__/appLinks.test.mjs). createCommunityInvite
 * refuses to mint anything unless baseUrl passes it.
 */

/** Development value. Switching to the real domain is a change to baseUrl only. */
export const APP_LINKS_DEV = Object.freeze({
  baseUrl: 'https://bama-af0a0.web.app',
  iosUrl: '',
  androidUrl: '',
});

export function isBareHttpsOrigin(v) {
  if (typeof v !== 'string' || !v) return false;
  let u;
  try { u = new URL(v); } catch { return false; }
  return u.protocol === 'https:' && u.pathname === '/' && !u.search && !u.hash && !u.username && !u.password;
}

/** Problems with a stored config/appLinks doc; [] means createCommunityInvite will accept it. */
export function validateAppLinks(doc) {
  if (!doc || typeof doc !== 'object') return ['config/appLinks does not exist'];
  const problems = [];
  if (!isBareHttpsOrigin(doc.baseUrl)) problems.push(`baseUrl must be a bare https origin, got ${JSON.stringify(doc.baseUrl)}`);
  if (typeof doc.iosUrl !== 'string') problems.push(`iosUrl must be a string (may be empty), got ${JSON.stringify(doc.iosUrl)}`);
  if (typeof doc.androidUrl !== 'string') problems.push(`androidUrl must be a string (may be empty), got ${JSON.stringify(doc.androidUrl)}`);
  return problems;
}
