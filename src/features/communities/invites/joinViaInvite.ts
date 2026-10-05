import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { isInviteTokenOrCode } from '@core/deepLinks/allowlist';

/**
 * A join request that arrived through an invite link. Same document the Discover
 * flow writes (useCommunityDiscovery.requestToJoin) plus `via` and `inviteToken`,
 * which the rules accept together or not at all: the token must be the invite's
 * 22-character token (NOT the 6-character short code) and name a live invite for
 * this community. Keys are exactly the rules' allowlist. The owner's approval is
 * still the only gate.
 */
export async function requestToJoinViaInvite(p: {
  chatId: string;
  /** The invite's long token, as getCommunityInvite returns it. */
  token: string;
  uid: string;
  displayName: string;
}): Promise<void> {
  if (!isInviteTokenOrCode(p.token) || p.token.length !== 22) throw new Error('requestToJoinViaInvite: token must be the 22-character invite token');
  await setDoc(doc(db, 'chats', p.chatId, 'joinRequests', p.uid), {
    userId: p.uid,
    displayName: p.displayName,
    requestedAt: serverTimestamp(),
    status: 'pending',
    via: 'invite',
    inviteToken: p.token,
  });
}
