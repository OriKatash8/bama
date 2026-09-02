import * as admin from 'firebase-admin';
import { FieldValue as AdminFieldValue, Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { PLATFORM_FEE_RATE, TIMEZONE } from '../pricing';

if (admin.apps.length === 0) {
  admin.initializeApp();
}

export const db = admin.firestore();
// From the MODULAR entry point, not the `admin.firestore.X` namespace: under the
// functions emulator that namespace is a bare function with its statics stripped,
// so `admin.firestore.FieldValue` is undefined and every write throws at runtime.
// `admin.firestore()` itself still works, which is why only the statics moved.
export const FieldValue = AdminFieldValue;
export const Timestamp = AdminTimestamp;
export type Ts = AdminTimestamp;

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

/** A professional's fee record: `projects/{projectId}/fees/{professionalId}`. */
export function feeRef(projectId: string, proId: string) {
  return db.doc(`projects/${projectId}/fees/${proId}`);
}

export function feesCol(projectId: string) {
  return db.collection(`projects/${projectId}/fees`);
}

export type FeeDoc = {
  professionalId: string;
  feeStatus: 'included' | 'owed' | 'exempt';
  feeRate: number;
  baseAmount: number;
  feeDue?: number;
  /** Cumulative shekels already settled. Everything derives from
   *  `outstanding = max(0, computeFee(baseAmount, feeRate) - paidAmount)`, which
   *  covers §5's top-up rule, re-hire, and ordinary settlement without branching. */
  paidAmount?: number;
  feePaid?: boolean;
  slotActive: boolean;
};

/**
 * ONE professional's accepted value on a project: their individual accepted
 * offers, plus each accepted bundle of theirs counted ONCE at `bundlePrice`.
 *
 * A bundle is a single discounted amount covering several slots, so summing its
 * individual offers (which keep their own prices) would over-charge. `freeSlot`
 * sets a departing pro's offers to 'removed', so they drop out here by status.
 *
 * Three equality filters need no composite index — Firestore serves equality-only
 * queries with a zigzag merge join (same shape as removal.ts's existing query).
 */
export async function computeProAmount(projectId: string, proId: string): Promise<number> {
  const offersSnap = await db
    .collection('priceOffers')
    .where('projectId', '==', projectId)
    .where('professionalId', '==', proId)
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

/** The fee a pro owes on their own amount, rounded to the nearest shekel. Pure. */
export function computeFee(baseAmount: number, feeRate = PLATFORM_FEE_RATE): number {
  return Math.round(baseAmount * feeRate);
}

/**
 * Read one pro's fee record. A MISSING doc means 'exempt' — the permanent
 * fallback for every project created before the per-pro correction. Those can
 * never owe, never hold a slot, and their reviews publish immediately.
 */
export async function readFee(projectId: string, proId: string): Promise<FeeDoc> {
  const snap = await feeRef(projectId, proId).get();
  if (!snap.exists) {
    return {
      professionalId: proId,
      feeStatus: 'exempt',
      feeRate: PLATFORM_FEE_RATE,
      baseAmount: 0,
      slotActive: false,
    };
  }
  return snap.data() as FeeDoc;
}

/**
 * Publish the held client→pro review(s) for ONE professional on a project
 * (idempotent). Per-pro: pro A paying must not publish pro B's held review.
 */
export async function publishProReview(projectId: string, proId: string): Promise<void> {
  const snap = await db
    .collection('reviews')
    .where('projectId', '==', projectId)
    .where('professionalId', '==', proId)
    .where('published', '==', false)
    .get();
  const batch = db.batch();
  snap.docs.forEach((d) =>
    batch.update(d.ref, { published: true, visibleAt: FieldValue.serverTimestamp() }),
  );
  if (!snap.empty) await batch.commit();
}
