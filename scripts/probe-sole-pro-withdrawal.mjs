#!/usr/bin/env node
/**
 * Sole-professional withdrawal must not complete the project — against the EMULATORS.
 *
 *   firebase emulators:start --only firestore,auth,functions --project bama-af0a0
 *   node scripts/probe-sole-pro-withdrawal.mjs
 *
 *  1 sole pro asks to withdraw, client accepts → project stays OPEN, re-hire allowed
 *  2 control: pro A completes, pro B withdraws → project COMPLETES (work was delivered)
 */
import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore as getAdminDb } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
} from 'firebase/auth';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const P = 'bama-af0a0';
const adb = getAdminDb(initAdmin({ projectId: P }));
const app = initializeApp({ apiKey: 'k', projectId: P }, 'sw');
const auth = getAuth(app), fns = getFunctions(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
connectFunctionsEmulator(fns, '127.0.0.1', 5001);
const call = (name) => async (data) => {
  try { return { ok: true, data: (await httpsCallable(fns, name)(data)).data }; }
  catch (e) { return { ok: false, msg: String(e.message) }; }
};
const hire = call('hireProfessional');
const requestEnd = call('requestEngagementEnd');
const respondEnd = call('respondToEngagementEnd');
const markComplete = call('markEngagementComplete');

let failures = 0;
const check = (l, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${d ? `  — ${d}` : ''}`); if (!ok) failures++; };
const PW = 'pw123456';
const uids = {};
for (const tag of ['client', 'proA', 'proB']) {
  const email = `sw-${tag}@probe.invalid`;
  try { uids[tag] = (await createUserWithEmailAndPassword(auth, email, PW)).user.uid; }
  catch { uids[tag] = (await signInWithEmailAndPassword(auth, email, PW)).user.uid; }
  await signOut(auth);
}
const as = async (tag) => { await signOut(auth).catch(() => {}); await signInWithEmailAndPassword(auth, `sw-${tag}@probe.invalid`, PW); };
const get = async (path) => (await adb.doc(path).get()).data();
const created = [];
async function project(id, seats) {
  await adb.doc(`projects/${id}`).set({
    clientId: uids.client, title: id, description: 'x', location: 'TLV', deadline: 'flexible',
    status: 'open', createdAt: new Date(), crewSlots: seats.map((category) => ({ category, quantity: 1 })), filledSlots: [],
  });
  created.push(id);
}
async function offer(id, projectId, tag, category) {
  await adb.doc(`priceOffers/${id}`).set({ projectId, professionalId: uids[tag], category, price: 500, status: 'pending', createdAt: new Date() });
}
async function wipe() {
  for (const id of created) {
    const ref = adb.doc(`projects/${id}`);
    const chatId = (await ref.get()).data()?.chatId;
    for (const sub of ['fees', 'paymentRequests']) for (const d of (await ref.collection(sub).get()).docs) await d.ref.delete();
    if (chatId) {
      for (const m of (await adb.collection(`chats/${chatId}/messages`).get()).docs) await m.ref.delete();
      await adb.doc(`chats/${chatId}`).delete();
    }
    await ref.delete();
  }
  for (const d of (await adb.collection('priceOffers').get()).docs) if (d.id.startsWith('sw-')) await d.ref.delete();
}

try {
  console.log('\n=== 1. sole pro withdraws ===');
  await project('sw-p1', ['Editor']);
  await offer('sw-o1', 'sw-p1', 'proA', 'Editor');
  await as('client');
  check('hire the only pro', (await hire({ offerId: 'sw-o1' })).ok);
  await as('proA');
  const req = await requestEnd({ projectId: 'sw-p1', kind: 'withdrawing', reason: 'probe' });
  check('pro asks to withdraw', req.ok, req.msg);
  await as('client');
  const res = await respondEnd({ projectId: 'sw-p1', professionalId: uids.proA, accept: true });
  check('client accepts the withdrawal', res.ok && res.data.outcome === 'withdrawn', JSON.stringify(res.data ?? res.msg));
  const p1 = await get('projects/sw-p1');
  check('project stays OPEN (was: completed)', p1.status === 'open', p1.status);
  check('seat is vacant again', !(p1.filledSlots ?? []).length, JSON.stringify(p1.filledSlots));
  check('fee withdrawn / pro_withdrew', (await get(`projects/sw-p1/fees/${uids.proA}`)).engagementStatus === 'withdrawn');
  await offer('sw-o1b', 'sw-p1', 'proB', 'Editor');
  const rehire = await hire({ offerId: 'sw-o1b' });
  check('client can hire a replacement', rehire.ok, rehire.msg);

  console.log('\n=== 2. control: work delivered, then a withdrawal ===');
  await project('sw-p2', ['Editor', 'Sound Recordist']);
  await offer('sw-o2a', 'sw-p2', 'proA', 'Editor');
  await offer('sw-o2b', 'sw-p2', 'proB', 'Sound Recordist');
  await as('client');
  check('hire A and B', (await hire({ offerId: 'sw-o2a' })).ok && (await hire({ offerId: 'sw-o2b' })).ok);
  await as('proA');
  check('A marks his part complete', (await markComplete({ projectId: 'sw-p2' })).ok);
  check('project still open (B hired)', (await get('projects/sw-p2')).status === 'open');
  await as('proB');
  check('B asks to withdraw', (await requestEnd({ projectId: 'sw-p2', kind: 'withdrawing', reason: 'probe' })).ok);
  await as('client');
  check('client accepts', (await respondEnd({ projectId: 'sw-p2', professionalId: uids.proB, accept: true })).ok);
  const p2 = await get('projects/sw-p2');
  check('project COMPLETES — real work was delivered', p2.status === 'completed', p2.status);
} catch (e) {
  console.error('\nprobe threw:', e); failures++;
} finally {
  await wipe();
}
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
