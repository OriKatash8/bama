import { onRequest } from 'firebase-functions/v2/https';
import { checkWindow } from '../communities/rateLimit';
import { rateKeyFromRequest } from '../communities/inviteCore';
import { readPaymentsConfig } from './guard';
import { MAKE_SHARED_SECRET, SECRET_HEADER } from './growLinkProvider';
import { parseLinkPayment, verifyLinkSecret } from './linkConfirm';
import { processWebhookEvent } from './webhookCore';

const QUOTA = { prefix: 'pay-link', limit: 300, windowMs: 60_000 };

/**
 * Make -> us: "this payment link was paid". POST only, no CORS, never cached.
 *
 * Authenticity is the shared secret in X-Bama-Secret, compared in constant time.
 * A wrong or missing secret is a bare 401 with no detail. Make forwards PAID
 * notifications only, after it has approved the transaction with Grow.
 *
 * 200 for everything we handled, including "recorded for an admin": Make must not
 * retry those. 500 only for a transient failure, which Make may retry safely
 * (idempotent per transactionId). This is the only way a fee is settled by a link;
 * the successUrl page never reaches it.
 */
export const paymentLinkConfirm = onRequest(
  {
    region: 'europe-west1', maxInstances: 10, cors: false,
    // Declared, not created: a deploy needs it set (firebase functions:secrets:set).
    secrets: [MAKE_SHARED_SECRET],
  },
  async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (req.method !== 'POST') {
      res.status(405).set('Allow', 'POST').json({ ok: false });
      return;
    }

    const key = rateKeyFromRequest({ xForwardedFor: req.get('x-forwarded-for') ?? undefined, ip: req.ip });
    const decision = await checkWindow(key, QUOTA);
    if (!decision.allowed) {
      res.status(429).set('Retry-After', String(decision.retryAfterSec)).json({ ok: false });
      return;
    }

    try {
      if (!verifyLinkSecret(req.get(SECRET_HEADER), MAKE_SHARED_SECRET.value())) {
        res.status(401).json({ ok: false });
        return;
      }
      const event = parseLinkPayment(req.body);
      if (!event) {
        res.status(400).json({ ok: false });
        return;
      }
      const outcome = await processWebhookEvent(event, await readPaymentsConfig());
      const result = outcome === 'settled' ? 'settled'
        : outcome === 'duplicate' ? 'duplicate'
        : outcome === 'needs_review' ? 'needs_review'
        : 'ignored';
      res.status(200).json({ ok: true, result });
    } catch (err) {
      console.error('[paymentLinkConfirm] processing failed', err);
      res.status(500).json({ ok: false });
    }
  },
);
