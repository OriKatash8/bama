import { useState } from 'react';
import { useAuthStore } from '@core/stores/authStore';
import { addDocument } from '@core/firebase/firestore';

export function useProjectApplication() {
  const user = useAuthStore((s) => s.user);
  const [applying, setApplying] = useState<string | null>(null);

  async function apply(projectId: string): Promise<void> {
    if (!user) return;
    setApplying(projectId);
    try {
      await addDocument('projectApplications', {
        projectId,
        professionalId: user.id,
        status: 'pending' as const,
        createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
      });
    } finally {
      setApplying(null);
    }
  }

  return { apply, applying };
}
