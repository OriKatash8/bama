import { useState, useEffect } from 'react';
import { useAuthStore } from '@core/stores/authStore';
import { addDocument, subscribeToCollection, where, updateDocument, deleteDocument } from '@core/firebase/firestore';
import type { ProjectRequest, CrewRequestSlot } from '@core/types/project';

type SubmitDetails = {
  title: string;
  description: string;
  date: string;
  location: string;
};

export function useProjectRequests() {
  const user = useAuthStore((s) => s.user);
  const [requests, setRequests] = useState<ProjectRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return subscribeToCollection<ProjectRequest>(
      'projects',
      (data) => {
        const sorted = [...data].sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
        setRequests(sorted);
        setIsLoading(false);
      },
      where('clientId', '==', user.id)
    );
  }, [user?.id]);

  async function submit(slots: CrewRequestSlot[], details: SubmitDetails): Promise<void> {
    if (!user) return;
    setError(null);
    try {
      await addDocument('projects', {
        clientId: user.id,
        crewSlots: slots,
        filledSlots: [],
        ...details,
        status: 'open' as const,
        createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
      });
    } catch (e: any) {
      const message = e.message ?? 'Failed to submit request';
      setError(message);
      throw e;
    }
  }

  async function updateProject(
    id: string,
    slots: CrewRequestSlot[],
    details: SubmitDetails
  ): Promise<void> {
    setError(null);
    try {
      await updateDocument(`projects/${id}`, { crewSlots: slots, ...details });
    } catch (e: any) {
      const message = e.message ?? 'Failed to update project';
      setError(message);
      throw e;
    }
  }

  async function deleteProject(id: string): Promise<void> {
    setError(null);
    try {
      await deleteDocument(`projects/${id}`);
    } catch (e: any) {
      const message = e.message ?? 'Failed to delete project';
      setError(message);
      throw e;
    }
  }

  return { requests, isLoading, error, submit, updateProject, deleteProject };
}
