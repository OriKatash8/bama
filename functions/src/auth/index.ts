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

/**
 * `setAdminClaim` WAS HERE AND IS DELETED. Do not bring it back.
 *
 * It granted the admin custom claim, and its guard read:
 *
 *     const callerIsAdmin = context.auth?.token?.role === 'admin';
 *     const isBootstrap   = targetUid === BOOTSTRAP_ADMIN_UID;
 *     if (!callerIsAdmin && !isBootstrap) throw permission-denied;
 *
 * The bootstrap branch short-circuits the caller check entirely, so the
 * callable was reachable BY ANYONE — signed out included, since `context.auth`
 * was never required on that path — and would re-grant admin to the hardcoded
 * uid on demand. The blast radius was small (that one uid is the owner's, so an
 * attacker could only re-grant a privilege that account already held) but the
 * shape is wrong: a public endpoint whose job is writing admin claims.
 *
 * Nothing in src/ ever called it. Bootstrapping an admin is a one-off operator
 * task, not an app feature, and it already has a home:
 *
 *     node scripts/set-admin.mjs <UID>
 *
 * which uses the Admin SDK against bama-af0a0 and requires credentials on the
 * machine running it — the right trust boundary for granting admin.
 */
