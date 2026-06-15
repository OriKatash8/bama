import { useState } from 'react';
import { useAuthStore } from '@core/stores/authStore';
import { addDocument } from '@core/firebase/firestore';

type OfferSlot = { category: string; subcategory: string; price: number };

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
            subcategory: slot.subcategory,
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

  return { submit, isSubmitting };
}
