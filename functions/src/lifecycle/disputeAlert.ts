import { db, notify } from './helpers';
import { ADMIN_UIDS } from '../moderation/reportAlert';

/** The push text for a raised dispute. Pure. */
export function disputeAlertText(args: {
  proName?: string; title?: string; reason: 'didnt_happen' | 'amount_disputed';
}): { title: string; message: string } {
  const who = args.proName || '—';
  const what = args.title ? ` "${args.title}"` : '';
  const kind = args.reason === 'didnt_happen' ? "didn't happen" : 'fee amount disputed';
  return {
    title: 'New dispute',
    message: `${who} disputed${what} (${kind}). Review in Admin → Reports → Disputes.`,
  };
}

/**
 * Push every admin when a professional raises a dispute. Same recipients and the
 * same path as a report (ADMIN_UIDS → a `notifications` doc → onNotificationCreate),
 * so no new sender. Tapping it opens Reports on the Disputes tab (see
 * useNotificationRouting, type 'admin_dispute').
 *
 * NEVER THROWS. The dispute is already durably saved by the time this runs; a
 * failed alert must not turn a recorded dispute into an error for the professional.
 * It logs loudly instead, so a missing ADMIN_UIDS or a failed write is findable.
 */
export async function notifyAdminsOfDispute(args: {
  projectId: string; proId: string; reason: 'didnt_happen' | 'amount_disputed';
}): Promise<void> {
  try {
    const uids = ADMIN_UIDS.value().filter(Boolean);
    if (uids.length === 0) {
      console.warn('[disputeAlert] ADMIN_UIDS is empty — no admin was alerted to the dispute on', args.projectId);
      return;
    }
    const [proSnap, projSnap] = await Promise.all([
      db.doc(`users/${args.proId}`).get(),
      db.doc(`projects/${args.projectId}`).get(),
    ]);
    const { title, message } = disputeAlertText({
      proName: proSnap.data()?.displayName as string | undefined,
      title: projSnap.data()?.title as string | undefined,
      reason: args.reason,
    });
    await Promise.all(uids.map((userId) => notify({
      userId, title, message,
      data: { type: 'admin_dispute', projectId: args.projectId, proId: args.proId },
    })));
  } catch (err) {
    console.error('[disputeAlert] failed to alert admins of the dispute on', args.projectId, err);
  }
}
