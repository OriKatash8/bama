import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Per-device record of when the client last "saw" their price offers, used to
 * badge the Projects tab for offers newer than that. Offers have no seen flag
 * in Firestore, so this is tracked locally (persisted across restarts).
 */
type OffersSeenState = {
  /** userId -> epoch ms of the newest offer seen. */
  lastSeenAt: Record<string, number>;
  markSeen: (userId: string, ts: number) => void;
};

const nativeOrWebStorage: StateStorage =
  typeof window !== 'undefined' && (window as unknown as { localStorage?: StateStorage }).localStorage
    ? (window as unknown as { localStorage: StateStorage }).localStorage
    : (AsyncStorage as unknown as StateStorage);

export const useOffersSeenStore = create<OffersSeenState>()(
  persist(
    (set, get) => ({
      lastSeenAt: {},
      markSeen: (userId, ts) => {
        const current = get().lastSeenAt[userId] ?? 0;
        if (ts > current) {
          set({ lastSeenAt: { ...get().lastSeenAt, [userId]: ts } });
        }
      },
    }),
    {
      name: 'bama-offers-seen',
      storage: createJSONStorage(() => nativeOrWebStorage),
      partialize: (state) => ({ lastSeenAt: state.lastSeenAt }),
    },
  ),
);
