import { useState, useEffect } from 'react';
import { subscribeToCollection, where } from '@core/firebase/firestore';
import type { ProjectRequest } from '@core/types/project';

export function useNoticeboard() {
  const [requests, setRequests] = useState<ProjectRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    return subscribeToCollection<ProjectRequest>(
      'projects',
      (data) => {
        const sorted = [...data].sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
        setRequests(sorted);
        setIsLoading(false);
      },
      where('status', '==', 'open')
    );
  }, []);

  return { requests, isLoading };
}
