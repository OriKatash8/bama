import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, FieldValue, monthKey, requireAuth, requireAdmin } from './helpers';

/**
 * INERT. Nothing reads `subscriptions/{uid}` any more.
 *
 * There is no subscription product: a paid tier used to lift the open-project cap
 * from two to ten a month, which made capacity purchasable. `hireProfessional` no
 * longer consults this collection, and the subscription screen is gone from the
 * app.
 *
 * Left deployed rather than deleted so that removing a live callable is a
 * deliberate, separate deploy rather than a side effect of this change. It writes
 * a document no code reads. Delete it when the next functions deploy is planned.
 */
export const setSubscription = onCall(async (request) => {
  requireAuth(request.auth?.uid);
  requireAdmin(request.auth?.token);
  const targetUid = request.data?.targetUid as string | undefined;
  const active = request.data?.active === true;
  const plan = (request.data?.plan as string) === 'annual' ? 'annual' : 'monthly';
  if (!targetUid) throw new HttpsError('invalid-argument', 'targetUid required');

  const ref = db.doc(`subscriptions/${targetUid}`);
  const existing = await ref.get();
  await ref.set(
    {
      userId: targetUid,
      status: active ? 'active' : 'canceled',
      plan,
      startedAt: existing.exists ? existing.data()?.startedAt ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      monthKey: existing.data()?.monthKey ?? monthKey(),
      monthCount: existing.data()?.monthCount ?? 0,
    },
    { merge: true },
  );
  return { ok: true };
});
