import { isIP } from 'net';

/**
 * Whether a URL is https on a real public hostname — no IP literals, no
 * localhost or internal names. The functions run inside Google's network, so
 * nothing a store or an admin supplies may point them at internal hosts.
 * Used for every URL the rental functions fetch or link to.
 */
export function isPublicHttpsUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (isIP(host.replace(/^\[|\]$/g, ''))) return false;
    if (host === 'localhost' || !host.includes('.')) return false;
    return !/\.(internal|local|localhost)$/.test(host);
  } catch {
    return false;
  }
}
