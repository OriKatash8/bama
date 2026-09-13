/**
 * config/appLinks: the base URL every invite link is built from, plus store links.
 *
 * There is ONE "is this a valid invite base URL" rule: buildInviteUrl in
 * functions/src/communities/inviteCore.ts, the function createCommunityInvite calls.
 * This module imports that TypeScript SOURCE directly (Node's type stripping, Node
 * >= 22.18 / 24), not a copy and not the compiled functions/lib output, which can be
 * stale after a checkout. So seed-app-links --verify can never pass a config that
 * the deployed function (compiled from the same source) would reject with
 * failed-precondition.
 */

const INVITE_CORE = new URL('../../functions/src/communities/inviteCore.ts', import.meta.url);

// Importing .ts from a package with no "type" field prints two advisory warnings
// (type stripping is experimental; module type inferred). Silence exactly those,
// for this import only; every other warning still prints.
const QUIET = [/Type Stripping is an experimental feature/i, /MODULE_TYPELESS_PACKAGE_JSON|Module type of .*inviteCore\.ts/];
const originalEmit = process.emitWarning;
process.emitWarning = function (warning, ...rest) {
  const text = `${typeof warning === 'string' ? warning : warning?.message ?? ''} ${rest.map(String).join(' ')}`;
  if (QUIET.some((re) => re.test(text))) return;
  return originalEmit.call(process, warning, ...rest);
};
let core;
try {
  core = await import(INVITE_CORE.href);
} catch (err) {
  throw new Error(
    `Could not import ${INVITE_CORE.pathname} as TypeScript source (needs Node >= 22.18 with type stripping; running ${process.version}): ${err.message}`,
  );
} finally {
  process.emitWarning = originalEmit;
}

/** The real function createCommunityInvite uses. Re-exported so tests can assert identity. */
export const buildInviteUrl = core.buildInviteUrl;

/** Development value. Switching to the real domain is a change to baseUrl only. */
export const APP_LINKS_DEV = Object.freeze({
  baseUrl: 'https://bama-af0a0.web.app',
  iosUrl: '',
  androidUrl: '',
});

/** True exactly when createCommunityInvite would accept this baseUrl. Delegates; no rule of its own. */
export function isBareHttpsOrigin(v) {
  return buildInviteUrl(v, 'T'.repeat(22)) !== null;
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
