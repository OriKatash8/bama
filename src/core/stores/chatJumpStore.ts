import { create } from 'zustand';

export type ChatJump = { chatId: string; channelId: string; messageId: string };

/**
 * "Open this chat at this message" — set by community search just before it
 * pops back to the room, taken by the room when it regains focus. Navigation
 * cannot carry it: going back to a screen already in the stack does not give it
 * new params. In memory only, and taken once.
 */
type ChatJumpState = {
  pending: ChatJump | null;
  request: (jump: ChatJump) => void;
  /** This chat's request, if any, cleared as it is read. */
  take: (chatId: string) => ChatJump | null;
};

export const useChatJumpStore = create<ChatJumpState>((set, get) => ({
  pending: null,
  request: (jump) => set({ pending: jump }),
  take: (chatId) => {
    const p = get().pending;
    if (!p || p.chatId !== chatId) return null;
    set({ pending: null });
    return p;
  },
}));
