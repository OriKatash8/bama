import { onRequest } from 'firebase-functions/v2/https';
import { checkWindow } from '../communities/rateLimit';
import { rateKeyFromRequest } from '../communities/inviteCore';
import { readPaymentsConfig } from './guard';
import { getWebhookProvider } from './getProvider';
import { processWebhookEvent } from './webhookCore';
import type { WebhookEvent, WebhookRequest } from './types';

/** Generous: a gateway posts from few addresses. A 429 only delays an event, the provider retries. */
const WEBHOOK_QUOTA = { prefix: 'pay-webhook', limit: 300, windowMs: 60_000 };

/**
 * The gateway's callback: charge results and saved cards. POST only, no CORS, never
 * cached. The answer never says WHY a request was refused (bad signature, unknown
 * event, wrong provider), so it cannot be used to probe. Authenticity is the
 * provider's job (verifyAndParseWebhook); this file adds method, rate and
 * idempotency around it.
 *
 * With paymentProvider 'none' it answers 200 and does nothing.
 */
export const paymentWebhook = onRequest(
  { region: 'europe-west1', maxInstances: 10, cors: false },
  async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (req.method !== 'POST') {
      res.status(405).set('Allow', 'POST').json({ ok: false });
      return;
    }

    const key = rateKeyFromRequest({ xForwardedFor: req.get('x-forwarded-for') ?? undefined, ip: req.ip });
    const decision = await checkWindow(key, WEBHOOK_QUOTA);
    if (!decision.allowed) {
      res.status(429).set('Retry-After', String(decision.retryAfterSec)).json({ ok: false });
      return;
    }

    try {
      const config = await readPaymentsConfig();
      const provider = getWebhookProvider(config);
      if (!provider) {
        res.status(200).json({ ok: true });
        return;
      }

      let event: WebhookEvent | null = null;
      try {
        event = await provider.verifyAndParseWebhook(req as unknown as WebhookRequest);
      } catch (err) {
        console.error('[paymentWebhook] verification threw', err);
      }
      if (!event) {
        res.status(400).json({ ok: false });
        return;
      }

      await processWebhookEvent(event, config);
      res.status(200).json({ ok: true });
    } catch (err) {
      // 500 so the provider retries; the event record was left unprocessed.
      console.error('[paymentWebhook] processing failed', err);
      res.status(500).json({ ok: false });
    }
  },
);
