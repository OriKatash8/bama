import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  db, FieldValue, requireAuth, computeFee, computeProAmount,
} from '../lifecycle/helpers';

/**
 * Account deletion, as Apple 5.1.1(v) requires: available from inside the app,
 * and it really deletes — it does not deactivate.
 *
 * ── WHY OUTSTANDING FEES DO NOT BLOCK ──────────────────────────────────────
 * The obvious design is "settle up before you may leave", and it is wrong here.
 * BAMA's platform fee is invoiced and paid OUTSIDE the app — see ProjectFee:
 * "no in-app payment can clear it". So a professional who owes a fee has no
 * in-app way to settle, and blocking on it would leave them permanently unable
 * to delete their account. That is the exact situation 5.1.1(v) exists to stop,
 * and a reviewer can find it by reading BAMA's own terms.
 *
 * The debt is unaffected either way: it is a real-world invoice under the
 * terms, not an in-app balance. So deletion WARNS, proceeds, and RETAINS the
 * fee documents (see below) as the business record.
 *
 * ── WHAT DOES BLOCK ────────────────────────────────────────────────────────
 * Live commitments to other people, all of which the user CAN resolve in-app:
 * an open engagement as a professional, an open project with hired crew as a
 * client, and a reserved marketplace purchase. Vanishing mid-project leaves a
 * counterparty stranded, and every one of these has an in-app exit (finish,
 * cancel, withdraw), so blocking never becomes a trap.
 *
 * ── WHAT SURVIVES DELETION, AND WHY ────────────────────────────────────────
 * The user document is TOMBSTONED, not removed. Messages, reviews, projects and
 * fees all reference the uid; deleting it outright would turn other people's
 * chat history and project records into dangling ids. So: personal data goes,
 * the identity becomes an anonymous marker, and other users keep coherent
 * history.
 *
 *   DELETED  Auth account · phone · profile (bio, equipment, prices, skills) ·
 *            portfolio docs and files · avatars · chat videos · push tokens ·
 *            notifications · their open marketplace listings
 *   KEPT     fee records (business/tax record of a real debt) · reviews they
 *            wrote or received · chat messages · project history
 *   TOMBSTONE users/{uid} → deleted: true, displayName replaced, photo cleared
 *
 * NOT LEGAL ADVICE. What a marketplace must retain for tax and what it must
 * erase on request are questions for BAMA's accountant and lawyer. This file
 * implements a defensible default; the retention list is the part to review.
 */

const OPEN_ENGAGEMENT_IS_CLOSED = ['completed', 'withdrawn', 'cancelled'];
const PROJECT_IS_CLOSED = ['completed', 'cancelled'];

/** Mirrors outstandingOf in lifecycle/completion.ts — floors at zero so an early
 *  payment is never refunded, and reads THIS fee's locked floor, not live config. */
function outstandingOf(
  fee: FirebaseFirestore.DocumentData,
  baseAmount: number,
): number {
  return Math.max(
    0,
    computeFee(baseAmount, fee.feeRate, fee.minFeeApplied ?? 0) - (fee.paidAmount ?? 0),
  );
}

export type DeletionBlocker =
  | { kind: 'open_engagement'; projectId: string; status: string }
  | { kind: 'open_client_project'; projectId: string; hiredCount: number }
  | { kind: 'reserved_listing'; listingId: string; role: 'buyer' | 'seller' };

type DeletionStatus = {
  canDelete: boolean;
  blockers: DeletionBlocker[];
  /** Whole shekels still owed across all projects. Warned about, never blocking. */
  outstandingFee: number;
  outstandingFeeProjects: number;
};

