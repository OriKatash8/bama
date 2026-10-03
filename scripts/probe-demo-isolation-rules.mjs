#!/usr/bin/env node
/**
 * Probe: demo-account isolation in firestore.rules (config/demoAccounts).
 *
 * Runs against the Firestore EMULATOR with whatever firestore.rules currently
 * says. Nothing here touches production.
 *
 *   npx firebase emulators:start --only firestore,auth --project bama-af0a0
 *   node scripts/probe-demo-isolation-rules.mjs
 *
 * Two states, each over the SAME flows, written in the app's exact shapes:
 *   A  config/demoAccounts ABSENT (production at deploy time): every flow is
 *      allowed for every pair — the rules must behave exactly as before.
 *   B  config/demoAccounts PRESENT: real↔real and demo↔demo allowed; every
 *      flow that connects two people is denied across sides, both directions;
 *      flows that reach only BAMA (reports, community requests, the own system
 *      chat, a chat with an admin) stay allowed for both sides.
 */
import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore, FieldValue as AFV } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, collection, setDoc, updateDoc, addDoc,
  writeBatch, runTransaction, serverTimestamp, arrayUnion, arrayRemove, increment, setLogLevel,
} from 'firebase/firestore';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
setLogLevel('silent');
const PROJECT = 'bama-af0a0';
const adminApp = initAdmin({ projectId: PROJECT });
const adb = getAdminFirestore(adminApp);
const aauth = getAdminAuth(adminApp);
const app = initializeApp({ apiKey: 'emulator-key', projectId: PROJECT }, 'probe');
const db = getFirestore(app);
const auth = getAuth(app);
connectFirestoreEmulator(db, '127.0.0.1', 8080);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });

const PW = 'probe-password-123';
const uidOf = {};
async function ensureUser(label, claims) {
  const email = `${label}@probe.invalid`;
  let uid;
  try { uid = (await createUserWithEmailAndPassword(auth, email, PW)).user.uid; }
  catch { uid = (await signInWithEmailAndPassword(auth, email, PW)).user.uid; }
  await aauth.updateUser(uid, { emailVerified: true });
  await aauth.setCustomUserClaims(uid, claims ?? null);
  await signOut(auth);
  uidOf[label] = uid;
  return uid;
}
let current = null;
async function as(label) {
  if (current === label) return;
  await signOut(auth).catch(() => {});
  await signInWithEmailAndPassword(auth, `${label}@probe.invalid`, PW);
  await auth.currentUser.getIdToken(true);
  current = label;
}

const R1 = await ensureUser('di-real1');
const R2 = await ensureUser('di-real2');
const D1 = await ensureUser('di-demo1');
const D2 = await ensureUser('di-demo2');
const ADMIN = await ensureUser('di-admin', { role: 'admin' });
const name = { [R1]: 'real1', [R2]: 'real2', [D1]: 'demo1', [D2]: 'demo2', [ADMIN]: 'admin' };
const label = { [R1]: 'di-real1', [R2]: 'di-real2', [D1]: 'di-demo1', [D2]: 'di-demo2', [ADMIN]: 'di-admin' };

let n = 0;
const uniq = (p) => `${p}-${Date.now().toString(36)}-${++n}`;
/** Communities listed in communityIds. A demo-OWNED community is demo with no
 *  listing (communityIsDemo), so the flows below never list theirs; only
 *  joinListedCommunity uses this, for a community a neutral admin owns. */
const demoCommunities = [];
const communityFor = (owner) => uniq(owner === D1 || owner === D2 ? 'demo-comm' : 'comm');

let statePresent = false;
async function setState(present) {
  statePresent = present;
  if (present) {
    await adb.doc('config/demoAccounts').set({ uids: [D1, D2], neutralUids: [ADMIN], communityIds: demoCommunities });
  } else {
    await adb.doc('config/demoAccounts').delete();
  }
}

