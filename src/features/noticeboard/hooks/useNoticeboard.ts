import { useState, useEffect } from 'react';
import { subscribeToCollection, getDocument, where } from '@core/firebase/firestore';
import type { ProjectRequest, CrewRequestSlot } from '@core/types/project';
import type { User } from '@core/types/user';

export type PosterInfo = { displayName: string; photoURL: string | null };

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
  const [posters, setPosters] = useState<Record<string, PosterInfo>>({});
  const [isLoading, setIsLoading] = useState(true);
  const categoriesKey = professionalCategories.join(',');

  useEffect(() => {
    return subscribeToCollection<ProjectRequest>(
      'projects',
      async (data) => {
        const sorted = [...data].sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
        const vacant = sorted.filter(r => getVacantSlots(r).length > 0);
        const filtered = filterByProfessionalCategories(vacant, professionalCategories);
        setRequests(filtered);

        const uniqueClientIds = [...new Set(filtered.map(r => r.clientId))];
        const entries = await Promise.all(
          uniqueClientIds.map(async (id) => {
            const user = await getDocument<User>(`users/${id}`);
            return [id, user ? { displayName: user.displayName, photoURL: user.photoURL } : null] as const;
          })
        );
        setPosters(
          Object.fromEntries(entries.filter((e): e is [string, PosterInfo] => e[1] !== null))
        );

        setIsLoading(false);
      },
      where('status', '==', 'open')
    );
  }, [categoriesKey]);

  return { requests, posters, isLoading };
}
