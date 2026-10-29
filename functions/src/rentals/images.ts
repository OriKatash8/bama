import * as admin from 'firebase-admin';
import { randomUUID } from 'crypto';
import { isIP } from 'net';
import sharp from 'sharp';
import { DETAIL_WIDTH, FETCH_TIMEOUT_MS, MAX_SOURCE_IMAGE_BYTES, THUMB_WIDTH, WEBP_QUALITY } from './config';

export type StoredImage = { thumbUrl: string; url: string };

/**
 * Whether a store-supplied image URL may be downloaded: https, a real hostname
 * (no IP literals, no localhost or internal names). The sync runs inside
 * Google's network, so a store must not be able to point it at internal hosts.
 */
export function isFetchableImageUrl(src: string): boolean {
  try {
    const u = new URL(src);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (isIP(host.replace(/^\[|\]$/g, ''))) return false;
    if (host === 'localhost' || !host.includes('.')) return false;
    return !/\.(internal|local|localhost)$/.test(host);
  } catch {
    return false;
  }
}

async function download(src: string, fetchFn: typeof fetch): Promise<Buffer> {
  if (!isFetchableImageUrl(src)) throw new Error(`Image URL not allowed: ${src}`);
  const res = await fetchFn(src, { redirect: 'error', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Image HTTP ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  if (!type.startsWith('image/')) throw new Error(`Not an image: ${type}`);
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_SOURCE_IMAGE_BYTES) throw new Error('Image too large');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_SOURCE_IMAGE_BYTES) throw new Error('Image too large');
  return buf;
}

/** Resize to `width` (never enlarging) and encode as WebP. */
export function toWebp(input: Buffer, width: number): Promise<Buffer> {
  return sharp(input, { failOn: 'error', limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}

/** Uploads with a download token, the same way video/index.ts does: a permanent URL, no makePublic(). */
async function upload(path: string, data: Buffer): Promise<string> {
  const bucket = admin.storage().bucket();
  const token = randomUUID();
  await bucket.file(path).save(data, {
    resumable: false,
    metadata: {
      contentType: 'image/webp',
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });
  const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST
    ? `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}`
    : 'https://firebasestorage.googleapis.com';
  return `${host}/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

/**
 * Copies one store image into Storage as a grid thumbnail and a detail image.
 * `prefix` is the item's folder; the file names carry a nonce so a changed
 * image never collides with a cached old one.
 */
export async function copyImage(
  src: string,
  prefix: string,
  index: number,
  fetchFn: typeof fetch = fetch,
): Promise<{ image: StoredImage; bytes: number }> {
  const original = await download(src, fetchFn);
  const [thumb, detail] = await Promise.all([toWebp(original, THUMB_WIDTH), toWebp(original, DETAIL_WIDTH)]);
  const nonce = randomUUID().slice(0, 8);
  const [thumbUrl, url] = await Promise.all([
    upload(`${prefix}/${index}-${nonce}-thumb.webp`, thumb),
    upload(`${prefix}/${index}-${nonce}.webp`, detail),
  ]);
  return { image: { thumbUrl, url }, bytes: thumb.length + detail.length };
}

/** Deletes every file under a Storage folder. Missing files are not an error. */
export async function deletePrefix(prefix: string): Promise<void> {
  await admin.storage().bucket().deleteFiles({ prefix: `${prefix}/`, force: true });
}

/** Runs `fn` over `items` with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
