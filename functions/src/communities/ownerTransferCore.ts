/**
 * Community ownership hand-over: the rules, as pure functions. The callables in
 * ownerTransfer.ts do the reads and writes; every decision is made here so it can
 * be unit-tested without Firestore.
 *
 * The flow: the current owner OFFERS ownership to one member. Nothing changes
 * until that member ACCEPTS; until then the owner stays in charge and can cancel.
 * An unanswered offer lapses after OFFER_TTL_MS. On accept only `ownerId` changes:
 * the previous owner stays on as a regular member.
 */
export type Lang = 'he' | 'en';

export const OFFER_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const OWNERSHIP_OFFER_NOTIFICATION_TYPE = 'community_ownership_offer';
export const OWNERSHIP_RESULT_NOTIFICATION_TYPE = 'community_ownership_result';

export type OfferDoc = {
  fromUid: string;
  toUid: string;
  status: 'pending';
  /** Millis. */
  expiresAtMs: number;
};

export type CommunityState = {
  type?: unknown;
  ownerId?: unknown;
  members?: unknown;
  status?: unknown;
};

export type Refusal =
  | 'not-a-community'
  | 'not-owner'
  | 'bad-target'
  | 'target-not-member'
  | 'suspended'
  | 'offer-pending'
  | 'no-offer'
  | 'offer-expired'
  | 'not-recipient'
  | 'owner-changed'
  | 'recipient-left';

const members = (c: CommunityState): string[] =>
  Array.isArray(c.members) ? c.members.filter((m): m is string => typeof m === 'string') : [];

export const isLive = (offer: OfferDoc | null, nowMs: number): offer is OfferDoc =>
  !!offer && offer.status === 'pending' && offer.expiresAtMs > nowMs;

/** The owner offers ownership to `toUid`. `null` means allowed. */
export function checkOffer(p: {
  uid: string;
  toUid: unknown;
  community: CommunityState | null;
  existing: OfferDoc | null;
  nowMs: number;
}): Refusal | null {
  const { uid, community, existing, nowMs } = p;
  if (!community || community.type !== 'community') return 'not-a-community';
  if (community.ownerId !== uid) return 'not-owner';
  if (community.status === 'suspended') return 'suspended';
  if (typeof p.toUid !== 'string' || !p.toUid || p.toUid.includes('/') || p.toUid === uid) return 'bad-target';
  if (!members(community).includes(p.toUid)) return 'target-not-member';
  // An expired offer is replaceable; a live one must be cancelled first, so two
  // offers can never be racing each other.
  if (isLive(existing, nowMs)) return 'offer-pending';
  return null;
}

/** The recipient answers. `null` means allowed. */
export function checkResponse(p: {
  uid: string;
  accept: boolean;
  community: CommunityState | null;
  offer: OfferDoc | null;
  nowMs: number;
}): Refusal | null {
  const { uid, community, offer, nowMs } = p;
  if (!community || community.type !== 'community') return 'not-a-community';
  if (!offer || offer.status !== 'pending') return 'no-offer';
  if (offer.toUid !== uid) return 'not-recipient';
  // Declining stays possible on an expired offer (it just clears it); accepting does not.
  if (!p.accept) return null;
  if (offer.expiresAtMs <= nowMs) return 'offer-expired';
  if (community.status === 'suspended') return 'suspended';
  // The owner may have changed since the offer (an app admin reassigned it): the
  // offer was made by someone who is no longer in charge, so it is void.
  if (community.ownerId !== offer.fromUid) return 'owner-changed';
  if (!members(community).includes(uid)) return 'recipient-left';
  return null;
}

/** The owner cancels their own pending offer. `null` means allowed. */
export function checkCancel(p: {
  uid: string;
  community: CommunityState | null;
  offer: OfferDoc | null;
}): Refusal | null {
  if (!p.community || p.community.type !== 'community') return 'not-a-community';
  if (p.community.ownerId !== p.uid) return 'not-owner';
  if (!p.offer) return 'no-offer';
  return null;
}

const MAX_NAME = 60;
const clip = (s: string) => (s.length > MAX_NAME ? `${s.slice(0, MAX_NAME - 1)}…` : s);
const name = (v: unknown, lang: Lang) =>
  typeof v === 'string' && v.trim() ? clip(v.trim()) : lang === 'he' ? 'מישהו' : 'Someone';

/** The push to the member being offered ownership. */
export function offerNotice(lang: Lang, p: { communityName: unknown; fromName: unknown }) {
  const community = typeof p.communityName === 'string' ? p.communityName.trim() : '';
  const from = name(p.fromName, lang);
  return {
    title: community ? `${clip(community)} · ${lang === 'he' ? 'העברת ניהול' : 'Ownership offer'}` : 'BAMA',
    message: lang === 'he'
      ? `${from} מציע/ה לך לנהל את הקהילה. אשר/י או דחה/י בעמוד הקהילה`
      : `${from} wants to make you the host of this community. Accept or decline on its page`,
  };
}

/** The push back to the owner once the member answered. */
export function resultNotice(lang: Lang, p: { communityName: unknown; toName: unknown; accepted: boolean }) {
  const community = typeof p.communityName === 'string' ? p.communityName.trim() : '';
  const to = name(p.toName, lang);
  const suffix = lang === 'he' ? 'העברת ניהול' : 'Ownership';
  return {
    title: community ? `${clip(community)} · ${suffix}` : 'BAMA',
    message: lang === 'he'
      ? p.accepted ? `${to} אישר/ה והוא/היא המנהל/ת החדש/ה של הקהילה` : `${to} דחה/תה את הצעת ניהול הקהילה`
      : p.accepted ? `${to} accepted and is now the host of the community` : `${to} declined to become the host`,
  };
}
