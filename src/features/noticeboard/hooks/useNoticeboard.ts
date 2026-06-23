import { useState, useEffect } from 'react';
import { subscribeToCollection, where } from '@core/firebase/firestore';
import type { ProjectRequest, CrewRequestSlot } from '@core/types/project';

export function getVacantSlots(request: ProjectRequest): CrewRequestSlot[] {
  return request.crewSlots
    .map(slot => {
      const filled = (request.filledSlots ?? []).filter(
        f => f.category === slot.category && f.subcategory === slot.subcategory
      ).length;
      return { ...slot, quantity: slot.quantity - filled };
    })
    .filter(slot => slot.quantity > 0);
}

export function filterByProfessionalCategories(
  requests: ProjectRequest[],
  categories: string[]
): ProjectRequest[] {
  if (categories.length === 0) return [];
  return requests.filter(r =>
    getVacantSlots(r).some(slot => categories.includes(slot.category))
  );
}

export function useNoticeboard(professionalCategories: string[]) {
  const [requests, setRequests] = useState<ProjectRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    return subscribeToCollection<ProjectRequest>(
      'projects',
      (data) => {
        const sorted = [...data].sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
        const vacant = sorted.filter(r => getVacantSlots(r).length > 0);
        setRequests(filterByProfessionalCategories(vacant, professionalCategories));
        setIsLoading(false);
      },
      where('status', '==', 'open')
    );
  }, [professionalCategories]);

  return { requests, isLoading };
}
