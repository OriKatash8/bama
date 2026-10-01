import {
  legalUrl,
  PRIVACY_URL_EN,
  PRIVACY_URL_HE,
  REFUNDS_URL_EN,
  REFUNDS_URL_HE,
  TERMS_URL_EN,
  TERMS_URL_HE,
} from '../legal';

/**
 * The legal pages live on the default Firebase Hosting site. These exact URLs are
 * written into the Terms themselves, so they must not drift.
 */
describe('legal URLs', () => {
  it('are the published Hosting addresses', () => {
    expect(TERMS_URL_HE).toBe('https://bama-af0a0.web.app/terms');
    expect(TERMS_URL_EN).toBe('https://bama-af0a0.web.app/en/terms');
    expect(PRIVACY_URL_HE).toBe('https://bama-af0a0.web.app/privacy');
    expect(PRIVACY_URL_EN).toBe('https://bama-af0a0.web.app/en/privacy');
    expect(REFUNDS_URL_HE).toBe('https://bama-af0a0.web.app/refunds');
    expect(REFUNDS_URL_EN).toBe('https://bama-af0a0.web.app/en/refunds');
  });

  it('Hebrew picks the Hebrew page', () => {
    expect(legalUrl('terms', 'he')).toBe(TERMS_URL_HE);
    expect(legalUrl('privacy', 'he')).toBe(PRIVACY_URL_HE);
    expect(legalUrl('refunds', 'he')).toBe(REFUNDS_URL_HE);
  });

  it('English picks the English page', () => {
    expect(legalUrl('terms', 'en')).toBe(TERMS_URL_EN);
    expect(legalUrl('privacy', 'en')).toBe(PRIVACY_URL_EN);
    expect(legalUrl('refunds', 'en')).toBe(REFUNDS_URL_EN);
  });

  it('any other language falls back to English, like i18n does', () => {
    expect(legalUrl('terms', 'fr')).toBe(TERMS_URL_EN);
    expect(legalUrl('privacy', undefined)).toBe(PRIVACY_URL_EN);
    expect(legalUrl('refunds', 'fr')).toBe(REFUNDS_URL_EN);
  });
});
