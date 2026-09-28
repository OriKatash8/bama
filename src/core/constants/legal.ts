/**
 * The Terms / Privacy version users must have accepted. Bump it when the final
 * documents change: every signed-in user whose stored termsVersion is lower (or
 * missing) is sent to the consent screen before they can use the app again.
 */
export const CURRENT_TERMS_VERSION = '1.0';
/** The name older code imports; always the current version. */
export const TERMS_VERSION = CURRENT_TERMS_VERSION;
export const TERMS_URL = 'https://example.com/terms';
export const PRIVACY_URL = 'https://example.com/privacy';

/** "1.10" > "1.9": dotted versions compared number by number; missing parts count as 0. */
export function compareTermsVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10));
  const pb = b.split('.').map((n) => parseInt(n, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = Number.isFinite(pa[i]) ? pa[i] : 0;
    const y = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** True when a stored termsVersion is present, readable and not older than the current one. */
export function isTermsVersionCurrent(
  version: string | null | undefined,
  current: string = CURRENT_TERMS_VERSION,
): boolean {
  if (!version || !/^\d+(\.\d+)*$/.test(version)) return false;
  return compareTermsVersions(version, current) >= 0;
}
