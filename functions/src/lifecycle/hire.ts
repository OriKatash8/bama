import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, FieldValue, parseDeadline, daysFromNow, requireAuth, feeRef } from './helpers';
import { readConfig, feeRateOf, type PricingConfig } from './config';
import { assignFilledCapability } from '../matching';
import {
  DEFAULT_PROJECT_DURATION_DAYS,
  canHireOnStatus, isOfferPriceValid,
  hireConsumesNewSlot, atSlotCap,
} from '../pricing';

type Filled = { category: string; professionalId: string; requiredCapability?: string };
type Batch = admin.firestore.WriteBatch;
type Update = admin.firestore.UpdateData<admin.firestore.DocumentData>;

/**
 * Load the project, verify the caller is its client, and ENFORCE the open-project
 * cap. Throws `resource-exhausted` when blocked. Single source of enforcement —
 * every hire (offer or bundle) goes through here.
 *
 * The cap is `maxOpenProjects` from the runtime config, and the ONLY things that
 * free a slot are completion and cancellation. There is deliberately no way to
 * buy past it: a subscription tier used to lift it to ten projects a month, which
 * made capacity a thing you could purchase.
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

  // A completed or cancelled project is closed to new hires. Without this a hire
  // could land AFTER cancelProject had emptied `slotHolders`, re-occupying a slot
  // that nothing will ever free again and minting a fee doc on a dead project —
  // which is the state iE5bnmC138mftNwdYvyg is stuck in.
  //
  // `failed-precondition`, NOT `resource-exhausted`: that code belongs to the cap
  // and the monthly limit, and the client's hireErrorMessage branches on the
  // message. Deliberately distinct so the client can say what actually happened.
  if (!canHireOnStatus(project.status)) {
    throw new HttpsError('failed-precondition', 'project-not-hireable');
  }

  const config = await readConfig();

  // This pro's existing fee record on THIS project, if any — a pro can be hired
  // for a second role on a project they are already on. Read here (never inside
  // commitHire) so the immutable lock is decided before the batch runs.
  const existingFeeSnap = await feeRef(projectId, proId).get();

  // A second role on a project this pro already holds a slot on consumes nothing —
  // see hireConsumesNewSlot for why this must come BEFORE the cap query, and why
  // it keys on slotHolders rather than professionalIds.
  const consumesNewSlot = hireConsumesNewSlot(project.slotHolders as string[] | undefined, proId);

  if (consumesNewSlot) {
    // Projects where THIS pro still occupies a slot. Single-field array-contains —
    // no composite index needed. Not reached when the pro already holds a slot
    // here, so the query never counts the project being hired onto.
    const active = await db
      .collection('projects')
      .where('slotHolders', 'array-contains', proId)
      .limit(config.maxOpenProjects + 1)
      .get();
    if (atSlotCap(active.size, config.maxOpenProjects)) {
      throw new HttpsError('resource-exhausted', 'slot-cap-reached');
    }
  }
  return { projSnap, project, config, existingFeeSnap, consumesNewSlot };
}

/**
 * Commit accept writes + chat + THIS pro's fee record, atomically.
 *
 * The fee record is written on EVERY hire, not just the first. It used to sit
 * inside the `isFirstHire` branch, so pros 2..n silently inherited pro #1's fee
 * status. Each pro now gets their own `fees/{proId}` doc, and only the genuinely
 * project-level state (the group chat, expectedEndDate, the completion machine)
 * stays first-hire-gated.
 */
async function commitHire(args: {
  projSnap: admin.firestore.DocumentSnapshot;
  project: Record<string, unknown>;
  proId: string;
  config: PricingConfig;
  existingFeeSnap: admin.firestore.DocumentSnapshot;
  /** False when the pro already held a slot here — see hireConsumesNewSlot. */
  consumesNewSlot: boolean;
  filledEntries: Filled[];
  amount: number;
  acceptWrites: (batch: Batch) => void;
}): Promise<string> {
  const {
    projSnap, project, proId, config,
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

  // ── This pro's fee record ──
  // `baseAmount` accumulates: a pro hired for a second role on the same project
  // owes on the sum of both. increment() treats a missing doc/field as 0.
  const feeUpdate: Record<string, unknown> = {
    professionalId: proId,
    projectId: projSnap.id,
    baseAmount: FieldValue.increment(amount),
    slotActive: true,
  };
  if (!existingFeeSnap.exists) {
    // Written once, at this pro's FIRST hire on this project, and immutable
    // afterwards. The RATE IS CAPTURED HERE, not at completion: a later edit to
    // config/pricing.feePercent must never change a fee that was already agreed.
    feeUpdate.feeStatus = 'owed';
    feeUpdate.feeRate = feeRateOf(config);
    // The commission FLOOR, locked here for the same reason as the rate: raising
    // config/pricing.minFeeAmount later must never reprice a project that was
    // already agreed. Absent on pre-floor records, which read it as 0.
    feeUpdate.minFeeApplied = config.minFeeAmount;
    feeUpdate.status = 'pending';
    feeUpdate.hiredAt = FieldValue.serverTimestamp();
    feeUpdate.createdAt = FieldValue.serverTimestamp();
  } else if (existingFeeSnap.get('feePaid') === true) {
    // Re-hire onto a project whose fee this pro has ALREADY settled, for a
    // further role. The extra baseAmount is genuinely owed, so the settled flag
    // has to drop — otherwise markFeePaid would refuse the new amount as
    // "already paid" and it could never be recorded.
    // `paidAmount` is untouched and carries their earlier payment forward, so
    // they are charged only the delta, never twice for the first portion.
    // Bookkeeping only: nothing here affects slots, reviews, or what they can do.
    feeUpdate.feePaid = false;
    feeUpdate.feePaidAt = FieldValue.delete();
    feeUpdate.status = 'pending';
  }
  batch.set(feeRef(projSnap.id, proId), feeUpdate, { merge: true });

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

  // Backstop behind the submission UI and the security rules. The amount here
  // becomes the fee base, so a typo that slipped past the other two layers — or
  // an offer written before they existed — must not be hireable.
  const srcPrice = (offerId ? src.price : src.bundlePrice) as unknown;
  if (!isOfferPriceValid(srcPrice)) {
    throw new HttpsError('failed-precondition', 'offer-price-out-of-range');
  }

  const ctx = await loadAndEnforce(uid, projectId, proId);
  const prepared = offerId
    ? await prepareOffer(srcSnap, ctx.project)
    : await prepareBundle(srcSnap, ctx.project);

  const chatId = await commitHire({ ...ctx, proId, ...prepared });
  return { chatId };
});
