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
 * The owner is told about one person's request to one community at most once per this
 * window, however many times that person cancels and asks again. The rules let a requester
 * delete a pending request and create a new one, so nothing ON the request can remember
 * (it is deleted with it): the memory is the server-only doc at joinRequestNoticePath.
 */
export const JOIN_REQUEST_NOTIFY_COOLDOWN_MS = 60 * 60 * 1000;

/** `chats/{chatId}/joinRequestNotices/{uid}`: { lastNotifiedAt }. Written only by the trigger; the rules deny clients (no rule matches it, so the catch-all applies). */
export const joinRequestNoticePath = (chatId: string, requesterUid: string) =>
  `chats/${chatId}/joinRequestNotices/${requesterUid}`;

/**
 * Whether to notify, given when this requester last caused a notification to this community.
 * No stamp, or one we cannot read, notifies. A stamp from further in the future than the
 * cooldown (clock trouble) is not trusted either, so it can never silence an owner for good.
 */
export function shouldNotify(
  lastNotifiedAtMs: number | null | undefined,
  nowMs: number,
  cooldownMs: number = JOIN_REQUEST_NOTIFY_COOLDOWN_MS,
): boolean {
  if (typeof lastNotifiedAtMs !== 'number' || !Number.isFinite(lastNotifiedAtMs)) return true;
  const elapsed = nowMs - lastNotifiedAtMs;
  if (elapsed < -cooldownMs) return true;
  return elapsed >= cooldownMs;
}

/**
 * Trigger events are delivered at least once. Keying the notification doc on the
 * EVENT id and creating it (not adding) makes a redelivery a no-op instead of a
 * second push.
 */
export const joinRequestNotificationId = (eventId: string) => `communityJoinRequest_${eventId}`;
