import { randomUUID } from 'crypto';
import * as admin from 'firebase-admin';
import {
  db, FieldValue, Timestamp, feeRef, type FeeDoc,
} from '../lifecycle/helpers';
import { getLinkProvider } from './getProvider';
import type { PaymentsConfig } from './guard';
import {
  evaluateLinkClaim, feeKeyOf, growFullName, isFeeClosed, israeliMobileLocal, LINK_MAX_ATTEMPTS,
} from './linkLogic';
import { sendLinkNotice } from './notices';
import type { LinkProvider } from './types';

/**
 * Link mode: claim -> ask Make for a link -> store it. One link per fee.
 *
 * Nothing here marks a fee paid. A payment arrives only through paymentLinkConfirm
 * (Make -> us), which is the single place a link settles a fee.
 *
 * Every state change is a transaction that re-reads the fee, so two overlapping
 * sweeps cannot both claim it, and a feeDue that moved while Make was working
 * cannot get a stale link attached.
 */

export const pointerRef = (processId: string) => db.doc(`paymentLinks/${processId}`);

export type Payer = { fullName: string; phone: string; email?: string };

export type PayerLookup =
  | { ok: true; payer: Payer; title: string }
  | { ok: false; reason: 'no-mobile' };

/** Name, Israeli mobile, email: from the user doc, users/{uid}/private/contact and Auth. */
export async function loadPayer(proId: string, projectId: string): Promise<PayerLookup> {
  const [userSnap, contactSnap, projSnap, authUser] = await Promise.all([
    db.doc(`users/${proId}`).get(),
    db.doc(`users/${proId}/private/contact`).get(),
    db.doc(`projects/${projectId}`).get(),
    admin.auth().getUser(proId).catch(() => null),
  ]);
  const phone = israeliMobileLocal(contactSnap.data()?.phone);
  if (!phone) return { ok: false, reason: 'no-mobile' };
  const title = projSnap.data()?.title;
  return {
    ok: true,
    payer: {
      // Grow rejects a one-word name (427 on pageFieldSettings[fullName]).
      fullName: growFullName(userSnap.data()?.displayName),
      phone,
      ...(authUser?.email ? { email: authUser.email } : {}),
    },
    title: typeof title === 'string' ? title : '',
  };
}

export type LinkRunResult =
  | { status: 'no-provider' }
  | { status: 'skipped'; reason: string }
  | { status: 'needs_phone' }
  | { status: 'created'; processId: string }
  | { status: 'failed' }
  | { status: 'voided' };

export type LinkDeps = {
  provider?: LinkProvider | null;
  loadPayer?: typeof loadPayer;
};

type ClaimOut =
  | { claimed: true; claimId: string; amount: number; attempt: number }
  | { claimed: false; reason: string };

/** Transactionally take the creation lock; supersede a stale link in the same step. */
export async function claimFeeForLink(
  projectId: string, proId: string, now: number = Date.now(),
): Promise<ClaimOut> {
  const ref = feeRef(projectId, proId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const verdict = evaluateLinkClaim(snap.exists ? (snap.data() as FeeDoc) : undefined, now);
    if (!verdict.ok) return { claimed: false as const, reason: verdict.reason };
    const fee = snap.data() as FeeDoc;

    const claimId = randomUUID();
    const update: Record<string, unknown> = {
      paymentLinkClaim: { id: claimId, at: Timestamp.fromMillis(now), attempts: verdict.attempt },
      projectId,
    };
    if (verdict.replaces && fee.paymentLink) {
      update.paymentLink = { ...fee.paymentLink, superseded: true };
      tx.set(pointerRef(verdict.replaces), { supersededAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    tx.update(ref, update);
    return { claimed: true as const, claimId, amount: verdict.amount, attempt: verdict.attempt };
  });
}

/** Make failed or timed out: free the lock now, keep the attempt count. */
export async function releaseLinkClaim(
  projectId: string, proId: string, claimId: string, now: number = Date.now(),
): Promise<void> {
  const ref = feeRef(projectId, proId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const fee = snap.data() as FeeDoc;
    const claim = fee.paymentLinkClaim;
    if (!claim || claim.id !== claimId) return;
    const update: Record<string, unknown> = {
      // Epoch, not a delete: the attempt counter must survive until success.
      paymentLinkClaim: { id: claim.id, at: Timestamp.fromMillis(0), attempts: claim.attempts },
    };
    if (claim.attempts >= LINK_MAX_ATTEMPTS && (!fee.linkReview || fee.linkReview.acknowledgedAt)) {
      update.linkReview = {
        reason: 'link_create_failed', at: Timestamp.fromMillis(now), amount: fee.feeDue,
        note: `Make failed ${claim.attempts} times`,
      };
      update.chargeNeedsAdmin = true;
    }
    tx.update(ref, update);
  });
}

type StoreOut = { stored: true } | { stored: false; reason: string };

/**
 * Attach the new link, only if we still hold the claim and feeDue is what the link
 * was made for. Otherwise the link exists at Grow but must never settle anything:
 * its pointer is marked superseded and the next sweep makes a correct one.
 */
export async function storeLink(
  projectId: string, proId: string,
  claim: { claimId: string; amount: number },
  link: { url: string; processId: string },
  now: number = Date.now(),
): Promise<StoreOut> {
  const ref = feeRef(projectId, proId);
  const pRef = pointerRef(link.processId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const fee = snap.exists ? (snap.data() as FeeDoc) : undefined;
    const holds = !!fee && fee.paymentLinkClaim?.id === claim.claimId;
    const valid = holds && !isFeeClosed(fee!) && fee!.feeDue === claim.amount;
    tx.set(pRef, {
      projectId, proId, feeKey: feeKeyOf(projectId, proId), amount: claim.amount,
      createdAt: Timestamp.fromMillis(now),
      ...(valid ? {} : { supersededAt: Timestamp.fromMillis(now) }),
    });
    if (!valid) return { stored: false as const, reason: holds ? 'fee-changed' : 'claim-lost' };
    tx.update(ref, {
      paymentLink: {
        url: link.url, processId: link.processId, amount: claim.amount, createdAt: Timestamp.fromMillis(now),
      },
      chargeState: 'awaiting_payment',
      paymentLinkClaim: FieldValue.delete(),
      needsPhoneNotifiedAt: FieldValue.delete(),
      linkNotifiedAt: Timestamp.fromMillis(now),
      projectId,
    });
    return { stored: true as const };
  });
}

