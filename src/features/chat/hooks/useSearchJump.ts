import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useChatJumpStore, type ChatJump } from '@core/stores/chatJumpStore';

/**
 * The chat room's half of "tap a search result": when the room regains focus
 * with a request waiting for it (chatJumpStore), switch to the result's channel
 * and jump to the message once that channel's messages include it.
 *
 * `jump` does the same for a result picked without leaving the room.
 *
 * The wait matters: right after the switch the list still holds the previous
 * channel's messages, and jumpToMessage on an id that is not in the list is a
 * silent no-op. So the request is held in a ref and retried on every change of
 * channel or messages until it lands, then dropped — it jumps once.
 */
export function useSearchJump({
  chatId,
  activeChannelId,
  messageIds,
  setActiveChannelId,
  jumpToMessage,
}: {
  chatId: string;
  activeChannelId: string;
  messageIds: string[];
  setActiveChannelId: (id: string) => void;
  jumpToMessage: (messageId: string) => void;
}) {
  const pendingRef = useRef<ChatJump | null>(null);
  // Bumped when a request is taken, so the effect below runs even when neither
  // the channel nor the messages change (already on that channel, all loaded).
  const [taken, setTaken] = useState(0);

  /** Hold a jump until it lands. Also returned, for a result picked on the
   *  room itself (the search sheet), where there is no focus change to wait for. */
  const jump = useCallback((j: ChatJump) => {
    pendingRef.current = j;
    setActiveChannelId(j.channelId);
    setTaken((n) => n + 1);
  }, [setActiveChannelId]);

  useFocusEffect(
    useCallback(() => {
      const j = useChatJumpStore.getState().take(chatId);
      if (j) jump(j);
    }, [chatId, jump]),
  );

  useEffect(() => {
    const p = pendingRef.current;
    if (!p || p.channelId !== activeChannelId || !messageIds.includes(p.messageId)) return;
    pendingRef.current = null;
    jumpToMessage(p.messageId);
  }, [taken, activeChannelId, messageIds, jumpToMessage]);

  return { jump };
}
