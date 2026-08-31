import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, FieldValue, monthKey, parseDeadline, daysFromNow, requireAuth } from './helpers';
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

  const subSnap = await db.doc(`subscriptions/${proId}`).get();
  const sub = subSnap.exists ? (subSnap.data() as Record<string, unknown>) : null;
  const isSubscriber = sub?.status === 'active';
  const thisMonth = monthKey();

  if (isSubscriber) {
    const count = sub?.monthKey === thisMonth ? (Number(sub?.monthCount) || 0) : 0;
    if (count >= SUBSCRIBER_MONTHLY_LIMIT) throw new HttpsError('resource-exhausted', 'monthly-limit-reached');
  } else {
    // Count only projects with slotActive == true; pre-backfill (undefined) never counts.
    const active = await db
      .collection('projects')
      .where('professionalIds', 'array-contains', proId)
      .where('slotActive', '==', true)
      .limit(NON_SUBSCRIBER_SLOT_CAP + 1)
      .get();
    if (active.size >= NON_SUBSCRIBER_SLOT_CAP) throw new HttpsError('resource-exhausted', 'slot-cap-reached');
  }
  return { projSnap, project, subSnap, sub, isSubscriber, thisMonth };
}

/** Commit accept writes + chat + (first hire) fee lock + subscriber counter, atomically. */
async function commitHire(args: {
  projSnap: admin.firestore.DocumentSnapshot;
  project: Record<string, unknown>;
  proId: string;
  subSnap: admin.firestore.DocumentSnapshot;
  sub: Record<string, unknown> | null;
  isSubscriber: boolean;
  thisMonth: string;
  filledEntries: Filled[];
  acceptWrites: (batch: Batch) => void;
}): Promise<string> {
  const { projSnap, project, proId, subSnap, sub, isSubscriber, thisMonth, filledEntries, acceptWrites } = args;
  const batch = db.batch();
  acceptWrites(batch);

  const isFirstHire = !project.chatId;
  const projUpdate: Update = {
    filledSlots: FieldValue.arrayUnion(...filledEntries),
    professionalIds: FieldValue.arrayUnion(proId),
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
    // Fee status is locked HERE (chat creation) and immutable thereafter.
    projUpdate.feeStatus = isSubscriber ? 'included' : 'owed';
    projUpdate.feeRate = PLATFORM_FEE_RATE;
    projUpdate.slotActive = true;
    projUpdate.expectedEndDate = parseDeadline(project.deadline) ?? daysFromNow(DEFAULT_PROJECT_DURATION_DAYS);
    projUpdate.completion = { state: 'none' };
  } else {
    batch.update(db.doc(`chats/${chatId}`), { members: FieldValue.arrayUnion(proId) });
  }
  batch.update(projSnap.ref, projUpdate);

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

  const competing = await db.collection('priceOffers')
    .where('projectId', '==', projectId).where('category', '==', category).where('status', '==', 'pending').get();
  const staleBundles = await db.collection('bundleOffers')
    .where('projectId', '==', projectId).where('professionalId', '==', proId).where('status', '==', 'pending').get();

  const acceptWrites = (batch: Batch) => {
    competing.docs.forEach((d) => { if (d.id !== offerSnap.id) batch.update(d.ref, { status: 'rejected' }); });
    staleBundles.docs.forEach((d) => batch.update(d.ref, { status: 'rejected' }));
    batch.update(offerSnap.ref, { status: 'accepted' });
  };
  return { filledEntries, acceptWrites };
}

async function prepareBundle(bSnap: admin.firestore.DocumentSnapshot, project: Record<string, unknown>) {
  const bundle = bSnap.data() as Record<string, unknown>;
  const projectId = bundle.projectId as string;
  const proId = bundle.professionalId as string;
  const slots = (bundle.slots as { category: string }[]) ?? [];
  const offerIds = (bundle.offerIds as string[]) ?? [];

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
  return { filledEntries, acceptWrites };
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
