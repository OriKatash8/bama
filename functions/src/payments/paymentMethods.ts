import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, FieldValue, requireAuth } from '../lifecycle/helpers';
import { assertVerifiedEmail } from '../auth/verifiedEmail';
import { readPaymentsConfig, isPaymentsEnabledFor } from './guard';
import { getProvider } from './getProvider';
import { FAKE_TOKENS } from './fakeProvider';
import { requeueNeedsCardFees } from './requeue';
import type { CardDetails } from './types';

const REGION = 'europe-west1' as const;

export const paymentMethodRef = (uid: string) => db.doc(`paymentMethods/${uid}`);

export type PaymentMethodView = {
  /** Whether this user sees the card UI at all: provider on AND this user allowed. */
  enabled: boolean;
  hasCard: boolean;
  last4?: string;
  brand?: string;
  expMonth?: number;
  expYear?: number;
  status?: 'active' | 'invalid';
};

/**
 * The ONLY shape a client ever receives. Built field by field so a field added to
 * the stored document later (the token above all) can never leak by spreading.
 */
export function toPaymentMethodView(
  stored: Record<string, unknown> | undefined,
  enabled: boolean,
): PaymentMethodView {
  if (!stored) return { enabled, hasCard: false };
  return {
    enabled,
    hasCard: true,
    last4: stored.last4 as string,
    brand: stored.brand as string,
    expMonth: stored.expMonth as number,
    expYear: stored.expYear as number,
    status: stored.status === 'invalid' ? 'invalid' : 'active',
  };
}

/** Store (or replace) a pro's card and put their parked fees back in the queue. */
export async function savePaymentMethod(
  uid: string, provider: string, card: CardDetails,
): Promise<void> {
  const ref = paymentMethodRef(uid);
  const prior = await ref.get();
  // A plain set() REPLACES the document, which is what clears a previous invalidReason;
  // FieldValue.delete() is not allowed in a set() without merge.
  await ref.set({
    provider,
    token: card.token,
    last4: card.last4,
    brand: card.brand,
    expMonth: card.expMonth,
    expYear: card.expYear,
    status: 'active',
    // Keep the first save's date; a doc without one (never written by this code) gets one now.
    createdAt: prior.get('createdAt') ?? FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await requeueNeedsCardFees(uid);
}

/** The pro's card state, with `enabled` computed here by the same guard getProvider uses. */
export const getMyPaymentMethod = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const config = await readPaymentsConfig();
  const enabled = isPaymentsEnabledFor(config, uid);
  // A disabled user learns nothing, not even whether a card exists.
  if (!enabled) return toPaymentMethodView(undefined, false);
  const snap = await paymentMethodRef(uid).get();
  return toPaymentMethodView(snap.exists ? snap.data() : undefined, true);
});

/** Start a hosted card-save session. Email verification matches the app's other
 *  money-adjacent callables (callClaude): password accounts must be verified. */
export const createCardSaveSession = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request.auth?.uid);
  assertVerifiedEmail(request);
  const config = await readPaymentsConfig();
  const provider = getProvider(config, { professionalId: uid });
  if (!provider) throw new HttpsError('failed-precondition', 'payments-disabled');
  return provider.createCardSaveSession(uid);
});

export const removeMyPaymentMethod = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const config = await readPaymentsConfig();
  if (!isPaymentsEnabledFor(config, uid)) {
    throw new HttpsError('failed-precondition', 'payments-disabled');
  }
  await paymentMethodRef(uid).delete();
  return { ok: true };
});

/**
 * TEST ONLY. Stands in for the provider's hosted page + callback: saves a fake
 * card whose behaviour is chosen by `token` (tok_ok, tok_retry, tok_dead,
 * tok_pending). Refused unless the fake provider is active for this user.
 */
export const fakeCompleteCardSave = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const config = await readPaymentsConfig();
  if (config.paymentProvider !== 'fake' || !isPaymentsEnabledFor(config, uid)) {
    throw new HttpsError('failed-precondition', 'fake-provider-inactive');
  }
  const token = request.data?.token ?? 'tok_ok';
  if (!(FAKE_TOKENS as readonly string[]).includes(token)) {
    throw new HttpsError('invalid-argument', 'unknown-fake-token');
  }
  await savePaymentMethod(uid, 'fake', {
    token, last4: '4242', brand: 'visa', expMonth: 12, expYear: new Date().getFullYear() + 3,
  });
  return { ok: true };
});
