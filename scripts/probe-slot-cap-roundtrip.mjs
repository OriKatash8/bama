#!/usr/bin/env node
/**
 * Full callable round-trip for the slot-cap fix, against the FUNCTIONS emulator.
 *
 * Deliberately not a read-only query simulation: it calls hireProfessional twice
 * and asserts what the batch actually wrote. The emulator (not production) is the
 * target because the fix is not deployed — production still runs the old code, so
 * a round-trip there would be testing the bug.
 *
 *   firebase emulators:start --only firestore,auth,functions   (ports below)
 *   FS_PORT=8680 AUTH_PORT=9699 FN_PORT=5101 node scripts/probe-slot-cap-roundtrip.mjs
 */
import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore as getAdminDb } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
} from 'firebase/auth';
import { SUBSCRIBER_MONTHLY_LIMIT } from '../src/core/constants/pricing.ts';

const FS = process.env.FS_PORT ?? '8680';
const AU = process.env.AUTH_PORT ?? '9699';
const FN = process.env.FN_PORT ?? '5101';
process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${FS}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${AU}`;
const P = 'bama-af0a0';

const adminDb = getAdminDb(initAdmin({ projectId: P }));
const app = initializeApp({ apiKey: 'k', projectId: P }, 'slotcap');
const db = getFirestore(app), auth = getAuth(app), fns = getFunctions(app);
connectFirestoreEmulator(db, '127.0.0.1', Number(FS));
connectAuthEmulator(auth, `http://127.0.0.1:${AU}`, { disableWarnings: true });
connectFunctionsEmulator(fns, '127.0.0.1', Number(FN));
const hire = httpsCallable(fns, 'hireProfessional');

