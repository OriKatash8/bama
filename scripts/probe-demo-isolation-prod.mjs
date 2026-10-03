#!/usr/bin/env node
/**
 * PRODUCTION check of the demo-account isolation rules, as NORMAL users.
 *
 *   node scripts/probe-demo-isolation-prod.mjs --state absent                 # right after the rules deploy
 *   DEMO_PASSWORD=… node scripts/probe-demo-isolation-prod.mjs --state present  # after the seed
 *
 * Three throwaway real-shaped users (C client, P pro, Q other) perform every write
 * whose rule changed, in the app's exact shapes. Each must be ALLOWED. With
 * --state present it then tries every cross-side path, real → demo and
 * demo → real (signing in as demo-test2), and each must be DENIED.
 *
 * NO REAL USER IS NOTIFIED. The only projects are C's: one open with no seats
 * (onProjectCreate returns when nothing is vacant) and one direct (returns on a
 * target). Offer, message and listing triggers notify only the throwaway parties.
 * The throwaway community and listing exist for the seconds the probe runs.
 *
 * Teardown deletes everything it made, asserts it, waits for late trigger writes
 * and sweeps again. Exit 0 only when every case behaved and nothing is left.
 */
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore as getAdminDb, FieldValue } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, writeBatch, runTransaction,
  serverTimestamp, arrayUnion, arrayRemove, increment, query, where, setLogLevel,
} from 'firebase/firestore';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { DEMO_UIDS, byKey } from './lib/demoAccountsData.mjs';

setLogLevel('silent');
const PROJECT = 'bama-af0a0';
const STATE = process.argv[process.argv.indexOf('--state') + 1];
if (!['absent', 'present'].includes(STATE)) { console.error('--state absent|present'); process.exit(2); }

