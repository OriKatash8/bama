import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineList } from 'firebase-functions/params';
import { db, FieldValue } from '../lifecycle/helpers';

/**
 * uids that receive a push when a report (or a block) is filed. A deploy-time
 * parameter, set in functions/.env as `ADMIN_UIDS=uid1,uid2`. Deliberately a
 * plain list and not a custom-claim lookup: listing every account to find the
 * admins would run on every report.
 */
export const ADMIN_UIDS = defineList('ADMIN_UIDS');

export function alertText(report: {
  type?: string; reportedUserName?: string; targetType?: string;
}): { title: string; message: string } {
  const who = report.reportedUserName || '—';
  if (report.type === 'user_blocked') {
    return { title: 'User blocked', message: `A user blocked ${who}. Review in Admin → Reports.` };
  }
  if (report.type === 'community_deletion') {
    return { title: 'Community deletion request', message: 'Review in Admin → Reports.' };
  }
  const what = report.targetType ? ` (${report.targetType})` : '';
  return { title: 'New report', message: `Report against ${who}${what}. Review within 24 hours.` };
}

/**
 * Guideline 1.2: reports must reach the team promptly. A `notifications` doc is
 * the app's existing push path (onNotificationCreate turns it into an Expo
 * push), so this reuses it rather than adding a sender.
 */
export const onReportCreate = onDocumentCreated('reports/{reportId}', async (event) => {
  const report = event.data?.data();
  if (!report) return;
  const uids = ADMIN_UIDS.value().filter(Boolean);
  if (uids.length === 0) {
    console.warn('[reportAlert] ADMIN_UIDS is empty — no one was alerted to report', event.params.reportId);
    return;
  }
  const { title, message } = alertText(report);
  const batch = db.batch();
  for (const userId of uids) {
    batch.set(db.collection('notifications').doc(), {
      userId,
      title,
      message,
      data: { type: 'admin_report', reportId: event.params.reportId },
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
});
