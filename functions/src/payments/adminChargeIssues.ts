import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  db, FieldValue, requireAuth, requireAdmin, type FeeDoc, type LinkReview,
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
   *  'attempts_exhausted': every retry failed. 'unresolved_claim': outcome unknown.
   *  link_*: a payment link payment that was NOT applied (money received, fee still
   *  owed or already settled: refund or reconcile in Grow), or a link that could not
   *  be created. 'link_unmatched': a payment for a link we have no record of. */
  reason:
    | 'settle_mismatch' | 'attempts_exhausted' | 'unresolved_claim'
    | LinkReview['reason'] | 'link_unmatched';
  /** Set only for 'link_unmatched', which belongs to no fee: acknowledge by this id. */
  transactionId?: string;
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
  const link = fee.linkReview && !fee.linkReview.acknowledgedAt ? fee.linkReview : undefined;
  const review = fee.chargeReview;
  if (!review && link) {
    return {
      projectId, title, professionalId: proId, displayName,
      reason: link.reason,
      chargeState: fee.chargeState ?? 'idle',
      chargedAmount: typeof link.amount === 'number' ? link.amount : null,
      feeDue: Math.max(0, fee.feeDue ?? 0),
      attempts: fee.paymentLinkClaim?.attempts ?? 0,
      providerRef: link.transactionId ?? fee.providerRef ?? null,
      lastErrorCode: null,
      flaggedAt: millis(link.at),
      note: link.note ?? '',
    };
  }
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

  // Payments that matched no fee at all (an orphan link, a deleted fee).
  const orphans = await db.collection('paymentLinkIssues').where('acknowledged', '==', false).limit(LIMIT).get();
  for (const d of orphans.docs) {
    const o = d.data() as Record<string, unknown>;
    rows.push({
      projectId: typeof o.projectId === 'string' ? o.projectId : '',
      title: '',
      professionalId: typeof o.proId === 'string' ? o.proId : '',
      displayName: '',
      reason: 'link_unmatched',
      transactionId: d.id,
      chargeState: 'idle',
      chargedAmount: typeof o.amount === 'number' ? o.amount : null,
      feeDue: 0, attempts: 0,
      providerRef: typeof o.transactionId === 'string' ? o.transactionId : null,
      lastErrorCode: null,
      flaggedAt: millis(o.at),
      note: `processId ${String(o.processId ?? '-')} feeKey ${String(o.feeKey ?? '-')}`,
    });
  }

  rows.sort((a, b) => (b.flaggedAt ?? 0) - (a.flaggedAt ?? 0));
  return { rows };
});

/** The admin has dealt with (or at least seen) a charge issue: take it off the list.
 *  The review record itself is kept, with who acknowledged it and when. */
export const adminAcknowledgeChargeIssue = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request.auth?.uid);
  requireAdmin(request.auth?.token);
  const transactionId = request.data?.transactionId as string | undefined;
  if (transactionId) {
    // An unmatched link payment: no fee to update.
    const ref = db.doc(`paymentLinkIssues/${encodeURIComponent(transactionId).slice(0, 400)}`);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('failed-precondition', 'no-charge-issue');
    await ref.update({ acknowledged: true, acknowledgedAt: FieldValue.serverTimestamp(), acknowledgedBy: uid });
    return { ok: true };
  }
  const projectId = request.data?.projectId as string | undefined;
  const professionalId = request.data?.professionalId as string | undefined;
  if (!projectId || !professionalId) {
    throw new HttpsError('invalid-argument', 'projectId and professionalId required');
  }
  const ref = db.doc(`projects/${projectId}/fees/${professionalId}`);
  const snap = await ref.get();
  const fee = snap.exists ? (snap.data() as FeeDoc) : undefined;
  const hasLink = !!fee?.linkReview && !fee.linkReview.acknowledgedAt;
  if (!fee || (!fee.chargeReview && !hasLink)) throw new HttpsError('failed-precondition', 'no-charge-issue');
  const update: Record<string, unknown> = { chargeNeedsAdmin: false };
  if (fee.chargeReview) {
    update['chargeReview.acknowledgedAt'] = FieldValue.serverTimestamp();
    update['chargeReview.acknowledgedBy'] = uid;
  }
  if (hasLink) {
    update['linkReview.acknowledgedAt'] = FieldValue.serverTimestamp();
    update['linkReview.acknowledgedBy'] = uid;
    // Acknowledging "could not create a link" is the admin saying try again.
    if (fee.linkReview!.reason === 'link_create_failed') update.paymentLinkClaim = FieldValue.delete();
  }
  await ref.update(update);
  return { ok: true };
});

export type PaymentLinkRow = {
  projectId: string;
  title: string;
  professionalId: string;
  displayName: string;
  amount: number;
  processId: string;
  createdAt: number | null;
  /** True when the link no longer matches feeDue (or was superseded): not payable. */
  stale: boolean;
  paidAt: number | null;
  transactionId: string | null;
};

/** One admin row for a fee with a payment link. Pure. */
export function paymentLinkRowOf(
  projectId: string, proId: string, fee: FeeDoc, title: string, displayName: string,
): PaymentLinkRow | null {
  const l = fee.paymentLink;
  if (!l) return null;
  return {
    projectId, title, professionalId: proId, displayName,
    amount: l.amount,
    processId: l.processId,
    createdAt: millis(l.createdAt),
    stale: l.superseded === true || l.amount !== fee.feeDue,
    paidAt: millis(fee.feePaidAt),
    transactionId: fee.paidBy === 'link' ? fee.providerRef ?? null : null,
  };
}

/**
 * Payment links awaiting payment, and the latest ones paid. Admin-only read; the
 * needs-review items stay in adminListChargeIssues.
 */
export const adminListPaymentLinks = onCall({ region: REGION }, async (request) => {
  requireAuth(request.auth?.uid);
  requireAdmin(request.auth?.token);

  const [awaitingSnap, paidSnap] = await Promise.all([
    db.collectionGroup('fees').where('chargeState', '==', 'awaiting_payment').limit(LIMIT).get(),
    db.collectionGroup('fees').where('paidBy', '==', 'link').limit(LIMIT).get(),
  ]);
  const toItems = (snap: typeof awaitingSnap) => snap.docs.map((d) => ({
    projectId: d.ref.parent.parent?.id ?? '', proId: d.id, fee: d.data() as FeeDoc,
  }));
  const awaiting = toItems(awaitingSnap);
  const paid = toItems(paidSnap);
  const all = [...awaiting, ...paid];
  const [users, projects] = await Promise.all([
    Promise.all(all.map((i) => db.doc(`users/${i.proId}`).get())),
    Promise.all(all.map((i) => db.doc(`projects/${i.projectId}`).get())),
  ]);
  const row = (i: (typeof all)[number], n: number) => paymentLinkRowOf(
    i.projectId, i.proId, i.fee,
    (projects[n].data()?.title as string) ?? '', (users[n].data()?.displayName as string) ?? '',
  );
  const awaitingRows = awaiting.map((i, n) => row(i, n))
    .filter((r): r is PaymentLinkRow => r !== null)
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  const paidRows = paid.map((i, n) => row(i, awaiting.length + n))
    .filter((r): r is PaymentLinkRow => r !== null)
    .sort((a, b) => (b.paidAt ?? 0) - (a.paidAt ?? 0));
  return { awaiting: awaitingRows, paid: paidRows };
});
