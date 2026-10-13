import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { uploadReportEvidence } from '@core/firebase/storage';

/** What a report points at. 'user' is the whole account. */
export type ReportTargetType = 'user' | 'message' | 'listing' | 'review' | 'portfolio';

export type ReportInput = {
  reporterId: string;
  reportedUserId: string;
  reportedUserName: string;
  reason: string;
  evidence?: string[];
  targetType: ReportTargetType;
  /** Message id, listing id, review id… absent for a whole-account report. */
  targetId?: string;
  chatId?: string;
  /** A short copy of the content, so the admin still sees it if it is gone. */
  snippet?: string;
};

/**
 * Files a report for the admin queue (`reports`, see src/app/admin/reports.tsx).
 * One implementation for every content type — Guideline 1.2 wants objectionable
 * content reportable wherever it appears, and the admin needs to know WHICH
 * content, hence targetType/targetId/snippet. Evidence screenshots are uploaded
 * after the doc exists because their storage path carries its id.
 */
export async function submitReport(input: ReportInput): Promise<string> {
  const docRef = await addDoc(collection(db, 'reports'), {
    reporterId: input.reporterId,
    reportedUserId: input.reportedUserId,
    reportedUserName: input.reportedUserName,
    reason: input.reason.trim(),
    targetType: input.targetType,
    ...(input.targetId ? { targetId: input.targetId } : {}),
    ...(input.chatId ? { chatId: input.chatId } : {}),
    ...(input.snippet ? { snippet: input.snippet.slice(0, 300) } : {}),
    evidenceURLs: [] as string[],
    status: 'pending' as const,
    createdAt: serverTimestamp(),
  });
  if (input.evidence?.length) {
    const urls = await uploadReportEvidence(docRef.id, input.reporterId, input.evidence);
    await updateDoc(doc(db, 'reports', docRef.id), { evidenceURLs: urls });
  }
  return docRef.id;
}
