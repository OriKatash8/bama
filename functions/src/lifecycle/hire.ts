import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, FieldValue, monthKey, parseDeadline, daysFromNow, requireAuth, feeRef } from './helpers';
import { assignFilledCapability } from '../matching';
import {
  NON_SUBSCRIBER_SLOT_CAP, SUBSCRIBER_MONTHLY_LIMIT, PLATFORM_FEE_RATE, DEFAULT_PROJECT_DURATION_DAYS,
} from '../pricing';

type Filled = { category: string; professionalId: string; requiredCapability?: string };
type Batch = admin.firestore.WriteBatch;
type Update = admin.firestore.UpdateData<admin.firestore.DocumentData>;

/**
 * Load the project, verify the caller is its client, read the pro's subscription,
 * and ENFORCE the cap (non-sub: slot-active projects) / monthly limit (sub).
 * Throws `resource-exhausted` when blocked. Single source of enforcement — every
 * hire (offer or bundle) goes through here.
 */
async function loadAndEnforce(uid: string, projectId: string, proId: string) {
  const projSnap = await db.doc(`projects/${projectId}`).get();
  if (!projSnap.exists) throw new HttpsError('not-found', 'Project not found');
  const project = projSnap.data() as Record<string, unknown>;
  if (project.clientId !== uid) throw new HttpsError('permission-denied', 'Only the client can hire');

  // A client cannot hire themselves. Two rules each guard a different half of
  // the same person — priceOffers create checks `professionalId == uid`, and the
  // line above checks `clientId == uid` — so one user satisfies both and neither
  // notices.
  //
  // The reason to block rather than neutralise is NOT the fee. `filledSlots`
  // drives the review prompt, so a self-hire lets someone generate reviews of
  // themselves that count toward their own public rating. That has already
  // happened in production. Skipping the fee and the slot would leave both the
  // self-review and the subscriber monthCount increment intact.
  if (proId === project.clientId) {
    throw new HttpsError('failed-precondition', 'cannot-hire-yourself');
  }

  const subSnap = await db.doc(`subscriptions/${proId}`).get();
  const sub = subSnap.exists ? (subSnap.data() as Record<string, unknown>) : null;
  const isSubscriber = sub?.status === 'active';
  const thisMonth = monthKey();

  // This pro's existing fee record on THIS project, if any — a pro can be hired
  // for a second role on a project they are already on. Read here (never inside
  // commitHire) so the immutable lock is decided before the batch runs.
  const existingFeeSnap = await feeRef(projectId, proId).get();

  if (isSubscriber) {
    const count = sub?.monthKey === thisMonth ? (Number(sub?.monthCount) || 0) : 0;
    if (count >= SUBSCRIBER_MONTHLY_LIMIT) throw new HttpsError('resource-exhausted', 'monthly-limit-reached');
  } else {
    // Projects where THIS pro still occupies a slot. Per-pro: another pro settling
    // their own fee must not free this pro's slot. Single-field array-contains —
    // no composite index needed.
    const active = await db
      .collection('projects')
      .where('slotHolders', 'array-contains', proId)
      .limit(NON_SUBSCRIBER_SLOT_CAP + 1)
      .get();
    if (active.size >= NON_SUBSCRIBER_SLOT_CAP) throw new HttpsError('resource-exhausted', 'slot-cap-reached');
  }
  return { projSnap, project, subSnap, sub, isSubscriber, thisMonth, existingFeeSnap };
}

/**
 * Commit accept writes + chat + THIS pro's fee lock + subscriber counter, atomically.
 *
 * The fee lock runs on EVERY hire, not just the first. It used to sit inside the
 * `isFirstHire` branch, so pros 2..n silently inherited pro #1's fee status — one
 * subscriber hired first made the project free for every non-subscriber added
 * after. Each pro now gets their own `fees/{proId}` doc from their own
 * subscription status, and only the genuinely project-level state (the group chat,
 * expectedEndDate, the completion machine) stays first-hire-gated.
 */
