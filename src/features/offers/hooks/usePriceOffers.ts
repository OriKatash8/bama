import { useState, useEffect } from 'react';
import { useAuthStore } from '@core/stores/authStore';
import { queryDocuments, subscribeToCollectionIn, where } from '@core/firebase/firestore';
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
        // Chunked: an `in` list longer than the rules' 20-get budget is denied
        // outright, which used to blank this page for any client with more than
        // ~20 projects. See subscribeToCollectionIn.
        unsubscribe = subscribeToCollectionIn<PriceOffer>(
          'priceOffers',
          'projectId',
          ids,
          (data) => {
            setOffers(data);
            setIsLoading(false);
          },
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