/** No usable mobile: park the fee at needs_phone and push once. */
export async function markNeedsPhone(
  projectId: string, proId: string, now: number = Date.now(),
): Promise<boolean> {
  const ref = feeRef(projectId, proId);
  const amount = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const fee = snap.data() as FeeDoc;
    if (!evaluateLinkClaim({ ...fee, paymentLinkClaim: undefined }, now).ok) return null;
    const first = fee.needsPhoneNotifiedAt === undefined;
    const update: Record<string, unknown> = { chargeState: 'needs_phone', projectId };
    if (fee.paymentLink && fee.paymentLink.superseded !== true && fee.paymentLink.amount !== fee.feeDue) {
      update.paymentLink = { ...fee.paymentLink, superseded: true };
      tx.set(pointerRef(fee.paymentLink.processId), { supersededAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    if (first) update.needsPhoneNotifiedAt = Timestamp.fromMillis(now);
    tx.update(ref, update);
    return first ? (fee.feeDue as number) : null;
  });
  if (amount !== null) await sendLinkNotice('link_needs_phone', proId, projectId, amount);
  return amount !== null;
}

/** An awaiting_payment fee that is now settled/voided: retire its link. */
export async function voidDeadLink(projectId: string, proId: string): Promise<boolean> {
  const ref = feeRef(projectId, proId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const fee = snap.data() as FeeDoc;
    if (fee.chargeState !== 'awaiting_payment' || !fee.paymentLink || !isFeeClosed(fee)) return false;
    tx.update(ref, {
      // A paid fee keeps the link record (paidBy/providerRef say how); anything
      // else goes back to idle so a re-opened fee can get a fresh link.
      paymentLink: { ...fee.paymentLink, superseded: true },
      chargeState: fee.feePaid === true || fee.status === 'paid' ? 'succeeded' : 'idle',
    });
    tx.set(pointerRef(fee.paymentLink.processId), { supersededAt: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
}

/** One fee, one pass: create (or replace) its link if it is due one. */
export async function runLinkIssue(
  projectId: string, proId: string, config: PaymentsConfig,
  now: number = Date.now(), deps: LinkDeps = {},
): Promise<LinkRunResult> {
  const provider = deps.provider !== undefined
    ? deps.provider
    : getLinkProvider(config, { professionalId: proId });
  if (!provider) return { status: 'no-provider' };

  const snap = await feeRef(projectId, proId).get();
  const fee = snap.exists ? (snap.data() as FeeDoc) : undefined;
  if (fee && fee.chargeState === 'awaiting_payment' && isFeeClosed(fee)) {
    if (await voidDeadLink(projectId, proId)) return { status: 'voided' };
  }
  const pre = evaluateLinkClaim(fee, now);
  if (!pre.ok) return { status: 'skipped', reason: pre.reason };

  const payerLookup = await (deps.loadPayer ?? loadPayer)(proId, projectId);
  if (!payerLookup.ok) {
    await markNeedsPhone(projectId, proId, now);
    return { status: 'needs_phone' };
  }

  const claim = await claimFeeForLink(projectId, proId, now);
  if (!claim.claimed) return { status: 'skipped', reason: claim.reason };

  let link: { url: string; processId: string };
  try {
    link = await provider.createPaymentLink({
      feeKey: feeKeyOf(projectId, proId),
      requestId: claim.claimId,
      projectId, proId,
      amount: claim.amount,
      currency: 'ILS',
      description: payerLookup.title ? `עמלת תיווך – ${payerLookup.title}` : 'עמלת תיווך',
      payer: payerLookup.payer,
    });
  } catch (err) {
    console.error('[link] create failed; will retry next run', projectId, proId, err);
    await releaseLinkClaim(projectId, proId, claim.claimId, now);
    return { status: 'failed' };
  }

  const stored = await storeLink(projectId, proId, claim, link, now);
  if (!stored.stored) {
    await releaseLinkClaim(projectId, proId, claim.claimId, now);
    return { status: 'skipped', reason: stored.reason };
  }
  await sendLinkNotice('link_ready', proId, projectId, claim.amount);
  return { status: 'created', processId: link.processId };
}
