import { useEffect, useRef, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, orderBy, query, where, type Timestamp } from 'firebase/firestore';
import { db } from '@core/firebase/config';
import type { CommunityEvent } from './aggregate';

/**
 * Live data for the owner dashboard. Everything that is a list is an
 * onSnapshot listener. The list queries (requests, events, stats) are only
 * provable in the rules for the OWNER, so they only run with `enabled` —
 * otherwise a non-owner would get a permission error that looks like "empty".
 */

const toDate = (v: unknown): Date | null => ((v as Timestamp | null)?.toDate ? (v as Timestamp).toDate() : null);
// A write this device just made carries a pending serverTimestamp; estimate it
// rather than rendering the row with no time.
const SNAP = { serverTimestamps: 'estimate' } as const;

export type CommunityInfo = {
  id: string;
  name: string;
  ownerId: string;
  members: string[];
  photoURL: string | null;
};

export function useCommunity(chatId: string | undefined) {
  const [community, setCommunity] = useState<CommunityInfo | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!chatId) return;
    return onSnapshot(
      doc(db, 'chats', chatId),
      (snap) => {
        const d = snap.data();
        setCommunity(
          snap.exists() && d?.type === 'community'
            ? {
                id: snap.id,
                name: (d.name as string) ?? '',
                ownerId: (d.ownerId as string) ?? '',
                members: (d.members as string[]) ?? [],
                photoURL: (d.photoURL as string | undefined) ?? null,
              }
            : null,
        );
        setLoading(false);
      },
      (err) => {
        console.error('[community-admin] community listener failed:', err);
        setLoading(false);
      },
    );
  }, [chatId]);
  // No id, nothing to wait for.
  return { community, loading: !!chatId && loading };
}

export type PendingRequest = { userId: string; displayName: string; requestedAt: Date | null };

export function useJoinRequests(chatId: string, enabled: boolean) {
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  useEffect(() => {
    if (!enabled) return;
    const q = query(collection(db, 'chats', chatId, 'joinRequests'), where('status', '==', 'pending'));
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data(SNAP);
          return {
            userId: (data.userId as string) ?? d.id,
            displayName: (data.displayName as string) ?? '',
            requestedAt: toDate(data.requestedAt),
          };
        });
        // Oldest first: the one that has waited longest is at the top. Sorted
        // here, not in the query, so the query needs no composite index.
        list.sort((a, b) => (a.requestedAt?.getTime() ?? 0) - (b.requestedAt?.getTime() ?? 0));
        setRequests(list);
      },
      (err) => console.error('[community-admin] join requests listener failed:', err),
    );
  }, [chatId, enabled]);
  return requests;
}

/**
 * The whole membership log. Not range-filtered: member rows need each
 * person's latest join, which can be older than the chart range. The log only
 * starts when this shipped, so it stays small for a long while; if it grows,
 * page it by `at` here.
 */
export function useCommunityEvents(chatId: string, enabled: boolean) {
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  useEffect(() => {
    if (!enabled) return;
    const q = query(collection(db, 'chats', chatId, 'communityEvents'), orderBy('at', 'asc'));
    return onSnapshot(
      q,
      (snap) => {
        setEvents(
          snap.docs.flatMap((d) => {
            const data = d.data(SNAP);
            const at = toDate(data.at);
            if (!at || (data.type !== 'join' && data.type !== 'leave')) return [];
            return [{ id: d.id, type: data.type, userId: data.userId as string, at }];
          }),
        );
      },
      (err) => console.error('[community-admin] events listener failed:', err),
    );
  }, [chatId, enabled]);
  return events;
}

/** Messages per member, kept by the onNewCommunityMessage trigger. */
export function useMemberStats(chatId: string, enabled: boolean) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      collection(db, 'chats', chatId, 'memberStats'),
      (snap) => {
        setCounts(Object.fromEntries(snap.docs.map((d) => [d.id, (d.data().messageCount as number) ?? 0])));
      },
      (err) => console.error('[community-admin] member stats listener failed:', err),
    );
  }, [chatId, enabled]);
  return counts;
}

export type Person = { name: string; photoURL: string | null; roleId: string | null };

/**
 * Name, photo and first professional role per uid. Fetched once per uid — a
 * profile doesn't change while the owner is looking, and the LIST (who is a
 * member, who is waiting) is already live. `attempted` marks a uid done even
 * when the user doc is gone, so it isn't refetched on every snapshot.
 */
export function usePeople(uids: string[]) {
  const [people, setPeople] = useState<Record<string, Person>>({});
  const attempted = useRef(new Set<string>());
  // Unmount only. A per-effect flag would drop a fetch still in flight when the
  // list changes — and those uids are already marked attempted, so never refetched.
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const key = uids.join('|');
  useEffect(() => {
    const missing = uids.filter((u) => !attempted.current.has(u));
    if (missing.length === 0) return;
    missing.forEach((u) => attempted.current.add(u));
    Promise.all(
      missing.map(async (uid) => {
        const [user, profile] = await Promise.all([
          getDoc(doc(db, 'users', uid)),
          getDoc(doc(db, 'users', uid, 'profile', 'data')),
        ]);
        const roleSkills = (profile.data()?.roleSkills as { role: string }[] | undefined) ?? [];
        const person: Person = {
          name: (user.data()?.displayName as string | undefined) ?? '',
          photoURL: (user.data()?.photoURL as string | null | undefined) ?? null,
          roleId: roleSkills[0]?.role ?? null,
        };
        return [uid, person] as const;
      }),
    )
      .then((entries) => {
        if (mounted.current) setPeople((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
      })
      .catch((err) => {
        missing.forEach((u) => attempted.current.delete(u));
        console.error('[community-admin] people fetch failed:', err);
      });
    // `key` stands in for `uids`: a new array with the same ids isn't a change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return people;
}