// ── flows: (a = actor, b = the other party) → { seed?, run } ────────────────
// Every write below is the app's own shape (file:line in the comment).
const FLOWS = {
  // chatService.ts:148 getOrCreateDM
  dm: { run: (a, b) => addDoc(collection(db, 'chats'), { type: 'dm', members: [a, b], lastMessage: null, createdAt: serverTimestamp() }) },
  // chatService.ts:165 createPurchaseChat
  purchaseChat: {
    seed: async (a, b) => {
      const id = uniq('lst');
      await adb.doc(`marketplace_listings/${id}`).set({ type: 'secondhand', posterId: b, posterName: 'x', productName: 'Cam', location: 'TA', price: 100, imageUrl: null, status: 'available', createdAt: { seconds: 1, nanoseconds: 0 } });
      return { id };
    },
    run: (a, b, s) => addDoc(collection(db, 'chats'), { type: 'purchase', members: [a, b], purchaseListingId: s.id, name: 'Cam', buyerName: 'x', lastMessage: null, createdAt: serverTimestamp() }),
  },
  // DirectProjectSheet.tsx:224
  projectDirect: {
    run: (a, b) => addDoc(collection(db, 'projects'), {
      clientId: a, title: 'T', description: 'D', deadline: 'flexible', location: 'TA',
      crewSlots: [{ category: 'Video Photographer', quantity: 1 }], filledSlots: [], status: 'open',
      targetProfessionalId: b, createdAt: { seconds: 1, nanoseconds: 0 },
    }),
  },
  // a creates a project OWNED by b (clientId = b): the owner is checked, not only the target
  projectOwnedByOther: {
    run: (a, b) => addDoc(collection(db, 'projects'), {
      clientId: b, title: 'T', description: 'D', deadline: 'flexible', location: 'TA',
      crewSlots: [{ category: 'Editor', quantity: 1 }], filledSlots: [], status: 'open', createdAt: { seconds: 1, nanoseconds: 0 },
    }),
  },
  // project re-targeted to b by its client a (clientProjectFields)
  projectRetarget: {
    seed: async (a) => {
      const id = uniq('prj');
      await adb.doc(`projects/${id}`).set({ clientId: a, title: 'T', crewSlots: [{ category: 'Editor', quantity: 1 }], filledSlots: [], status: 'open', targetProfessionalId: null });
      return { id };
    },
    run: (a, b, s) => updateDoc(doc(db, 'projects', s.id), { targetProfessionalId: b }),
  },
  // usePriceOffer.ts:18 — a is the pro, b the client
  priceOffer: {
    seed: async (a, b) => seedOpenProject(b),
    run: (a, b, s) => addDoc(collection(db, 'priceOffers'), { projectId: s.id, professionalId: a, category: 'Editor', price: 300, status: 'pending', createdAt: serverTimestamp() }),
  },
  // usePriceOffer.ts:44-70 — offers, bundle, backfill batch
  bundleOffer: {
    seed: async (a, b) => seedOpenProject(b),
    run: async (a, b, s) => {
      const o1 = await addDoc(collection(db, 'priceOffers'), { projectId: s.id, professionalId: a, category: 'Editor', price: 300, status: 'pending', createdAt: serverTimestamp() });
      const o2 = await addDoc(collection(db, 'priceOffers'), { projectId: s.id, professionalId: a, category: 'Sound Recordist', price: 200, status: 'pending', createdAt: serverTimestamp() });
      const bundle = await addDoc(collection(db, 'bundleOffers'), {
        projectId: s.id, professionalId: a, slots: [{ category: 'Editor' }, { category: 'Sound Recordist' }],
        individualTotal: 500, bundlePrice: 450, offerIds: [o1.id, o2.id], status: 'pending', createdAt: { seconds: 1, nanoseconds: 0 },
      });
      const batch = writeBatch(db);
      batch.update(doc(db, 'priceOffers', o1.id), { bundleId: bundle.id });
      batch.update(doc(db, 'priceOffers', o2.id), { bundleId: bundle.id });
      await batch.commit();
    },
  },
  // useProjectApplication.ts:13
  application: {
    seed: async (a, b) => seedOpenProject(b),
    run: (a, b, s) => addDoc(collection(db, 'projectApplications'), { projectId: s.id, professionalId: a, status: 'pending', createdAt: { seconds: 1, nanoseconds: 0 } }),
  },
  // ReviewFlow.tsx:113 — a is the client reviewing pro b
  review: {
    seed: async (a, b) => {
      const id = uniq('prj');
      await adb.doc(`projects/${id}`).set({ clientId: a, title: 'T', crewSlots: [], filledSlots: [{ category: 'Editor', professionalId: b }], status: 'completed', professionalIds: [b] });
      return { id };
    },
    run: (a, b, s) => addDoc(collection(db, 'reviews'), { projectId: s.id, professionalId: b, reviewerId: a, authorId: a, authorName: 'x', rating: 5, text: 'Great work, thanks a lot', body: 'Great work, thanks a lot', createdAt: serverTimestamp() }),
  },
  // useCommunityDiscovery.ts:69 — a asks to join b's community
  joinRequest: {
    seed: async (a, b) => seedCommunity(b, [b]),
    run: (a, b, s) => setDoc(doc(db, 'chats', s.id, 'joinRequests', a), { userId: a, displayName: 'x', requestedAt: serverTimestamp(), status: 'pending' }),
  },
  // communityMembership.ts:65 approveJoinRequest — owner a approves b (transaction)
  ownerApprove: {
    seed: async (a, b) => {
      const s = await seedCommunity(a, [a]);
      await adb.doc(`chats/${s.id}/joinRequests/${b}`).set({ userId: b, displayName: 'x', requestedAt: new Date(), status: 'pending' });
      return s;
    },
    run: (a, b, s) => runTransaction(db, async (tx) => {
      const reqRef = doc(db, 'chats', s.id, 'joinRequests', b);
      const chatRef = doc(db, 'chats', s.id);
      await Promise.all([tx.get(reqRef), tx.get(chatRef)]);
      tx.update(reqRef, { status: 'approved', decidedAt: serverTimestamp() });
      tx.update(chatRef, { members: arrayUnion(b) });
      tx.set(doc(collection(db, 'chats', s.id, 'communityEvents')), { type: 'join', userId: b, at: serverTimestamp() });
    }),
  },
  // communityMembership.ts:93 approveAllJoinRequests — batch
  ownerApproveAll: {
    seed: async (a, b) => {
      const s = await seedCommunity(a, [a]);
      await adb.doc(`chats/${s.id}/joinRequests/${b}`).set({ userId: b, displayName: 'x', requestedAt: new Date(), status: 'pending' });
      return s;
    },
    run: async (a, b, s) => {
      const batch = writeBatch(db);
      batch.update(doc(db, 'chats', s.id, 'joinRequests', b), { status: 'approved', decidedAt: serverTimestamp() });
      batch.set(doc(collection(db, 'chats', s.id, 'communityEvents')), { type: 'join', userId: b, at: serverTimestamp() });
      batch.update(doc(db, 'chats', s.id), { members: arrayUnion(b) });
      await batch.commit();
    },
  },
  // chatService.ts:225 addMemberToGroup shape — owner a adds b with no request.
  // Isolates the chats-update members guard (ownerApprove also hits joinRequests).
  ownerAddsMember: {
    seed: async (a) => seedCommunity(a, [a]),
    run: (a, b, s) => updateDoc(doc(db, 'chats', s.id), { members: arrayUnion(b) }),
  },
  // approveJoinRequest's "already in" branch — status only, no members write.
  // Isolates the joinRequests owner-decision guard.
  ownerApproveStatusOnly: {
    seed: async (a, b) => {
      const s = await seedCommunity(a, [a]);
      await adb.doc(`chats/${s.id}/joinRequests/${b}`).set({ userId: b, displayName: 'x', requestedAt: new Date(), status: 'pending' });
      return s;
    },
    run: (a, b, s) => updateDoc(doc(db, 'chats', s.id, 'joinRequests', b), { status: 'approved', decidedAt: serverTimestamp() }),
  },
  // communityMembership.ts removeMember — a leaves b's community
  memberLeaves: {
    seed: async (a, b) => seedCommunity(b, [b, a]),
    run: async (a, b, s) => {
      const batch = writeBatch(db);
      batch.update(doc(db, 'chats', s.id), { members: arrayRemove(a) });
      batch.set(doc(collection(db, 'chats', s.id, 'communityEvents')), { type: 'leave', userId: a, at: serverTimestamp() });
      await batch.commit();
    },
  },
  // marketplaceService.ts:93 acceptDeal, pressed second by the BUYER a
  listingReserve: {
    seed: async (a, b) => {
      const id = uniq('lst'); const chatId = uniq('pch');
      await adb.doc(`marketplace_listings/${id}`).set({ type: 'secondhand', posterId: b, posterName: 'x', productName: 'Cam', location: 'TA', price: 100, imageUrl: null, status: 'available', createdAt: { seconds: 1, nanoseconds: 0 } });
      await adb.doc(`chats/${chatId}`).set({ type: 'purchase', members: [a, b], purchaseListingId: id, sellerAgreed: true, lastMessage: null });
      return { id, chatId };
    },
    run: async (a, b, s) => {
      const batch = writeBatch(db);
      batch.update(doc(db, 'marketplace_listings', s.id), { status: 'reserved', buyerId: a, purchaseChatId: s.chatId });
      batch.update(doc(db, 'chats', s.chatId), { sellerAgreed: true, buyerAgreed: true });
      await batch.commit();
    },
  },
  // chatService.ts:306 sendMessage, in an existing DM
  message: {
    seed: async (a, b) => { const id = uniq('dm'); await adb.doc(`chats/${id}`).set({ type: 'dm', members: [a, b], lastMessage: null }); return { id }; },
    run: async (a, b, s) => {
      await addDoc(collection(db, 'chats', s.id, 'messages'), { senderId: a, text: 'hi', timestamp: serverTimestamp(), readBy: [a] });
      await updateDoc(doc(db, 'chats', s.id), { lastMessage: { text: 'hi', senderId: a, timestamp: serverTimestamp() }, [`unreadCount.${b}`]: increment(1) });
    },
  },
};

