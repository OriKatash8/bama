import { useState, useEffect } from 'react';
import { useAuthStore } from '@core/stores/authStore';
import { queryDocuments, subscribeToCollection, where } from '@core/firebase/firestore';
import type { PriceOffer, ProjectRequest } from '@core/types/project';

export function usePriceOffers() {
  const user = useAuthStore((s) => s.user);
  const [offers, setOffers] = useState<PriceOffer[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setIsLoading(true);
    let unsubscribe: (() => void) | undefined;

    queryDocuments<ProjectRequest>('projects', where('clientId', '==', user.id))
      .then((projects) => {
        if (projects.length === 0) {
          setIsLoading(false);
          return;
        }
        const ids = projects.map((p) => p.id);
        unsubscribe = subscribeToCollection<PriceOffer>(
          'priceOffers',
          (data) => {
            setOffers(data);
            setIsLoading(false);
          },
          where('projectId', 'in', ids),
          where('status', '==', 'pending')
        );
      })
      .catch(() => setIsLoading(false));

    return () => { unsubscribe?.(); };
  }, [user?.id]);

  return { offers, isLoading };
}
