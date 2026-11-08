import { onCall, HttpsError, type FunctionsErrorCode } from 'firebase-functions/v2/https';
import { db, FieldValue, Timestamp, requireAuth, notify } from '../lifecycle/helpers';
import { assertVerifiedEmail } from '../auth/verifiedEmail';
import { checkAllWindows } from './rateLimit';
import { communityOnSide, readDemoConfig } from '../demo';
import { userLang } from '../notifications/userLang';
import {
  OFFER_TTL_MS,
  OWNERSHIP_OFFER_NOTIFICATION_TYPE,
  OWNERSHIP_RESULT_NOTIFICATION_TYPE,
  checkCancel,
  checkOffer,
  checkResponse,
  offerNotice,
  resultNotice,
  type CommunityState,
  type OfferDoc,
  type Refusal,
} from './ownerTransferCore';

/**
 * Community ownership hand-over. `ownerId` is not client-writable (firestore.rules),
 * so this is the only way an owner can pass the community on, and it needs the new
 * owner's consent: the offer lives in `chats/{id}/ownerTransfer/current` (Admin SDK
 * writes only; members may read it) and `ownerId` changes only when the recipient
 * accepts. Region europe-west1, next to the database, like the invite callables.
 */
const REGION = 'europe-west1';

const offerRef = (communityId: string) => db.doc(`chats/${communityId}/ownerTransfer/current`);

const MESSAGES: Record<Refusal, [FunctionsErrorCode, string]> = {
  'not-a-community': ['not-found', 'community_not_found'],
  'not-owner': ['permission-denied', 'not_owner'],
  'bad-target': ['invalid-argument', 'bad_target'],
  'target-not-member': ['failed-precondition', 'target_not_member'],
  'suspended': ['failed-precondition', 'community_suspended'],
  'offer-pending': ['failed-precondition', 'offer_pending'],
  'no-offer': ['not-found', 'no_offer'],
  'offer-expired': ['failed-precondition', 'offer_expired'],
  'not-recipient': ['permission-denied', 'not_recipient'],
  'owner-changed': ['failed-precondition', 'owner_changed'],
  'recipient-left': ['failed-precondition', 'recipient_left'],
};
function refuse(r: Refusal): never {
  const [code, msg] = MESSAGES[r];
  throw new HttpsError(code, msg);
}

function communityIdOf(data: unknown): string {
  const id = (data as { communityId?: unknown } | null)?.communityId;
  if (typeof id !== 'string' || !id || id.includes('/')) throw new HttpsError('invalid-argument', 'communityId required');
  return id;
}

async function limit(uid: string) {
  // A burst guard, and a daily cap: handing a community over is rare.
  const d = await checkAllWindows(`uid:${uid}`, [
    { prefix: 'ownerTransferBurst', limit: 6, windowMs: 60_000 },
    { prefix: 'ownerTransferDay', limit: 30, windowMs: 24 * 60 * 60_000 },
  ]);
  if (!d.allowed) throw new HttpsError('resource-exhausted', 'rate_limited', { retryAfterSec: d.retryAfterSec });
}

const toOffer = (data: FirebaseFirestore.DocumentData | undefined): OfferDoc | null => {
  if (!data || typeof data.fromUid !== 'string' || typeof data.toUid !== 'string') return null;
  const exp = data.expiresAt;
  const expiresAtMs = exp && typeof exp.toMillis === 'function' ? exp.toMillis() : 0;
  return { fromUid: data.fromUid, toUid: data.toUid, status: 'pending', expiresAtMs };
};

async function displayName(uid: string): Promise<string> {
  try {
    return String((await db.doc(`users/${uid}`).get()).get('displayName') ?? '');
  } catch {
    return '';
  }
}

/** Best effort: the offer and its answer stand even if the push fails. */
async function tell(userId: string, kind: 'offer' | 'result', communityId: string, build: (lang: 'he' | 'en') => { title: string; message: string }) {
  try {
    const n = build(await userLang(userId));
    await notify({
      userId,
      ...n,
      data: {
        type: kind === 'offer' ? OWNERSHIP_OFFER_NOTIFICATION_TYPE : OWNERSHIP_RESULT_NOTIFICATION_TYPE,
        chatId: communityId,
      },
    });
  } catch (e) {
    console.warn('[ownerTransfer] notification failed', (e as Error)?.message);
  }
}

