import i18n from '@core/i18n';
import { sendVerificationEmail } from '../auth';

/**
 * The verification email's own language line (auth.ts) uses the same mapping
 * as config.ts: Hebrew goes to Firebase as 'iw'.
 */

const mockAuth: { languageCode: string | null } = { languageCode: null };
const mockSend = jest.fn(() => Promise.resolve());

// A getter: the factory runs at the hoisted import, before mockAuth is assigned.
jest.mock('../config', () => ({
  get auth() { return mockAuth; },
  firebaseLanguageCode: jest.requireActual('../languageCode').firebaseLanguageCode,
}));
jest.mock('firebase/auth', () => ({ sendEmailVerification: (...a: unknown[]) => mockSend(...(a as [])) }));


afterAll(() => i18n.changeLanguage('he'));

it('sends the verification email in Hebrew as iw', async () => {
  await i18n.changeLanguage('he');
  await sendVerificationEmail({} as never);
  expect(mockAuth.languageCode).toBe('iw');
  expect(mockSend).toHaveBeenCalled();
});

it('and in English as en', async () => {
  await i18n.changeLanguage('en');
  await sendVerificationEmail({} as never);
  expect(mockAuth.languageCode).toBe('en');
});
