import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../core/firebase/config';
import type { PriceOffer } from '../../../core/types/project';
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

  const slots: ProjectFeeSlot[] = await Promise.all(
    offersSnap.docs.map(async (offerDoc) => {
      const offer = { id: offerDoc.id, ...offerDoc.data() } as PriceOffer;
      const userSnap = await getDoc(doc(db, 'users', offer.professionalId));
      const displayName = userSnap.exists()
        ? (userSnap.data() as User).displayName
        : offer.professionalId;
      return { professionalId: offer.professionalId, displayName, amount: offer.price };
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
