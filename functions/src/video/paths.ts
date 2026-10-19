/**
 * Storage paths the video pipeline works with, and the ownership check behind
 * cancelVideoJob. Everything the callable deletes or marks is derived HERE from a path
 * that has passed parseOwnedVideoPath; nothing from the client is used as-is.
 */

/** Folders the app uploads videos into, always as `{folder}/{uid}/{Date.now()}.mp4`. */
export const CANCELLABLE_FOLDERS = ['portfolio', 'chat-videos'] as const;

export type OwnedVideoPath = {
  /** The verified original upload path. */
  filePath: string;
  /** `videoJobs/{jobId}`, computed exactly as compressVideo computes it. */
  jobId: string;
  /** Where compressVideo writes its output for this upload. */
  compressedPath: string;
};

const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,100}\.mp4$/;
const UID = /^[A-Za-z0-9]{1,128}$/;

export function jobIdFor(filePath: string): string {
  return Buffer.from(filePath).toString('base64').replace(/[/+=]/g, '_');
}

/** `a/b/123.mp4` → `a/b/123_compressed.mp4`, the same name compressVideo writes. */
export function compressedPathFor(filePath: string): string {
  const slash = filePath.lastIndexOf('/');
  const dir = filePath.slice(0, slash);
  const name = filePath.slice(slash + 1).replace(/\.[^.]+$/, '');
  return `${dir}/${name}_compressed.mp4`;
}

/**
 * Accepts exactly `portfolio/{callerUid}/{name}.mp4` or `chat-videos/{callerUid}/{name}.mp4`
 * (three segments, a plain file name, not an already-compressed output). Anything else,
 * including another user's uid, `..`, extra or empty segments, is null.
 */
export function parseOwnedVideoPath(raw: unknown, callerUid: string): OwnedVideoPath | null {
  if (typeof raw !== 'string' || raw.length > 300) return null;
  if (!callerUid || !UID.test(callerUid)) return null;
  const parts = raw.split('/');
  if (parts.length !== 3) return null;
  const [folder, uid, name] = parts;
  if (!(CANCELLABLE_FOLDERS as readonly string[]).includes(folder)) return null;
  if (uid !== callerUid) return null;
  if (!FILE_NAME.test(name) || name.includes('_compressed')) return null;
  return { filePath: raw, jobId: jobIdFor(raw), compressedPath: compressedPathFor(raw) };
}
