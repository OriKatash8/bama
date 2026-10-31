import { db, FieldValue } from '../lifecycle/helpers';
import { applyChargeResult } from './charge';
import { parseIdempotencyKey } from './chargeLogic';
import { isPaymentsEnabledFor, type PaymentsConfig } from './guard';
import { savePaymentMethod } from './paymentMethods';
import type { WebhookEvent } from './types';

/**
 * What a verified provider event does. Separate from the HTTP handler so the
 * whole thing runs in tests without a server.
 *
 * Idempotency lives in paymentEvents/{providerEventId} (server-only). The record
 * is written BEFORE the work and marked 'processed' AFTER: if the work throws, the
 * provider's retry finds a record that is not 'processed' and does the work again
 * (every handler below is itself idempotent), whereas marking first would lose the
 * event for good. Only a 'processed' record short-circuits.
 */
export type WebhookOutcome = 'duplicate' | 'processed' | 'unmatched' | 'ignored';

const eventDocId = (providerEventId: string) => encodeURIComponent(providerEventId).slice(0, 400);

export async function processWebhookEvent(
  event: WebhookEvent, config: PaymentsConfig, now: number = Date.now(),
): Promise<WebhookOutcome> {
  const ref = db.doc(`paymentEvents/${eventDocId(event.providerEventId)}`);

  const proceed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.get('status') === 'processed') return false;
    if (!snap.exists) {
      tx.set(ref, {
        providerEventId: event.providerEventId,
        type: event.type,
        status: 'received',
        receivedAt: FieldValue.serverTimestamp(),
      });
    }
    return true;
  });
  if (!proceed) return 'duplicate';

  const outcome = await dispatch(event, config, now);
  await ref.update({ status: 'processed', result: outcome, processedAt: FieldValue.serverTimestamp() });
  return outcome;
}

async function dispatch(
  event: WebhookEvent, config: PaymentsConfig, now: number,
): Promise<Exclude<WebhookOutcome, 'duplicate'>> {
  if (event.type === 'card_saved') {
    // Same per-user guard as everywhere else: a fake event can never write a card
    // for a real user, whatever the payload claims.
    if (!isPaymentsEnabledFor(config, event.uid)) return 'ignored';
    await savePaymentMethod(event.uid, config.paymentProvider, event.card);
    return 'processed';
  }

  const key = parseIdempotencyKey(event.idempotencyKey);
  if (!key) return 'unmatched';
  if (!isPaymentsEnabledFor(config, key.proId)) return 'ignored';
  await applyChargeResult(key.projectId, key.proId, event.idempotencyKey, event, config, now);
  return 'processed';
}