// Flows that reach BAMA only — the actor alone (b unused, or an admin).
const BAMA_FLOWS = {
  // browse/profile/[userId].tsx:137 — a reports b
  report: (a, b) => addDoc(collection(db, 'reports'), { reporterId: a, reportedUserId: b, reportedUserName: 'x', reason: 'This is a report reason long enough', evidenceURLs: [], status: 'pending', createdAt: serverTimestamp() }),
  // (professional)/(tabs)/chats/index.tsx:250
  communityRequest: (a) => addDoc(collection(db, 'communityRequests'), { name: 'C', description: 'D', requesterId: a, requesterName: 'x', status: 'pending', createdAt: serverTimestamp() }),
  // the user's own BAMA System DM, read (functions/src/system/index.ts:49)
  ownSystemChat: async (a) => {
    await adb.doc(`chats/sys_${a}`).set({ type: 'dm', members: ['bama-system', a], readOnly: true, lastMessage: null });
    await adb.doc(`chats/sys_${a}/messages/m1`).set({ senderId: 'bama-system', system: true, text: 'hi', timestamp: new Date(), readBy: [] });
    await getDoc(doc(db, 'chats', `sys_${a}`));
    await getDocs(collection(db, 'chats', `sys_${a}`, 'messages'));
  },
  // a community owned by a neutral admin, put on the demo side by communityIds
  joinListedCommunity: async (a) => {
    const id = uniq('listed-comm');
    demoCommunities.push(id);
    await adb.doc(`chats/${id}`).set({ type: 'community', name: 'C', ownerId: ADMIN, members: [ADMIN], lastMessage: null });
    if (statePresent) await adb.doc('config/demoAccounts').set({ uids: [D1, D2], neutralUids: [ADMIN], communityIds: demoCommunities });
    await setDoc(doc(db, 'chats', id, 'joinRequests', a), { userId: a, displayName: 'x', requestedAt: serverTimestamp(), status: 'pending' });
  },
  // a chat with an admin (neutral)
  dmWithAdmin: (a) => addDoc(collection(db, 'chats'), { type: 'dm', members: [a, ADMIN], lastMessage: null, createdAt: serverTimestamp() }),
  // a group chat with an admin and BAMA itself, created and then left (self-removal)
  // (Clients can no longer create group chats — rule-holes fix — so the chat
  // with an admin and BAMA is seeded, and the user leaves it.)
  chatWithAdminAndSystemCreateLeave: async (a) => {
    const id = uniq('grp-admin');
    await adb.doc(`chats/${id}`).set({ type: 'group', name: 'x', members: [a, ADMIN, 'bama-system'], lastMessage: null });
    await updateDoc(doc(db, 'chats', id), { members: arrayRemove(a) });
    const dm = await addDoc(collection(db, 'chats'), { type: 'dm', members: [a, ADMIN], lastMessage: null, createdAt: serverTimestamp() });
    await updateDoc(dm, { members: arrayRemove(a) });
  },
  // leaving a community whose members include an admin and BAMA itself
  leaveCommunityWithAdmin: async (a) => {
    const id = uniq('comm-admin');
    await adb.doc(`chats/${id}`).set({ type: 'community', name: 'C', ownerId: ADMIN, members: [ADMIN, 'bama-system', a], lastMessage: null });
    const batch = writeBatch(db);
    batch.update(doc(db, 'chats', id), { members: arrayRemove(a) });
    batch.set(doc(collection(db, 'chats', id, 'communityEvents')), { type: 'leave', userId: a, at: serverTimestamp() });
    await batch.commit();
  },
};