async function commitHire(args: {
  projSnap: admin.firestore.DocumentSnapshot;
  project: Record<string, unknown>;
  proId: string;
  subSnap: admin.firestore.DocumentSnapshot;
  sub: Record<string, unknown> | null;
  isSubscriber: boolean;
  thisMonth: string;
  existingFeeSnap: admin.firestore.DocumentSnapshot;
  filledEntries: Filled[];
  amount: number;
  acceptWrites: (batch: Batch) => void;
}): Promise<string> {
  const {
    projSnap, project, proId, subSnap, sub, isSubscriber, thisMonth,
    existingFeeSnap, filledEntries, amount, acceptWrites,
  } = args;
  const batch = db.batch();
  acceptWrites(batch);

  const isFirstHire = !project.chatId;
  const projUpdate: Update = {
    filledSlots: FieldValue.arrayUnion(...filledEntries),
    professionalIds: FieldValue.arrayUnion(proId),
    // This pro now occupies a slot. Per-pro, so another pro settling later does
    // not free theirs. `slotActive` is the derived "anyone still unsettled" flag
    // kept only so lifecycleCron's range sweeps stay indexable.
    slotHolders: FieldValue.arrayUnion(proId),
    slotActive: true,
  };
  let chatId = project.chatId as string | undefined;

  if (isFirstHire) {
    const chatRef = db.collection('chats').doc();
    chatId = chatRef.id;
    batch.set(chatRef, {
      type: 'group',
      name: (project.title as string) ?? '',
      projectId: projSnap.id,
      members: [project.clientId, proId],
      roles: { [project.clientId as string]: 'admin' },
      lastMessage: null,
      createdAt: FieldValue.serverTimestamp(),
    });
    projUpdate.chatId = chatId;
    projUpdate.expectedEndDate = parseDeadline(project.deadline) ?? daysFromNow(DEFAULT_PROJECT_DURATION_DAYS);
    projUpdate.completion = { state: 'none' };
    // NOTE: no project-level feeStatus/feeRate is written any more. The fee is
    // per-pro (see below); a parallel project-level copy would be a second source
    // of truth a later reader could pick the wrong one from. Legacy docs keep
    // theirs, and a MISSING fee doc is read as 'exempt'.
  } else {
    batch.update(db.doc(`chats/${chatId}`), { members: FieldValue.arrayUnion(proId) });
  }
  batch.update(projSnap.ref, projUpdate);

  // ── This pro's fee record — locked from THEIR subscription status ──
  // `baseAmount` accumulates: a pro hired for a second role on the same project
  // owes on the sum of both. increment() treats a missing doc/field as 0.
  const feeUpdate: Record<string, unknown> = {
    professionalId: proId,
    baseAmount: FieldValue.increment(amount),
    slotActive: true,
  };
  if (!existingFeeSnap.exists) {
    // Immutable, set once at this pro's FIRST hire on this project. A pro who
    // subscribes between two hires on the same project keeps their original
    // status — spec §3: fee status can never change under them.
    feeUpdate.feeStatus = isSubscriber ? 'included' : 'owed';
    feeUpdate.feeRate = PLATFORM_FEE_RATE;
    feeUpdate.hiredAt = FieldValue.serverTimestamp();
  } else if (existingFeeSnap.get('feePaid') === true) {
    // Re-hire onto a project this pro ALREADY settled (they paid early per §5,
    // freeing their slot, and were then hired for another role). The extra
    // baseAmount is genuinely owed again, so the settled flag has to drop —
    // otherwise they hold a slot that markFeePaid and payFee both refuse to
    // settle as "already paid", and it can never be freed.
    // `paidAmount` is untouched and carries their earlier payment forward, so
    // they are charged only the delta, never twice for the first portion.
    feeUpdate.feePaid = false;
    feeUpdate.feePaidAt = FieldValue.delete();
  }
  batch.set(feeRef(projSnap.id, proId), feeUpdate, { merge: true });

  if (isSubscriber) {
    const base = sub?.monthKey === thisMonth ? (Number(sub?.monthCount) || 0) : 0;
    batch.set(subSnap.ref, { monthKey: thisMonth, monthCount: base + 1 }, { merge: true });
  }

  await batch.commit();
  return chatId as string;
}

// ── Per-type accept preparation (which docs to accept/reject + the filled slots) ──

async function prepareOffer(offerSnap: admin.firestore.DocumentSnapshot, project: Record<string, unknown>) {
  const offer = offerSnap.data() as Record<string, unknown>;
  const projectId = offer.projectId as string;
  const proId = offer.professionalId as string;
  const category = offer.category as string;

  const profSnap = await db.doc(`users/${proId}/profile/data`).get();
  const roleSkills = (profSnap.data()?.roleSkills as { role: string; specializations: string[] }[]) ?? [];
  const cap = assignFilledCapability(
    (project.crewSlots as never[]) ?? [], (project.filledSlots as never[]) ?? [], roleSkills, category,
  );
  const filledEntries: Filled[] = [{ category, professionalId: proId, ...(cap ? { requiredCapability: cap } : {}) }];
  // The pro's own accepted value. Read from the in-memory offer, NOT by querying
  // priceOffers: this offer is accepted in the same batch, so a query here would
  // not see it (read-after-write).
  const amount = (offer.price as number | undefined) ?? 0;

  const competing = await db.collection('priceOffers')
    .where('projectId', '==', projectId).where('category', '==', category).where('status', '==', 'pending').get();
  const staleBundles = await db.collection('bundleOffers')
    .where('projectId', '==', projectId).where('professionalId', '==', proId).where('status', '==', 'pending').get();

  const acceptWrites = (batch: Batch) => {
    competing.docs.forEach((d) => { if (d.id !== offerSnap.id) batch.update(d.ref, { status: 'rejected' }); });
    staleBundles.docs.forEach((d) => batch.update(d.ref, { status: 'rejected' }));
    batch.update(offerSnap.ref, { status: 'accepted' });
  };
  return { filledEntries, amount, acceptWrites };
}

