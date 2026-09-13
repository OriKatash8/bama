import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Per-device record of when the client last SAW their price offers: the newest
 * offer's time at the moment they last opened the price offers tab (the "הצעות
 * מחיר" pill on the Projects page). Opening the Projects page alone does not count.
 * Offers have no seen flag in Firestore, so this is tracked locally and persisted
 * across restarts. The bottom Projects tab badge and the pill badge both count
 * against it with the helpers below, so they always agree.
 */
type OffersSeenState = {
  /** userId -> epoch ms of the newest offer seen. */
  lastSeenAt: Record<string, number>;
  markSeen: (userId: string, ts: number) => void;
};

type HasCreatedAt = { createdAt?: { seconds: number } | null };

/** Offers created after `seenMs` (epoch ms). One at exactly `seenMs` is already seen. */
export function unseenOfferCount(items: HasCreatedAt[], seenMs: number): number {
  return items.filter((o) => (o.createdAt?.seconds ?? 0) * 1000 > seenMs).length;
}

/** The newest offer's creation time in ms, or 0 when there are none. */
export function newestOfferMs(items: HasCreatedAt[]): number {
  return items.reduce((max, o) => Math.max(max, (o.createdAt?.seconds ?? 0) * 1000), 0);
}

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
