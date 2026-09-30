import * as admin from 'firebase-admin';
import { db, notify } from './helpers';
import { completeEngagementInternal } from './completion';
import { closeProjectChatOnce } from './chatClose';
import { readConfig } from './config';
import { AUTO_CLOSE_GRACE_DAYS } from '../pricing';

/**
 * Engagements whose `completionDueAt` (the project's end date, local midnight)
 * is before this are due to auto-close. Not "now": the project closes
 * AUTO_CLOSE_GRACE_DAYS after its end date, and until then the client can still
 * move the date — the chat tells everyone so (EndDateBanner).
 */
export function autoCloseCutoff(nowMs: number = Date.now()): admin.firestore.Timestamp {
  return admin.firestore.Timestamp.fromMillis(nowMs - AUTO_CLOSE_GRACE_DAYS * 86400_000);
}

/**
 * Auto-close one engagement. When that finishes the project, its chat is closed
 * the same way the client's confirmation closes it — the fee and the closing
 * card with the team's phones already follow from the project turning
 * `completed` (applyDerivedProjectState → onProjectClosed).
 */
export async function autoCloseEngagement(projectId: string, proId: string): Promise<void> {
  const res = await completeEngagementInternal(projectId, proId, 'auto');
  if (!res.completed) return;

  const { chargeWindowDays } = await readConfig();
  await notify({
    userId: proId,
    title: 'BAMA',
    message: `הפרויקט הסתיים. עמלת הפלטפורמה תיגבה בעוד ${chargeWindowDays} ימים — אם העבודה לא בוצעה, סמנו זאת עכשיו.`,
    data: { type: 'engagement_completed', projectId },
  });

  const project = (await db.doc(`projects/${projectId}`).get()).data();
  if (project?.status === 'completed' && project.chatId) {
    await closeProjectChatOnce(project.chatId as string);
  }
}
