import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@core/firebase/config';

/**
 * One review per (project, professional): the doc id is derived from both, so a
 * retry cannot write a second review. Reviews are immutable to clients, so a
 * write to an id that already exists is refused — the review is already there.
 */
export function reviewDocId(projectId: string, professionalId: string): string {
  return `${projectId}_${professionalId}`;
}

export type ReviewInput = { professionalId: string; rating: number; text: string };

/**
 * Writes each review on its own, then ALWAYS marks the project reviewed.
 *
 * It used to be one Promise.all: a single refused review rejected the batch,
 * `reviewsCompleted` was never written, the error was swallowed, and
 * ReviewFlowGate re-opened the review modal on every launch — while the reviews
 * that had succeeded were written again as duplicates on each retry.
 */
export async function submitReviews(args: {
  projectId: string;
  clientId: string;
  clientDisplayName: string;
  reviews: ReviewInput[];
}): Promise<{ written: string[]; failed: string[] }> {
  const { projectId, clientId, clientDisplayName, reviews } = args;
  const results = await Promise.allSettled(
    reviews.map((r) =>
      setDoc(doc(db, 'reviews', reviewDocId(projectId, r.professionalId)), {
        projectId,
        professionalId: r.professionalId,
        reviewerId: clientId,
        authorId: clientId,
        authorName: clientDisplayName,
        rating: r.rating,
        text: r.text,
        body: r.text,
        createdAt: serverTimestamp(),
      }),
    ),
  );
  const written: string[] = [];
  const failed: string[] = [];
  results.forEach((res, i) => {
    const id = reviews[i].professionalId;
    if (res.status === 'fulfilled') written.push(id);
    else {
      failed.push(id);
      console.error('[reviews] review not written', { projectId, professionalId: id, code: (res.reason as { code?: string })?.code });
    }
  });
  try {
    await updateDoc(doc(db, 'projects', projectId), { reviewsCompleted: true, reviewsPending: [] });
  } catch (e) {
    console.error('[reviews] could not mark the project reviewed', { projectId, code: (e as { code?: string })?.code });
  }
  return { written, failed };
}
