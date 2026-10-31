import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  db, FieldValue, requireAuth, requireAdmin, type FeeDoc,
} from '../lifecycle/helpers';

const REGION = 'europe-west1' as const;
const LIMIT = 200;

const millis = (v: unknown): number | null => {
  const ts = v as { toMillis?: () => number } | undefined;
  return typeof ts?.toMillis === 'function' ? ts.toMillis() : null;
};

export type ChargeIssueRow = {
  projectId: string;
  title: string;
  professionalId: string;
  displayName: string;
  /** 'settle_mismatch': money was taken but not recorded (needs reconciling / refund).
   *  'attempts_exhausted': every retry failed. 'unresolved_claim': outcome unknown. */
  reason: 'settle_mismatch' | 'attempts_exhausted' | 'unresolved_claim';
  chargeState: string;
  chargedAmount: number | null;
  feeDue: number;
  attempts: number;
  providerRef: string | null;
  lastErrorCode: string | null;
  flaggedAt: number | null;
  note: string;
};

/** One admin row for a flagged fee. Pure. */
export function chargeIssueRowOf(
  projectId: string, proId: string, fee: FeeDoc, title: string, displayName: string,
): ChargeIssueRow | null {
  const review = fee.chargeReview;
  if (!review) return null;
  return {
    projectId,
    title,
    professionalId: proId,
    displayName,
    reason: review.reason,
    chargeState: fee.chargeState ?? 'idle',
    chargedAmount: typeof review.chargedAmount === 'number' ? review.chargedAmount : null,
    feeDue: Math.max(0, fee.feeDue ?? 0),
    attempts: fee.chargeAttempts ?? 0,
    providerRef: review.providerRef ?? fee.providerRef ?? null,
    lastErrorCode: fee.lastChargeError?.code ?? null,
    flaggedAt: millis(review.at),
    note: review.note ?? '',
  };
}

/**
 * Fees whose automatic charge needs a human: every retry failed, money moved that
 * could not be recorded against the balance (possible duplicate charge), or a claim
 * whose outcome could not be determined. Admin-only read; moves nothing.
 */
export const adminListChargeIssues = onCall({ region: REGION }, async (request) => {
  requireAuth(request.auth?.uid);
  requireAdmin(request.auth?.token);

  const snap = await db.collectionGroup('fees').where('chargeNeedsAdmin', '==', true).limit(LIMIT).get();
  const items = snap.docs.map((d) => ({
    projectId: d.ref.parent.parent?.id ?? '',
    proId: d.id,
    fee: d.data() as FeeDoc,
  }));

  const [users, projects] = await Promise.all([
    Promise.all(items.map((i) => db.doc(`users/${i.proId}`).get())),
    Promise.all(items.map((i) => db.doc(`projects/${i.projectId}`).get())),
  ]);

  const rows = items
    .map((i, n) => chargeIssueRowOf(
      i.projectId, i.proId, i.fee,
      (projects[n].data()?.title as string) ?? '',
      (users[n].data()?.displayName as string) ?? '',
    ))
    // An exhausted fee an admin has since settled by hand is no longer an issue.
    .filter((r, n): r is ChargeIssueRow => r !== null
      && !(r.reason === 'attempts_exhausted' && (items[n].fee.feePaid === true || items[n].fee.status === 'paid')));

  rows.sort((a, b) => (b.flaggedAt ?? 0) - (a.flaggedAt ?? 0));
  return { rows };
});

/** The admin has dealt with (or at least seen) a charge issue: take it off the list.
 *  The review record itself is kept, with who acknowledged it and when. */
export const adminAcknowledgeChargeIssue = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request.auth?.uid);
  requireAdmin(request.auth?.token);
  const projectId = request.data?.projectId as string | undefined;
  const professionalId = request.data?.professionalId as string | undefined;
  if (!projectId || !professionalId) {
    throw new HttpsError('invalid-argument', 'projectId and professionalId required');
  }
  const ref = db.doc(`projects/${projectId}/fees/${professionalId}`);
  const snap = await ref.get();
  if (!snap.exists || !snap.get('chargeReview')) throw new HttpsError('failed-precondition', 'no-charge-issue');
  await ref.update({
    chargeNeedsAdmin: false,
    'chargeReview.acknowledgedAt': FieldValue.serverTimestamp(),
    'chargeReview.acknowledgedBy': uid,
  });
  return { ok: true };
});
