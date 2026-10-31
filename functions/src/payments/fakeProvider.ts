import { db, FieldValue } from '../lifecycle/helpers';
import { isEmulator } from './guard';
import type {
  PaymentProvider, ChargeInput, ChargeResult, WebhookEvent, WebhookRequest,
} from './types';

/**
 * Deterministic stand-in for a gateway. Behaviour is chosen by the TOKEN:
 *
 *   tok_ok      -> succeeded
 *   tok_retry   -> failed, retryable   (declined for now)
 *   tok_dead    -> failed, final       (card expired / stolen)
 *   tok_pending -> pending; resolved later through a simulated webhook
 *   anything else -> failed, final (an unknown token is not a card)
 *
 * Like a real gateway it is idempotent: a charge repeated with the same
 * idempotencyKey returns the first answer. Outcomes are kept in paymentFake/{key}
 * (server-only) so they survive a cold start. Never reachable in production for
 * a real pro: see isPaymentsEnabledFor.
 */
export const FAKE_TOKENS = ['tok_ok', 'tok_retry', 'tok_dead', 'tok_pending'] as const;

const chargeDoc = (key: string) => db.doc(`paymentFake/${key}`);

export function fakeOutcomeFor(token: string): ChargeResult {
  switch (token) {
    case 'tok_ok': return { outcome: 'succeeded' };
    case 'tok_retry': return { outcome: 'failed', failureCode: 'fake_declined', failureClass: 'retryable' };
    case 'tok_dead': return { outcome: 'failed', failureCode: 'fake_card_expired', failureClass: 'final' };
    case 'tok_pending': return { outcome: 'pending' };
    default: return { outcome: 'failed', failureCode: 'fake_unknown_token', failureClass: 'final' };
  }
}

export const fakeProvider: PaymentProvider = {
  name: 'fake',

  async createCardSaveSession(uid) {
    const sessionId = `fake_${uid}_${Date.now()}`;
    // A real provider returns its hosted page; the fake's is a dead address and
    // the save is completed through the fakeCompleteCardSave callable instead.
    return { url: `https://fake-pay.invalid/save?session=${sessionId}`, sessionId };
  },

  async chargeToken(input: ChargeInput): Promise<ChargeResult> {
    const ref = chargeDoc(input.idempotencyKey);
    const existing = await ref.get();
    if (existing.exists) return existing.data()!.result as ChargeResult;

    const base = fakeOutcomeFor(input.token);
    const result: ChargeResult = {
      ...base,
      providerRef: `fake_${input.idempotencyKey}`,
    };
    await ref.set({
      result, amount: input.amount, proId: input.proId, projectId: input.projectId,
      createdAt: FieldValue.serverTimestamp(),
    });
    return result;
  },

  async lookupCharge(idempotencyKey) {
    const snap = await chargeDoc(idempotencyKey).get();
    return snap.exists ? (snap.data()!.result as ChargeResult) : null;
  },

  async verifyAndParseWebhook(req: WebhookRequest): Promise<WebhookEvent | null> {
    // Emulator only: there is no shared secret to check, so in production a
    // fake webhook is simply not accepted.
    if (!isEmulator()) return null;
    return parseFakeWebhook(req.body);
  },
};

/** Pure: the fake's wire format, shared with tests. */
export function parseFakeWebhook(body: unknown): WebhookEvent | null {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b !== 'object' || typeof b.providerEventId !== 'string') return null;
  if (b.type === 'charge' && typeof b.idempotencyKey === 'string'
      && (b.outcome === 'succeeded' || b.outcome === 'failed' || b.outcome === 'pending')) {
    return {
      type: 'charge',
      providerEventId: b.providerEventId,
      idempotencyKey: b.idempotencyKey,
      outcome: b.outcome,
      providerRef: typeof b.providerRef === 'string' ? b.providerRef : undefined,
      failureCode: typeof b.failureCode === 'string' ? b.failureCode : undefined,
      failureClass: b.failureClass === 'final' || b.failureClass === 'retryable' ? b.failureClass : undefined,
    };
  }
  return null;
}

/** Test helper: settle a 'tok_pending' charge the way a provider callback would. */
export async function fakeResolvePending(
  idempotencyKey: string,
  outcome: 'succeeded' | 'failed',
  failureClass: 'final' | 'retryable' = 'retryable',
): Promise<WebhookEvent> {
  const result: ChargeResult = outcome === 'succeeded'
    ? { outcome, providerRef: `fake_${idempotencyKey}` }
    : { outcome, providerRef: `fake_${idempotencyKey}`, failureCode: 'fake_declined', failureClass };
  await chargeDoc(idempotencyKey).set({ result }, { merge: true });
  return {
    type: 'charge', providerEventId: `fake_evt_${idempotencyKey}_${outcome}`, idempotencyKey, ...result,
  };
}
