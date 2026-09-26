import { useEffect, useState } from 'react';
import { useAuthStore } from '@core/stores/authStore';
import { useBlockStore } from '@core/stores/blockStore';
import { listenToUserChats } from '../services/chatService';
import type { Chat } from '../types';

/**
 * Subscribes to the current user's chats with a distinct loading flag so
 * callers can tell "still loading" apart from "no chats" — preventing the
 * empty state from flashing before the first Firestore snapshot arrives.
 */
export function useUserChats() {
  const userId = useAuthStore((s) => s.user?.id);
  const blocked = useBlockStore((s) => s.blocked);
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setChats([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return listenToUserChats(userId, (c) => {
      setChats(c);
      setLoading(false);
    });
  }, [userId]);

  /**
   * Blocked users' DMs are hidden, GROUPS ARE NOT.
   *
   * A group is a project chat: blocking a counterparty must not sabotage paid
   * work that both sides are still owed, and the client is in there too. A DM is
   * the private channel blocking exists to close — see the blocking design note
   * in firestore.rules.
   *
   * Filtered here rather than in listenToUserChats so the subscription stays a
   * pure Firestore concern and the block list can change without re-subscribing.
   */
  const visible = blocked.length === 0
    ? chats
    : chats.filter((c) =>
        c.type !== 'dm' || !(c.members ?? []).some((m) => m !== userId && blocked.includes(m)),
      );

  return { chats: visible, loading };
}
