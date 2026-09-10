import { onCall } from 'firebase-functions/v2/https';
import { db, requireAuth, requireAdmin, computeFee, type FeeDoc } from './helpers';
import { readConfig } from './config';
import { feeBlocksNewHire } from '../pricing';

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
    const blocks = feeBlocksNewHire(fee, config.paymentFailureGraceDays, now);
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

  const rows = [...byPro.values()].map((r) => ({
    ...r,
    displayName: nameOf.get(r.professionalId) ?? '',
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

  const ids = new Set<string>();
  for (const r of rows) {
    if (r.proId) ids.add(r.proId);
    if (r.clientId) ids.add(r.clientId);
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
    })),
  };
});
