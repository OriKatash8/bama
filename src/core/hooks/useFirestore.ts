import { useState, useEffect } from 'react';
import { subscribeToDocument } from '@core/firebase/firestore';
import type { LoadingState } from '@core/types/common';

export function useFirestoreDoc<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<LoadingState>('idle');

  useEffect(() => {
    if (!path) return;
    setState('loading');
    const unsubscribe = subscribeToDocument<T>(path, (result) => {
      setData(result);
      setState('success');
    });
    return unsubscribe;
  }, [path]);

  return { data, state };
}
