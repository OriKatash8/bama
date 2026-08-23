import { useState, useEffect, useRef } from 'react';
import { subscribeToCollection, getDocument, updateDocument, arrayUnion, where } from '@core/firebase/firestore';
import type { ProjectRequest } from '@core/types/project';
import type { User } from '@core/types/user';
import {
  getVacantSlots,
  professionalMatchesProject,
  type RoleSkillEntry,
} from '@features/noticeboard/matching';

export type PosterInfo = { displayName: string; photoURL: string | null };

// Re-exported for existing consumers (e.g. ProjectDetailModal, tests).
export { getVacantSlots } from '@features/noticeboard/matching';

export function useNoticeboard(
  professionalRoleSkills: RoleSkillEntry[] | null,
  currentUserId: string | undefined,
) {
  const [requests, setRequests] = useState<ProjectRequest[]>([]);
  const [posters, setPosters] = useState<Record<string, PosterInfo>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const posterCacheRef = useRef<Map<string, PosterInfo>>(new Map());
  const roleSkillsKey = professionalRoleSkills === null ? null : JSON.stringify(professionalRoleSkills);

  useEffect(() => {
    if (!currentUserId) return;
    getDocument<{ dismissedNotices?: string[] }>(`users/${currentUserId}`)
      .then((doc) => {
        if (doc?.dismissedNotices?.length) {
          setDismissed(new Set(doc.dismissedNotices));
        }
      })
      .catch(() => {});
  }, [currentUserId]);

  async function dismiss(projectId: string) {
    if (!currentUserId) return;
    setDismissed((prev) => new Set([...prev, projectId]));
    updateDocument(`users/${currentUserId}`, {
      dismissedNotices: arrayUnion(projectId),
    }).catch(() => {});
  }

  useEffect(() => {
    if (professionalRoleSkills === null) return;
    const roleSkills = professionalRoleSkills;

    return subscribeToCollection<ProjectRequest>(
      'projects',
      async (data) => {
        const sorted = [...data].sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
        const withVacancy = sorted.filter(r => getVacantSlots(r).length > 0 && r.clientId !== currentUserId);

        // Direct projects addressed to this professional — bypass skill filter, show first
        const directProjects = currentUserId
          ? withVacancy.filter(r => r.targetProfessionalId != null && r.targetProfessionalId === currentUserId)
          : [];

        // Regular projects (no targetProfessionalId) — capability-aware skill filter
        const regularOpen = withVacancy.filter(r => r.targetProfessionalId == null);
        const regularFiltered = regularOpen.filter(r => professionalMatchesProject(roleSkills, r));

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
  }, [roleSkillsKey, currentUserId]);

  const visible = requests.filter((r) => !dismissed.has(r.id));

  return { requests: visible, posters, isLoading, dismiss };
}
