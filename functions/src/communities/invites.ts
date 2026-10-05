import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten, onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { db, FieldValue, requireAuth } from '../lifecycle/helpers';
import {
  generateToken,
  generateShortCode,
  isTokenShape,
  isCodeShape,
  canCreateInvite,
  canRevokeInvite,
  publicResolveBody,
  PUBLIC_MISS,
  authedInviteBody,
  rateKeyFromRequest,
  buildInviteUrl,
  type CommunityDoc,
  type Membership,
} from './inviteCore';
import { checkRateLimit } from './rateLimit';
import { communityOnSide, readDemoConfig } from '../demo';
import { assertVerifiedEmail } from '../auth/verifiedEmail';
import { announceJoinRequest } from './joinRequestAnnounce';

/**
 * Community invites. Region: europe-west1, next to the eur3 database.
 * These are NEW functions reached through a second client instance
 * (getFunctions(app, 'europe-west1')); the existing callables stay in us-central1
 * (docs/slice1-verification.md, "Functions region").
 *
 * Invites only ever lead into the existing join-request flow. Nothing here adds a
 * member.
 */
const REGION = 'europe-west1';

const invitesCol = () => db.collection('communityInvites');
const codesCol = () => db.collection('communityInviteCodes');

type InviteDoc = {
  shortCode: string;
  communityId: string;
  createdBy: string;
  revoked: boolean;
};

const isAppAdmin = (token: Record<string, unknown> | undefined) => token?.role === 'admin';

/** Token or 6-char code -> the invite and its community, or null for any miss. */
async function lookupInvite(tokenOrCode: unknown): Promise<
  { token: string; invite: InviteDoc; communityId: string; community: CommunityDoc } | null
> {
  let token: string | null = null;
  if (isTokenShape(tokenOrCode)) {
    token = tokenOrCode;
  } else if (typeof tokenOrCode === 'string' && isCodeShape(tokenOrCode.trim().toUpperCase())) {
    const code = await codesCol().doc(tokenOrCode.trim().toUpperCase()).get();
    const mapped = code.exists ? code.get('token') : null;
    token = isTokenShape(mapped) ? mapped : null;
  }
  if (!token) return null;

  const inviteSnap = await invitesCol().doc(token).get();
  if (!inviteSnap.exists) return null;
  const invite = inviteSnap.data() as InviteDoc;
  if (typeof invite.communityId !== 'string' || !invite.communityId) return null;

  const chat = await db.collection('chats').doc(invite.communityId).get();
  if (!chat.exists || chat.get('type') !== 'community') return null;
  return { token, invite, communityId: invite.communityId, community: chat.data() as CommunityDoc };
}

// ── createCommunityInvite ────────────────────────────────────────────────────

export const createCommunityInvite = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request.auth?.uid);
  assertVerifiedEmail(request);
  const communityId = request.data?.communityId;
  if (typeof communityId !== 'string' || !communityId || communityId.includes('/')) {
    throw new HttpsError('invalid-argument', 'communityId required');
  }

  const chatRef = db.collection('chats').doc(communityId);
  const chat = await chatRef.get();
  const community = chat.exists ? (chat.data() as CommunityDoc) : null;
  if (!canCreateInvite({ uid, isAppAdmin: isAppAdmin(request.auth?.token), community })) {
    throw new HttpsError('permission-denied', 'Not allowed to invite to this community');
  }

  const appLinks = await db.collection('config').doc('appLinks').get();
  const baseUrl = appLinks.exists ? appLinks.get('baseUrl') : undefined;
  // Validate before minting anything: a bad base would be baked into every shared link.
  if (!buildInviteUrl(baseUrl, 'x'.repeat(22))) {
    throw new HttpsError('failed-precondition', 'config/appLinks.baseUrl is missing or not an https origin');
  }

  const existingQuery = invitesCol()
    .where('communityId', '==', communityId)
    .where('createdBy', '==', uid)
    .where('revoked', '==', false)
    .limit(1);

  for (let attempt = 0; attempt < 5; attempt++) {
    const token = generateToken();
    const shortCode = generateShortCode();
    const result = await db.runTransaction(async (tx) => {
      // Inside the transaction, so two quick taps can't both mint a new invite.
      const existing = await tx.get(existingQuery);
      if (!existing.empty) {
        const doc = existing.docs[0];
        return { token: doc.id, shortCode: doc.get('shortCode') as string };
      }
      const codeRef = codesCol().doc(shortCode);
      const inviteRef = invitesCol().doc(token);
      const [codeSnap, inviteSnap] = await Promise.all([tx.get(codeRef), tx.get(inviteRef)]);
      if (codeSnap.exists || inviteSnap.exists) return null; // collision: retry with fresh values
      tx.create(inviteRef, {
        shortCode,
        communityId,
        createdBy: uid,
        createdAt: FieldValue.serverTimestamp(),
        revoked: false,
        expiresAt: null,
        useCount: 0,
      });
      tx.create(codeRef, { token });
      return { token, shortCode };
    });
    if (result) {
      return { token: result.token, shortCode: result.shortCode, url: buildInviteUrl(baseUrl, result.token) };
    }
  }
  throw new HttpsError('aborted', 'Could not allocate an invite code, try again');
});

