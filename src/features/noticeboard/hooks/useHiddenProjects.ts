import { useEffect, useState } from 'react';
import { arrayRemove } from 'firebase/firestore';
import { useAuthStore } from '@core/stores/authStore';
import { subscribeToDocument, getDocument, updateDocument } from '@core/firebase/firestore';
import type { ProjectRequest } from '@core/types/project';

/**
 * Projects the professional dismissed (users/{uid}.dismissedNotices) that are
 * still restorable — i.e. the doc exists and is still open. `enabled` gates the
 * subscription so it only runs while the History sheet is visible.
 */
export function useHiddenProjects(enabled: boolean) {
  const uid = useAuthStore((s) => s.user?.id);
  const [ids, setIds] = useState<string[]>([]);
  const [projects, setProjects] = useState<ProjectRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid || !enabled) { setIds([]); return; }
    return subscribeToDocument<{ dismissedNotices?: string[] }>(
      `users/${uid}`, (d) => setIds(d?.dismissedNotices ?? []),
    );
  }, [uid, enabled]);

  useEffect(() => {
    if (!enabled) { setProjects([]); setLoading(false); return; }
    let active = true;
    setLoading(true);
    (async () => {
      const docs = await Promise.all(
        ids.map((id) =>
          getDocument<ProjectRequest>(`projects/${id}`)
            .then((p) => (p ? { ...p, id } : null))
            .catch(() => null),
        ),
      );
      if (!active) return;
      // Only existing, still-open projects can be restored to the noticeboard.
      setProjects(docs.filter((p): p is ProjectRequest => !!p && p.status === 'open'));
      setLoading(false);
    })();
    return () => { active = false; };
  }, [ids, enabled]);

  async function restore(projectId: string): Promise<void> {
    if (!uid) return;
    await updateDocument(`users/${uid}`, { dismissedNotices: arrayRemove(projectId) } as never);
  }

  return { projects, loading, restore };
}
