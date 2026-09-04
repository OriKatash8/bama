import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, FieldValue, requireAuth } from './helpers';


type Party = { clientId: string; professionalIds: string[]; chatId?: string; title?: string };

/**
 * Load the project and place the caller in it.
 *
 * The engagement being repriced is always **the client and ONE professional**.
 * Both sides are derived here from the PROJECT — never read from a request
 * document, which is client-written and therefore attacker-controlled. This is
 * what made the old flow exploitable: `respondToPaymentRequest` trusted
 * `req.professionalId` to decide whose offers got repriced, so a party could
 * name anyone and, with a confederate accepting, move that professional's agreed
 * price — and with it the platform fee's base.
 */
async function loadParty(projectId: string, uid: string) {
  const snap = await db.doc(`projects/${projectId}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Project not found');
  const p = snap.data() as Record<string, unknown>;
  const clientId = p.clientId as string;
  const professionalIds = (p.professionalIds as string[]) ?? [];

  const callerIsClient = uid === clientId;
  const callerIsPro = professionalIds.includes(uid);
  if (!callerIsClient && !callerIsPro) {
    throw new HttpsError('permission-denied', 'not-a-party');
  }
  return {
    project: { clientId, professionalIds, chatId: p.chatId as string | undefined, title: p.title as string | undefined } as Party,
    callerIsClient,
    callerIsPro,
  };
}

/**
 * Raise a price-renegotiation request.
 *
 * The input carries NO identity: no fromUserId, no toUserId, no currentAmount.
 * `fromUserId` is always the caller, the counterparty is derived, and the amount
 * is read from the accepted offer. A self-addressed request is therefore not
 * merely rejected — it is unrepresentable.
 *
 * A professional may only reprice their OWN engagement; a `professionalId` they
 * pass is ignored. A client must name a professional actually on the project.
 */
export const createPaymentRequest = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const projectId = request.data?.projectId as string | undefined;
  const proposedAmount = Number(request.data?.proposedAmount);
  if (!projectId) throw new HttpsError('invalid-argument', 'projectId required');
  if (!Number.isFinite(proposedAmount) || proposedAmount <= 0) {
    throw new HttpsError('invalid-argument', 'proposedAmount must be a positive number');
  }

  const { project, callerIsClient } = await loadParty(projectId, uid);

  // Derive the pair. The client names WHICH professional (validated against the
  // project); a professional can only ever mean themselves.
  const targetPro = callerIsClient ? (request.data?.professionalId as string | undefined) : uid;
  if (!targetPro) throw new HttpsError('invalid-argument', 'professionalId required');
  if (!project.professionalIds.includes(targetPro)) {
    throw new HttpsError('failed-precondition', 'professional-not-on-project');
  }
  const toUserId = callerIsClient ? targetPro : project.clientId;

  const bundleId = request.data?.bundleId as string | undefined;
  const category = request.data?.category as string | undefined;

  // The current amount is read from the accepted offer, not supplied. This also
  // proves there is something repriceable before a request is raised.
  let currentAmount = 0;
  if (bundleId) {
    const b = await db.doc(`bundleOffers/${bundleId}`).get();
    const bd = b.data() as { projectId?: string; professionalId?: string; status?: string; bundlePrice?: number } | undefined;
    if (!b.exists || bd?.projectId !== projectId || bd?.professionalId !== targetPro || bd?.status !== 'accepted') {
      throw new HttpsError('failed-precondition', 'no-accepted-bundle-to-reprice');
    }
    currentAmount = bd.bundlePrice ?? 0;
  } else {
    let q = db.collection('priceOffers')
      .where('projectId', '==', projectId)
      .where('professionalId', '==', targetPro)
      .where('status', '==', 'accepted');
    if (category) q = q.where('category', '==', category);
    const offers = await q.get();
    if (offers.empty) throw new HttpsError('failed-precondition', 'no-accepted-offer-to-reprice');
    currentAmount = (offers.docs[0].data().price as number | undefined) ?? 0;
  }

  const batch = db.batch();
  const reqRef = db.collection(`projects/${projectId}/paymentRequests`).doc();
  batch.set(reqRef, {
    projectId,
    fromUserId: uid,
    toUserId,
    professionalId: targetPro,
    ...(bundleId ? { bundleId } : {}),
    ...(category ? { category } : {}),
    currentAmount,
    proposedAmount,
    ...(request.data?.note ? { note: String(request.data.note).slice(0, 500) } : {}),
    status: 'pending',
    createdAt: FieldValue.serverTimestamp(),
  });

  // The chat notice moves in here, atomic with the request — it was a client
  // write wrapped in a swallow, so a failure left the counterparty with a pending
  // request and no heads-up. No amount is named, only who must respond.
  if (project.chatId) {
    const toSnap = await db.doc(`users/${toUserId}`).get();
    const toName = (toSnap.data()?.displayName as string | undefined) ?? '';
    const text = toName
      ? `💰 בקשת שינוי מחיר: ממתין לאישור ${toName}`
      : '💰 בקשת שינוי מחיר';
    batch.set(db.collection(`chats/${project.chatId}/messages`).doc(), {
      senderId: 'system', system: true, text,
      timestamp: FieldValue.serverTimestamp(), readBy: [],
    });
    batch.update(db.doc(`chats/${project.chatId}`), {
      lastMessage: { text, senderId: 'system', timestamp: FieldValue.serverTimestamp() },
      [`unreadCount.${toUserId}`]: FieldValue.increment(1),
    });
  }

  await batch.commit();
  return { ok: true, requestId: reqRef.id, currentAmount };
});

/**
 * Accept or reject a price-renegotiation request.
 *
 * This was a client-side batch (`paymentService.respondToPaymentRequest`) that
 * wrote `price` / `bundlePrice` straight onto accepted offers. Two problems:
 *
 *  1. Those amounts are the base the platform fee is computed from, and the
 *     rules let EITHER party rewrite them at any time — so a professional could
 *     cut their accepted price just before the client confirmed completion and
 *     shrink their own fee. The rules now freeze accepted offers, which means
 *     the legitimate path has to run with Admin credentials: here.
 *  2. The non-bundle branch matched on projectId + professionalId + status with
 *     no category, so a pro holding two separate non-bundled roles who
 *     renegotiated one had BOTH repriced to the new amount.
 *
 * Only the RECIPIENT of the request may answer it — the proposer accepting their
 * own proposal would be a unilateral reprice.
 */
export const respondToPaymentRequest = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const projectId = request.data?.projectId as string | undefined;
  const requestId = request.data?.requestId as string | undefined;
  const accept = request.data?.accept === true;
  if (!projectId || !requestId) {
    throw new HttpsError('invalid-argument', 'projectId and requestId required');
  }

  const reqRef = db.doc(`projects/${projectId}/paymentRequests/${requestId}`);
  const reqSnap = await reqRef.get();
  if (!reqSnap.exists) throw new HttpsError('not-found', 'Request not found');
  const req = reqSnap.data() as Record<string, unknown>;

  if (req.toUserId !== uid) {
    throw new HttpsError('permission-denied', 'Only the recipient can answer this request');
  }
  if (req.status !== 'pending') {
    throw new HttpsError('failed-precondition', 'Request is not pending');
  }

  // Re-validate the pair against the PROJECT rather than trusting the stored
  // fields. Creation is server-side now, but documents written by older clients
  // still exist and every field on them was attacker-controlled. `toUserId ===
  // uid` proves who is answering; it never proved either party was entitled to
  // reprice this professional.
  const { project } = await loadParty(projectId, uid);
  const from = req.fromUserId as string;
  const to = req.toUserId as string;
  const pro = req.professionalId as string;

  if (from === to) {
    throw new HttpsError('failed-precondition', 'self-addressed-request');
  }
  if (!project.professionalIds.includes(pro)) {
    throw new HttpsError('failed-precondition', 'professional-not-on-project');
  }
  // The two sides must be the client and THAT professional — not two
  // professionals, and not one person appearing twice.
  const pair = new Set([from, to]);
  if (!(pair.size === 2 && pair.has(project.clientId) && pair.has(pro))) {
    throw new HttpsError('failed-precondition', 'parties-do-not-match-the-engagement');
  }

  if (!accept) {
    await reqRef.update({ status: 'rejected' });
    return { ok: true, accepted: false };
  }

  const proId = req.professionalId as string;
  const bundleId = req.bundleId as string | undefined;
  const newAmount = Number(req.proposedAmount);
  if (!Number.isFinite(newAmount) || newAmount < 0) {
    throw new HttpsError('invalid-argument', 'proposedAmount is not a valid amount');
  }

  const batch = db.batch();
  let repriced = 0;

  if (bundleId) {
    // A bundle is one amount covering several slots — reprice it once.
    batch.update(db.doc(`bundleOffers/${bundleId}`), { bundlePrice: newAmount });
    repriced = 1;
  } else {
    let q = db
      .collection('priceOffers')
      .where('projectId', '==', projectId)
      .where('professionalId', '==', proId)
      .where('status', '==', 'accepted');
    // Scope to the role being renegotiated. Legacy requests carry no category;
    // those keep the old behaviour rather than failing, but anything written by
    // a current client always has one.
    const category = req.category as string | undefined;
    if (category) q = q.where('category', '==', category);

    const offersSnap = await q.get();
    if (offersSnap.empty) throw new HttpsError('failed-precondition', 'No accepted offer to reprice');
    offersSnap.docs.forEach((d) => batch.update(d.ref, { price: newAmount }));
    repriced = offersSnap.size;
  }

  batch.update(reqRef, { status: 'accepted' });
  await batch.commit();

  // The fee's baseAmount is deliberately NOT touched here. It is re-derived from
  // the accepted offers at confirmation, and anything already paid stays credited
  // in paidAmount — so a rise is topped up and a fall cannot claw back a payment.
  return { ok: true, accepted: true, repriced };
});
