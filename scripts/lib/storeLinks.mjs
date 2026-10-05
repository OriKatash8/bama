/**
 * Store links in config/appLinks (iosUrl, androidUrl): what the public invite landing page may
 * show as download buttons. Kept apart from appLinks.mjs on purpose: that module must not hold
 * a URL rule of its own for the invite BASE URL (it delegates to createCommunityInvite's), and
 * this is a different rule for a different field.
 */

/** A store link the landing page may render as a button: an https URL, nothing else. */
export function isStoreUrl(v) {
  if (typeof v !== 'string' || !v.startsWith('https://')) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password && u.hostname.length > 0;
  } catch {
    return false;
  }
}

/**
 * What the public landing page is told about the stores: the two URLs, each kept only if it
 * is a usable https link. Never the baseUrl or anything else in config/appLinks.
 */
export function storeLinks(doc) {
  const pick = (v) => (isStoreUrl(v) ? v : '');
  return { iosUrl: pick(doc?.iosUrl), androidUrl: pick(doc?.androidUrl) };
}
