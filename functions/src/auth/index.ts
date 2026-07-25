import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

if (admin.apps.length === 0) {
  admin.initializeApp();
}

export const onUserCreate = functions.auth.user().onCreate(async (user) => {
  await admin.firestore().collection('users').doc(user.uid).set({
    id: user.uid,
    email: user.email ?? '',
    displayName: user.displayName ?? '',
    photoURL: user.photoURL ?? null,
    role: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
});

export const getAdminStatus = functions.https.onCall((_data, context) => {
  const isAdmin = context.auth?.token?.role === 'admin';
  return { isAdmin };
});

const BOOTSTRAP_ADMIN_UID = 'C1pd9uv64yOBYfrPaktXet7Pxfr2';

export const setAdminClaim = functions.https.onCall(async (data: { uid: string }, context) => {
  try {
    const targetUid: string = data?.uid;
    if (!targetUid) throw new functions.https.HttpsError('invalid-argument', 'uid is required');

    const callerIsAdmin = context.auth?.token?.role === 'admin';
    const isBootstrap = targetUid === BOOTSTRAP_ADMIN_UID;

    if (!callerIsAdmin && !isBootstrap) {
      throw new functions.https.HttpsError('permission-denied', 'Only admins can set admin claims');
    }

    await admin.auth().setCustomUserClaims(targetUid, { role: 'admin' });
    return { success: true };
  } catch (error) {
    console.error('[setAdminClaim] error:', error);
    throw new functions.https.HttpsError('internal', String(error));
  }
});
