import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, FieldValue, requireAuth, requireAdmin } from '../lifecycle/helpers';

/**
 * The admin's actions on a community: suspend / unsuspend, hand it to a new
 * owner, remove a member.
 *
 * Server-side because the chat rules let only a community's MEMBERS update it
 * (and its owner for owner-only fields) — the admin usually is neither, so every
 * one of these was refused when written from the admin page. The rules stay as
 * tight as they are; the admin goes through the Admin SDK, as for deletion
 * (adminDeleteCommunity).
 *
 * Default region (us-central1), like every callable the app calls.
 */
type Action = 'suspend' | 'unsuspend' | 'set_owner' | 'remove_member';
const ACTIONS: Action[] = ['suspend', 'unsuspend', 'set_owner', 'remove_member'];

export const adminCommunityAction = onCall(async (request) => {
  requireAuth(request.auth?.uid);
  requireAdmin(request.auth?.token);

  const { communityId, action, userId } = (request.data ?? {}) as {
    communityId?: unknown; action?: unknown; userId?: unknown;
  };
  if (typeof communityId !== 'string' || !communityId) {
    throw new HttpsError('invalid-argument', 'communityId required');
  }
  if (typeof action !== 'string' || !ACTIONS.includes(action as Action)) {
    throw new HttpsError('invalid-argument', 'unknown action');
  }
  const needsUser = action === 'set_owner' || action === 'remove_member';
  if (needsUser && (typeof userId !== 'string' || !userId)) {
    throw new HttpsError('invalid-argument', 'userId required');
  }

  const ref = db.doc(`chats/${communityId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Community not found');
  // Only communities: never a DM, a group or a project chat.
  if (snap.get('type') !== 'community') throw new HttpsError('failed-precondition', 'Not a community');

  switch (action as Action) {
    case 'suspend':
    case 'unsuspend':
      await ref.update({ status: action === 'suspend' ? 'suspended' : 'active' });
      break;

    case 'set_owner': {
      const user = await db.doc(`users/${userId}`).get();
      if (!user.exists) throw new HttpsError('not-found', 'No such user');
      // The owner must be able to read and run their community: make them a member too.
      await ref.update({ ownerId: userId, members: FieldValue.arrayUnion(userId) });
      break;
    }

    case 'remove_member': {
      // As the owner's own tool: the owner can never be removed.
      if (userId === snap.get('ownerId')) throw new HttpsError('failed-precondition', 'Cannot remove the owner');
      const batch = db.batch();
      batch.update(ref, { members: FieldValue.arrayRemove(userId) });
      // Logged like an owner's removal, so the community's member stats count it.
      batch.set(ref.collection('communityEvents').doc(), {
        type: 'leave', userId, at: FieldValue.serverTimestamp(),
      });
      await batch.commit();
      break;
    }
  }
  return { ok: true };
});
