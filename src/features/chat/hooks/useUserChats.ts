import { useEffect, useState } from 'react';
import { useAuthStore } from '@core/stores/authStore';
import { listenToUserChats } from '../services/chatService';
import type { Chat } from '../types';

/**
 * Subscribes to the current user's chats with a distinct loading flag so
 * callers can tell "still loading" apart from "no chats" — preventing the
 * empty state from flashing before the first Firestore snapshot arrives.
 */
export function useUserChats() {
  const userId = useAuthStore((s) => s.user?.id);
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

  return { chats, loading };
}
