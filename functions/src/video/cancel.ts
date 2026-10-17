import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, FieldValue, requireAuth } from '../lifecycle/helpers';
import { parseOwnedVideoPath } from './paths';

function bucketName(): string {
  return admin.app().options.storageBucket ?? `${process.env.GCLOUD_PROJECT}.firebasestorage.app`;
}

/** Delete a Storage object, treating "already gone" as success. */
export async function deleteIfExists(bucket: string, path: string): Promise<void> {
  try {
    await admin.storage().bucket(bucket).file(path).delete({ ignoreNotFound: true });
  } catch (e) {
    console.warn('[video] could not delete', path, e);
  }
}

/**
 * The user cancelled an upload that has reached (or is about to reach) the server.
 *
 * Race-free with compressVideo because both go through a Firestore transaction on
 * `videoJobs/{jobId}`:
 *   - job still processing or not created yet → mark `cancelled`; compressVideo sees the
 *     mark, discards its output and the original, and deletes the job doc.
 *   - job already `done` → delete the compressed output and the job doc here.
 *
 * Security: auth required; the path must be `portfolio|chat-videos/{callerUid}/{name}.mp4`
 * (parseOwnedVideoPath). The job id and the compressed path are DERIVED from that verified
 * path; the job doc's own fields are never trusted as a path to delete.
 */
export const cancelVideoJob = onCall({ region: 'europe-west1' }, async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const data = (request.data ?? {}) as { filePath?: unknown };
  const owned = parseOwnedVideoPath(data.filePath, uid);
  if (!owned) throw new HttpsError('permission-denied', 'Not your video');

  const ref = db.doc(`videoJobs/${owned.jobId}`);
  const outcome = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const job = snap.exists ? (snap.data() as { status?: string; originalPath?: string }) : null;
    // A job doc for this id that names a different original is not ours to touch.
    if (job?.originalPath && job.originalPath !== owned.filePath) {
      throw new HttpsError('permission-denied', 'Not your video');
    }
    if (job?.status === 'done') {
      tx.delete(ref);
      return 'delete-output' as const;
    }
    tx.set(
      ref,
      { cancelled: true, originalPath: owned.filePath, cancelledAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    return 'marked' as const;
  });

  if (outcome === 'delete-output') {
    await deleteIfExists(bucketName(), owned.compressedPath);
    await deleteIfExists(bucketName(), owned.filePath); // normally already gone
  }
  return { ok: true, outcome };
});
