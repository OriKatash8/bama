import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, requireAuth } from './helpers';

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