const WEB = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8')).build.production.env;
const WEB_CONFIG = {
  apiKey: WEB.EXPO_PUBLIC_FIREBASE_API_KEY, authDomain: WEB.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: WEB.EXPO_PUBLIC_FIREBASE_PROJECT_ID, appId: WEB.EXPO_PUBLIC_FIREBASE_APP_ID,
};
const adminApp = initAdmin({ projectId: PROJECT });
const adb = getAdminDb(adminApp);
const aauth = getAdminAuth(adminApp);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAMP = `didp${Date.now()}`;
// A rehearsal against the emulators when FIRESTORE_EMULATOR_HOST is set (the
// Admin SDK follows it on its own; client apps are pointed at it below).
const EMU = process.env.FIRESTORE_EMULATOR_HOST;
function clientApp(name) {
  const app = initializeApp(EMU ? { ...WEB_CONFIG, apiKey: 'emulator-key' } : WEB_CONFIG, name);
  if (EMU) {
    const [host, port] = EMU.split(':');
    connectFirestoreEmulator(getFirestore(app), host, Number(port));
    connectAuthEmulator(getAuth(app), `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  }
  return app;
}
console.log(`\nproject: ${PROJECT} (${EMU ? `EMULATOR ${EMU}` : 'LIVE'})   state: ${STATE}   stamp: ${STAMP}\n`);

const cfgExists = (await adb.doc('config/demoAccounts').get()).exists;
if ((STATE === 'absent') === cfgExists) {
  console.error(`config/demoAccounts is ${cfgExists ? 'PRESENT' : 'ABSENT'} — wrong --state. Stopping.`);
  process.exit(2);
}

// ── throwaway users ─────────────────────────────────────────────────────────
const made = { uids: [], refs: [] };
const track = (ref) => { made.refs.push(ref.path ?? ref); return ref; };
const s = {};
async function user(tag) {
  const email = `${STAMP}.${tag}@probe.invalid`;
  const pw = randomBytes(18).toString('base64url');
  const u = await aauth.createUser({ email, password: pw, emailVerified: true, displayName: `probe ${tag}` });
  made.uids.push(u.uid);
  const app = clientApp(`${STAMP}-${tag}`);
  await signInWithEmailAndPassword(getAuth(app), email, pw);
  s[tag] = { uid: u.uid, db: getFirestore(app) };
}
await user('C'); await user('P'); await user('Q');
const { C, P, Q } = { C: s.C, P: s.P, Q: s.Q };
await sleep(4000); // onUserCreate

const rows = [];
async function attempt(name, expected, run) {
  let allowed = true; let err = '';
  try { await run(); } catch (e) { allowed = false; err = e.code ?? String(e.message ?? e); }
  rows.push({ name, expected, allowed, err });
  console.log(`  ${allowed === expected ? 'ok  ' : 'FAIL'} ${name} — expected ${expected ? 'allow' : 'deny'}, ${allowed ? 'allowed' : `denied (${err})`}`);
}
const now = () => ({ seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 });

async function sendMessage(who, chatId, text) {                       // chatService.sendMessage
  await addDoc(collection(who.db, 'chats', chatId, 'messages'), { senderId: who.uid, text, timestamp: serverTimestamp(), readBy: [who.uid] });
  const members = (await getDoc(doc(who.db, 'chats', chatId))).data()?.members ?? [];
  const u = { lastMessage: { text, senderId: who.uid, timestamp: serverTimestamp() } };
  for (const m of members) if (m !== who.uid) u[`unreadCount.${m}`] = increment(1);
  await updateDoc(doc(who.db, 'chats', chatId), u);
}
const dm = async (a, b) => track(await addDoc(collection(a.db, 'chats'), { type: 'dm', members: [a.uid, b], lastMessage: null, createdAt: serverTimestamp() }));
const directProject = async (a, target) => track(await addDoc(collection(a.db, 'projects'), {
  clientId: a.uid, title: `Probe ${STAMP}`, description: 'probe', deadline: 'flexible', location: 'TA',
  crewSlots: [{ category: 'Editor', quantity: 1 }], filledSlots: [], status: 'open', targetProfessionalId: target, createdAt: now(),
}));
const priceOffer = async (a, pid) => track(await addDoc(collection(a.db, 'priceOffers'), { projectId: pid, professionalId: a.uid, category: 'Editor', price: 300, status: 'pending', createdAt: serverTimestamp() }));
async function bundleOffer(a, pid) {                                   // usePriceOffer.submitWithBundle
  const o1 = await priceOffer(a, pid);
  const o2 = track(await addDoc(collection(a.db, 'priceOffers'), { projectId: pid, professionalId: a.uid, category: 'Sound Recordist', price: 200, status: 'pending', createdAt: serverTimestamp() }));
  const b = track(await addDoc(collection(a.db, 'bundleOffers'), {
    projectId: pid, professionalId: a.uid, slots: [{ category: 'Editor' }, { category: 'Sound Recordist' }],
    individualTotal: 500, bundlePrice: 450, offerIds: [o1.id, o2.id], status: 'pending', createdAt: now(),
  }));
  const batch = writeBatch(a.db);
  batch.update(doc(a.db, 'priceOffers', o1.id), { bundleId: b.id });
  batch.update(doc(a.db, 'priceOffers', o2.id), { bundleId: b.id });
  await batch.commit();
}
const application = async (a, pid) => track(await addDoc(collection(a.db, 'projectApplications'), { projectId: pid, professionalId: a.uid, status: 'pending', createdAt: now() }));
const review = async (a, pid, pro) => track(await addDoc(collection(a.db, 'reviews'), {
  projectId: pid, professionalId: pro, reviewerId: a.uid, authorId: a.uid, authorName: 'probe', rating: 5,
  text: 'Probe review, please ignore', body: 'Probe review, please ignore', createdAt: serverTimestamp(),
}));
const joinRequest = (a, cid) => setDoc(track(doc(a.db, 'chats', cid, 'joinRequests', a.uid)), { userId: a.uid, displayName: 'probe', requestedAt: serverTimestamp(), status: 'pending' });
async function listing(a) {                                            // useCreateListing
  return track(await addDoc(collection(a.db, 'marketplace_listings'), {
    type: 'secondhand', posterId: a.uid, posterName: 'probe', productName: `zzz probe ${STAMP}`, location: 'TA', price: 1,
    imageUrl: null, condition: 'good', category: 'accessories', subcategory: null, brand: null, status: 'available', createdAt: now(),
  }));
}
const purchaseChat = async (buyer, seller, lid) => track(await addDoc(collection(buyer.db, 'chats'), {
  type: 'purchase', members: [buyer.uid, seller], purchaseListingId: lid, name: 'probe', buyerName: 'probe', lastMessage: null, createdAt: serverTimestamp(),
}));
async function reserve(buyer, lid, chatId) {                            // acceptDeal, pressed second by the buyer
  const batch = writeBatch(buyer.db);
  batch.update(doc(buyer.db, 'marketplace_listings', lid), { status: 'reserved', buyerId: buyer.uid, purchaseChatId: chatId });
  batch.update(doc(buyer.db, 'chats', chatId), { sellerAgreed: true, buyerAgreed: true });
  await batch.commit();
}

// ── 1. normal users, every changed rule: all ALLOWED ────────────────────────
console.log('Normal users (real ↔ real) — every write must be allowed:');
let dmRef, directRef, listingRef, pchatRef;
await attempt('DM create', true, async () => { dmRef = await dm(C, P.uid); });
await attempt('message in the DM', true, () => sendMessage(C, dmRef.id, 'probe'));
await attempt('open project (no seats → no broadcast)', true, async () => {
  track(await addDoc(collection(C.db, 'projects'), { clientId: C.uid, crewSlots: [], filledSlots: [], title: `Probe ${STAMP}`, description: 'probe', deadline: 'flexible', location: 'TA', status: 'open', createdAt: now() }));
});
await attempt('direct project with targetProfessionalId', true, async () => { directRef = await directProject(C, P.uid); });
await attempt('project retarget', true, () => updateDoc(doc(C.db, 'projects', directRef.id), { targetProfessionalId: Q.uid }));
await attempt('price offer', true, () => priceOffer(P, directRef.id));
await attempt('bundle offer (offers + bundle + backfill batch)', true, () => bundleOffer(P, directRef.id));
await attempt('project application', true, () => application(P, directRef.id));
// A review needs a completed project of the reviewer with the pro on it (as after confirmCompletion).
const doneP = adb.doc(`projects/${STAMP}-done`); track(doneP);
await doneP.set({ clientId: C.uid, title: `Probe ${STAMP}`, status: 'completed', professionalIds: [P.uid], filledSlots: [{ category: 'Editor', professionalId: P.uid }], crewSlots: [{ category: 'Editor', quantity: 1 }] });
await attempt('review', true, () => review(C, doneP.id, P.uid));
await attempt('listing create', true, async () => { listingRef = await listing(Q); });
await attempt('purchase chat create', true, async () => { pchatRef = await purchaseChat(P, Q.uid, listingRef.id); });
await attempt('seller agrees first (agreeToDeal: own flag)', true, () => updateDoc(doc(Q.db, 'chats', pchatRef.id), { sellerAgreed: true }));
await attempt('listing reserve (acceptDeal by buyer)', true, () => reserve(P, listingRef.id, pchatRef.id));
const cid = `${STAMP}-community`;
await adb.doc(`chats/${cid}`).set({ type: 'community', name: `zzz probe ${STAMP}`, ownerId: C.uid, members: [C.uid], lastMessage: null, createdAt: FieldValue.serverTimestamp() });
track(adb.doc(`chats/${cid}`));
await attempt('community join request', true, () => joinRequest(P, cid));
await attempt('owner approves (transaction)', true, () => runTransaction(C.db, async (tx) => {
  const r = doc(C.db, 'chats', cid, 'joinRequests', P.uid); const c = doc(C.db, 'chats', cid);
  await Promise.all([tx.get(r), tx.get(c)]);
  tx.update(r, { status: 'approved', decidedAt: serverTimestamp() });
  tx.update(c, { members: arrayUnion(P.uid) });
  tx.set(doc(collection(C.db, 'chats', cid, 'communityEvents')), { type: 'join', userId: P.uid, at: serverTimestamp() });
}));
await attempt('second join request', true, () => joinRequest(Q, cid));
await attempt('owner approve-all (batch)', true, async () => {
  const b = writeBatch(C.db);
  b.update(doc(C.db, 'chats', cid, 'joinRequests', Q.uid), { status: 'approved', decidedAt: serverTimestamp() });
  b.set(doc(collection(C.db, 'chats', cid, 'communityEvents')), { type: 'join', userId: Q.uid, at: serverTimestamp() });
  b.update(doc(C.db, 'chats', cid), { members: arrayUnion(Q.uid) });
  await b.commit();
});
await attempt('member leaves (batch)', true, async () => {
  const b = writeBatch(P.db);
  b.update(doc(P.db, 'chats', cid), { members: arrayRemove(P.uid) });
  b.set(doc(collection(P.db, 'chats', cid, 'communityEvents')), { type: 'leave', userId: P.uid, at: serverTimestamp() });
  await b.commit();
});
await attempt('report a user', true, async () => { track(await addDoc(collection(C.db, 'reports'), { reporterId: C.uid, reportedUserId: Q.uid, reportedUserName: 'probe', reason: 'Probe report, please ignore it', evidenceURLs: [], status: 'pending', createdAt: serverTimestamp() })); });
await attempt('community request to BAMA', true, async () => { track(await addDoc(collection(C.db, 'communityRequests'), { name: `zzz probe ${STAMP}`, description: 'probe', requesterId: C.uid, requesterName: 'probe', status: 'pending', createdAt: serverTimestamp() })); });
await adb.doc(`chats/sys_${C.uid}`).set({ type: 'dm', members: ['bama-system', C.uid], readOnly: true, lastMessage: null });
await adb.doc(`chats/sys_${C.uid}/messages/m1`).set({ senderId: 'bama-system', system: true, text: 'probe', timestamp: FieldValue.serverTimestamp(), readBy: [] });
track(adb.doc(`chats/sys_${C.uid}`));
await attempt('read own BAMA System chat', true, async () => { await getDoc(doc(C.db, 'chats', `sys_${C.uid}`)); await getDocs(collection(C.db, 'chats', `sys_${C.uid}`, 'messages')); });

// ── 2. cross-side (present only): all DENIED ────────────────────────────────
if (STATE === 'present') {
  if (!process.env.DEMO_PASSWORD) { console.error('DEMO_PASSWORD needed for --state present'); process.exit(2); }
  const D1 = DEMO_UIDS[0];
  const demoOpen = (await adb.collection('projects').where('clientId', '==', D1).where('status', '==', 'open').limit(1).get()).docs[0]?.id;
  const demoSale = (await adb.collection('marketplace_listings').where('posterId', '==', D1).limit(1).get()).docs[0]?.id;
  const DEMO_COMMUNITY_ID = (await adb.doc('config/demoAccounts').get()).get('communityIds')?.[0];
  if (!demoOpen || !demoSale || !DEMO_COMMUNITY_ID) throw new Error('demo open project / listing / community not found — run the seed first');
  console.log('\nReal → demo — every write must be denied:');
  await attempt('DM to demo', false, () => dm(C, D1));
  await attempt('direct project targeting demo', false, () => directProject(C, D1));
  await attempt('retarget own project to demo', false, () => updateDoc(doc(C.db, 'projects', directRef.id), { targetProfessionalId: D1 }));
  await attempt('price offer on demo project', false, () => priceOffer(P, demoOpen));
  await attempt('bundle offer on demo project', false, () => bundleOffer(P, demoOpen));
  await attempt('application to demo project', false, () => application(P, demoOpen));
  const doneD = adb.doc(`projects/${STAMP}-done-demo`); track(doneD);
  await doneD.set({ clientId: C.uid, title: `Probe ${STAMP}`, status: 'completed', professionalIds: [D1], filledSlots: [], crewSlots: [] });
  await attempt('review a demo pro', false, () => review(C, doneD.id, D1));
  await attempt('join the demo community', false, () => joinRequest(P, DEMO_COMMUNITY_ID));
  // Demo by OWNER, with no communityIds entry (communityIsDemo): a throwaway community owned by test1.
  const unlisted = `${STAMP}-unlisted-demo-community`;
  await adb.doc(`chats/${unlisted}`).set({ type: 'community', name: `zzz probe ${STAMP}`, ownerId: D1, members: [D1], lastMessage: null });
  track(adb.doc(`chats/${unlisted}`));
  await attempt('join a demo-OWNED community not in communityIds', false, () => joinRequest(P, unlisted));
  await attempt('purchase chat with demo seller', false, () => purchaseChat(P, D1, demoSale));
  const forged = adb.collection('chats').doc(); track(forged);
  await forged.set({ type: 'purchase', members: [P.uid, D1], purchaseListingId: demoSale, sellerAgreed: true, lastMessage: null });
  await attempt('reserve a demo listing', false, () => reserve(P, demoSale, forged.id));
  await attempt('add a demo user to own community', false, () => updateDoc(doc(C.db, 'chats', cid), { members: arrayUnion(D1) }));

  console.log('\nDemo → real (signed in as test2) — every write must be denied:');
  const dApp = clientApp(`${STAMP}-demo`);
  await signInWithEmailAndPassword(getAuth(dApp), byKey.test2.email, process.env.DEMO_PASSWORD);
  const D = { uid: byKey.test2.uid, db: getFirestore(dApp) };
  await attempt('demo DMs a real user', false, () => dm(D, C.uid));
  await attempt('demo direct project to a real pro', false, () => directProject(D, P.uid));
  await attempt('demo offers on a real project', false, () => priceOffer(D, directRef.id));
  await attempt('demo bundle on a real project', false, () => bundleOffer(D, directRef.id));
  await attempt('demo applies to a real project', false, () => application(D, directRef.id));
  const doneR = adb.doc(`projects/${STAMP}-done-real`); track(doneR);
  await doneR.set({ clientId: D.uid, title: `Probe ${STAMP}`, status: 'completed', professionalIds: [P.uid], filledSlots: [], crewSlots: [] });
  await attempt('demo reviews a real pro', false, () => review(D, doneR.id, P.uid));
  await attempt('demo joins a real community', false, () => joinRequest(D, cid));
  const l2 = await listing(Q);
  await attempt('demo purchase chat with a real seller', false, () => purchaseChat(D, Q.uid, l2.id));
  const forged2 = adb.collection('chats').doc(); track(forged2);
  await forged2.set({ type: 'purchase', members: [D.uid, Q.uid], purchaseListingId: l2.id, sellerAgreed: true, lastMessage: null });
  await attempt('demo reserves a real listing', false, () => reserve(D, l2.id, forged2.id));
  await attempt('demo reports a real user (BAMA flow — allowed)', true, async () => { track(await addDoc(collection(D.db, 'reports'), { reporterId: D.uid, reportedUserId: C.uid, reportedUserName: 'probe', reason: 'Probe report, please ignore it', evidenceURLs: [], status: 'pending', createdAt: serverTimestamp() })); });
}

// ── teardown ────────────────────────────────────────────────────────────────
console.log('\nTeardown:');
const deleted = [];
async function sweep() {
  for (const p of made.refs) {
    const ref = adb.doc(p);
    if ((await ref.get()).exists || (await ref.listCollections()).length) { await adb.recursiveDelete(ref); deleted.push(p); }
  }
  for (const uid of made.uids) {
    const q = async (col, field) => { for (const d of (await adb.collection(col).where(field, '==', uid).get()).docs) { await adb.recursiveDelete(d.ref); deleted.push(d.ref.path); } };
    await q('projects', 'clientId'); await q('priceOffers', 'professionalId'); await q('bundleOffers', 'professionalId');
    await q('projectApplications', 'professionalId'); await q('reviews', 'reviewerId'); await q('reviews', 'professionalId');
    await q('marketplace_listings', 'posterId'); await q('reports', 'reporterId'); await q('reports', 'reportedUserId');
    await q('communityRequests', 'requesterId'); await q('notifications', 'userId');
    for (const c of (await adb.collection('chats').where('members', 'array-contains', uid).get()).docs) { await adb.recursiveDelete(c.ref); deleted.push(c.ref.path); }
    const u = adb.doc(`users/${uid}`);
    if ((await u.get()).exists || (await u.listCollections()).length) { await adb.recursiveDelete(u); deleted.push(u.path); }
  }
  // Anything a cross-side attempt made on the demo side by mistake.
  for (const r of (await adb.collection('reviews').where('reviewerId', '==', byKey.test2.uid).get()).docs) {
    if (!DEMO_UIDS.includes(r.get('professionalId'))) { await r.ref.delete(); deleted.push(r.ref.path); }
  }
}
await sweep();
for (const uid of made.uids) await aauth.deleteUser(uid).catch(() => {});
await sleep(6000);
await sweep();
let residue = 0;
for (const uid of made.uids) {
  for (const [col, field] of [['projects', 'clientId'], ['priceOffers', 'professionalId'], ['reviews', 'reviewerId'], ['marketplace_listings', 'posterId'], ['notifications', 'userId'], ['reports', 'reporterId'], ['communityRequests', 'requesterId']]) {
    residue += (await adb.collection(col).where(field, '==', uid).get()).size;
  }
  residue += (await adb.collection('chats').where('members', 'array-contains', uid).get()).size;
  residue += (await adb.doc(`users/${uid}`).get()).exists ? 1 : 0;
  residue += (await aauth.getUser(uid).then(() => 1, () => 0));
}
residue += (await adb.doc(`chats/${cid}`).get()).exists ? 1 : 0;
console.log(`  deleted ${deleted.length} docs; residue ${residue}`);

const bad = rows.filter((r) => r.allowed !== r.expected).length;
console.log(`\n${rows.length} cases, ${bad} not as expected; ${residue === 0 ? 'ZERO RESIDUE' : `RESIDUE ${residue}`}`);
setTimeout(() => process.exit(bad || residue ? 1 : 0), 200);
