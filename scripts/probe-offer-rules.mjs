#!/usr/bin/env node
/**
 * Probe for the offer status state machine + project status transitions.
 *
 * Runnable against either ruleset so before/after can be diffed:
 *   FS_PORT=8580 AUTH_PORT=9599 node scripts/probe-offer-rules.mjs --json out.json
 *
 * The rules constrain amount and identity but historically said nothing about
 * `status`, so the sharp cases here are the ones that move an offer INTO or OUT
 * OF 'accepted' — computeProAmount derives the platform-fee base from that
 * status, so `accepted -> rejected` by the pro is a direct revenue bypass.
 *
 * Isolated emulator only; the long-running instance on 8080/9099 is untouched.
 */
import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore as getAdminDb } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, doc, updateDoc, collection, addDoc,
} from 'firebase/firestore';
import {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
} from 'firebase/auth';
import { writeFileSync } from 'node:fs';

const FS_PORT = process.env.FS_PORT ?? '8580';
const AUTH_PORT = process.env.AUTH_PORT ?? '9599';
process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${FS_PORT}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${AUTH_PORT}`;
const P = 'bama-af0a0';

const adminDb = getAdminDb(initAdmin({ projectId: P }));
const app = initializeApp({ apiKey: 'k', projectId: P }, 'offer-probe');
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
for (const t of ['pro', 'client', 'third']) await mk(t);
console.log(`\npro=${uid.pro}\nclient=${uid.client}\nthird=${uid.third}\n`);

const PRJ = 'probe-project', OFFER = 'probe-offer', BUNDLE = 'probe-bundle', CHILD = 'probe-child';
const rows = [];

async function seed(offerStatus, projectStatus = 'open') {
  await adminDb.collection('projects').doc(PRJ).set({
    clientId: uid.client, title: 'Probe', crewSlots: [], filledSlots: [],
    status: projectStatus, createdAt: new Date(),
  });
  await adminDb.collection('priceOffers').doc(OFFER).set({
    projectId: PRJ, professionalId: uid.pro, category: 'Video Photographer',
    price: 1000, status: offerStatus, createdAt: new Date(),
  });
  await adminDb.collection('priceOffers').doc(CHILD).set({
    projectId: PRJ, professionalId: uid.pro, category: 'Editor',
    price: 500, status: 'pending', bundleId: BUNDLE, createdAt: new Date(),
  });
  await adminDb.collection('bundleOffers').doc(BUNDLE).set({
    projectId: PRJ, professionalId: uid.pro, slots: [{ category: 'Editor' }],
    individualTotal: 500, bundlePrice: 400, offerIds: [CHILD],
    status: offerStatus, createdAt: new Date(),
  });
}

async function upd(group, col, docId, label, tag, payload, seedStatus = 'pending', projectStatus = 'open') {
  await seed(seedStatus, projectStatus);
  await as(tag);
  let allowed = true, code = '';
  try { await updateDoc(doc(db, col, docId), payload); }
  catch (e) { allowed = false; code = e.code ?? String(e); }
  rows.push({ group, label, tag, allowed, code });
}

const CASES = [
  ['a. status pending -> accepted',                  () => ({ status: 'accepted' }), 'pending'],
  ['d. status pending -> rejected (client decline)',  () => ({ status: 'rejected' }), 'pending'],
  ['e. status pending -> removed',                    () => ({ status: 'removed' }),  'pending'],
  ['f. status accepted -> pending',                   () => ({ status: 'pending' }),  'accepted'],
  ['f2. status accepted -> rejected (THE LEAK)',      () => ({ status: 'rejected' }), 'accepted'],
  ['g. edit price on a PENDING offer',                () => ({ price: 1, editedAt: new Date(), editCount: 2 }), 'pending'],
  ['h. edit price on an ACCEPTED offer',              () => ({ price: 1 }),           'accepted'],
  ['i. change professionalId to another user',        () => ({ professionalId: 'someone-else' }), 'pending'],
  ['i2. change projectId',                            () => ({ projectId: 'other' }), 'pending'],
  ['j. status riding along with editedAt',            () => ({ status: 'accepted', editedAt: new Date() }), 'pending'],
  ['k. add an arbitrary new field',                   () => ({ injectedField: 'x' }), 'pending'],
];

for (const [label, mkP, st] of CASES) {
  for (const tag of ['client', 'pro', 'third']) await upd('priceOffers', 'priceOffers', OFFER, label, tag, mkP(), st);
}
for (const [label, mkP, st] of CASES) {
  for (const tag of ['client', 'pro', 'third']) {
    const p = mkP();
    if ('price' in p) { p.bundlePrice = p.price; delete p.price; }
    await upd('bundleOffers', 'bundleOffers', BUNDLE, label, tag, p, st);
  }
}
for (const tag of ['client', 'pro', 'third']) {
  await upd('priceOffers', 'priceOffers', CHILD, 'l. CHILD -> accepted while parent bundle pending', tag, { status: 'accepted' }, 'pending');
}
// ── Price bounds ─────────────────────────────────────────────────────────────
// The row that matters most: an offer ALREADY out of range (production holds a
// ₪10,000,000 one) must still be declinable. Bounds are checked only when the
// amount changes, precisely so the existing data is not stranded.
async function priced(group, col, docId, label, tag, payload, expectAllow, seedPrice, seedStatus = 'pending') {
  await seed(seedStatus);
  const field = col === 'bundleOffers' ? 'bundlePrice' : 'price';
  await adminDb.collection(col).doc(docId).update({ [field]: seedPrice });
  await as(tag);
  let allowed = true;
  try { await updateDoc(doc(db, col, docId), payload); } catch { allowed = false; }
  rows.push({ group, label: `${label} [want ${expectAllow ? 'ALLOW' : 'deny'}]`, tag, allowed });
}
await priced('price', 'priceOffers', OFFER, 'P1. decline an EXISTING ₪10,000,000 offer', 'client', { status: 'rejected' }, true, 10_000_000);
await priced('price', 'priceOffers', OFFER, 'P2. edit an out-of-range offer DOWN to ₪900', 'pro', { price: 900, editedAt: new Date(), editCount: 1 }, true, 10_000_000);
await priced('price', 'priceOffers', OFFER, 'P3. edit an out-of-range offer to another out-of-range value', 'pro', { price: 9_000_000 }, false, 10_000_000);
await priced('price', 'priceOffers', OFFER, 'P4. edit a normal offer UP to ₪554,545', 'pro', { price: 554_545 }, false, 1000);
await priced('price', 'priceOffers', OFFER, 'P5. edit a normal offer to exactly ₪50,000', 'pro', { price: 50_000 }, true, 1000);
await priced('price', 'priceOffers', OFFER, 'P6. edit a normal offer to ₪50,001', 'pro', { price: 50_001 }, false, 1000);
await priced('price', 'priceOffers', OFFER, 'P7. edit a normal offer to ₪0', 'pro', { price: 0 }, false, 1000);
await priced('price', 'bundleOffers', BUNDLE, 'P8. bundle repriced to ₪60,000', 'pro', { bundlePrice: 60_000 }, false, 1000);
await priced('price', 'bundleOffers', BUNDLE, 'P9. decline an out-of-range BUNDLE', 'client', { status: 'rejected' }, true, 999_999);

// bundleId backfill — usePriceOffer.ts:68-70, a real client update
for (const tag of ['pro']) {
  await upd('priceOffers', 'priceOffers', OFFER, 'm. bundleId backfill (usePriceOffer.ts:68)', tag, { bundleId: BUNDLE }, 'pending');
}

// ── CREATE ──
async function create(group, col, label, tag, payload) {
  await seed('pending');
  await as(tag);
  let allowed = true, code = '', made = null;
  try { made = (await addDoc(collection(db, col), payload)).id; }
  catch (e) { allowed = false; code = e.code ?? String(e); }
  if (made) await adminDb.collection(col).doc(made).delete();
  rows.push({ group, label, tag, allowed, code });
}
const base = () => ({ projectId: PRJ, professionalId: uid.pro, category: 'X', price: 100, createdAt: new Date() });
await create('create', 'priceOffers', 'n. create pending on a REAL project', 'pro', { ...base(), status: 'pending' });
await create('create', 'priceOffers', 'o. create ACCEPTED', 'pro', { ...base(), status: 'accepted' });
await create('create', 'priceOffers', 'p. create with status omitted', 'pro', base());
await create('create', 'priceOffers', 'q. create pending on a NONEXISTENT project', 'pro', { ...base(), projectId: 'no-such-project', status: 'pending' });
await create('create', 'priceOffers', 'r. create impersonating another pro', 'client', { ...base(), status: 'pending' });
await create('create', 'priceOffers', 'P10. create at ₪554,545', 'pro', { ...base(), price: 554_545, status: 'pending' }, );
await create('create', 'priceOffers', 'P11. create at ₪50,000 (the ceiling)', 'pro', { ...base(), price: 50_000, status: 'pending' });
await create('create', 'priceOffers', 'P12. create at ₪0', 'pro', { ...base(), price: 0, status: 'pending' });
await create('create', 'bundleOffers', 's. bundle create pending on a real project', 'pro',
  { projectId: PRJ, professionalId: uid.pro, slots: [{ category: 'X' }], individualTotal: 1, bundlePrice: 1, offerIds: [], status: 'pending', createdAt: new Date() });
await create('create', 'bundleOffers', 't. bundle created ACCEPTED', 'pro',
  { projectId: PRJ, professionalId: uid.pro, slots: [{ category: 'X' }], individualTotal: 1, bundlePrice: 1, offerIds: [], status: 'accepted', createdAt: new Date() });

// ── PROJECT STATUS ──
async function proj(label, tag, payload, projectStatus) {
  await seed('pending', projectStatus);
  await as(tag);
  let allowed = true, code = '';
  try { await updateDoc(doc(db, 'projects', PRJ), payload); }
  catch (e) { allowed = false; code = e.code ?? String(e); }
  rows.push({ group: 'projects', label, tag, allowed, code });
}
await proj('u. open -> in_progress', 'client', { status: 'in_progress' }, 'open');
await proj('v. open -> completed', 'client', { status: 'completed' }, 'open');
await proj('w. completed -> open (reopen)', 'client', { status: 'open' }, 'completed');
await proj('x. completed -> in_progress', 'client', { status: 'in_progress' }, 'completed');
await proj('y. cancelled -> open', 'client', { status: 'open' }, 'cancelled');
await proj('z. arbitrary new field', 'client', { injected: 'x' }, 'open');
await proj('z2. legit edit: title/description/deadline/location', 'client',
  { title: 'T2', description: 'D2', deadline: '2026-12-01', location: 'TLV' }, 'open');
await proj('z3. legit: crewSlots + status open (repost roles)', 'client',
  { crewSlots: [{ category: 'X', quantity: 1 }], status: 'open' }, 'in_progress');
await proj('z4. legit: reviewsCompleted/reviewsPending', 'client',
  { reviewsCompleted: true, reviewsPending: [] }, 'completed');
await proj('z5. slotHolders cleared', 'client', { slotHolders: [] }, 'open');

function table(group, title, tags = ['client', 'pro', 'third']) {
  console.log(`\n${title}`);
  console.log('  ' + 'case'.padEnd(56) + tags.map((t) => t.padEnd(9)).join(''));
  for (const label of [...new Set(rows.filter((r) => r.group === group).map((r) => r.label))]) {
    const cell = (t) => {
      const r = rows.find((x) => x.group === group && x.label === label && x.tag === t);
      return r ? (r.allowed ? 'ALLOW' : 'deny ') : '  -  ';
    };
    console.log('  ' + label.slice(0, 55).padEnd(56) + tags.map((t) => cell(t).padEnd(9)).join(''));
  }
}
table('priceOffers', 'priceOffers');
table('bundleOffers', 'bundleOffers');
table('create', 'CREATE', ['pro', 'client']);
table('price', 'PRICE BOUNDS', ['client', 'pro']);
table('projects', 'PROJECTS (client is the owner)', ['client']);

const j = process.argv.indexOf('--json');
if (j !== -1 && process.argv[j + 1]) {
  writeFileSync(process.argv[j + 1], JSON.stringify(rows, null, 2));
  console.log(`\nwrote ${process.argv[j + 1]}`);
}
for (const id of [OFFER, CHILD]) await adminDb.collection('priceOffers').doc(id).delete();
await adminDb.collection('bundleOffers').doc(BUNDLE).delete();
await adminDb.collection('projects').doc(PRJ).delete();
console.log('\ndone\n');
process.exit(0);
