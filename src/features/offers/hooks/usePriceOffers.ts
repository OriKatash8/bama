import { useState, useEffect } from 'react';
import { useAuthStore } from '@core/stores/authStore';
import { queryDocuments, subscribeToCollection, where } from '@core/firebase/firestore';
import type { PriceOffer, ProjectRequest } from '@core/types/project';

export function usePriceOffers() {
  const user = useAuthStore((s) => s.user);
  const [offers, setOffers] = useState<PriceOffer[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setOffers([]);
      return;
    }
    setIsLoading(true);
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    queryDocuments<ProjectRequest>('projects', where('clientId', '==', user.id))
      .then((projects) => {
        if (cancelled) return;
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
      .catch(() => { if (!cancelled) setIsLoading(false); });

    return () => {
      cancelled = true;
      unsubscribe?.();
      setOffers([]);
    };
  }, [user?.id]);

  return { offers, isLoading };
}
