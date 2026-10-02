import { onCall } from 'firebase-functions/v2/https';
import { db, feesCol, requireAuth, requireAdmin, computeFee, type FeeDoc } from './helpers';
import { readConfig } from './config';
import { feeBlocksNewHire, feeIsOverdue } from '../pricing';
import { withdrawalCount } from './derive';
import { resolvedFee } from './disputeResolution';

/**
 * Read-only admin views over state the app deliberately hides from everyone else.
 *
 * CALLABLES RATHER THAN A RULES CHANGE, on purpose. `firestore.rules` grants read
 * on a fee record only to the professional it belongs to — the client cannot see
 * it either (§6). Widening that to admins would open the most sensitive
 * collection on the platform to a client-side query and need a new
 * collection-group index to be useful. Going through the Admin SDK instead keeps
 * the rules as tight as they are, adds no index, and leaves fee records
 * server-read as well as server-written.
 *
 * Both are pure reads. Neither moves money, settles anything, or changes state.
 */

/** Cap on documents scanned per call. The platform is small; a hard bound keeps a
 *  future data set from turning an admin screen into a full-collection scan. */
const SCAN_LIMIT = 500;

type ArrearsRow = {
  professionalId: string;
  displayName: string;
  totalOwed: number;
  oldestUnpaidAt: number | null;
  demandSentAt: number | null;
  blocked: boolean;
  projects: { projectId: string; title: string; owed: number; demandSentAt: number | null }[];
};

/** What is still outstanding on one fee, honouring its own snapshotted floor. */
function outstandingOn(fee: FeeDoc): number {
  if (fee.feeStatus !== 'owed') return 0;
  if (fee.feePaid === true || fee.status === 'paid' || fee.status === 'not_owed') return 0;
  // After completion the server stores feeDue already net of anything paid; before
  // it, derive. Mirrors outstandingFee() on the client.
  if (typeof fee.feeDue === 'number') return Math.max(0, fee.feeDue);
  return Math.max(
    0,
    computeFee(fee.baseAmount ?? 0, fee.feeRate, fee.minFeeApplied ?? 0) - (fee.paidAmount ?? 0),
  );
}

function millis(v: unknown): number | null {
  const ts = v as { toMillis?: () => number } | undefined;
  return typeof ts?.toMillis === 'function' ? ts.toMillis() : null;
}

/**
 * Professionals with outstanding platform fees, grouped per professional.
 *
 * `blocked` is computed with the SAME predicate `hireProfessional` enforces with,
 * so the screen can never disagree with the gate — if they drifted, an admin
 * would be reading one rule while the server applied another.
 */
export const adminListArrears = onCall(async (request) => {
  requireAuth(request.auth?.uid);
  requireAdmin(request.auth?.token);

  const config = await readConfig();
  const now = Date.now();

  const feesSnap = await db.collectionGroup('fees').limit(SCAN_LIMIT).get();

  const byPro = new Map<string, ArrearsRow>();
  const projectIds = new Set<string>();

  for (const d of feesSnap.docs) {
    const fee = d.data() as FeeDoc;
    const owed = outstandingOn(fee);
    // Either gate hireProfessional applies: the invoice-based arrears gate, or the
    // automatic overdue one (behind its kill switch) — so this chip cannot say
    // "not blocked" about a professional the server is refusing.
    const blocks = feeBlocksNewHire(fee, config.paymentFailureGraceDays, now)
      || (config.feeOverdueBlockEnabled && feeIsOverdue(fee, now));
    if (owed <= 0 && !blocks) continue;

    const proId = fee.professionalId ?? d.id;
    const projectId = fee.projectId ?? d.ref.parent.parent?.id ?? '';
    projectIds.add(projectId);

    const sentAt = millis(fee.demandSentAt);
    const dueAt = millis(fee.hiredAt) ?? millis(fee.createdAt);

    const row = byPro.get(proId) ?? {
      professionalId: proId,
      displayName: '',
      totalOwed: 0,
      oldestUnpaidAt: null,
      demandSentAt: null,
      blocked: false,
      projects: [],
    };
    row.totalOwed += owed;
    row.blocked = row.blocked || blocks;
    if (dueAt !== null && (row.oldestUnpaidAt === null || dueAt < row.oldestUnpaidAt)) {
      row.oldestUnpaidAt = dueAt;
    }
    // The OLDEST demand is the one the grace period runs from.
    if (sentAt !== null && (row.demandSentAt === null || sentAt < row.demandSentAt)) {
      row.demandSentAt = sentAt;
    }
    row.projects.push({ projectId, title: '', owed, demandSentAt: sentAt });
    byPro.set(proId, row);
  }

  // Names resolved in one pass rather than per row — the same shape the reports
  // screen uses client-side.
  const [users, projects] = await Promise.all([
    Promise.all([...byPro.keys()].map((id) => db.doc(`users/${id}`).get())),
    Promise.all([...projectIds].filter(Boolean).map((id) => db.doc(`projects/${id}`).get())),
  ]);
  const nameOf = new Map(users.map((u) => [u.id, (u.data()?.displayName as string) ?? '']));
  const titleOf = new Map(projects.map((p) => [p.id, (p.data()?.title as string) ?? '']));

  // Reliability is derived per row rather than stored — see withdrawalCount.
  // Admin-visible only: it is not returned to any client surface and gates
  // nothing.
  const withdrawals = await Promise.all(
    [...byPro.keys()].map((id) => withdrawalCount(id)),
  );
  const withdrawalOf = new Map([...byPro.keys()].map((id, i) => [id, withdrawals[i]]));

  const rows = [...byPro.values()].map((r) => ({
    ...r,
    displayName: nameOf.get(r.professionalId) ?? '',
    withdrawals: withdrawalOf.get(r.professionalId) ?? { withdrawn: 0, byClientRemoval: 0, byOwnChoice: 0 },
    projects: r.projects.map((p) => ({ ...p, title: titleOf.get(p.projectId) ?? '' })),
  }));

  // Blocked first, then by size of debt: the rows needing action at the top.
  rows.sort((a, b) => Number(b.blocked) - Number(a.blocked) || b.totalOwed - a.totalOwed);

  return { rows, graceDays: config.paymentFailureGraceDays, scanned: feesSnap.size };
});

