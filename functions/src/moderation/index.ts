import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

if (admin.apps.length === 0) {
  admin.initializeApp();
}

type ModerateAction = 'warn' | 'suspend' | 'unsuspend' | 'clear_warning';

type ModerateInput = {
  targetUid: string;
  action: ModerateAction;
  reason?: string;
  reportId?: string;
};

const ACTIONS: ModerateAction[] = ['warn', 'suspend', 'unsuspend', 'clear_warning'];

/**
 * Admin-only enforcement against a user. Records an append-only adminActions
 * entry (evidence), mirrors the current state onto users/{uid}.moderation
 * (restatable reason), and for suspensions also disables the Firebase Auth
 * account + revokes refresh tokens so the user is hard-blocked from logging in.
 */
export const moderateUser = functions.https.onCall(async (data: ModerateInput, context) => {
  if (context.auth?.token?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admins only');
  }

  const actorId = context.auth.uid;
  const targetUid = data?.targetUid;
  const action = data?.action;
  const reason = (data?.reason ?? '').trim();
  const reportId = data?.reportId;

  if (!targetUid || typeof targetUid !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'targetUid is required');
  }
  if (!ACTIONS.includes(action)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid action');
  }
  if ((action === 'warn' || action === 'suspend') && !reason) {
    throw new functions.https.HttpsError('invalid-argument', 'A reason is required');
  }
  if (targetUid === actorId) {
    throw new functions.https.HttpsError('failed-precondition', 'You cannot moderate yourself');
  }

  const db = admin.firestore();

  // Never enforce against another admin.
  const targetAuth = await admin.auth().getUser(targetUid).catch(() => null);
  if (!targetAuth) {
    throw new functions.https.HttpsError('not-found', 'User not found');
  }
  if (targetAuth.customClaims?.role === 'admin') {
    throw new functions.https.HttpsError('failed-precondition', 'Cannot moderate an admin');
  }

  // Denormalized names for the evidence log.
  const [targetSnap, actorSnap] = await Promise.all([
    db.collection('users').doc(targetUid).get(),
    db.collection('users').doc(actorId).get(),
  ]);
  const targetUserName =
    (targetSnap.data()?.displayName as string | undefined) || targetAuth.displayName || targetAuth.email || targetUid;
  const actorName = (actorSnap.data()?.displayName as string | undefined) || 'Admin';

  // 1) Append-only evidence entry.
  const actionRef = db.collection('adminActions').doc();
  await actionRef.set({
    action,
    actorId,
    actorName,
    targetUserId: targetUid,
    targetUserName,
    reason,
    ...(reportId ? { reportId } : {}),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // 2) Mirror current state onto the user doc (+ Auth for suspensions).
  const userRef = db.collection('users').doc(targetUid);
  if (action === 'warn' || action === 'suspend') {
    await userRef.set(
      {
        moderation: {
          status: action === 'suspend' ? 'suspended' : 'warned',
          reason,
          actionId: actionRef.id,
          actorId,
          actorName,
          at: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      { merge: true },
    );
    if (action === 'suspend') {
      await admin.auth().updateUser(targetUid, { disabled: true });
      await admin.auth().revokeRefreshTokens(targetUid);
    }
  } else {
    // unsuspend / clear_warning → clear the mirror.
    await userRef.set(
      { moderation: admin.firestore.FieldValue.delete() },
      { merge: true },
    );
    if (action === 'unsuspend') {
      await admin.auth().updateUser(targetUid, { disabled: false });
    }
  }

  return { success: true, actionId: actionRef.id };
});
