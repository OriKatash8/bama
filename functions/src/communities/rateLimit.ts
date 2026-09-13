import { createHash } from 'crypto';
import { db, Timestamp } from '../lifecycle/helpers';
import { SlidingWindowCounter } from './inviteCore';

export const RATE_LIMIT_PER_WINDOW = 30;
export const RATE_WINDOW_MS = 60_000;

export type RateDecision = { allowed: true } | { allowed: false; retryAfterSec: number };

/**
 * First pass only. See SlidingWindowCounter: per instance, reset on cold start,
 * blind to other instances. It rejects floods cheaply. It does NOT enforce the limit.
 */
const firstPass = new SlidingWindowCounter({
  limit: RATE_LIMIT_PER_WINDOW,
  windowMs: RATE_WINDOW_MS,
  maxKeys: 5000,
});

/** Doc id for a key's current window. The key is hashed so no IP or uid is stored. */
export function rateWindowDocId(key: string, now: number): string {
  const window = Math.floor(now / RATE_WINDOW_MS);
  return `${createHash('sha256').update(key).digest('hex').slice(0, 32)}_${window}`;
}

/**
 * THE rate limit: a fixed 60s window per key in Firestore, shared by every instance.
 *
 * - A transaction reads the window doc and increments only while count < limit, so the
 *   limit holds exactly across instances. Worst case per key: 30/min sustained, or up to
 *   60 in about two seconds straddling a window boundary.
 * - Over the limit the transaction is a read with NO write, so a flood from one key
 *   can't push its doc past Firestore's ~1 write/s per document: writes per doc are capped
 *   at the limit itself.
 * - If the transaction fails (contention, timeout), it FAILS CLOSED: rate-limited, not allowed.
 * - `expireAt` drives a Firestore TTL policy on `rateLimits`, which must be enabled
 *   before deploy: gcloud firestore fields ttls update expireAt
 *   --collection-group=rateLimits --enable-ttl.
 */
export async function checkRateLimit(key: string, now: number = Date.now()): Promise<RateDecision> {
  const windowStart = Math.floor(now / RATE_WINDOW_MS) * RATE_WINDOW_MS;
  const retryAfterSec = Math.max(1, Math.ceil((windowStart + RATE_WINDOW_MS - now) / 1000));
  const limited = { allowed: false as const, retryAfterSec };

  if (!firstPass.hit(key, now)) return limited;

  const ref = db.collection('rateLimits').doc(rateWindowDocId(key, now));
  try {
    const allowed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const count = (snap.exists ? (snap.get('count') as number) : 0) ?? 0;
      if (count >= RATE_LIMIT_PER_WINDOW) return false;
      tx.set(ref, {
        count: count + 1,
        expireAt: Timestamp.fromMillis(windowStart + 2 * RATE_WINDOW_MS),
      });
      return true;
    }, { maxAttempts: 3 });
    return allowed ? { allowed: true } : limited;
  } catch (err) {
    console.error('[rateLimit] window transaction failed; failing closed', err);
    return limited;
  }
}
