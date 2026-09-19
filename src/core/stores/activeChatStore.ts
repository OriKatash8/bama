import { create } from 'zustand';

/**
 * The chat the user has on screen right now — and, in a community, the channel
 * they are reading. Set by the chat room while it is focused, cleared when it
 * loses focus. In memory only: after a restart nobody is inside a chat.
 */
type ActiveChatState = {
  chatId: string | null;
  /** Community channel on screen; null for a 1:1 / group / purchase chat. */
  channelId: string | null;
  setActive: (chatId: string, channelId: string | null) => void;
  clear: (chatId: string) => void;
};

export const useActiveChatStore = create<ActiveChatState>((set, get) => ({
  chatId: null,
  channelId: null,
  setActive: (chatId, channelId) => set({ chatId, channelId }),
  // Only clears if it still points at this chat, so leaving one room can't wipe
  // the room that was opened on top of it.
  clear: (chatId) => {
    if (get().chatId === chatId) set({ chatId: null, channelId: null });
  },
}));

/**
 * True when a push is a new message in the very chat (and channel) on screen —
 * the user is already reading it, so the banner and sound add nothing.
 */
export function isForActiveChat(data: Record<string, unknown> | null | undefined): boolean {
  if (!data || data.type !== 'message' || typeof data.chatId !== 'string') return false;
  const { chatId, channelId } = useActiveChatStore.getState();
  if (chatId == null || data.chatId !== chatId) return false;
  // A community message names its channel: suppress only the one on screen.
  if (typeof data.channelId === 'string') return data.channelId === channelId;
  return true;
}
