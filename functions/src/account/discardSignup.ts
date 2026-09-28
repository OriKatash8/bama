import * as admin from 'firebase-admin';
import { onCall } from 'firebase-functions/v2/https';
import { db, requireAuth } from '../lifecycle/helpers';

/**
 * Removes a sign-up the person backed out of on the consent screen.
 *
 * A social sign-in creates the Auth user (and, through onUserCreate, users/{uid})
 * BEFORE the consent screen can be shown. If they then decline, nothing of that
 * account may remain. The client cannot delete users/{uid} (rules deny it), so
 * this does it with the Admin SDK: the user doc and its private/profile
 * subdocuments, their push tokens, then the Auth user.
 *
 * GUARDED, because it hard-deletes: only the caller's own account, only if it
 * was created within DISCARD_WINDOW_MS, and only if it never consented. Anyone
 * else — an older account, or one that consented — gets { discarded: false }
 * and nothing is touched; for them declining just signs out. Real accounts are
 * removed by deleteMyAccount, which tombstones instead.
 */
export const DISCARD_WINDOW_MS = 60 * 60 * 1000;

export function mayDiscardSignup(
  createdAtMs: number | null,
  userDoc: { termsAcceptedAt?: unknown; termsVersion?: unknown } | undefined,
  now: number,
): boolean {
  if (createdAtMs == null || !Number.isFinite(createdAtMs)) return false;
  if (now - createdAtMs > DISCARD_WINDOW_MS || now < createdAtMs) return false;
  if (userDoc?.termsAcceptedAt || userDoc?.termsVersion) return false;
  return true;
}

export const discardUnconsentedSignup = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const authUser = await admin.auth().getUser(uid);
  const createdAtMs = Date.parse(authUser.metadata.creationTime);
  const userRef = db.doc(`users/${uid}`);
  const snap = await userRef.get();

  if (!mayDiscardSignup(createdAtMs, snap.exists ? snap.data() : undefined, Date.now())) {
    return { discarded: false };
  }

  const tokens = await db.collection('pushTokens').where('userId', '==', uid).get();
  const batch = db.batch();
  tokens.docs.forEach((d) => batch.delete(d.ref));
  for (const sub of ['private', 'profile']) {
    (await userRef.collection(sub).listDocuments()).forEach((ref) => batch.delete(ref));
  }
  batch.delete(userRef);
  await batch.commit();

  // Last: once the Auth user is gone the caller can no longer retry.
  await admin.auth().deleteUser(uid);
  console.log('[discardUnconsentedSignup] removed', uid);
  return { discarded: true };
});