/**
 * Projects waiting on a human — the other half of a flag that has been written
 * since the completion rewrite and read by nothing.
 *
 * Two ways in: a professional disputed a confirmed completion (`fee_disputed`),
 * or a completion request went unanswered and the cron declined to auto-confirm
 * it (`completion_unanswered`). Silence never confirms a completion, so these sit
 * here until someone looks.
 */
type DisputeRow = {
  proId: string;
  /** 'didnt_happen' | 'fee_disputed' | … — the fee's own adminReview.reason. */
  reason: string;
  baseAmount: number;
  /** What resolving as 'completed' with no corrected price would leave owing. */
  feeDueIfCompleted: number;
  minFeeApplied: number;
  feeRate: number;
};

/** One contested engagement, in the admin's terms. Pure. */
export function disputeRowOf(proId: string, fee: FeeDoc): DisputeRow {
  // The same function resolveFeeDispute prices with, so the admin sees exactly
  // what pressing "completed" will leave owing.
  const { baseAmount, feeDue: feeDueIfCompleted } = resolvedFee(fee);
  return {
    proId,
    reason: fee.adminReview?.reason ?? '',
    baseAmount,
    feeDueIfCompleted,
    minFeeApplied: fee.minFeeApplied ?? 0,
    feeRate: fee.feeRate ?? 0,
  };
}

export const adminListFlaggedProjects = onCall(async (request) => {
  requireAuth(request.auth?.uid);
  requireAdmin(request.auth?.token);

  const snap = await db
    .collection('projects')
    .where('adminReviewPending', '==', true)
    .limit(SCAN_LIMIT)
    .get();

  const rows = snap.docs.map((d) => {
    const p = d.data();
    const review = (p.adminReview ?? {}) as {
      reason?: string; proId?: string | null; at?: unknown; note?: string;
    };
    return {
      projectId: d.id,
      title: (p.title as string) ?? '',
      status: (p.status as string) ?? '',
      clientId: (p.clientId as string) ?? '',
      reason: review.reason ?? '',
      proId: review.proId ?? null,
      flaggedAt: millis(review.at),
      note: review.note ?? '',
    };
  });

  // The contested engagements on each flagged project — what resolveFeeDispute
  // acts on. Per engagement, because the project's own adminReview names at
  // most one professional and a project can carry several disputes.
  const disputesByProject = new Map<string, DisputeRow[]>();
  await Promise.all(rows.map(async (r) => {
    const fees = await feesCol(r.projectId).where('engagementStatus', '==', 'disputed').get();
    disputesByProject.set(r.projectId, fees.docs.map((d) => disputeRowOf(d.id, d.data() as FeeDoc)));
  }));

  const ids = new Set<string>();
  for (const r of rows) {
    if (r.proId) ids.add(r.proId);
    if (r.clientId) ids.add(r.clientId);
    for (const d of disputesByProject.get(r.projectId) ?? []) ids.add(d.proId);
  }
  const users = await Promise.all([...ids].map((id) => db.doc(`users/${id}`).get()));
  const nameOf = new Map(users.map((u) => [u.id, (u.data()?.displayName as string) ?? '']));

  // Newest flag first — an unanswered completion goes stale, not better.
  rows.sort((a, b) => (b.flaggedAt ?? 0) - (a.flaggedAt ?? 0));

  return {
    rows: rows.map((r) => ({
      ...r,
      proName: r.proId ? nameOf.get(r.proId) ?? '' : '',
      clientName: nameOf.get(r.clientId) ?? '',
      disputes: (disputesByProject.get(r.projectId) ?? []).map((d) => ({
        ...d, proName: nameOf.get(d.proId) ?? '',
      })),
    })),
  };
});

