import { useCallback, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { useAuthStore } from '@core/stores/authStore';

/** Newest-first, and how many a user document keeps. */
export const MAX_PENDING_MENTIONS = 50;

export type PendingMention = {
  chatId: string;
  /** null for a group chat; the channel id for a community. */
  channelId: string | null;
  messageId: string;
  at?: { seconds: number } | null;
};

/** Oldest first, so "the one to jump to" is simply the first match. */
function byAge(a: PendingMention, b: PendingMention): number {
  return (a.at?.seconds ?? 0) - (b.at?.seconds ?? 0);
}

/**
 * Mentions waiting for this user, written by the message triggers.
 *
 * SEPARATE FROM `unreadCount`, deliberately. An unread count means "activity";
 * a mention means "someone needs you". Deriving one from the other would tie
 * the @ pill to a counter that community channels never bump at all — they have
 * no unread state — so the pill would simply never appear there.
 *
 * That independence is also what lets clearing work through ONE path for both
 * group chats and channels.
 */
export function usePendingMentions(): {
  /** Oldest-first, capped. */
  all: PendingMention[];
  /** chatIds with at least one mention waiting — what the chat list reads. */
  chatIds: Set<string>;
  /** The mention to jump to on opening this chat/channel, oldest first. */
  firstFor: (chatId: string, channelId: string | null) => PendingMention | undefined;
  /** Drop every entry for this chat/channel. Safe to call with none. */
  clear: (chatId: string, channelId: string | null) => Promise<void>;
} {
  const userId = useAuthStore((s) => s.user?.id);
  const [raw, setRaw] = useState<PendingMention[]>([]);

  useEffect(() => {
    if (!userId) return;
    return onSnapshot(doc(db, 'users', userId), (snap) => {
      setRaw((snap.data()?.pendingMentions as PendingMention[] | undefined) ?? []);
    }, () => setRaw([]));
  }, [userId]);

  // Derived, not stored: signing out must empty this WITHOUT a setState inside
  // the effect, which would be a cascading render.
  //
  // The server appends with arrayUnion and does not cap — capping there would
  // cost one read per recipient, which is exactly the fan-out cost the trigger
  // exists to avoid. The newest MAX are kept here instead, and `clear` writes
  // the trimmed list back.
  const all = useMemo(
    () => (userId ? [...raw].sort(byAge).slice(-MAX_PENDING_MENTIONS) : []),
    [userId, raw],
  );

  const firstFor = useCallback(
    (chatId: string, channelId: string | null) =>
      all.find((m) => m.chatId === chatId && (m.channelId ?? null) === channelId),
    [all],
  );

  const clear = useCallback(
    async (chatId: string, channelId: string | null) => {
      if (!userId) return;
      const keep = all.filter((m) => !(m.chatId === chatId && (m.channelId ?? null) === channelId));
      // The rule only lets the owner SHRINK this list, so a write that changes
      // nothing would be denied — and there is nothing to do anyway.
      if (keep.length === all.length) return;
      await updateDoc(doc(db, 'users', userId), { pendingMentions: keep });
    },
    [userId, all],
  );

  return { all, chatIds: new Set(all.map((m) => m.chatId)), firstFor, clear };
}
