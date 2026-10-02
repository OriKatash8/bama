#!/usr/bin/env node
/**
 * Emulator probe for the overdue-fee rules (firestore.rules: feeOverdueBlocks,
 * offerCreateValid, projectApplications create, match /feeBlocks).
 *
 * The writes are the SHIPPED ones: usePriceOffer's priceOffers/bundleOffers
 * addDoc payloads and useProjectApplication's projectApplications addDoc.
 *
 *   FS_PORT=8580 AUTH_PORT=9599 node scripts/probe-fee-overdue-rules.mjs
 *
 * Creates only — the emulator is unreliable for `list` (docs/slice1-verification.md);
 * nothing here lists. Isolated emulator only.
 */
import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore as getAdminDb, Timestamp } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc, collection, addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
} from 'firebase/auth';

const FS_PORT = process.env.FS_PORT ?? '8580';
const AUTH_PORT = process.env.AUTH_PORT ?? '9599';
process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${FS_PORT}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${AUTH_PORT}`;
const P = 'bama-af0a0';

const adminDb = getAdminDb(initAdmin({ projectId: P }));
const app = initializeApp({ apiKey: 'k', projectId: P }, 'fee-overdue-probe');
const db = getFirestore(app);
const auth = getAuth(app);
connectFirestoreEmulator(db, '127.0.0.1', Number(FS_PORT));
connectAuthEmulator(auth, `http://127.0.0.1:${AUTH_PORT}`, { disableWarnings: true });

const PW = 'pw123456';
const uid = {};
async function mk(tag) {
  try { uid[tag] = (await createUserWithEmailAndPassword(auth, `${tag}@probe.invalid`, PW)).user.uid; }
  catch { uid[tag] = (await signInWithEmailAndPassword(auth, `${tag}@probe.invalid`, PW)).user.uid; }
  await signOut(auth);
}
async function as(tag) {
  await signOut(auth).catch(() => {});
  await signInWithEmailAndPassword(auth, `${tag}@probe.invalid`, PW);
}
for (const t of ['pro', 'client', 'other']) await mk(t);

const PRJ = 'probe-overdue-project';
await adminDb.doc(`projects/${PRJ}`).set({
  clientId: uid.client, title: 'Probe', crewSlots: [], filledSlots: [], status: 'open', createdAt: new Date(),
});
await adminDb.doc(`projects/${PRJ}/fees/${uid.pro}`).set({
  professionalId: uid.pro, projectId: PRJ, feeStatus: 'owed', status: 'pending', feePaid: false, feeDue: 30,
  engagementStatus: 'completed',
});

async function setSwitch(on) {
  await adminDb.doc('config/pricing').set({ feeOverdueBlockEnabled: on }, { merge: true });
}
async function setBlock(ms) {
  if (ms === undefined) await adminDb.doc(`feeBlocks/${uid.pro}`).delete();
  else await adminDb.doc(`feeBlocks/${uid.pro}`).set({ blockedFrom: ms === null ? null : Timestamp.fromMillis(ms) });
}

// The three shipped creates, verbatim shapes.
const offer = () => addDoc(collection(db, 'priceOffers'), {
  projectId: PRJ, professionalId: uid.pro, category: 'Video Photographer', price: 1000,
  status: 'pending', createdAt: serverTimestamp(),
});
const bundle = () => addDoc(collection(db, 'bundleOffers'), {
  projectId: PRJ, professionalId: uid.pro, slots: [{ category: 'Video Photographer' }],
  individualTotal: 1000, bundlePrice: 900, offerIds: ['x'], status: 'pending',
  createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
});
const application = () => addDoc(collection(db, 'projectApplications'), {
  projectId: PRJ, professionalId: uid.pro, status: 'pending',
  createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
});

