import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, FieldValue, requireAuth, feeRef } from './helpers';
import { releaseEngagement } from './removal';
import { sendBamaSystemDM } from '../system';
import { decideActivation, pendingReviewOffers, type ActivationDecision } from './review';

type Update = admin.firestore.UpdateData<admin.firestore.DocumentData>;

/**
 * The client's review card: רלוונטי / לא רלוונטי on each hired professional.
 *
 * V1 — joining the chat is still hiring. The review sits on top: every offer
 * hireProfessional accepts starts `review: 'pending'`, and these two callables
 * resolve it. The project moves to 'in_progress' only once nobody is still
 * under review and no seat is empty (maybeActivateProject).
 *
 * שינוי מחיר is not here — it is the existing paymentRequests flow
 * (repricing.ts), and confirmCandidate refuses while one is pending.
 */

const REASON_MAX = 500;

/** Load the project and require the caller to be its client. */
async function loadAsClient(uid: string, projectId: unknown) {
  if (typeof projectId !== 'string' || !projectId) {
    throw new HttpsError('invalid-argument', 'projectId required');
  }
  const snap = await db.doc(`projects/${projectId}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Project not found');
  const project = snap.data() as Record<string, unknown>;
  if (project.clientId !== uid) {
    throw new HttpsError('permission-denied', 'Only the client can review professionals');
  }
  return { projectId, project };
}

function requirePro(value: unknown): string {
  if (typeof value !== 'string' || !value) {
    throw new HttpsError('invalid-argument', 'professionalId required');
  }
  return value;
}

/**
 * C6 guard. A candidate's engagement is live from the hire, so they can request
 * an end, complete, or be disputed while still under review. Releasing any of
 * those would void a fee for work that happened or is being contested. Only a
 * plain 'hired' engagement can be released through the review.
 */
async function requirePlainHire(projectId: string, proId: string) {
  const fee = await feeRef(projectId, proId).get();
  const engagementStatus = fee.get('engagementStatus') ?? 'hired';
  if (!fee.exists || engagementStatus !== 'hired') {
    throw new HttpsError('failed-precondition', 'engagement-not-open');
  }
}

/**
 * A price change still pending for a released professional can never be
 * answered — respondToPaymentRequest refuses once they are off the project — so
 * close it rather than leave it hanging in both parties' lists.
 */
async function closePendingPriceChanges(projectId: string, proId: string) {
  const open = await db.collection(`projects/${projectId}/paymentRequests`)
    .where('professionalId', '==', proId)
    .where('status', '==', 'pending')
    .get();
  if (open.empty) return;
  const batch = db.batch();
  open.docs.forEach((d) => batch.update(d.ref, { status: 'rejected' } as Update));
  await batch.commit();
}

/** Load the project and require the caller to be a professional on it — not its client. */
async function loadAsCandidate(uid: string, projectId: unknown) {
  if (typeof projectId !== 'string' || !projectId) {
    throw new HttpsError('invalid-argument', 'projectId required');
  }
  const snap = await db.doc(`projects/${projectId}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Project not found');
  const project = snap.data() as Record<string, unknown>;
  // A self-hired client decides from the client side; the professional's
  // surface is for professionals.
  if (project.clientId === uid || !((project.professionalIds as string[] | undefined) ?? []).includes(uid)) {
    throw new HttpsError('permission-denied', 'Only a professional on this project can do this');
  }
  return { projectId, project };
}

/** The professional's offers still under review; refuses when there are none. */
async function requireUnderReview(projectId: string, proId: string) {
  const pending = await pendingReviewOffers(projectId, proId);
  if (pending.length === 0) {
    throw new HttpsError('failed-precondition', 'not-under-review');
  }
  return pending;
}

/**
 * רלוונטי — the client keeps this professional on the project at the price
 * that currently stands.
 *
 * Refused while a price change for them is pending: confirming would accept a
 * price the other side has not agreed to, in either direction.
 */
export const confirmCandidate = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const { projectId } = await loadAsClient(uid, request.data?.projectId);
  const proId = requirePro(request.data?.professionalId);

  const pending = await requireUnderReview(projectId, proId);

  // Equality-only on two fields — served by single-field indexes, no composite.
  const openPriceChange = await db.collection(`projects/${projectId}/paymentRequests`)
    .where('professionalId', '==', proId)
    .where('status', '==', 'pending')
    .limit(1)
    .get();
  if (!openPriceChange.empty) {
    throw new HttpsError('failed-precondition', 'price-change-pending');
  }

  const batch = db.batch();
  for (const d of pending) {
    batch.update(d.ref, { review: 'confirmed', reviewedAt: FieldValue.serverTimestamp() } as Update);
  }
  await batch.commit();

  const activation = await maybeActivateProject(projectId);
  return { ok: true, confirmed: pending.length, activated: activation.activate };
});

/**
 * לא רלוונטי — the client releases this professional before the work starts.
 *
 * The mechanics are releaseEngagement's, the same ones a withdrawal or an
 * accepted removal use: slot and seat freed, removed from the chat, fee voided,
 * offers set to 'removed', and the neutral "left the project" notice. The reason
 * is delivered privately as a BAMA System DM, never into the group chat.
 */
