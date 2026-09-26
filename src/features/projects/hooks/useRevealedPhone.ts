import { useEffect, useState } from 'react';
import { callFunction } from '@core/firebase/functions';

const getContactPhone = callFunction<{ projectId: string; userId: string }, { phone: string | null }>('getContactPhone');

/**
 * The other side's phone number on project details: the professional's for the
 * client, the client's for the professional — once the professional's part has
 * ended. `eligible` is the viewer's own reading of that (the project's
 * endedEngagementIds for the client, their own engagement for the pro), so the
 * server is only asked when it will say yes; it decides for real
 * (getContactPhone → contactPolicy). A refusal or a missing number is null.
 */
export function useRevealedPhone(projectId: string | undefined, userId: string, eligible: boolean): string | null {
  const key = `${projectId}|${userId}`;
  const [result, setResult] = useState<{ key: string; phone: string | null } | null>(null);

  useEffect(() => {
    if (!eligible || !projectId) return;
    let active = true;
    getContactPhone({ projectId, userId })
      .then((r) => { if (active) setResult({ key: `${projectId}|${userId}`, phone: r.phone ?? null }); })
      .catch((err) => console.warn('[phone] not shared:', err?.code ?? err));
    return () => { active = false; };
  }, [projectId, userId, eligible]);

  // Keyed, so a different person or project never shows the last one's number.
  return eligible && result?.key === key ? result.phone : null;
}
