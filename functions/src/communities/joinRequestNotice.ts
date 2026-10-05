/**
 * The owner's push for a new invite join request: text and the dedupe id. Pure,
 * so it is unit-tested; the trigger in invites.ts does the reads and the write.
 */
export type Lang = 'he' | 'en';

/** A display name is user-typed: keep one absurd name from becoming an absurd push. */
const MAX_NAME = 60;
const clip = (s: string) => (s.length > MAX_NAME ? `${s.slice(0, MAX_NAME - 1)}…` : s);

export const JOIN_REQUEST_NOTIFICATION_TYPE = 'community_join_request';

export function joinRequestNotice(
  lang: Lang,
  p: { communityName: unknown; requesterName: unknown },
): { title: string; message: string } {
  const community = typeof p.communityName === 'string' ? p.communityName.trim() : '';
  const requester = typeof p.requesterName === 'string' ? p.requesterName.trim() : '';
  const suffix = lang === 'he' ? 'בקשת הצטרפות' : 'Join request';
  const who = requester ? clip(requester) : lang === 'he' ? 'מישהו' : 'Someone';
  return {
    title: community ? `${clip(community)} · ${suffix}` : 'BAMA',
    message: lang === 'he' ? `${who} ביקש/ה להצטרף לקהילה` : `${who} asked to join your community`,
  };
}

/**
 * Trigger events are delivered at least once. Keying the notification doc on the
 * EVENT id and creating it (not adding) makes a redelivery a no-op instead of a
 * second push.
 */
export const joinRequestNotificationId = (eventId: string) => `communityJoinRequest_${eventId}`;
