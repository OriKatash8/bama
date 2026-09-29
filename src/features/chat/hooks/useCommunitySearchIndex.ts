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

/** A community has channels; every other chat keeps its messages flat. */
export type SearchKind = 'community' | 'chat';

function toSearchable(docs: { id: string; data: () => unknown }[], channelId: string, channelName: string): SearchableMessage[] {
  return docs
    .map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }))
    .filter((d) => isSearchable(d.data))
    .map((d): SearchableMessage => ({
      id: d.id,
      channelId,
      channelName,
      senderId: String(d.data.senderId ?? ''),
      text: d.data.text as string,
      timestamp: (d.data.timestamp ?? null) as SearchableMessage['timestamp'],
    }));
}

/**
 * A chat's messages, loaded ONCE for the search screen: a community's from
 * every channel, any other chat's from chats/{id}/messages with channel ''
 * (what the room's activeChannelId holds outside a community, so the jump back
 * needs no channel switch).
 *
 * Not live: search filters on every keystroke (searchMessages), so the list must
 * hold still while the user types, and a message sent meanwhile is not what they
 * are looking for. Opening search reads the whole community once — fine at
 * today's sizes; a server-side index is the upgrade if communities grow large.
 * Members only by rule; for anyone else the reads fail and status is 'error'.
 */
export function useCommunitySearchIndex(chatId: string | undefined, kind: SearchKind = 'community'): SearchIndex {
  const [index, setIndex] = useState<SearchIndex & { chatId?: string }>({ status: 'loading', messages: [] });

  useEffect(() => {
    if (!chatId) return;
    let active = true;
    (async () => {
      if (kind === 'chat') {
        const snap = await getDocs(collection(db, 'chats', chatId, 'messages'));
        if (active) setIndex({ chatId, status: 'ready', messages: toSearchable(snap.docs, '', '') });
        return;
      }
      const channels = await getDocs(collection(db, 'chats', chatId, 'channels'));
      const perChannel = await Promise.all(channels.docs.map(async (ch) => {
        const channelName = String((ch.data() as { name?: unknown }).name ?? '');
        const snap = await getDocs(collection(db, 'chats', chatId, 'channels', ch.id, 'messages'));
        return toSearchable(snap.docs, ch.id, channelName);
      }));
      if (active) setIndex({ chatId, status: 'ready', messages: perChannel.flat() });
    })().catch((err) => {
      console.warn('[useCommunitySearchIndex] load failed (not a member?)', err);
      if (active) setIndex({ chatId, status: 'error', messages: [] });
    });
    return () => { active = false; };
  }, [chatId, kind]);

  // Keyed by chat, so a different chat id reads as loading without a reset.
  return index.chatId === chatId && chatId ? index : { status: 'loading', messages: [] };
}
