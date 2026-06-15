import { useState } from 'react';
import { queryDocuments, runBatchUpdates, updateDocument, arrayUnion, where } from '@core/firebase/firestore';
import type { PriceOffer } from '@core/types/project';

export function useAcceptOffer() {
  const [isAccepting, setIsAccepting] = useState<string | null>(null);

  async function accept(offer: PriceOffer): Promise<void> {
    setIsAccepting(offer.id);
    try {
      const competing = await queryDocuments<PriceOffer>(
        'priceOffers',
        where('projectId', '==', offer.projectId),
        where('category', '==', offer.category),
        where('subcategory', '==', offer.subcategory),
        where('status', '==', 'pending')
      );

      const others = competing.filter((o) => o.id !== offer.id);
      if (others.length > 0) {
        await runBatchUpdates(
          others.map((o) => ({ path: `priceOffers/${o.id}`, data: { status: 'rejected' } }))
        );
      }

      await updateDocument(`priceOffers/${offer.id}`, { status: 'accepted' });
      await updateDocument(`projects/${offer.projectId}`, {
        filledSlots: arrayUnion({
          category: offer.category,
          subcategory: offer.subcategory,
          professionalId: offer.professionalId,
        }) as any,
      });
    } finally {
      setIsAccepting(null);
    }
  }

  async function reject(offerId: string): Promise<void> {
    await updateDocument(`priceOffers/${offerId}`, { status: 'rejected' });
  }

  return { accept, reject, isAccepting };
}