async function assessAccount(uid: string): Promise<DeletionStatus> {
  const blockers: DeletionBlocker[] = [];
  let outstandingFee = 0;
  let outstandingFeeProjects = 0;

  // ── as a professional: fees carry the engagement state ────────────────────
  const fees = await db
    .collectionGroup('fees')
    .where('professionalId', '==', uid)
    .get();

  for (const feeDoc of fees.docs) {
    const fee = feeDoc.data();
    const projectId = fee.projectId ?? feeDoc.ref.parent.parent?.id;
    if (!projectId) continue;

    const engagementStatus = (fee.engagementStatus as string) ?? 'hired';
    if (!OPEN_ENGAGEMENT_IS_CLOSED.includes(engagementStatus)) {
      blockers.push({ kind: 'open_engagement', projectId, status: engagementStatus });
    }

    if (fee.feeStatus === 'owed' && fee.feePaid !== true) {
      const baseAmount = await computeProAmount(projectId, uid).catch(() => fee.baseAmount ?? 0);
      const owed = outstandingOf(fee, baseAmount);
      if (owed > 0) {
        outstandingFee += owed;
        outstandingFeeProjects += 1;
      }
    }
  }

  // ── as a client: projects that still have crew on them ────────────────────
  const clientProjects = await db.collection('projects').where('clientId', '==', uid).get();
  for (const p of clientProjects.docs) {
    const d = p.data();
    if (PROJECT_IS_CLOSED.includes(d.status ?? '')) continue;
    const hired = (d.professionalIds ?? d.slotHolders ?? []) as string[];
    if (hired.length > 0) {
      blockers.push({ kind: 'open_client_project', projectId: p.id, hiredCount: hired.length });
    }
  }

  // ── marketplace: a handover in progress ───────────────────────────────────
  for (const [field, role] of [['posterId', 'seller'], ['buyerId', 'buyer']] as const) {
    const snap = await db
      .collection('marketplace_listings')
      .where(field, '==', uid)
      .where('status', '==', 'reserved')
      .get();
    snap.docs.forEach((l) => blockers.push({ kind: 'reserved_listing', listingId: l.id, role }));
  }

  return {
    canDelete: blockers.length === 0,
    blockers,
    outstandingFee,
    outstandingFeeProjects,
  };
}

/** What the confirmation screen shows before the user commits to anything. */
export const getAccountDeletionStatus = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  return assessAccount(uid);
});

/** Best-effort Storage cleanup. A failure here must never abort the deletion —
 *  an orphaned object is a tidiness problem; a half-deleted account is not. */
async function deleteStoragePrefixes(uid: string): Promise<void> {
  const bucket = admin.storage().bucket();
  const prefixes = [
    `users/${uid}/avatar/`,
    `portfolio/${uid}/`,
    `chat-videos/${uid}/`,
  ];
  await Promise.all(
    prefixes.map((prefix) =>
      bucket.deleteFiles({ prefix }).catch((e) => {
        console.error('[deleteAccount] storage prefix failed', prefix, e?.message);
      }),
    ),
  );
  // `avatars/{uid}` is a single object, not a prefix.
  await bucket.file(`avatars/${uid}`).delete().catch(() => undefined);
}

async function deleteQueryInBatches(
  query: FirebaseFirestore.Query,
  label: string,
): Promise<number> {
  let removed = 0;
  for (;;) {
    const snap = await query.limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    removed += snap.size;
    if (snap.size < 400) break;
  }
  if (removed) console.log(`[deleteAccount] ${label}: ${removed}`);
  return removed;
}

export const deleteMyAccount = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);

  // Re-assessed server-side. The client showed a status a moment ago, but a
  // client could be stale or lying, and this is irreversible.
  const status = await assessAccount(uid);
  if (!status.canDelete) {
    throw new HttpsError(
      'failed-precondition',
      'Finish or cancel your open work before deleting your account.',
      { blockers: status.blockers },
    );
  }

  // Ordered so that the account is unusable as early as possible and the
  // irreversible Auth deletion happens LAST: if anything in between throws, the
  // user can still sign in and retry rather than being stranded with a
  // half-deleted account they cannot access.

  // 1. Tombstone the public identity.
  await db.doc(`users/${uid}`).set(
    {
      deleted: true,
      deletedAt: FieldValue.serverTimestamp(),
      displayName: 'חשבון שנמחק',
      photoURL: null,
      mutedChats: FieldValue.delete(),
      pendingMentions: FieldValue.delete(),
    },
    { merge: true },
  );

  // 2. Personal data under the user document.
  await deleteQueryInBatches(db.collection(`users/${uid}/private`), 'private');
  await deleteQueryInBatches(db.collection(`users/${uid}/profile`), 'profile');
  await deleteQueryInBatches(db.collection(`users/${uid}/portfolio`), 'portfolio');

  // 3. Devices and their notifications.
  await deleteQueryInBatches(
    db.collection('pushTokens').where('userId', '==', uid), 'pushTokens',
  );
  await deleteQueryInBatches(
    db.collection('notifications').where('userId', '==', uid), 'notifications',
  );

  // 4. Their own listings. Only unsold ones — a completed sale is another
  //    party's purchase history.
  await deleteQueryInBatches(
    db.collection('marketplace_listings')
      .where('posterId', '==', uid)
      .where('status', '==', 'available'),
    'listings',
  );

  // 5. Files.
  await deleteStoragePrefixes(uid);

  // 6. Irreversible, and therefore last. Revokes every session immediately.
  await admin.auth().deleteUser(uid);

  console.log('[deleteAccount] completed for', uid, {
    outstandingFeeAtDeletion: status.outstandingFee,
  });

  return { ok: true, outstandingFeeAtDeletion: status.outstandingFee };
});
