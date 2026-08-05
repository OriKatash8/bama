import { useState, useEffect, useRef } from 'react';
import { subscribeToCollection, getDocument, where } from '@core/firebase/firestore';
import type { ProjectRequest, CrewRequestSlot } from '@core/types/project';
import type { User } from '@core/types/user';

export type PosterInfo = { displayName: string; photoURL: string | null };

export function getVacantSlots(request: ProjectRequest): CrewRequestSlot[] {
  return request.crewSlots
    .map(slot => {
      const filled = (request.filledSlots ?? []).filter(
        f => f.category === slot.category
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

export function useNoticeboard(
  professionalCategories: string[] | null,
  currentUserId: string | undefined,
) {
  const [requests, setRequests] = useState<ProjectRequest[]>([]);
  const [posters, setPosters] = useState<Record<string, PosterInfo>>({});
  const [isLoading, setIsLoading] = useState(true);
  const posterCacheRef = useRef<Map<string, PosterInfo>>(new Map());
  const categoriesKey = professionalCategories === null ? null : professionalCategories.join(',');

  useEffect(() => {
    if (professionalCategories === null) return;

    return subscribeToCollection<ProjectRequest>(
      'projects',
      async (data) => {
        const sorted = [...data].sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
        const withVacancy = sorted.filter(r => getVacantSlots(r).length > 0);

        // Direct projects addressed to this professional — bypass skill filter, show first
        const directProjects = currentUserId
          ? withVacancy.filter(r => r.targetProfessionalId != null && r.targetProfessionalId === currentUserId)
          : [];

        // Regular projects (no targetProfessionalId) — apply skill filter
        const regularOpen = withVacancy.filter(r => r.targetProfessionalId == null);
        const regularFiltered = filterByProfessionalCategories(regularOpen, professionalCategories);

        const filtered = [...directProjects, ...regularFiltered];
        setRequests(filtered);

        const uniqueClientIds = [...new Set(filtered.map(r => r.clientId))];
        const missing = uniqueClientIds.filter(id => !posterCacheRef.current.has(id));
        if (missing.length > 0) {
          const fetched = await Promise.all(
            missing.map(async (id) => {
              const user = await getDocument<User>(`users/${id}`);
              return [id, user ? { displayName: user.displayName, photoURL: user.photoURL } : null] as const;
            })
          );
          for (const [id, info] of fetched) {
            if (info !== null) posterCacheRef.current.set(id, info);
          }
        }

        setPosters(
          Object.fromEntries(
            uniqueClientIds
              .filter(id => posterCacheRef.current.has(id))
              .map(id => [id, posterCacheRef.current.get(id)!])
          )
        );

        setIsLoading(false);
      },
      where('status', '==', 'open')
    );
  }, [categoriesKey, currentUserId]);

  return { requests, posters, isLoading };
}