async function prepareBundle(bSnap: admin.firestore.DocumentSnapshot, project: Record<string, unknown>) {
  const bundle = bSnap.data() as Record<string, unknown>;
  const projectId = bundle.projectId as string;
  const proId = bundle.professionalId as string;
  const slots = (bundle.slots as { category: string }[]) ?? [];
  const offerIds = (bundle.offerIds as string[]) ?? [];
  // A bundle is ONE discounted amount covering several slots. Its individual
  // offers keep their own prices, so summing them would over-charge — the pro is
  // charged bundlePrice, once.
  const amount = (bundle.bundlePrice as number | undefined) ?? 0;

  const profSnap = await db.doc(`users/${proId}/profile/data`).get();
  const roleSkills = (profSnap.data()?.roleSkills as { role: string; specializations: string[] }[]) ?? [];
  const running: Filled[] = [...(((project.filledSlots as Filled[]) ?? []))];
  const filledEntries: Filled[] = slots.map((s) => {
    const cap = assignFilledCapability((project.crewSlots as never[]) ?? [], running as never[], roleSkills, s.category);
    const entry: Filled = { category: s.category, professionalId: proId, ...(cap ? { requiredCapability: cap } : {}) };
    running.push(entry);
    return entry;
  });

  const competingOfferIds = new Set<string>();
  for (const slot of slots) {
    const snap = await db.collection('priceOffers')
      .where('projectId', '==', projectId).where('category', '==', slot.category).where('status', '==', 'pending').get();
    snap.docs.filter((d) => !offerIds.includes(d.id)).forEach((d) => competingOfferIds.add(d.id));
  }
  const allBundles = await db.collection('bundleOffers')
    .where('projectId', '==', projectId).where('status', '==', 'pending').get();
  const competingBundleIds = allBundles.docs
    .filter((d) => d.id !== bSnap.id && ((d.data().slots as { category: string }[]) ?? []).some((bs) => slots.some((s) => s.category === bs.category)))
    .map((d) => d.id);

  const acceptWrites = (batch: Batch) => {
    batch.update(bSnap.ref, { status: 'accepted' });
    offerIds.forEach((id) => batch.update(db.doc(`priceOffers/${id}`), { status: 'accepted' }));
    competingOfferIds.forEach((id) => batch.update(db.doc(`priceOffers/${id}`), { status: 'rejected' }));
    competingBundleIds.forEach((id) => batch.update(db.doc(`bundleOffers/${id}`), { status: 'rejected' }));
  };
  return { filledEntries, amount, acceptWrites };
}

/**
 * Client hires a professional by accepting an individual offer OR a bundle.
 * ONE callable, ONE enforcement path (loadAndEnforce + commitHire) for both —
 * a bundle accept cannot skip the cap, monthly limit, fee lock, or monthCount.
 */
export const hireProfessional = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const offerId = request.data?.offerId as string | undefined;
  const bundleId = request.data?.bundleId as string | undefined;
  if (!offerId && !bundleId) throw new HttpsError('invalid-argument', 'offerId or bundleId required');
  if (offerId && bundleId) throw new HttpsError('invalid-argument', 'Provide only one of offerId / bundleId');

  const col = offerId ? 'priceOffers' : 'bundleOffers';
  const id = (offerId ?? bundleId) as string;
  const srcSnap = await db.doc(`${col}/${id}`).get();
  if (!srcSnap.exists) throw new HttpsError('not-found', `${offerId ? 'Offer' : 'Bundle'} not found`);
  const src = srcSnap.data() as Record<string, unknown>;
  const projectId = src.projectId as string;
  const proId = src.professionalId as string;

  if (src.status === 'accepted') {
    const p = await db.doc(`projects/${projectId}`).get();
    return { chatId: (p.data()?.chatId as string) ?? null, alreadyAccepted: true };
  }
  if (src.status !== 'pending') throw new HttpsError('failed-precondition', 'Offer/bundle is not pending');

  const ctx = await loadAndEnforce(uid, projectId, proId);
  const prepared = offerId
    ? await prepareOffer(srcSnap, ctx.project)
    : await prepareBundle(srcSnap, ctx.project);

  const chatId = await commitHire({ ...ctx, proId, ...prepared });
  return { chatId };
});
