import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import { PLATFORM_FEE_RATE, TIMEZONE } from '../pricing';

if (admin.apps.length === 0) {
  admin.initializeApp();
}

export const db = admin.firestore();
export const FieldValue = admin.firestore.FieldValue;
export const Timestamp = admin.firestore.Timestamp;
export type Ts = admin.firestore.Timestamp;

/** 'YYYY-MM' for a date, in Asia/Jerusalem — the subscriber counter's period key. */
export function monthKey(d: Date = new Date()): string {
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  return s.slice(0, 7); // "2026-08"
}

export function daysAgo(days: number): Ts {
  return Timestamp.fromMillis(Date.now() - days * 86400_000);
}

export function daysFromNow(days: number): Ts {
  return Timestamp.fromMillis(Date.now() + days * 86400_000);
}

/** Parse a project `deadline` string to a Timestamp, else null. */
export function parseDeadline(deadline: unknown): Ts | null {
  if (typeof deadline !== 'string' || !deadline) return null;
  const ms = Date.parse(deadline);
  return Number.isNaN(ms) ? null : Timestamp.fromMillis(ms);
}

export function requireAuth(uid: string | undefined): string {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required');
  return uid;
}

export function requireAdmin(token: Record<string, unknown> | undefined): void {
  if (token?.role !== 'admin') throw new HttpsError('permission-denied', 'Admins only');
}

/** Notification doc (same shape as functions/src/notifications/triggers.ts). */
export async function notify(payload: {
  userId: string;
  title: string;
  message: string;
  data?: Record<string, string>;
}): Promise<void> {
  await db.collection('notifications').add({
    userId: payload.userId,
    title: payload.title,
    message: payload.message,
    data: payload.data ?? {},
    createdAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Sum of accepted price offers for a project (bundles counted once) — the
 * project value the 3% fee is taken from. Mirrors paymentService.calculateProjectFee
 * minus the (retired) client add-on.
 */
export async function computeProjectValue(projectId: string): Promise<number> {
  const offersSnap = await db
    .collection('priceOffers')
    .where('projectId', '==', projectId)
    .where('status', '==', 'accepted')
    .get();
  const seenBundles = new Set<string>();
  let total = 0;
  for (const d of offersSnap.docs) {
    const o = d.data() as { price?: number; bundleId?: string };
    if (o.bundleId) {
      if (seenBundles.has(o.bundleId)) continue;
      seenBundles.add(o.bundleId);
      const b = await db.collection('bundleOffers').doc(o.bundleId).get();
      total += (b.data()?.bundlePrice as number | undefined) ?? 0;
    } else {
      total += o.price ?? 0;
    }
  }
  return total;
}

/** feeDue = 3% of project value, rounded to the nearest shekel. */
export async function computeFeeDue(projectId: string): Promise<number> {
  const value = await computeProjectValue(projectId);
  return Math.round(value * PLATFORM_FEE_RATE);
}

/** Publish the held client→pro review(s) for a project (idempotent). */
export async function publishProjectReview(projectId: string): Promise<void> {
  const snap = await db
    .collection('reviews')
    .where('projectId', '==', projectId)
    .where('published', '==', false)
    .get();
  const batch = db.batch();
  snap.docs.forEach((d) =>
    batch.update(d.ref, { published: true, visibleAt: FieldValue.serverTimestamp() }),
  );
  if (!snap.empty) await batch.commit();
}
