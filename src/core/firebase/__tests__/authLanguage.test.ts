import i18n from '@core/i18n';

/**
 * Firebase's own emails (verification, password reset) follow the app's
 * language: auth.languageCode is set right after auth init and follows every
 * i18next language change. Firebase lists Hebrew under the legacy code 'iw'
 * (the project's template locale), so 'he' is sent as 'iw'.
 */

const mockAuth: { languageCode: string | null } = { languageCode: null };

jest.mock('firebase/app', () => ({ initializeApp: jest.fn(() => ({})), getApps: jest.fn(() => []) }));
jest.mock('firebase/auth', () => ({
  initializeAuth: jest.fn(() => mockAuth),
  getAuth: jest.fn(() => mockAuth),
  GoogleAuthProvider: jest.fn(),
}));
jest.mock('@firebase/auth', () => ({ getReactNativePersistence: jest.fn() }), { virtual: true });
jest.mock('@react-native-async-storage/async-storage', () => ({}));
jest.mock('firebase/firestore', () => ({ initializeFirestore: jest.fn(() => ({})) }));
jest.mock('firebase/storage', () => ({ getStorage: jest.fn(() => ({})) }));
jest.mock('firebase/database', () => ({ getDatabase: jest.fn(() => ({})) }));
jest.mock('firebase/functions', () => ({ getFunctions: jest.fn(() => ({})) }));
jest.mock('../appCheck', () => ({ initAppCheck: jest.fn(() => Promise.resolve()) }));


afterAll(() => i18n.changeLanguage('he'));

describe('firebaseLanguageCode', () => {
  it("maps Hebrew to Firebase's 'iw'", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { firebaseLanguageCode } = require('../config');
    expect(firebaseLanguageCode('he')).toBe('iw');
  });

  it('passes anything else through as-is', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { firebaseLanguageCode } = require('../config');
    expect(firebaseLanguageCode('en')).toBe('en');
    expect(firebaseLanguageCode('fr')).toBe('fr');
    expect(firebaseLanguageCode('iw')).toBe('iw');
  });

  it("treats no language as the app's default, Hebrew", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { firebaseLanguageCode } = require('../config');
    expect(firebaseLanguageCode('')).toBe('iw');
    expect(firebaseLanguageCode(undefined)).toBe('iw');
  });
});

it('sets the auth language right after init, from i18next', async () => {
  await i18n.changeLanguage('he');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { auth } = require('../config');
  expect(auth).toBe(mockAuth);
  expect(auth.languageCode).toBe('iw');
});

it('follows every i18next language change', async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { auth } = require('../config');
  await i18n.changeLanguage('en');
  expect(auth.languageCode).toBe('en');
  await i18n.changeLanguage('he');
  expect(auth.languageCode).toBe('iw');
});
