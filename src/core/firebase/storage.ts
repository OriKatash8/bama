import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './config';

export type UploadProgress = {
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;
};

/**
 * Extension → MIME, for the paths that carry one. `marketplace/{id}/{Date.now()}`
 * deliberately has no extension, which is why blob.type is consulted first and
 * why callers may still pass contentType explicitly.
 */
const EXT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
};

/**
 * Work out what to DECLARE for this upload.
 *
 * This matters because Cloud Storage assigns `application/octet-stream` to any
 * object uploaded without a contentType — it is never absent — so a Storage rule
 * of the form `contentType.matches('image/.*')` rejects a perfectly good JPEG
 * that simply arrived undeclared. On React Native, `fetch(fileUri).blob()`
 * frequently yields `blob.type === ''`, so that is the common case, not the edge.
 *
 * Order: what the caller said, then what the Blob knows, then the file
 * extension. Only if all three are silent do we let it default.
 */
function resolveContentType(path: string, blob: Blob, explicit?: string): string | undefined {
  if (explicit) return explicit;
  if (blob.type) return blob.type;
  const ext = path.split('?')[0].split('.').pop()?.toLowerCase();
  return ext ? EXT_TYPES[ext] : undefined;
}

export function uploadFile(
  path: string,
  blob: Blob,
  onProgress?: (progress: UploadProgress) => void,
  metadata?: { contentType?: string }
): Promise<string> {
  return new Promise((resolve, reject) => {
    const storageRef = ref(storage, path);
    const contentType = resolveContentType(path, blob, metadata?.contentType);
    const task = uploadBytesResumable(
      storageRef,
      blob,
      contentType ? { ...metadata, contentType } : metadata
    );

    task.on(
      'state_changed',
      (snapshot) => {
        if (onProgress) {
          onProgress({
            bytesTransferred: snapshot.bytesTransferred,
            totalBytes: snapshot.totalBytes,
            percentage: (snapshot.bytesTransferred / snapshot.totalBytes) * 100,
          });
        }
      },
      reject,
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve(url);
      }
    );
  });
}

export async function deleteFile(path: string): Promise<void> {
  await deleteObject(ref(storage, path));
}

/**
 * Report evidence images.
 *
 * Extracted from three identical copies (client profile, professional profile,
 * project details) that each had the same two bugs.
 *
 *  1. `uri.split('.').pop()` as the extension. On web the picker hands back a
 *     `blob:http://localhost:8081/<uuid>` URI with NO dot, so `pop()` returned
 *     the entire URI — slashes included — and the object name grew extra path
 *     segments. A Storage rule matching a single `{fileName}` segment cannot
 *     match that, so the upload was denied. `safeExt` only ever returns a known
 *     image extension.
 *
 *  2. The reporter's uid was not in the path, so evidence could only be read by
 *     an admin — and `getDownloadURL`, which uploadFile calls to build the URL
 *     the report document stores, NEEDS read access. The upload succeeded and
 *     then the URL fetch was denied. The uid segment lets the reporter read
 *     back their own evidence and nobody else's.
 */
const EVIDENCE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic']);

function safeExt(uri: string, blob: Blob): string {
  const tail = uri.split('?')[0].split('#')[0].split('/').pop() ?? '';
  const fromName = tail.includes('.') ? tail.split('.').pop()!.toLowerCase() : '';
  if (EVIDENCE_EXTS.has(fromName)) return fromName;
  const fromType = (blob.type || '').split('/')[1]?.toLowerCase() ?? '';
  if (EVIDENCE_EXTS.has(fromType)) return fromType;
  return 'jpg';
}

export async function uploadReportEvidence(
  reportId: string,
  reporterId: string,
  uris: string[]
): Promise<string[]> {
  return Promise.all(
    uris.map(async (uri, i) => {
      const blob = await fetch(uri).then((r) => r.blob());
      const ext = safeExt(uri, blob);
      const contentType = blob.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      return uploadFile(
        `reports/${reportId}/evidence/${reporterId}/${Date.now()}_${i}.${ext}`,
        blob,
        undefined,
        { contentType }
      );
    })
  );
}
