import { useState, useEffect } from 'react';
import { useAuthStore } from '@core/stores/authStore';
import { queryDocuments, subscribeToCollectionIn, where } from '@core/firebase/firestore';
import type { BundleOffer, ProjectRequest } from '@core/types/project';

export function useBundleOffers() {
  const user = useAuthStore((s) => s.user);
  const [bundles, setBundles] = useState<BundleOffer[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setBundles([]);
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
        unsubscribe = subscribeToCollectionIn<BundleOffer>(
          'bundleOffers',
          'projectId',
          ids,
          (data) => {
            setBundles(data);
            setIsLoading(false);
          },
          where('status', '==', 'pending'),
        );
      })
      .catch(() => { if (!cancelled) setIsLoading(false); });

    return () => {
      cancelled = true;
      unsubscribe?.();
      setBundles([]);
    };
  }, [user?.id]);

  return { bundles, isLoading };
}
