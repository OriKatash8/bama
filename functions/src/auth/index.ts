import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

if (admin.apps.length === 0) {
  admin.initializeApp();
}

/**
 * No `email` field. `users/{uid}` is readable by every signed-in user, so an
 * email stored here made every address on the platform enumerable by one
 * throwaway account. Auth already holds it authoritatively; the admin screen
 * reads it through the adminFindUser callable.
 */
export const onUserCreate = functions.auth.user().onCreate(async (user) => {
  await admin.firestore().collection('users').doc(user.uid).set(
    {
      id: user.uid,
      displayName: user.displayName ?? '',
      photoURL: user.photoURL ?? null,
      role: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    // MERGE IS LOAD-BEARING. This trigger and the client both write
    // users/{uid} at sign-up, and the order is a race. Without merge this
    // overwrote the whole document, destroying the fields ONLY the client
    // knows — termsAcceptedAt, termsVersion, ageConfirmed, ageConfirmedAt.
    //
    // The result was that BAMA held no evidence any user had accepted the
    // Terms or confirmed they were 18+, on any account, ever: the consent was
    // collected by the UI, written, and then erased milliseconds later.
    //
    // Anything this trigger does not name is now left alone.
    { merge: true },
  );
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