// ── requestOwnershipTransfer ─────────────────────────────────────────────────

export const requestOwnershipTransfer = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request.auth?.uid);
  assertVerifiedEmail(request);
  const communityId = communityIdOf(request.data);
  const toUid = (request.data as { toUid?: unknown }).toUid;
  await limit(uid);

  const chatRef = db.doc(`chats/${communityId}`);
  const demo = await readDemoConfig();
  const nowMs = Date.now();

  const { communityName } = await db.runTransaction(async (tx) => {
    const [chat, offer] = await Promise.all([tx.get(chatRef), tx.get(offerRef(communityId))]);
    const community = chat.exists ? (chat.data() as CommunityState & { name?: unknown }) : null;
    const refusal = checkOffer({ uid, toUid, community, existing: offer.exists ? toOffer(offer.data()) : null, nowMs });
    if (refusal) refuse(refusal);
    // The demo flag of a community follows its owner, so the new owner must be on the
    // same side as the community: an offer can never carry it across.
    if (!communityOnSide(demo, toUid as string, communityId, community?.ownerId as string)) {
      throw new HttpsError('failed-precondition', 'demo-isolation');
    }
    tx.set(offerRef(communityId), {
      fromUid: uid,
      toUid,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(nowMs + OFFER_TTL_MS),
    });
    return { communityName: community?.name };
  });

  const fromName = await displayName(uid);
  await tell(toUid as string, 'offer', communityId, (lang) => offerNotice(lang, { communityName, fromName }));
  return { ok: true, expiresAtMs: nowMs + OFFER_TTL_MS };
});

// ── respondOwnershipTransfer ─────────────────────────────────────────────────

export const respondOwnershipTransfer = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request.auth?.uid);
  assertVerifiedEmail(request);
  const communityId = communityIdOf(request.data);
  const accept = (request.data as { accept?: unknown }).accept;
  if (typeof accept !== 'boolean') throw new HttpsError('invalid-argument', 'accept must be true or false');
  await limit(uid);

  const chatRef = db.doc(`chats/${communityId}`);
  const nowMs = Date.now();

  const outcome = await db.runTransaction(async (tx) => {
    const [chat, offerSnap] = await Promise.all([tx.get(chatRef), tx.get(offerRef(communityId))]);
    const community = chat.exists ? (chat.data() as CommunityState & { name?: unknown }) : null;
    const offer = offerSnap.exists ? toOffer(offerSnap.data()) : null;
    const refusal = checkResponse({ uid, accept, community, offer, nowMs });
    if (refusal === 'owner-changed' || refusal === 'recipient-left') {
      // The offer can never be accepted now: clear it so it stops showing, then say why.
      tx.delete(offerRef(communityId));
      return { voided: refusal } as const;
    }
    if (refusal) refuse(refusal);
    if (accept) tx.update(chatRef, { ownerId: uid });
    tx.delete(offerRef(communityId));
    return { fromUid: offer!.fromUid, communityName: community?.name } as const;
  });
  if ('voided' in outcome && outcome.voided) refuse(outcome.voided);
  const { fromUid, communityName } = outcome as { fromUid: string; communityName: unknown };

  const toName = await displayName(uid);
  await tell(fromUid, 'result', communityId, (lang) => resultNotice(lang, { communityName, toName, accepted: accept }));
  return { ok: true, accepted: accept };
});

// ── cancelOwnershipTransfer ──────────────────────────────────────────────────

export const cancelOwnershipTransfer = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request.auth?.uid);
  assertVerifiedEmail(request);
  const communityId = communityIdOf(request.data);
  await limit(uid);

  const chatRef = db.doc(`chats/${communityId}`);
  await db.runTransaction(async (tx) => {
    const [chat, offerSnap] = await Promise.all([tx.get(chatRef), tx.get(offerRef(communityId))]);
    const refusal = checkCancel({
      uid,
      community: chat.exists ? (chat.data() as CommunityState) : null,
      offer: offerSnap.exists ? toOffer(offerSnap.data()) : null,
    });
    if (refusal) refuse(refusal);
    tx.delete(offerRef(communityId));
  });
  return { ok: true };
});
