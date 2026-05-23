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