const PW = 'pw123456';
const ids = {};
let failures = 0;
const check = (l, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${d ? `  — ${d}` : ''}`); if (!ok) failures++; };
async function mk(tag) {
  try { ids[tag] = (await createUserWithEmailAndPassword(auth, `${tag}@slotcap.invalid`, PW)).user.uid; }
  catch { ids[tag] = (await signInWithEmailAndPassword(auth, `${tag}@slotcap.invalid`, PW)).user.uid; }
  await signOut(auth);
}
async function as(tag) { await signOut(auth).catch(() => {}); await signInWithEmailAndPassword(auth, `${tag}@slotcap.invalid`, PW); }

for (const t of ['pro', 'client']) await mk(t);
const PRO = ids.pro, CLIENT = ids.client;
console.log(`\npro=${PRO}\nclient=${CLIENT}\n`);

const HERE = 'sc-here', OTHER = 'sc-other', THIRD = 'sc-third';
const created = [];

async function project(id, extra = {}) {
  await adminDb.collection('projects').doc(id).set({
    clientId: CLIENT, title: `Project ${id}`, description: 'x', location: 'TLV',
    deadline: 'flexible', status: 'open', createdAt: new Date(),
    crewSlots: [{ category: 'Editor', quantity: 1 }, { category: 'Video Photographer', quantity: 1 }],
    filledSlots: [], ...extra,
  });
  created.push(['projects', id]);
}
async function offer(id, projectId, category, price = 1000) {
  await adminDb.collection('priceOffers').doc(id).set({
    projectId, professionalId: PRO, category, price, status: 'pending', createdAt: new Date(),
  });
  created.push(['priceOffers', id]);
}
async function callHire(offerId) {
  await as('client');
  try { const r = await hire({ offerId }); return { ok: true, chatId: r.data?.chatId ?? null }; }
  catch (e) { return { ok: false, code: e.code ?? '', msg: String(e.message ?? '') }; }
}

async function scenario(label, { subscriber }) {
  console.log(`\n=== ${label} ===`);
  // Reset state.
  for (const [c, i] of [['projects', HERE], ['projects', OTHER], ['projects', THIRD]]) {
    const fees = await adminDb.collection(`${c}/${i}/fees`).get();
    for (const f of fees.docs) await f.ref.delete();
    await adminDb.collection(c).doc(i).delete();
  }
  await adminDb.collection('subscriptions').doc(PRO).delete();
  if (subscriber) {
    // ONE credit below the limit, deliberately. Starting AT the limit cannot test
    // what we care about: the first hire genuinely needs a credit and is rightly
    // refused, so the pro never reaches the state where a SECOND role is possible.
    // Starting at limit-1 lets the first hire land (spending the last credit and
    // putting them exactly AT the limit), and the second role then proves both
    // halves at once — no limit check, and no increment.
    const mk = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date()).slice(0, 7);
    await adminDb.collection('subscriptions').doc(PRO).set({
      status: 'active', monthKey: mk, monthCount: SUBSCRIBER_MONTHLY_LIMIT - 1,
    });
    created.push(['subscriptions', PRO]);
  }

  await project(HERE);
  // The pro is already engaged HERE and on ONE other project => at the cap of 2.
  await project(OTHER, { slotHolders: [PRO], slotActive: true, professionalIds: [PRO] });
  await project(THIRD);

  // First hire HERE (role 1) — this one legitimately takes the slot.
  await offer(`${HERE}-o1`, HERE, 'Editor', 1000);
  const r1 = await callHire(`${HERE}-o1`);
  check('first role on this project succeeds', r1.ok, r1.ok ? '' : `${r1.code} ${r1.msg}`);

  if (!r1.ok) { console.log('  (skipping the rest — the first hire did not land)'); return; }

  const beforeSub = (await adminDb.collection('subscriptions').doc(PRO).get()).data();
  const p1 = (await adminDb.collection('projects').doc(HERE).get()).data();
  const chatId = p1.chatId;
  check('first hire spent a monthly credit', !subscriber
    || beforeSub?.monthCount === SUBSCRIBER_MONTHLY_LIMIT,
    subscriber ? `monthCount=${beforeSub?.monthCount} (want ${SUBSCRIBER_MONTHLY_LIMIT})` : 'n/a');
  const membersBefore = JSON.stringify((await adminDb.collection('chats').doc(chatId).get()).data()?.members ?? []);
  if (chatId) created.push(['chats', chatId]);

  // SECOND role, different category — the case that used to throw.
  await offer(`${HERE}-o2`, HERE, 'Video Photographer', 700);
  const r2 = await callHire(`${HERE}-o2`);
  check('SECOND different-category role on the same project succeeds', r2.ok,
        r2.ok ? '' : `${r2.code} ${r2.msg}`);

  const p2 = (await adminDb.collection('projects').doc(HERE).get()).data();
  const holders = p2.slotHolders ?? [];
  check('slotHolders still has exactly ONE entry for the pro',
        holders.filter((h) => h === PRO).length === 1, JSON.stringify(holders));
  check('filledSlots has BOTH roles',
        (p2.filledSlots ?? []).filter((s) => s.professionalId === PRO).length === 2,
        JSON.stringify((p2.filledSlots ?? []).map((s) => s.category)));

  const fees = await adminDb.collection(`projects/${HERE}/fees`).get();
  check('exactly ONE fee doc', fees.size === 1, `${fees.size}`);
  check('fee baseAmount accumulated across both offers (1000+700)',
        fees.docs[0]?.data().baseAmount === 1700, `${fees.docs[0]?.data().baseAmount}`);

  const membersAfter = JSON.stringify((await adminDb.collection('chats').doc(chatId).get()).data()?.members ?? []);
  check('group chat members unchanged', membersBefore === membersAfter, `${membersBefore} -> ${membersAfter}`);

  const afterSub = (await adminDb.collection('subscriptions').doc(PRO).get()).data();
  if (subscriber) {
    check('monthCount UNCHANGED by the second role',
          afterSub?.monthCount === beforeSub?.monthCount,
          `${beforeSub?.monthCount} -> ${afterSub?.monthCount}`);
  }

  // A hire on a genuinely NEW project must still be refused.
  await offer(`${THIRD}-o1`, THIRD, 'Editor', 500);
  const r3 = await callHire(`${THIRD}-o1`);
  check('hire on a THIRD, new project is still denied', !r3.ok,
        r3.ok ? 'ALLOWED — cap not enforced!' : `${r3.code} ${r3.msg}`);
  check('...and denied for the right reason', !r3.ok && /slot-cap-reached|monthly-limit-reached/.test(r3.msg), r3.msg ?? '');
}

try {
  await scenario('NON-SUBSCRIBER at the slot cap', { subscriber: false });
  await scenario('SUBSCRIBER at the monthly limit', { subscriber: true });
} catch (e) {
  console.error('\nprobe threw:', e); failures++;
} finally {
  console.log('\nTeardown:');
  for (const id of [HERE, OTHER, THIRD]) {
    const fees = await adminDb.collection(`projects/${id}/fees`).get();
    for (const f of fees.docs) await f.ref.delete();
  }
  for (const [c, i] of created.reverse()) await adminDb.collection(c).doc(i).delete().catch(() => {});
  for (const c of ['projects', 'priceOffers', 'chats', 'subscriptions']) {
    const snap = await adminDb.collection(c).get();
    const junk = snap.docs.filter((d) => /^sc-/.test(d.id) || d.id === PRO || d.id === CLIENT);
    for (const d of junk) await d.ref.delete();
  }
  let left = 0;
  for (const c of ['projects', 'priceOffers', 'chats', 'subscriptions']) {
    const snap = await adminDb.collection(c).get();
    left += snap.docs.filter((d) => /^sc-/.test(d.id)).length;
  }
  check('zero residue', left === 0, `${left} left`);
}
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
