import { useEffect, useState } from 'react';
import { callFunction } from '@core/firebase/functions';

const getContactPhone = callFunction<
  { projectId: string; userId: string },
  { phone: string | null; email?: string | null }
>('getContactPhone');

/** What the other side shares: their phone, or — with no phone on file — their email. */
export type RevealedContact = { kind: 'phone'; value: string } | { kind: 'email'; value: string };

/**
 * The other side's contact on project details: the professional's for the
 * client, the client's for the professional — once the professional's part has
 * ended. `eligible` is the viewer's own reading of that (the project's
 * endedEngagementIds for the client, their own engagement for the pro), so the
 * server is only asked when it will say yes; it decides for real
 * (getContactPhone → contactPolicy). The phone wins; the email comes only when
 * there is no phone, and the server has already left out unverified and Apple
 * private-relay addresses. A refusal, or nothing to share, is null.
 */
export function useRevealedPhone(projectId: string | undefined, userId: string, eligible: boolean): RevealedContact | null {
  const key = `${projectId}|${userId}`;
  const [result, setResult] = useState<{ key: string; contact: RevealedContact | null } | null>(null);

  useEffect(() => {
    if (!eligible || !projectId) return;
    let active = true;
    getContactPhone({ projectId, userId })
      .then((r) => { if (active) setResult({ key: `${projectId}|${userId}`, contact: toContact(r) }); })
      .catch((err) => console.warn('[phone] not shared:', err?.code ?? err));
    return () => { active = false; };
  }, [projectId, userId, eligible]);

  // Keyed, so a different person or project never shows the last one's contact.
  return eligible && result?.key === key ? result.contact : null;
}

function toContact(r: { phone: string | null; email?: string | null } | null | undefined): RevealedContact | null {
  if (typeof r?.phone === 'string' && r.phone) return { kind: 'phone', value: r.phone };
  if (typeof r?.email === 'string' && r.email) return { kind: 'email', value: r.email };
  return null;
}
