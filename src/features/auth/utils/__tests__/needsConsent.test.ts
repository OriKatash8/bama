import { needsConsent } from '../needsConsent';
import * as legal from '@core/constants/legal';

describe('needsConsent — the re-accept gate', () => {
  it('stops a user with no termsVersion', () => {
    expect(needsConsent({ termsVersion: undefined })).toBe(true);
  });

  it('stops a user whose termsVersion is older than the current one', () => {
    expect(needsConsent({ termsVersion: '0.9' })).toBe(true);
  });

  it('lets a user on the current version through', () => {
    expect(needsConsent({ termsVersion: legal.CURRENT_TERMS_VERSION })).toBe(false);
  });

  it('bumping CURRENT_TERMS_VERSION stops everyone on the old one', () => {
    expect(needsConsent({ termsVersion: '1.0' }, '2.0')).toBe(true);
    expect(needsConsent({ termsVersion: '2.0' }, '2.0')).toBe(false);
  });

  it('no user loaded is not a "must consent"', () => {
    expect(needsConsent(null)).toBe(false);
    expect(needsConsent(undefined)).toBe(false);
  });
});
