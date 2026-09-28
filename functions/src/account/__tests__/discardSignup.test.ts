jest.mock('firebase-admin', () => ({ apps: [{}], initializeApp: jest.fn(), firestore: () => ({}), auth: () => ({}) }));
jest.mock('../../lifecycle/helpers', () => ({ db: {}, requireAuth: (u: string) => u }));
jest.mock('firebase-functions/v2/https', () => ({ onCall: (fn: unknown) => fn }));

import { DISCARD_WINDOW_MS, mayDiscardSignup } from '../discardSignup';

/**
 * discardUnconsentedSignup hard-deletes, so it may only ever take a sign-up
 * made moments ago that never consented. Everything else is left alone and
 * declining merely signs out.
 */
const NOW = 1_800_000_000_000;

describe('mayDiscardSignup', () => {
  it('takes a brand-new account with no consent', () => {
    expect(mayDiscardSignup(NOW - 60_000, { displayName: 'x' } as never, NOW)).toBe(true);
    expect(mayDiscardSignup(NOW - 60_000, undefined, NOW)).toBe(true);
  });

  it('never takes an account older than the window', () => {
    expect(mayDiscardSignup(NOW - DISCARD_WINDOW_MS - 1, undefined, NOW)).toBe(false);
  });

  it('never takes an account that consented', () => {
    expect(mayDiscardSignup(NOW - 60_000, { termsAcceptedAt: NOW - 1000 }, NOW)).toBe(false);
    expect(mayDiscardSignup(NOW - 60_000, { termsVersion: '1.0' }, NOW)).toBe(false);
  });

  it('refuses when the creation time is unknown or in the future', () => {
    expect(mayDiscardSignup(null, undefined, NOW)).toBe(false);
    expect(mayDiscardSignup(Number.NaN, undefined, NOW)).toBe(false);
    expect(mayDiscardSignup(NOW + 60_000, undefined, NOW)).toBe(false);
  });
});
