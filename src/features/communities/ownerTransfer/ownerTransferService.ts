import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { callFunction } from '@core/firebase/functions';

/**
 * Handing a community's hosting to another member. `ownerId` is not writable from
 * the app, so all three actions are callables (functions/src/communities/ownerTransfer.ts),
 * and nothing changes until the invited member accepts.
 */
const REGION = 'europe-west1' as const;

export const requestOwnershipTransfer = (communityId: string, toUid: string) =>
  callFunction<{ communityId: string; toUid: string }, { ok: true; expiresAtMs: number }>(
    'requestOwnershipTransfer', REGION,
  )({ communityId, toUid });

export const respondOwnershipTransfer = (communityId: string, accept: boolean) =>
  callFunction<{ communityId: string; accept: boolean }, { ok: true; accepted: boolean }>(
    'respondOwnershipTransfer', REGION,
  )({ communityId, accept });

export const cancelOwnershipTransfer = (communityId: string) =>
  callFunction<{ communityId: string }, { ok: true }>('cancelOwnershipTransfer', REGION)({ communityId });

export type OwnerOffer = { fromUid: string; toUid: string; expiresAtMs: number };

/** The live offer on a community, or null: none, expired, or unreadable by this viewer. */
export function useOwnerOffer(communityId: string | undefined, enabled = true): OwnerOffer | null {
  const [offer, setOffer] = useState<OwnerOffer | null>(null);
  useEffect(() => {
    if (!communityId || !enabled) { setOffer(null); return; }
    return onSnapshot(
      doc(db, 'chats', communityId, 'ownerTransfer', 'current'),
      (snap) => {
        const d = snap.exists() ? snap.data() : null;
        const exp = d?.expiresAt?.toMillis?.() as number | undefined;
        setOffer(
          d && d.status === 'pending' && typeof d.fromUid === 'string' && typeof d.toUid === 'string' && exp
            ? { fromUid: d.fromUid, toUid: d.toUid, expiresAtMs: exp }
            : null,
        );
      },
      () => setOffer(null),
    );
  }, [communityId, enabled]);
  // An offer that lapsed while the screen was open is not an offer any more.
  return offer && offer.expiresAtMs > Date.now() ? offer : null;
}

export type OwnerTransferErrorKey =
  | 'not_owner' | 'bad_target' | 'target_not_member' | 'community_suspended' | 'offer_pending'
  | 'no_offer' | 'offer_expired' | 'not_recipient' | 'owner_changed' | 'recipient_left'
  | 'email_not_verified' | 'demo_isolation' | 'rate_limited' | 'network' | 'generic';

const SERVER_REASONS: OwnerTransferErrorKey[] = [
  'not_owner', 'bad_target', 'target_not_member', 'community_suspended', 'offer_pending',
  'no_offer', 'offer_expired', 'not_recipient', 'owner_changed', 'recipient_left',
  'email_not_verified',
];

/** One i18n key per failure, from the server's HttpsError message; never the raw error. */
export function ownerTransferErrorKey(err: unknown): OwnerTransferErrorKey {
  const e = (err ?? {}) as { code?: unknown; message?: unknown };
  const code = typeof e.code === 'string' ? e.code.replace(/^functions\//, '') : '';
  const message = typeof e.message === 'string' ? e.message : '';
  const reason = SERVER_REASONS.find((r) => message.includes(r));
  if (reason) return reason;
  if (message.includes('demo-isolation')) return 'demo_isolation';
  if (code === 'resource-exhausted') return 'rate_limited';
  if (code === 'unavailable' || code === 'deadline-exceeded') return 'network';
  return 'generic';
}
