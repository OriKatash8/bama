import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  addDoc,
  onSnapshot,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../core/firebase/config';
import type { PriceOffer, BundleOffer, PaymentRequest } from '../../../core/types/project';
import type { User } from '../../../core/types/user';

export type ProjectFeeSlot = {
  professionalId: string;
  displayName: string;
  amount: number;
};

export type ProjectFee = {
  slots: ProjectFeeSlot[];
  subtotal: number;
  platformFee: number;
  total: number;
};

export async function calculateProjectFee(projectId: string): Promise<ProjectFee> {
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
  const platformFee = subtotal * 0.05;
  const total = subtotal + platformFee;

  return { slots, subtotal, platformFee, total };
}

export async function markProjectComplete(projectId: string): Promise<void> {
  await updateDoc(doc(db, 'projects', projectId), {
    status: 'completed',
    completedAt: serverTimestamp(),
  });
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

export async function createPaymentRequest(
  projectId: string,
  data: {
    fromUserId: string;
    toUserId: string;
    professionalId: string;
    bundleId?: string;
    currentAmount: number;
    proposedAmount: number;
    note?: string;
  },
): Promise<void> {
  const { bundleId, note, ...rest } = data;
  await addDoc(collection(db, `projects/${projectId}/paymentRequests`), {
    projectId,
    ...rest,
    ...(bundleId ? { bundleId } : {}),
    ...(note ? { note } : {}),
    status: 'pending',
    createdAt: serverTimestamp(),
  });
}

export async function respondToPaymentRequest(
  projectId: string,
  requestId: string,
  accept: boolean,
  professionalId: string,
  newAmount: number,
  bundleId?: string,
): Promise<void> {
  const requestRef = doc(db, `projects/${projectId}/paymentRequests/${requestId}`);

  if (!accept) {
    await updateDoc(requestRef, { status: 'rejected' });
    return;
  }

  const batch = writeBatch(db);
  if (bundleId) {
    // Bundle deal → reprice the single bundle.
    batch.update(doc(db, 'bundleOffers', bundleId), { bundlePrice: newAmount });
  } else {
    const offersSnap = await getDocs(
      query(
        collection(db, 'priceOffers'),
        where('projectId', '==', projectId),
        where('professionalId', '==', professionalId),
        where('status', '==', 'accepted'),
      ),
    );
    offersSnap.docs.forEach((d) => batch.update(d.ref, { price: newAmount }));
  }
  batch.update(requestRef, { status: 'accepted' });
  await batch.commit();
}