// ── getCommunityInvite (signed in) ───────────────────────────────────────────

export const getCommunityInvite = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request.auth?.uid);

  // Keyed on the uid, so it's independent of any client-IP question.
  const decision = await checkRateLimit(`uid:${uid}`);
  if (!decision.allowed) {
    throw new HttpsError('resource-exhausted', 'rate_limited', { retryAfterSec: decision.retryAfterSec });
  }

  const found = await lookupInvite(request.data?.tokenOrCode);
  if (!found) return PUBLIC_MISS;
  // A demo community's invite is refused to real users, and a real one to demo users.
  if (!communityOnSide(await readDemoConfig(), uid, found.communityId, found.community.ownerId as string | undefined)) {
    throw new HttpsError('failed-precondition', 'demo-isolation');
  }
  if (found.invite.revoked === true) {
    return authedInviteBody({ revoked: true, token: found.token, communityId: found.communityId, community: found.community, membership: 'none' });
  }

  let membership: Membership = 'none';
  if (Array.isArray(found.community.members) && found.community.members.includes(uid)) {
    membership = 'member';
  } else {
    const req = await db.collection('chats').doc(found.communityId).collection('joinRequests').doc(uid).get();
    if (req.exists && req.get('status') === 'pending') membership = 'pending';
  }
  return authedInviteBody({ revoked: false, token: found.token, communityId: found.communityId, community: found.community, membership });
});

// ── revokeCommunityInvite ────────────────────────────────────────────────────

export const revokeCommunityInvite = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const token = request.data?.token;
  if (!isTokenShape(token)) throw new HttpsError('invalid-argument', 'token required');

  const ref = invitesCol().doc(token);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'No such invite');
  const invite = snap.data() as InviteDoc;
  const chat = await db.collection('chats').doc(invite.communityId).get();
  const community = chat.exists ? (chat.data() as CommunityDoc) : null;

  if (!canRevokeInvite({ uid, isAppAdmin: isAppAdmin(request.auth?.token), community, invite })) {
    throw new HttpsError('permission-denied', 'Not allowed to revoke this invite');
  }
  if (invite.revoked !== true) {
    await ref.update({ revoked: true, revokedAt: FieldValue.serverTimestamp(), revokedBy: uid });
  }
  return { revoked: true };
});

// ── resolveCommunityInvite (public) ──────────────────────────────────────────

/**
 * PUBLIC, unauthenticated. NOT deployed with the callables. It ships with the web
 * landing task; until then nothing in the app calls it.
 *
 * Every miss is PUBLIC_MISS, byte-identical, including revoked invites and internal
 * errors, so the response never says whether a token or code exists. Rate-limited
 * is a separate, honest 429 (CGNAT users share IPs and must not be told a valid
 * invite doesn't exist).
 */
