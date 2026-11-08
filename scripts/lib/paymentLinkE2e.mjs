/**
 * Pure builders for scripts/seed-payment-link-test.mjs.
 *
 * The seeded project is status 'in_progress' with no chatId, endDate or slotActive on
 * purpose: onProjectCreate only acts on 'open' projects, onProjectClosed needs a
 * closing transition and a chat, onProjectEndDateChange needs an endDate, and the
 * daily lifecycleCron sweeps select on slotActive / completion state. Nobody but the
 * test account is notified, and the only thing that picks the fee up is feeChargeCron.
 * The fee has no overdueAt, so it never blocks the account.
 */
export const E2E_TAG = 'plink-e2e';
const HOUR = 3_600_000;
// Firebase Auth uids (custom ones too, e.g. demo-test1). No underscore: feeKey and the charge
// idempotency key are split on '_'.
const UID = /^[A-Za-z0-9][A-Za-z0-9-]{4,126}[A-Za-z0-9]$/;   // never starts with '-', so a flag can't pass as a uid

export function assertUid(uid) {
  if (typeof uid !== 'string' || !UID.test(uid)) throw new Error('--uid <firebase uid of the test account> is required');
  return uid;
}

const DAY = 24 * HOUR;

/**
 * The two documents to create. `ts(ms)` turns epoch ms into a Firestore Timestamp.
 * `inWindow` seeds a fee that is completed but STILL INSIDE its 4-day contest window
 * (chargeDueAt = now + 4 days): feeChargeCron ignores it, so the only way a link
 * appears is the pro tapping "Pay now" (requestMyPaymentLinkNow).
 */
export function buildSeed(uid, now, ts, { inWindow = false } = {}) {
  const projectId = `${E2E_TAG}-${now}`;
  return {
    projectId,
    project: {
      title: 'PLINK E2E TEST (delete me)',
      clientId: uid,
      status: 'in_progress',
      e2eTest: true,
      createdAt: ts(now),
    },
    fee: {
      professionalId: uid,
      projectId,
      feeStatus: 'owed',
      engagementStatus: 'completed',
      status: 'pending',
      feePaid: false,
      baseAmount: 200,
      feeRate: 0.03,
      feeDue: 6,                       // 3% of 200: matches the ₪6 sandbox payment
      paidAmount: 0,
      slotActive: false,
      chargeDueAt: inWindow ? ts(now + 4 * DAY) : ts(now - HOUR),   // window still open / closed an hour ago
      e2eTest: true,
    },
  };
}

/**
 * What to delete for one seeded project. Only documents carrying the e2e tag, and a
 * pointer only when it points back at THIS project, so cleanup can never reach a real fee.
 * @returns {{ ok: true, paths: string[] } | { ok: false, reason: string }}
 */
export function cleanupPlan(projectId, project, fees, pointers) {
  if (!projectId.startsWith(`${E2E_TAG}-`) || project?.e2eTest !== true) {
    return { ok: false, reason: `${projectId} is not an e2e project` };
  }
  const paths = [];
  for (const { id, data } of fees) {
    if (data?.e2eTest !== true) return { ok: false, reason: `fee ${projectId}/${id} is not tagged e2eTest` };
    const link = data.paymentLink?.processId;
    if (link && pointers[link]?.projectId === projectId) paths.push(`paymentLinks/${link}`);
    if (data.paidBy === 'link' && data.providerRef) paths.push(`paymentEvents/link_${data.providerRef}`);
    paths.push(`projects/${projectId}/fees/${id}`);
  }
  paths.push(`projects/${projectId}`);
  return { ok: true, paths };
}
