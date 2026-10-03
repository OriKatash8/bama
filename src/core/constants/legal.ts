/**
 * The Terms / Privacy version users must have accepted. Bump it when the final
 * documents change: every signed-in user whose stored termsVersion is lower (or
 * missing) is sent to the consent screen before they can use the app again.
 */
export const CURRENT_TERMS_VERSION = '1.4';
/** The name older code imports; always the current version. */
export const TERMS_VERSION = CURRENT_TERMS_VERSION;

/** The published legal pages (Firebase Hosting, default site). The Terms quote these exact URLs. */
export const TERMS_URL_HE = 'https://bama-af0a0.web.app/terms';
export const TERMS_URL_EN = 'https://bama-af0a0.web.app/en/terms';
export const PRIVACY_URL_HE = 'https://bama-af0a0.web.app/privacy';
export const PRIVACY_URL_EN = 'https://bama-af0a0.web.app/en/privacy';
export const REFUNDS_URL_HE = 'https://bama-af0a0.web.app/refunds';
export const REFUNDS_URL_EN = 'https://bama-af0a0.web.app/en/refunds';

const LEGAL_URLS = {
  terms: { he: TERMS_URL_HE, en: TERMS_URL_EN },
  privacy: { he: PRIVACY_URL_HE, en: PRIVACY_URL_EN },
  refunds: { he: REFUNDS_URL_HE, en: REFUNDS_URL_EN },
} as const;

/** A legal page in the app's language; anything but Hebrew gets English, as i18n falls back. */
export function legalUrl(doc: keyof typeof LEGAL_URLS, language: string | null | undefined): string {
  return language === 'he' ? LEGAL_URLS[doc].he : LEGAL_URLS[doc].en;
}

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