export const resolveCommunityInvite = onRequest(
  { region: REGION, maxInstances: 10, cors: true },
  async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (req.method !== 'GET') {
      res.status(405).set('Allow', 'GET').json({ error: 'method_not_allowed' });
      return;
    }

    const key = rateKeyFromRequest({ xForwardedFor: req.get('x-forwarded-for') ?? undefined, ip: req.ip });
    const decision = await checkRateLimit(key);
    if (!decision.allowed) {
      res.status(429).set('Retry-After', String(decision.retryAfterSec)).json({ rateLimited: true });
      return;
    }

    try {
      const q = typeof req.query.token === 'string' ? req.query.token
        : typeof req.query.code === 'string' ? req.query.code : undefined;
      const found = await lookupInvite(q);
      if (!found || found.invite.revoked === true) {
        res.status(200).json(PUBLIC_MISS);
        return;
      }
      res.status(200).json(publicResolveBody(found.community));
    } catch (err) {
      console.error('[resolveCommunityInvite] lookup failed', err);
      res.status(200).json(PUBLIC_MISS);
    }
  },
);

// ── Triggers ─────────────────────────────────────────────────────────────────

/**
 * When a join request becomes pending (created, or a settled one asking again):
 *  1. the community owner gets a push saying who asked. EVERY request, however it
 *     arrived: an owner told about one request and not the next is worse than never
 *     told. An edit to a request that is already pending is not a new request.
 *  2. if it carries an invite token, useCount += 1 on that invite (once per pending
 *     request; the rules have already checked the token, the communityId is
 *     re-checked here, and a token that does not check out is simply not counted).
 */
export const onCommunityInviteJoinRequest = onDocumentWritten(
  { document: 'chats/{chatId}/joinRequests/{uid}', region: REGION },
  async (event) => {
    const before = event.data?.before.exists ? event.data.before.data() : undefined;
    const after = event.data?.after.exists ? event.data.after.data() : undefined;
    if (!after || after.status !== 'pending') return;
    const wasPending = before?.status === 'pending';
    const hasToken = isTokenShape(after.inviteToken);
    // Same pending request, edited: nothing new to count or announce.
    if (wasPending && (!hasToken || before?.inviteToken === after.inviteToken)) return;

    if (hasToken) {
      const ref = invitesCol().doc(after.inviteToken);
      const snap = await ref.get();
      if (snap.exists && snap.get('communityId') === event.params.chatId) {
        await ref.update({ useCount: FieldValue.increment(1) });
      }
    }

    // Only a request that was not already pending is news to the owner (a pending
    // request that merely gains a token above is counted, not announced twice).
    if (wasPending) return;
    // Best effort: a failed push must never undo or retry the count above.
    await announceJoinRequest({ chatId: event.params.chatId, requesterUid: event.params.uid, requesterName: after.displayName, eventId: event.id })
      .catch((e) => console.warn('[onCommunityInviteJoinRequest] owner push failed', (e as Error)?.message));
  },
);

/**
 * When a community is deleted (console or Admin SDK, since clients can't delete chats),
 * remove its invites AND their code lookup docs, so no orphaned code resolves.
 */
export const onCommunityDeleted = onDocumentDeleted(
  { document: 'chats/{chatId}', region: REGION },
  async (event) => {
    if (event.data?.get('type') !== 'community') return;
    const chatId = event.params.chatId;

    // The owner-push cooldown stamps (one per requester). Subcollections outlive their parent
    // document, so nothing else removes them. Before the invite loop below, which returns early.
    await db.recursiveDelete(db.collection(`chats/${chatId}/joinRequestNotices`))
      .catch((e) => console.warn('[onCommunityDeleted] could not remove joinRequestNotices', (e as Error)?.message));

    for (;;) {
      const page = await invitesCol().where('communityId', '==', chatId).limit(200).get();
      if (page.empty) return;
      const codeRefs = page.docs
        .map((d) => d.get('shortCode'))
        .filter(isCodeShape)
        .map((c) => codesCol().doc(c));
      const codeSnaps = codeRefs.length ? await db.getAll(...codeRefs) : [];
      const tokens = new Set(page.docs.map((d) => d.id));
      const batch = db.batch();
      page.docs.forEach((d) => batch.delete(d.ref));
      // Only the lookup docs that point at THIS community's tokens.
      codeSnaps.forEach((s) => { if (s.exists && tokens.has(s.get('token'))) batch.delete(s.ref); });
      await batch.commit();
      if (page.size < 200) return;
    }
  },
);