const rows = [];
async function expect(label, want, fn) {
  let got;
  try { await fn(); got = 'ALLOW'; } catch (e) { got = e?.code === 'permission-denied' ? 'DENY' : `ERR:${e?.code ?? e}`; }
  rows.push({ label, want, got, pass: want === got });
}
async function allThree(prefix, want) {
  await expect(`${prefix}: priceOffers create`, want, offer);
  await expect(`${prefix}: bundleOffers create`, want, bundle);
  await expect(`${prefix}: projectApplications create`, want, application);
}

const PAST = Date.now() - 60_000;
const FUTURE = Date.now() + 3600_000;

await as('pro');

await setSwitch(false); await setBlock(PAST);
await allThree('switch OFF, block in the past', 'ALLOW');

await setSwitch(true); await setBlock(PAST);
await allThree('switch ON, block in the past', 'DENY');

await setBlock(FUTURE);
await allThree('switch ON, block not yet started', 'ALLOW');

await setBlock(null);
await allThree('switch ON, blockedFrom null (paid / recomputed)', 'ALLOW');

await setBlock(undefined);
await allThree('switch ON, no feeBlocks doc (never blocked)', 'ALLOW');

// config/pricing present but WITHOUT the field — production's state today.
await adminDb.doc('config/pricing').set({ feePercent: 3, maxOpenProjects: 2 }); await setBlock(PAST);
await allThree('config present, switch field ABSENT', 'ALLOW');
await setSwitch(true);

// A missing config doc must not error every offer into a deny.
await adminDb.doc('config/pricing').delete(); await setBlock(PAST);
await allThree('config/pricing missing', 'ALLOW');
await setSwitch(true);

// Kill switch read strictly: a string "true" is off.
await adminDb.doc('config/pricing').set({ feeOverdueBlockEnabled: 'true' });
await expect('switch "true" (string) reads as OFF: priceOffers create', 'ALLOW', offer);
await setSwitch(true);

// Another pro is unaffected by this pro's block.
await setBlock(PAST);
await as('other');
await expect('another pro, unblocked: priceOffers create', 'ALLOW', () => addDoc(collection(db, 'priceOffers'), {
  projectId: PRJ, professionalId: uid.other, category: 'Video Photographer', price: 1000,
  status: 'pending', createdAt: serverTimestamp(),
}));
await expect('another pro cannot read this pro\'s feeBlocks', 'DENY', () => getDoc(doc(db, `feeBlocks/${uid.pro}`)));

// The pro: reads own block, cannot write it or the fee.
await as('pro');
await expect('pro reads own feeBlocks', 'ALLOW', () => getDoc(doc(db, `feeBlocks/${uid.pro}`)));
await expect('pro clears own feeBlocks', 'DENY', () => setDoc(doc(db, `feeBlocks/${uid.pro}`), { blockedFrom: null }));
await expect('pro marks own fee paid', 'DENY', () => updateDoc(doc(db, `projects/${PRJ}/fees/${uid.pro}`), { status: 'paid', feePaid: true, feeDue: 0 }));
await expect('pro clears own overdueAt', 'DENY', () => updateDoc(doc(db, `projects/${PRJ}/fees/${uid.pro}`), { overdueAt: null }));
await expect('pro disputes own fee directly', 'DENY', () => updateDoc(doc(db, `projects/${PRJ}/fees/${uid.pro}`), { engagementStatus: 'disputed' }));
await expect('pro writes config/pricing (switch off)', 'DENY', () => setDoc(doc(db, 'config/pricing'), { feeOverdueBlockEnabled: false }, { merge: true }));

// The client cannot see that the pro owes money.
await as('client');
await expect('client reads pro\'s feeBlocks', 'DENY', () => getDoc(doc(db, `feeBlocks/${uid.pro}`)));

let failed = 0;
for (const r of rows) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  want=${r.want.padEnd(5)} got=${r.got.padEnd(5)}  ${r.label}`);
}
console.log(`\n${rows.length - failed}/${rows.length} passed`);
process.exit(failed ? 1 : 0);
