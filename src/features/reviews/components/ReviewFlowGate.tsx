import { useEffect, useState } from 'react';
import { useAuthStore } from '@core/stores/authStore';
import { getDocument, queryDocuments, where } from '@core/firebase/firestore';
import type { ProjectRequest } from '@core/types/project';
import { ReviewFlow, type ReviewProfessional } from './ReviewFlow';

type GateData = {
  projectId: string;
  professionals: ReviewProfessional[];
};

export function ReviewFlowGate() {
  const user = useAuthStore((s) => s.user);
  const [gateData, setGateData] = useState<GateData | null>(null);

  useEffect(() => {
    if (!user) {
      setGateData(null);
      return;
    }

    let cancelled = false;

    async function checkPendingReviews() {
      if (!user) return;
      console.log('[ReviewFlowGate] checking for userId:', user.id);
      try {
        const projects = await queryDocuments<ProjectRequest>(
          'projects',
          where('clientId', '==', user.id),
        );
        console.log('[ReviewFlowGate] total projects found:', projects.length);
        const pending = projects.filter(
          (p) => p.status === 'completed' && p.reviewsCompleted === false,
        );
        console.log('[ReviewFlowGate] pending review projects:', pending.length, pending.map(p => ({ id: p.id, reviewsCompleted: p.reviewsCompleted, status: p.status })));
        if (cancelled || pending.length === 0) return;

        const project = pending[0];
        const filledSlots = project.filledSlots ?? [];
        const uniqueProfIds = [...new Set(filledSlots.map((s) => s.professionalId))];
        console.log('[ReviewFlowGate] uniqueProfIds:', uniqueProfIds);
        if (uniqueProfIds.length === 0) return;

        const profUsers = await Promise.all(
          uniqueProfIds.map((id) =>
            getDocument<{ displayName: string; photoURL?: string }>(`users/${id}`),
          ),
        );
        if (cancelled) return;

        const professionals: ReviewProfessional[] = uniqueProfIds.flatMap((id, i) => {
          const u = profUsers[i];
          if (!u) return [];
          const roles = filledSlots
            .filter((s) => s.professionalId === id)
            .map((s) => s.category)
            .join(' | ');
          return [{ id, displayName: u.displayName, photoURL: u.photoURL ?? null, role: roles }];
        });

        console.log('[ReviewFlowGate] resolved professionals:', professionals.length);
        if (professionals.length > 0) {
          console.log('[ReviewFlowGate] setting gateData — overlay will show');
          setGateData({ projectId: project.id, professionals });
        } else {
          console.log('[ReviewFlowGate] no professionals resolved (user docs missing?) — not showing overlay');
        }
      } catch (err) {
        console.error('[ReviewFlowGate] checkPendingReviews error:', err);
      }
    }

    void checkPendingReviews();
    return () => { cancelled = true; };
  }, [user?.id]);

  if (!gateData || !user) return null;

  return (
    <ReviewFlow
      visible
      projectId={gateData.projectId}
      clientId={user.id}
      clientDisplayName={user.displayName ?? ''}
      professionals={gateData.professionals}
      onComplete={() => setGateData(null)}
    />
  );
}
