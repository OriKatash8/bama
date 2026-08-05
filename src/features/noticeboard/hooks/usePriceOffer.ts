import { useState } from 'react';
import { useAuthStore } from '@core/stores/authStore';
import { addDocument, runBatchUpdates } from '@core/firebase/firestore';

type OfferSlot = { category: string; price: number };

export function usePriceOffer() {
  const user = useAuthStore((s) => s.user);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(projectId: string, slots: OfferSlot[]): Promise<void> {
    if (!user) return;
    setIsSubmitting(true);
    try {
      await Promise.all(
        slots.map((slot) =>
          addDocument('priceOffers', {
            projectId,
            professionalId: user.id,
            category: slot.category,
            price: slot.price,
            status: 'pending' as const,
            createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
          })
        )
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitWithBundle(
    projectId: string,
    slots: OfferSlot[],
    bundlePrice: number,
  ): Promise<void> {
    if (!user) return;
    setIsSubmitting(true);
    try {
      // Create individual price offers first — get their IDs
      const offerIds = await Promise.all(
        slots.map((slot) =>
          addDocument('priceOffers', {
            projectId,
            professionalId: user.id,
            category: slot.category,
            price: slot.price,
            status: 'pending' as const,
            createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
          })
        )
      );

      // Create the bundle offer document
      const bundleId = await addDocument('bundleOffers', {
        projectId,
        professionalId: user.id,
        slots: slots.map((s) => ({ category: s.category })),
        individualTotal: slots.reduce((sum, s) => sum + s.price, 0),
        bundlePrice,
        offerIds,
        status: 'pending' as const,
        createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
      });

      // Back-fill bundleId on each priceOffer
      await runBatchUpdates(
        offerIds.map((id) => ({ path: `priceOffers/${id}`, data: { bundleId } }))
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return { submit, submitWithBundle, isSubmitting };
}
