import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, requireAuth, requireAdmin } from '../lifecycle/helpers';

if (admin.apps.length === 0) {
  admin.initializeApp();
}

/**
 * Find a user by email or display name, for the admin moderation screen.
 *
 * WHY THIS EXISTS. `users/{uid}` carried an `email` field whose ONLY consumer
 * was this screen — it ran where('email','==',term) from the client. But
 * `users/{uid}` is readable by every signed-in user, so that one convenience
 * field let any throwaway account enumerate the email address of every person
 * on the platform.
 *
 * Firebase Auth already stores every email, authoritatively. The Firestore copy
 * existed purely so a client query could reach it. So the field is gone and the
 * lookup moved here, where the Admin SDK can ask Auth directly — which is both
 * private and more correct, since Auth cannot go stale against itself.
 *
 * Display-name search stays a Firestore query: it is not sensitive (displayName
 * is public on every profile) and Auth has no index for it.
 */
export const adminFindUser = onCall(async (request) => {
  requireAuth(request.auth?.uid);
  requireAdmin(request.auth?.token);

  const term = typeof request.data?.term === 'string' ? request.data.term.trim() : '';
  if (!term) throw new HttpsError('invalid-argument', 'term is required');
  if (term.length > 320) throw new HttpsError('invalid-argument', 'term is too long');

  // Email first — an exact, indexed lookup against the source of truth.
  if (term.includes('@')) {
    try {
      const rec = await admin.auth().getUserByEmail(term);
      return { uid: rec.uid, email: rec.email ?? null, disabled: rec.disabled };
    } catch {
      // auth/user-not-found — fall through to the name search rather than
      // reporting "no such user", so an admin who typed a name containing '@'
      // still gets a result.
    }
  }

  const snap = await db.collection('users').where('displayName', '==', term).limit(1).get();
  if (snap.empty) throw new HttpsError('not-found', 'No user matches that email or name');

  const uid = snap.docs[0].id;
  // The email comes from Auth, never from the user document.
  const rec = await admin.auth().getUser(uid).catch(() => null);
  return { uid, email: rec?.email ?? null, disabled: rec?.disabled ?? false };
});
