import { doc, setDoc } from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { callFunction } from '@core/firebase/functions';
import { CURRENT_TERMS_VERSION } from '@core/constants/legal';

/** The four consent fields, written together and only after both boxes are checked. */
export type ConsentFields = {
  termsAcceptedAt: number;
  termsVersion: string;
  ageConfirmed: true;
  ageConfirmedAt: number;
};

export function consentFields(now: number): ConsentFields {
  return {
    termsAcceptedAt: now,
    termsVersion: CURRENT_TERMS_VERSION,
    ageConfirmed: true,
    ageConfirmedAt: now,
  };
}

export { needsConsent } from './needsConsent';

/**
 * Writes the consent. merge, not update: for a brand-new social account the
 * onUserCreate trigger may not have created users/{uid} yet.
 */
export async function recordConsent(uid: string, now: number = Date.now()): Promise<ConsentFields> {
  const fields = consentFields(now);
  await setDoc(doc(db, 'users', uid), fields, { merge: true });
  return fields;
}

/**
 * Asks the server to remove an account that was created a moment ago and never
 * consented (users/{uid}, its push tokens, the Auth user). The server decides:
 * an older or already-consented account is left alone and { discarded: false }
 * comes back — declining then only signs out.
 */
export const discardUnconsentedSignup = callFunction<Record<string, never>, { discarded: boolean }>(
  'discardUnconsentedSignup',
);
