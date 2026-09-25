import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@core/firebase/config';
import type { SearchableMessage } from '../search/searchMessages';

export type SearchIndex = {
  status: 'loading' | 'ready' | 'error';
  messages: SearchableMessage[];
};

/** Nothing anyone searches for: listing cards, system notices, bare media. */
function isSearchable(data: Record<string, unknown>): boolean {
  if (data.type === 'listing') return false;
  if (data.system || data.senderId === 'system') return false;
  return typeof data.text === 'string' && data.text.trim().length > 0;
}

/**
 * A community's messages, from every channel, loaded ONCE for the search screen.
 *
 * Not live: search filters on every keystroke (searchMessages), so the list must
 * hold still while the user types, and a message sent meanwhile is not what they
 * are looking for. Opening search reads the whole community once — fine at
 * today's sizes; a server-side index is the upgrade if communities grow large.
 * Members only by rule; for anyone else the reads fail and status is 'error'.
 */
export function useCommunitySearchIndex(chatId: string | undefined): SearchIndex {
  const [index, setIndex] = useState<SearchIndex & { chatId?: string }>({ status: 'loading', messages: [] });

  useEffect(() => {
    if (!chatId) return;
    let active = true;
    (async () => {
      const channels = await getDocs(collection(db, 'chats', chatId, 'channels'));
      const perChannel = await Promise.all(channels.docs.map(async (ch) => {
        const channelName = String((ch.data() as { name?: unknown }).name ?? '');
        const snap = await getDocs(collection(db, 'chats', chatId, 'channels', ch.id, 'messages'));
        return snap.docs
          .map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }))
          .filter((d) => isSearchable(d.data))
          .map((d): SearchableMessage => ({
            id: d.id,
            channelId: ch.id,
            channelName,
            senderId: String(d.data.senderId ?? ''),
            text: d.data.text as string,
            timestamp: (d.data.timestamp ?? null) as SearchableMessage['timestamp'],
          }));
      }));
      if (active) setIndex({ chatId, status: 'ready', messages: perChannel.flat() });
    })().catch((err) => {
      console.warn('[useCommunitySearchIndex] load failed (not a member?)', err);
      if (active) setIndex({ chatId, status: 'error', messages: [] });
    });
    return () => { active = false; };
  }, [chatId]);

  // Keyed by chat, so a different chat id reads as loading without a reset.
  return index.chatId === chatId && chatId ? index : { status: 'loading', messages: [] };
}
