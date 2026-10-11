import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, requireAuth, feeRef, type FeeDoc } from './helpers';
import { canRevealPhone, revealableEmail } from './contactPolicy';
import { assertSameSide } from '../demo';

/**
 * The phone number of the other side of a project, once the professional's part
 * has ended (contactPolicy). The number lives in `users/{uid}/private/contact`,
 * owner-only by rule; this is the only way anyone else reads it.
 *
 * `{ projectId, userId }` → `{ phone, email }`. The phone is optional, so with
 * none on file the target's email is shared instead — same gate, from Firebase
 * Auth (never a document), and only a verified, non-relay address
 * (revealableEmail). Both null when there is nothing to share.
 * Refused with permission-denied for anyone the policy does not allow, so the
 * client can never learn more than "not yet".
 */
export const getContactPhone = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const projectId = request.data?.projectId;
  const userId = request.data?.userId;
  if (typeof projectId !== 'string' || !projectId || typeof userId !== 'string' || !userId) {
    throw new HttpsError('invalid-argument', 'projectId and userId required');
  }

  const project = (await db.doc(`projects/${projectId}`).get()).data();
  if (!project) throw new HttpsError('not-found', 'Project not found');
  const clientId = project.clientId as string;
  // Never across the demo line, whatever the engagement says.
  await assertSameSide(uid, userId);

  // The pro whose engagement decides: the target when the client asks, the
  // caller's own when a pro asks.
  const proId = uid === clientId ? userId : uid;
  const fee = (await feeRef(projectId, proId).get()).data() as FeeDoc | undefined;

  if (!canRevealPhone({ callerId: uid, targetId: userId, clientId, proEngagementStatus: fee?.engagementStatus })) {
    throw new HttpsError('permission-denied', 'Not shared yet');
  }

  const contact = (await db.doc(`users/${userId}/private/contact`).get()).data();
  const phone = typeof contact?.phone === 'string' && contact.phone ? contact.phone : null;
  if (phone) return { phone, email: null };

  const authUser = await admin.auth().getUser(userId).catch(() => null);
  const email = revealableEmail({ phone, email: authUser?.email, emailVerified: authUser?.emailVerified });
  return { phone, email };
});
