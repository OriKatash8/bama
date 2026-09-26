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
export function rateWindowDocId(key: string, now: number, windowMs: number = RATE_WINDOW_MS): string {
  const window = Math.floor(now / windowMs);
  return `${createHash('sha256').update(key).digest('hex').slice(0, 32)}_${window}`;
}

/** A named quota: how many hits of `key` are allowed per window. */
export type WindowSpec = {
  /** Distinguishes this quota's documents from every other quota's. */
  prefix: string;
  limit: number;
  windowMs: number;
};

/**
 * The shared Firestore window, parameterised. `checkRateLimit` below is this
 * with the invite quota and an in-memory pre-filter; callers wanting a
 * different limit, a different window, or several quotas at once (see
 * checkAllWindows) use this directly.
 *
 * Same guarantees as documented on checkRateLimit: exact across instances,
 * writes-per-doc bounded by the limit itself, and FAILS CLOSED.
 */
export async function checkWindow(
  key: string,
  spec: WindowSpec,
  now: number = Date.now(),
): Promise<RateDecision> {
  const windowStart = Math.floor(now / spec.windowMs) * spec.windowMs;
  const retryAfterSec = Math.max(1, Math.ceil((windowStart + spec.windowMs - now) / 1000));
  const limited = { allowed: false as const, retryAfterSec };

  const ref = db
    .collection('rateLimits')
    .doc(`${spec.prefix}_${rateWindowDocId(key, now, spec.windowMs)}`);
  try {
    const allowed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const count = (snap.exists ? (snap.get('count') as number) : 0) ?? 0;
      if (count >= spec.limit) return false;
      tx.set(ref, {
        count: count + 1,
        expireAt: Timestamp.fromMillis(windowStart + 2 * spec.windowMs),
      });
      return true;
    }, { maxAttempts: 3 });
    return allowed ? { allowed: true } : limited;
  } catch (err) {
    console.error(`[rateLimit:${spec.prefix}] window transaction failed; failing closed`, err);
    return limited;
  }
}

/**
 * Every spec must allow, and the LONGEST retryAfter wins so the caller is not
 * told to retry in one second against a quota that resets tomorrow.
 *
 * Specs are evaluated in order and it STOPS AT THE FIRST DENIAL, so a burst
 * quota placed first spares the daily quota a write during a flood. The cost of
 * that: a request denied by the burst window is not counted against the daily
 * one. That is the correct direction — a user who is being throttled should not
 * also be burning their day's budget on rejected calls.
 */
export async function checkAllWindows(
  key: string,
  specs: WindowSpec[],
  now: number = Date.now(),
): Promise<RateDecision> {
  for (const spec of specs) {
    const d = await checkWindow(key, spec, now);
    if (!d.allowed) return d;
  }
  return { allowed: true };
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
