import { useState } from 'react';
import { queryDocuments, getDocument, where } from '@core/firebase/firestore';
import type { PriceOffer, AcceptedMember } from '@core/types/project';

export function useProjectTeam(projectId: string) {
  const [team, setTeam] = useState<AcceptedMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function load(): Promise<void> {
    if (loaded) return;
    setIsLoading(true);
    try {
      const offers = await queryDocuments<PriceOffer>(
        'priceOffers',
        where('projectId', '==', projectId),
        where('status', '==', 'accepted')
      );
      const members = await Promise.all(
        offers.map(async (o) => {
          const user = await getDocument<{ displayName: string }>(`users/${o.professionalId}`);
          return {
            professionalId: o.professionalId,
            category: o.category,
            subcategory: o.subcategory,
            price: o.price,
            displayName: user?.displayName ?? 'Unknown',
          };
        })
      );
      setTeam(members);
    } finally {
      setIsLoading(false);
      setLoaded(true);
    }
  }

  return { team, isLoading, load };
}
