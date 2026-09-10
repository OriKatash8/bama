import * as admin from 'firebase-admin';
import { FieldValue as AdminFieldValue, Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { PLATFORM_FEE_RATE, TIMEZONE } from '../pricing';
import { sumProAmount, type AcceptedOffer, type BundleSummary } from './proAmount';

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

/** Settlement state of a fee record. Distinct from `feeStatus`, which says
 *  whether a fee was ever owed and is fixed at hire; this says where the money
 *  got to. Nothing in the app is gated on either. */
export type FeeSettlementStatus = 'pending' | 'paid' | 'disputed' | 'not_owed';

export type FeeDoc = {
  professionalId: string;
  /** Denormalised so a collection-group read knows its project without walking
   *  ref.parent.parent. Absent on records written before this field existed. */
  projectId?: string;
  feeStatus: 'included' | 'owed' | 'exempt';
  status?: FeeSettlementStatus;
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

  const offers = offersSnap.docs.map((d) => d.data() as AcceptedOffer);

  // Each distinct parent bundle is fetched ONCE, and its status comes with it —
  // the previous version read `bundlePrice` without ever looking at whether the
  // bundle had been accepted. See sumProAmount for why that mispriced.
  const bundleIds = [...new Set(offers.map((o) => o.bundleId).filter((id): id is string => !!id))];
  const bundleDocs = await Promise.all(
    bundleIds.map((id) => db.collection('bundleOffers').doc(id).get()),
  );
  const bundles = new Map<string, BundleSummary | undefined>(
    bundleIds.map((id, i) => [id, bundleDocs[i].data() as BundleSummary | undefined]),
  );

  return sumProAmount(offers, bundles);
}

/** The fee a pro owes on their own amount, rounded to the nearest shekel. Pure. */
export function computeFee(baseAmount: number, feeRate = PLATFORM_FEE_RATE): number {
  return Math.round(baseAmount * feeRate);
}

/**
 * Force any unpublished client→pro review for ONE professional to published
 * (idempotent).
 *
 * A BACKSTOP, not a mechanism. Reviews publish on creation via onReviewCreate, so
 * this normally matches nothing; it exists to catch a document written before that
 * trigger existed. It used to be the lever that released a review when the pro
 * paid — that is gone, and no caller passes payment state any more.
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
