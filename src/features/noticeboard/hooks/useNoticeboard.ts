import { useState, useEffect } from 'react';
import { subscribeToCollection, where } from '@core/firebase/firestore';
import type { ProjectRequest, CrewRequestSlot } from '@core/types/project';

export function getVacantSlots(request: ProjectRequest): CrewRequestSlot[] {
  return request.crewSlots
    .map(slot => {
      const filled = request.filledSlots.filter(
        f => f.category === slot.category && f.subcategory === slot.subcategory
      ).length;
      return { ...slot, quantity: slot.quantity - filled };
    })
    .filter(slot => slot.quantity > 0);
}

export function useNoticeboard() {
  const [requests, setRequests] = useState<ProjectRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    return subscribeToCollection<ProjectRequest>(
      'projects',
      (data) => {
        const sorted = [...data].sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
        setRequests(sorted.filter(r => getVacantSlots(r).length > 0));
        setIsLoading(false);
      },
      where('status', '==', 'open')
    );
  }, []);

  return { requests, isLoading };
}