async function seedOpenProject(client) {
  const id = uniq('prj');
  await adb.doc(`projects/${id}`).set({ clientId: client, title: 'T', crewSlots: [{ category: 'Editor', quantity: 1 }, { category: 'Sound Recordist', quantity: 1 }], filledSlots: [], status: 'open' });
  return { id };
}
async function seedCommunity(owner, members) {
  const id = communityFor(owner);
  await adb.doc(`chats/${id}`).set({ type: 'community', name: 'C', ownerId: owner, members, lastMessage: null });
  return { id };
}

const rows = [];
async function attempt(state, flow, a, b, expected, run) {
  await as(label[a]);
  let allowed = true; let err = '';
  try { await run(); } catch (e) { allowed = false; err = e.code ?? String(e.message ?? e); }
  rows.push({ state, name: `${flow} ${name[a]}→${name[b] ?? '-'}`, expected, allowed, err });
}

async function runAll(state, present) {
  const pairs = [[R1, R2, true], [D1, D2, true], [R1, D1, !present], [D1, R1, !present]];
  for (const [flow, f] of Object.entries(FLOWS)) {
    for (const [a, b, expected] of pairs) {
      // A mixed chat cannot come to exist once the doc is present, so leaving one
      // or messaging in one is not a cross-side path; only same-side is checked.
      if (present && (flow === 'memberLeaves' || flow === 'message') && expected === false) continue;
      await setState(false);                         // seed under the old rules' world
      const s = f.seed ? await f.seed(a, b) : {};
      await setState(present);
      // A project in someone else's name is refused for every pair since the
      // rule-holes fix (clientId must be the caller).
      const exp = flow === 'projectOwnedByOther' ? false : expected;
      await attempt(state, flow, a, b, exp, () => f.run(a, b, s));
    }
  }
  // Open project with no target: the client alone.
  for (const a of [R1, D1]) {
    await setState(present);
    await attempt(state, 'projectOpen', a, undefined, true, () => addDoc(collection(db, 'projects'), {
      clientId: a, crewSlots: [{ category: 'Editor', quantity: 1 }], filledSlots: [], title: 'T', description: 'D',
      deadline: 'flexible', location: 'TA', status: 'open', createdAt: { seconds: 1, nanoseconds: 0 },
    }));
  }
  // Talking to BAMA: always allowed, both sides, including reporting across sides.
  // joinListedCommunity: with the config present, only the demo side may join.
  for (const [flow, f] of Object.entries(BAMA_FLOWS)) {
    for (const [a, b] of [[R1, D1], [D1, R1]]) {
      await setState(present);
      const expected = flow === 'joinListedCommunity' ? (!present || a === D1) : true;
      await attempt(state, flow, a, b, expected, () => f(a, b));
    }
  }
}

await runAll('A (absent)', false);
await runAll('B (present)', true);
await setState(false);

let bad = 0;
for (const r of rows) {
  const ok = r.allowed === r.expected;
  if (!ok) bad++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} [${r.state}] ${r.name} — expected ${r.expected ? 'allow' : 'deny'}, ${r.allowed ? 'allowed' : `denied (${r.err})`}`);
}
console.log(`\n${rows.length} cases, ${bad} not as expected`);
await signOut(auth).catch(() => {});
process.exit(bad ? 1 : 0);
