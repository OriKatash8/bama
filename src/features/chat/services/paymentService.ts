import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  addDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../core/firebase/config';
import type { PriceOffer, BundleOffer, PaymentRequest } from '../../../core/types/project';
import type { User } from '../../../core/types/user';
import { callFunction } from '@core/firebase/functions';

export type ProjectFeeSlot = {
  professionalId: string;
  displayName: string;
  amount: number;
};

/**
 * What the CLIENT pays their crew: the sum of the accepted offers. BAMA charges
 * the professional 3% on completion and takes nothing from the client. The old
 * 5% client add-on is retired; `total` is kept equal to `subtotal` so existing
 * call sites keep rendering a total.
 *
 * NOT to be confused with `ProjectFee` in core/types/project.ts, which is a
 * single PROFESSIONAL's platform fee at projects/{id}/fees/{proId}. This one is
 * the client's cost breakdown and has nothing to do with the platform fee — the
 * two were both called `ProjectFee` until this rename.
 */
export type ClientCostBreakdown = {
  slots: ProjectFeeSlot[];
  subtotal: number;
  total: number;
};

export async function calculateProjectFee(projectId: string): Promise<ClientCostBreakdown> {
  const offersSnap = await getDocs(
    query(
      collection(db, 'priceOffers'),
      where('projectId', '==', projectId),
      where('status', '==', 'accepted'),
    ),
  );

  const offers = offersSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as PriceOffer);

  // Fetch bundle prices for any bundled offers (deduplicated)
  const bundleIds = [...new Set(offers.filter((o) => o.bundleId).map((o) => o.bundleId!))];
  const bundlePriceMap = new Map<string, { bundlePrice: number; professionalId: string }>();
  await Promise.all(
    bundleIds.map(async (bundleId) => {
      const snap = await getDoc(doc(db, 'bundleOffers', bundleId));
      if (snap.exists()) {
        const b = snap.data() as BundleOffer;
        bundlePriceMap.set(bundleId, { bundlePrice: b.bundlePrice, professionalId: b.professionalId });
      }
    }),
  );

  // Build fee slots: each bundle counts once; individual offers count normally
  const seenBundleIds = new Set<string>();
  const feeEntries: Array<{ professionalId: string; amount: number }> = [];

  for (const offer of offers) {
    if (offer.bundleId) {
      if (!seenBundleIds.has(offer.bundleId)) {
        seenBundleIds.add(offer.bundleId);
        const entry = bundlePriceMap.get(offer.bundleId);
        if (entry) {
          feeEntries.push({ professionalId: entry.professionalId, amount: entry.bundlePrice });
        }
      }
    } else {
      feeEntries.push({ professionalId: offer.professionalId, amount: offer.price });
    }
  }

  // Resolve display names
  const slots: ProjectFeeSlot[] = await Promise.all(
    feeEntries.map(async ({ professionalId, amount }) => {
      const userSnap = await getDoc(doc(db, 'users', professionalId));
      const displayName = userSnap.exists()
        ? (userSnap.data() as User).displayName
        : professionalId;
      return { professionalId, displayName, amount };
    }),
  );

  const subtotal = slots.reduce((sum, s) => sum + s.amount, 0);

  return { slots, subtotal, total: subtotal };
}

export function listenToPaymentRequests(
  projectId: string,
  userId: string,
  callback: (requests: PaymentRequest[]) => void,
): () => void {
  const colRef = collection(db, `projects/${projectId}/paymentRequests`);

  const fromMap = new Map<string, PaymentRequest>();
  const toMap = new Map<string, PaymentRequest>();
  let fromReady = false;
  let toReady = false;

  function emit() {
    const merged = new Map<string, PaymentRequest>();
    fromMap.forEach((v, k) => merged.set(k, v));
    toMap.forEach((v, k) => merged.set(k, v));
    callback(Array.from(merged.values()));
  }

  const q1 = query(
    colRef,
    where('status', '==', 'pending'),
    where('fromUserId', '==', userId),
  );
  const q2 = query(
    colRef,
    where('status', '==', 'pending'),
    where('toUserId', '==', userId),
  );

  const unsub1 = onSnapshot(q1, (snap) => {
    fromMap.clear();
    snap.docs.forEach((d) => fromMap.set(d.id, { id: d.id, ...d.data() } as PaymentRequest));
    fromReady = true;
    if (toReady) emit();
  });

  const unsub2 = onSnapshot(q2, (snap) => {
    toMap.clear();
    snap.docs.forEach((d) => toMap.set(d.id, { id: d.id, ...d.data() } as PaymentRequest));
    toReady = true;
    if (fromReady) emit();
  });

  return () => {
    unsub1();
    unsub2();
  };
}

const createPaymentRequestFn = callFunction<
  {
    projectId: string;
    professionalId?: string;
    category?: string;
    bundleId?: string;
    proposedAmount: number;
    note?: string;
  },
  { ok: boolean; requestId: string; currentAmount: number }
>('createPaymentRequest');

/**
 * Raise a price-renegotiation request.
 *
 * Runs SERVER-SIDE, and deliberately takes no identity fields. This was a raw
 * client `addDoc`, so every field was attacker-controlled — `fromUserId`,
 * `toUserId` and `professionalId` alike — and the responder was left validating
 * around it. The callable derives the pair from the project instead: the caller
 * is always `fromUserId`, a professional can only reprice their own engagement,
 * and a client must name a professional actually on the project. A self-addressed
 * request is unrepresentable rather than merely rejected.
 *
 * `currentAmount` is read from the accepted offer, not supplied, which also
 * proves there is something repriceable before the request exists. The chat
 * notice is posted in the same batch.
 */
export async function createPaymentRequest(
  projectId: string,
  data: {
    professionalId?: string;
    bundleId?: string;
    category?: string;
    proposedAmount: number;
    note?: string;
  },
): Promise<void> {
  await createPaymentRequestFn({ projectId, ...data });
}

const respondToPaymentRequestFn = callFunction<
  { projectId: string; requestId: string; accept: boolean },
  { ok: boolean; accepted: boolean; repriced?: number }
>('respondToPaymentRequest');

/**
 * Accept or reject a price-renegotiation request.
 *
 * Server-side: an accepted offer's amount is the platform fee's base, so the
 * rules freeze it and the callable re-derives both parties from the project
 * rather than trusting the request document's own fields.
 */
export async function respondToPaymentRequest(
  projectId: string,
  requestId: string,
  accept: boolean,
  _professionalId?: string,
  _newAmount?: number,
  _bundleId?: string,
): Promise<void> {
  await respondToPaymentRequestFn({ projectId, requestId, accept });
}
