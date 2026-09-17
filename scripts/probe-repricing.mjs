#!/usr/bin/env node
/**
 * V1 step (c) — price changes, end to end, against the EMULATORS.
 *
 *   firebase emulators:start --only firestore,auth,functions --project bama-af0a0
 *   node scripts/probe-repricing.mjs
 *
 *  1 range 1–50000 on create (0, 50001 refused; 1, 50000 accepted)
 *  2 the counter sequence while under review, one pending per role
 *  3 a second role is independent; a pro cannot open a negotiation under review
 *  4 two concurrent creates for one role: exactly one lands
 *  4b the same with no chat doc to collide on — isolates the transactional history read
 *  5 an out-of-range request written before the check cannot be accepted
 *  6 after רלוונטי, the pro may reprice unprompted again
 *  7 rules: no direct client create; reading own requests still works
 */
import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore as getAdminDb } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, collection, addDoc, getDocs, query, where, setLogLevel,
} from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
} from 'firebase/auth';

setLogLevel('silent');
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const P = 'bama-af0a0';
const adb = getAdminDb(initAdmin({ projectId: P }));
const app = initializeApp({ apiKey: 'k', projectId: P }, 'rp');
const db = getFirestore(app), auth = getAuth(app), fns = getFunctions(app);
connectFirestoreEmulator(db, '127.0.0.1', 8080);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
connectFunctionsEmulator(fns, '127.0.0.1', 5001);
const call = (name) => async (data) => {
  try { return { ok: true, data: (await httpsCallable(fns, name)(data)).data }; }
  catch (e) { return { ok: false, code: e.code, msg: String(e.message) }; }
};
const hire = call('hireProfessional');
const create = call('createPaymentRequest');
const respond = call('respondToPaymentRequest');
const confirm = call('confirmCandidate');

