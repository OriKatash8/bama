import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, FieldValue, monthKey, requireAuth, requireAdmin } from './helpers';

/**
 * FAKE subscription toggle for slice 1 (admin/dev) — exercises subscriber vs
 * non-subscriber modes before Cardcom. Cardcom replaces this later.
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