/** A professional's own amount on a project above this many shekels is "large":
 *  its fee is big enough that the admin follows it from hire to payment. */
export const LARGE_ENGAGEMENT_ABOVE = 5000;

type LargeFeeState = 'pending' | 'paid' | 'disputed' | 'not_owed' | 'exempt';

/** The states the list keeps: money still to come in. */
const FOLLOWED: LargeFeeState[] = ['pending', 'disputed'];

/** Where a large engagement's fee stands, in the admin's terms. */
function largeFeeState(fee: FeeDoc): LargeFeeState {
  if (fee.feeStatus !== 'owed') return 'exempt';
  if (fee.status === 'disputed') return 'disputed';
  if (fee.status === 'not_owed') return 'not_owed';
  if (fee.feePaid === true || fee.status === 'paid') return 'paid';
  return 'pending';
}

export type LargeEngagementRow = {
  projectId: string;
  professionalId: string;
  baseAmount: number;
  /** The whole fee on this engagement (rate × amount, floored), 0 when exempt. */
  fee: number;
  /** What is still to be paid of it. */
  outstanding: number;
  feeState: LargeFeeState;
  /** Still working on it (holds a slot) — or finished / left. */
  active: boolean;
  hiredAt: number | null;
};

/**
 * Pure: the fee records whose professional's own amount is above the line and
 * whose fee is still to settle, biggest first. Kept apart from the callable so it is tested without Firestore.
 */
export function largeEngagementRows(
  fees: { id: string; parentId: string | null; data: FeeDoc }[],
  above = LARGE_ENGAGEMENT_ABOVE,
): LargeEngagementRow[] {
  return fees
    .filter(({ data }) => (data.baseAmount ?? 0) > above)
    // Only what is still to settle: once paid (or voided, or never charged) the
    // admin is done following it, so it leaves the list.
    .filter(({ data }) => FOLLOWED.includes(largeFeeState(data)))
    .map(({ id, parentId, data }) => ({
      projectId: data.projectId ?? parentId ?? '',
      professionalId: data.professionalId ?? id,
      baseAmount: data.baseAmount,
      fee: data.feeStatus === 'owed' ? computeFee(data.baseAmount, data.feeRate, data.minFeeApplied ?? 0) : 0,
      outstanding: outstandingOn(data),
      feeState: largeFeeState(data),
      active: data.slotActive === true,
      hiredAt: millis(data.hiredAt) ?? millis(data.createdAt),
    }))
    .sort((a, b) => b.baseAmount - a.baseAmount);
}

/**
 * Engagements where a professional's own amount is above ₪5,000 and the fee is
 * still to settle — the big fees the admin follows until they are paid (the
 * admin marks one paid with markFeePaid, and it leaves the list). Same shape and
 * reasoning as adminListArrears: fee records are server-read only.
 */
export const adminListLargeEngagements = onCall(async (request) => {
  requireAuth(request.auth?.uid);
  requireAdmin(request.auth?.token);

  const feesSnap = await db.collectionGroup('fees').limit(SCAN_LIMIT).get();
  const rows = largeEngagementRows(
    feesSnap.docs.map((d) => ({ id: d.id, parentId: d.ref.parent.parent?.id ?? null, data: d.data() as FeeDoc })),
  );

  const proIds = [...new Set(rows.map((r) => r.professionalId))];
  const projectIds = [...new Set(rows.map((r) => r.projectId).filter(Boolean))];
  const [users, projects] = await Promise.all([
    Promise.all(proIds.map((id) => db.doc(`users/${id}`).get())),
    Promise.all(projectIds.map((id) => db.doc(`projects/${id}`).get())),
  ]);
  const nameOf = new Map(users.map((u) => [u.id, (u.data()?.displayName as string) ?? '']));
  const projectOf = new Map(projects.map((p) => [p.id, p.data() ?? {}]));

  return {
    above: LARGE_ENGAGEMENT_ABOVE,
    scanned: feesSnap.size,
    rows: rows.map((r) => {
      const p = projectOf.get(r.projectId) ?? {};
      return {
        ...r,
        proName: nameOf.get(r.professionalId) ?? '',
        title: (p.title as string) ?? '',
        projectStatus: (p.status as string) ?? '',
        chatId: (p.chatId as string) ?? null,
      };
    }),
  };
});