export const rejectCandidate = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const { projectId, project } = await loadAsClient(uid, request.data?.projectId);
  const proId = requirePro(request.data?.professionalId);

  await requireUnderReview(projectId, proId);

  await requirePlainHire(projectId, proId);

  await releaseEngagement(projectId, proId, 'candidate_rejected');
  await closePendingPriceChanges(projectId, proId);

  const reason = typeof request.data?.reason === 'string'
    ? request.data.reason.trim().slice(0, REASON_MAX)
    : '';
  let dmSent = false;
  if (reason) {
    const title = typeof project.title === 'string' && project.title ? project.title : 'הפרויקט';
    try {
      await sendBamaSystemDM(db, proId, `הלקוח/ה בחר/ה לא להמשיך איתך בפרויקט "${title}".\nהסיבה שנמסרה: ${reason}`);
      dmSent = true;
    } catch (err) {
      // The release already happened and must stand; losing the note is the
      // lesser failure. Logged, and reported back so the client can be told.
      console.error('[candidates] rejection DM failed', { projectId, proId, err });
    }
  }

  const activation = await maybeActivateProject(projectId);
  return { ok: true, dmSent, activated: activation.activate };
});

/**
 * The professional's רלוונטי — "I'm in". Option A: an acknowledgement the client
 * can see, NOT a gate. The client's review, confirmCandidate and activation are
 * untouched by it.
 *
 * It does change what the professional may do next: once acknowledged, he may no
 * longer open a price change of his own while the client is still deciding —
 * only counter the client's (priceRequestPolicy). Idempotent.
 */
export const acknowledgeCandidacy = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const { projectId } = await loadAsCandidate(uid, request.data?.projectId);
  const pending = await requireUnderReview(projectId, uid);

  const batch = db.batch();
  for (const d of pending) {
    batch.update(d.ref, { proAccepted: true, proAcceptedAt: FieldValue.serverTimestamp() } as Update);
  }
  await batch.commit();
  return { ok: true, acknowledged: pending.length };
});

/**
 * The professional's לא רלוונטי — he leaves before anything was agreed.
 *
 * Immediate, no client approval: this is the stage where the client can already
 * let him go unilaterally, and the symmetry is the point. Once the client has
 * confirmed him, leaving goes back through requestEngagementEnd, which the client
 * answers. Same mechanics as a rejection (releaseEngagement), with its own
 * reason: the chat notice says he chose not to continue, the client is pushed,
 * and it counts toward neither completion nor reliability.
 */
export const declineCandidacy = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const { projectId } = await loadAsCandidate(uid, request.data?.projectId);
  await requireUnderReview(projectId, uid);
  await requirePlainHire(projectId, uid);

  await releaseEngagement(projectId, uid, 'candidate_declined');
  await closePendingPriceChanges(projectId, uid);

  const activation = await maybeActivateProject(projectId);
  return { ok: true, activated: activation.activate };
});

/**
 * Move the project to 'in_progress' when its crew is confirmed and complete,
 * and announce the crew in the group chat.
 *
 * A TRANSACTION so the check and the write see the same state: two confirms
 * landing together both call this, and only one may post the crew message.
 * The loser re-runs, re-reads status 'in_progress', and does nothing.
 */
export async function maybeActivateProject(projectId: string): Promise<ActivationDecision> {
  const projectRef = db.doc(`projects/${projectId}`);
  return db.runTransaction(async (tx) => {
    const projectSnap = await tx.get(projectRef);
    const project = projectSnap.data();
    if (!project) return { activate: false, reason: 'project not found' };

    const offersFor = (col: string) => db.collection(col)
      .where('projectId', '==', projectId)
      .where('status', '==', 'accepted');
    const [price, bundle] = await Promise.all([
      tx.get(offersFor('priceOffers')),
      tx.get(offersFor('bundleOffers')),
    ]);
    const offers = [...price.docs, ...bundle.docs].map((d) => d.data());

    const decision = decideActivation(project, offers);
    if (!decision.activate) return decision;

    const proIds = [...new Set(offers.map((o) => o.professionalId as string).filter(Boolean))];
    const userSnaps = await Promise.all(proIds.map((id) => tx.get(db.doc(`users/${id}`))));
    const chatId = project.chatId as string | undefined;
    const chatSnap = chatId ? await tx.get(db.doc(`chats/${chatId}`)) : null;

    // ── writes (no reads below this line) ──
    tx.update(projectRef, { status: 'in_progress' } as Update);

    if (chatId && chatSnap?.exists) {
      const names = userSnaps
        .map((s) => (s.get('displayName') as string | undefined)?.trim())
        .filter((n): n is string => !!n);
      const text = names.length > 0 ? `🎬 הצוות נסגר: ${names.join(', ')}` : '🎬 הצוות נסגר';
      tx.set(db.collection(`chats/${chatId}/messages`).doc(), {
        senderId: 'system', system: true, text,
        timestamp: FieldValue.serverTimestamp(), readBy: [],
      });
      const chatUpdate: Record<string, unknown> = {
        lastMessage: { text, senderId: 'system', timestamp: FieldValue.serverTimestamp() },
      };
      for (const memberId of (chatSnap.get('members') as string[] | undefined) ?? []) {
        chatUpdate[`unreadCount.${memberId}`] = FieldValue.increment(1);
      }
      tx.update(chatSnap.ref, chatUpdate as Update);
    }
    return decision;
  });
}
