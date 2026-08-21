import { useEffect, useState } from 'react';
import {
  collection, query, where, onSnapshot, getDoc, setDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@core/firebase/config';
import type { Chat } from '../types';

export type JoinStatus = 'pending' | 'approved' | 'rejected' | null;

export function useCommunityDiscovery(userId: string | undefined) {
  const [myCommunities, setMyCommunities] = useState<Chat[]>([]);
  const [discoverCommunities, setDiscoverCommunities] = useState<Chat[]>([]);
  const [joinStatuses, setJoinStatuses] = useState<Record<string, JoinStatus>>({});

  // My communities — user is a member
  useEffect(() => {
    if (!userId) {
      console.log('[useCommunityDiscovery] myCommunities: skipping — no userId');
      return;
    }
    console.log('[useCommunityDiscovery] myCommunities: querying chats where type==community AND members array-contains', userId);
    const q = query(
      collection(db, 'chats'),
      where('type', '==', 'community'),
      where('members', 'array-contains', userId),
    );
    return onSnapshot(q, (snap) => {
      console.log('[useCommunityDiscovery] myCommunities count:', snap.docs.length, snap.docs.map(d => ({ id: d.id, name: d.data().name })));
      setMyCommunities(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Chat)));
    }, (err) => {
      console.error('[useCommunityDiscovery] myCommunities Firestore error:', err.message, err);
    });
  }, [userId]);

  // All communities (for Discover section — filtered client-side)
  useEffect(() => {
    console.log('[useCommunityDiscovery] allCommunities: querying chats where type==community');
    const q = query(collection(db, 'chats'), where('type', '==', 'community'));
    return onSnapshot(q, (snap) => {
      console.log('[useCommunityDiscovery] allCommunities count:', snap.docs.length, snap.docs.map(d => ({ id: d.id, type: d.data().type, name: d.data().name })));
      setDiscoverCommunities(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Chat)));
    }, (err) => {
      console.error('[useCommunityDiscovery] allCommunities Firestore error:', err.message, err);
    });
  }, []);

  // Check join request status for communities user is NOT a member of
  useEffect(() => {
    if (!userId || discoverCommunities.length === 0) return;
    const myIds = new Set(myCommunities.map((c) => c.id));
    const toCheck = discoverCommunities.filter((c) => !myIds.has(c.id));
    Promise.all(
      toCheck.map(async (c) => {
        try {
          const snap = await getDoc(doc(db, 'chats', c.id, 'joinRequests', userId));
          const status: JoinStatus = snap.exists() ? (snap.data().status as JoinStatus) : null;
          return [c.id, status] as const;
        } catch {
          return [c.id, null] as const;
        }
      }),
    ).then((entries) => {
      setJoinStatuses((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    });
  }, [discoverCommunities, myCommunities, userId]);

  async function requestToJoin(communityId: string, displayName: string) {
    if (!userId) return;
    await setDoc(doc(db, 'chats', communityId, 'joinRequests', userId), {
      userId,
      displayName,
      requestedAt: serverTimestamp(),
      status: 'pending',
    });
    setJoinStatuses((prev) => ({ ...prev, [communityId]: 'pending' }));
  }

  // Include joined communities in Explore too — the UI marks them as "Member"
  // and offers "Open Chat" instead of "Request to Join".
  const discover = discoverCommunities;

  return { myCommunities, discover, joinStatuses, requestToJoin };
}