let failures = 0;
const check = (l, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${d ? `  — ${d}` : ''}`); if (!ok) failures++; };
const PW = 'pw123456';
const uids = {};
async function account(tag) {
  const email = `rp-${tag}@probe.invalid`;
  try { uids[tag] = (await createUserWithEmailAndPassword(auth, email, PW)).user.uid; }
  catch { uids[tag] = (await signInWithEmailAndPassword(auth, email, PW)).user.uid; }
  await signOut(auth);
}
const as = async (tag) => { await signOut(auth).catch(() => {}); await signInWithEmailAndPassword(auth, `rp-${tag}@probe.invalid`, PW); };
const get = async (path) => (await adb.doc(path).get()).data();
const PID = 'rp-p1';
const ED = 'Editor', SD = 'Sound Recordist';
const reason = (r) => (r.ok ? 'ok' : (r.msg.match(/[a-z]+(-[a-z]+)+/)?.[0] ?? r.msg));

async function wipe() {
  const ref = adb.doc(`projects/${PID}`);
  const chatId = (await ref.get()).data()?.chatId;
  for (const sub of ['fees', 'paymentRequests']) for (const d of (await ref.collection(sub).get()).docs) await d.ref.delete();
  if (chatId) {
    for (const m of (await adb.collection(`chats/${chatId}/messages`).get()).docs) await m.ref.delete();
    await adb.doc(`chats/${chatId}`).delete();
  }
  await ref.delete();
  for (const d of (await adb.collection('priceOffers').get()).docs) if (d.id.startsWith('rp-')) await d.ref.delete();
}

await account('client');
await account('pro');
const clientCreate = (category, proposedAmount) => create({ projectId: PID, professionalId: uids.pro, category, proposedAmount });
const proCreate = (category, proposedAmount) => create({ projectId: PID, category, proposedAmount });

try {
  await wipe();
  await adb.doc(`projects/${PID}`).set({
    clientId: uids.client, title: 'Probe reprice', description: 'x', location: 'TLV', deadline: 'flexible',
    status: 'open', createdAt: new Date(), filledSlots: [],
    crewSlots: [{ category: ED, quantity: 1 }, { category: SD, quantity: 1 }],
  });
  for (const [id, category] of [['rp-ed', ED], ['rp-sd', SD]]) {
    await adb.doc(`priceOffers/${id}`).set({ projectId: PID, professionalId: uids.pro, category, price: 500, status: 'pending', createdAt: new Date() });
  }
  await as('client');
  check('setup: hire the pro for Editor and Sound (both under review)',
    (await hire({ offerId: 'rp-ed' })).ok && (await hire({ offerId: 'rp-sd' })).ok);

  const answerAs = async (tag, requestId, accept) => { await as(tag); return respond({ projectId: PID, requestId, accept }); };

  // ── 1 ─────────────────────────────────────────────────────────────────────
  console.log('\n=== 1. range on create ===');
  await as('client');
  check('0 refused', reason(await clientCreate(ED, 0)) === 'offer-price-out-of-range');
  check('50001 refused', reason(await clientCreate(ED, 50001)) === 'offer-price-out-of-range');
  const at1 = await clientCreate(ED, 1);
  check('1 accepted as a request', at1.ok, reason(at1));
  check('pro rejects it', (await answerAs('pro', at1.data.requestId, false)).ok);
  await as('client');
  const at50k = await clientCreate(ED, 50000);
  check('50000 accepted as a request', at50k.ok, reason(at50k));
  check('pro rejects it', (await answerAs('pro', at50k.data.requestId, false)).ok);

  // ── 2 ─────────────────────────────────────────────────────────────────────
  console.log('\n=== 2. counter sequence under review (Editor) ===');
  await as('pro');
  const counter = await proCreate(ED, 600);
  check("pro counters right after rejecting the client's request", counter.ok, reason(counter));
  const second = await proCreate(ED, 650);
  check('pro cannot raise a second while his is pending', reason(second) === 'price-change-pending', reason(second));
  await as('client');
  const clientWhilePending = await clientCreate(ED, 550);
  check('client cannot raise one while the counter is pending', reason(clientWhilePending) === 'price-change-pending', reason(clientWhilePending));
  check('client rejects the counter', (await answerAs('client', counter.data.requestId, false)).ok);
  await as('pro');
  const again = await proCreate(ED, 620);
  check('pro cannot counter twice to the same client proposal', reason(again) === 'counter-not-allowed', reason(again));
  await as('client');
  const fresh = await clientCreate(ED, 700);
  check('client raises a new proposal', fresh.ok, reason(fresh));
  check('pro accepts it', (await answerAs('pro', fresh.data.requestId, true)).ok);
  check('Editor offer repriced to 700', (await get('priceOffers/rp-ed')).price === 700);
  await as('pro');
  const afterAccept = await proCreate(ED, 750);
  check('pro cannot counter a proposal he accepted', reason(afterAccept) === 'counter-not-allowed', reason(afterAccept));

  // ── 3 ─────────────────────────────────────────────────────────────────────
  console.log('\n=== 3. roles are independent ===');
  await as('client');
  const edPending = await clientCreate(ED, 710);
  check('client raises Editor change (pending)', edPending.ok, reason(edPending));
  const sdWhileEd = await clientCreate(SD, 400);
  check('client can still raise a Sound change while Editor is pending', sdWhileEd.ok, reason(sdWhileEd));
  check('pro rejects Editor', (await answerAs('pro', edPending.data.requestId, false)).ok);
  check('pro rejects Sound', (await answerAs('pro', sdWhileEd.data.requestId, false)).ok);
  await adb.doc('priceOffers/rp-sd').update({ review: 'pending' });
  const sdHistory = await adb.collection(`projects/${PID}/paymentRequests`).where('category', '==', SD).get();
  for (const d of sdHistory.docs) await d.ref.delete();
  await as('pro');
  const unprompted = await proCreate(SD, 450);
  check('pro cannot open a negotiation on a role under review', reason(unprompted) === 'counter-not-allowed', reason(unprompted));

  // ── 4 ─────────────────────────────────────────────────────────────────────
  console.log('\n=== 4. concurrent creates for one role ===');
  await as('client');
  const [c1, c2] = await Promise.all([clientCreate(SD, 410), clientCreate(SD, 420)]);
  const outcomes = [reason(c1), reason(c2)].sort();
  check('exactly one lands, the other is price-change-pending', JSON.stringify(outcomes) === JSON.stringify(['ok', 'price-change-pending']), JSON.stringify(outcomes));
  const pendingSd = (await adb.collection(`projects/${PID}/paymentRequests`).where('category', '==', SD).where('status', '==', 'pending').get());
  check('one pending Sound request in Firestore', pendingSd.size === 1, `${pendingSd.size}`);
  for (const d of pendingSd.docs) await answerAs('pro', d.id, false);

  // 4b. The same race with no chat write to collide on. Every real create also
  // updates the project's chat doc, and that shared write alone serializes two
  // creates — so 4 cannot tell whether the HISTORY read is transactional. With
  // chatId absent the only thing standing between them is tx.get(history).
  const savedChatId = (await get(`projects/${PID}`)).chatId;
  await adb.doc(`projects/${PID}`).update({ chatId: null });
  await as('client');
  const [d1, d2] = await Promise.all([clientCreate(SD, 430), clientCreate(SD, 440)]);
  const outcomesB = [reason(d1), reason(d2)].sort();
  check('4b no shared chat write: still exactly one lands', JSON.stringify(outcomesB) === JSON.stringify(['ok', 'price-change-pending']), JSON.stringify(outcomesB));
  await adb.doc(`projects/${PID}`).update({ chatId: savedChatId });
  for (const d of (await adb.collection(`projects/${PID}/paymentRequests`).where('category', '==', SD).where('status', '==', 'pending').get()).docs) {
    await answerAs('pro', d.id, false);
  }

  // ── 5 ─────────────────────────────────────────────────────────────────────
  console.log('\n=== 5. out-of-range request from before the check ===');
  const legacyRef = adb.collection(`projects/${PID}/paymentRequests`).doc('rp-legacy');
  await legacyRef.set({
    projectId: PID, fromUserId: uids.client, toUserId: uids.pro, professionalId: uids.pro, category: SD,
    currentAmount: 500, proposedAmount: 60000, status: 'pending', createdAt: new Date(),
  });
  const legacyAccept = await answerAs('pro', 'rp-legacy', true);
  check('accepting it is refused', reason(legacyAccept) === 'offer-price-out-of-range', reason(legacyAccept));
  check('Sound offer price unchanged', (await get('priceOffers/rp-sd')).price === 500);
  check('it can still be rejected', (await answerAs('pro', 'rp-legacy', false)).ok);

  // ── 6 ─────────────────────────────────────────────────────────────────────
  console.log('\n=== 6. after רלוונטי the pro may reprice unprompted ===');
  await as('client');
  const conf = await confirm({ projectId: PID, professionalId: uids.pro });
  check('client confirms the pro (nothing pending)', conf.ok, reason(conf));
  await as('pro');
  const postConfirm = await proCreate(SD, 480);
  check('pro raises a Sound change unprompted', postConfirm.ok, reason(postConfirm));

  // ── 7 ─────────────────────────────────────────────────────────────────────
  console.log('\n=== 7. rules ===');
  await as('client');
  let direct;
  try {
    await addDoc(collection(db, `projects/${PID}/paymentRequests`), {
      projectId: PID, fromUserId: uids.client, toUserId: uids.pro, professionalId: uids.pro,
      category: ED, currentAmount: 700, proposedAmount: 1, status: 'pending',
    });
    direct = 'allowed';
  } catch (e) { direct = e.code; }
  check('direct client create denied', direct === 'permission-denied', direct);
  let readOwn;
  try {
    readOwn = (await getDocs(query(collection(db, `projects/${PID}/paymentRequests`), where('fromUserId', '==', uids.client)))).size;
  } catch (e) { readOwn = e.code; }
  check('CONTROL client reads their own requests', typeof readOwn === 'number' && readOwn > 0, String(readOwn));
} catch (e) {
  console.error('\nprobe threw:', e); failures++;
} finally {
  await wipe();
}
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
