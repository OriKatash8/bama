import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, requireAuth, requireAdmin } from '../lifecycle/helpers';

/**
 * The admin deletes a community: its chat document AND everything under it —
 * channels, their messages, join requests — in one server-side recursive delete.
 *
 * A callable rather than a client delete: `chats/{id}` is not deletable by any
 * client (rules: `allow delete: if false`), and a client delete would remove
 * only the parent document, orphaning every subcollection. Deleting the doc
 * also fires onCommunityDeleted, which clears the community's invite links.
 */
// Default region (us-central1), like every callable the app calls: the client's
// `functions` instance is not region-pinned (src/core/firebase/config.ts).
export const adminDeleteCommunity = onCall(async (request) => {
  requireAuth(request.auth?.uid);
  requireAdmin(request.auth?.token);

  const communityId = request.data?.communityId;
  if (typeof communityId !== 'string' || !communityId) {
    throw new HttpsError('invalid-argument', 'communityId required');
  }

  const ref = db.doc(`chats/${communityId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Community not found');
  // Only communities: this must never become a way to delete a DM or a project chat.
  if (snap.get('type') !== 'community') throw new HttpsError('failed-precondition', 'Not a community');

  await db.recursiveDelete(ref);
  return { ok: true };
});
