import { create } from 'zustand';

/**
 * Who the signed-in user has blocked.
 *
 * Held in a store rather than fetched per screen because the list is read on
 * every surface where one user can see another — the chat list, browse, search,
 * the marketplace, community rosters — and re-querying on each would be both
 * slow and easy to forget in a new screen. One live subscription, read
 * everywhere.
 *
 * ONE-DIRECTIONAL BY DESIGN. This holds who *I* blocked. It deliberately does
 * NOT (and cannot) say who blocked me: `users/{uid}/blocks` is readable only by
 * its owner, so nobody can discover they were blocked. That asymmetry is the
 * point — a blocked harasser who knows they were blocked makes a new account.
 * Enforcement of the other direction lives in firestore.rules, which reads both
 * lists server-side where neither client can see the result.
 */
type BlockState = {
  /** uids the current user has blocked. Empty until the first snapshot lands. */
  blocked: string[];
  /** Null before the first snapshot — lets a screen distinguish "nobody blocked"
   *  from "not loaded yet" and avoid a flash of content that then disappears. */
  loaded: boolean;
  setBlocked: (uids: string[]) => void;
  clear: () => void;
};

export const useBlockStore = create<BlockState>((set) => ({
  blocked: [],
  loaded: false,
  setBlocked: (blocked) => set({ blocked, loaded: true }),
  clear: () => set({ blocked: [], loaded: false }),
}));

/** Convenience for the many call sites that just need a predicate. */
export function isBlockedBy(blocked: string[], userId: string | null | undefined): boolean {
  return !!userId && blocked.includes(userId);
}
